import "server-only";
import net from "node:net";
import { clamavConfigured } from "@/lib/env";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "skipped"; reason: string };

/**
 * ClamAV (clamd) INSTREAM scan over TCP. Streams the data so large files are never held in memory.
 * Enabled by setting CLAMAV_HOST. Fails closed: if the scanner is configured but unreachable this
 * throws, so the job retries instead of letting an unscanned file through.
 */
export async function scanStream(body: ReadableStream<Uint8Array>): Promise<ScanResult> {
  const cfg = clamavConfigured();
  if (!cfg) return { status: "skipped", reason: "No malware scanner configured." };

  return new Promise<ScanResult>((resolve, reject) => {
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    let response = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };
    socket.setTimeout(120_000, () => finish(() => reject(new Error("Malware scanner timed out."))));
    socket.on("error", (e) => finish(() => reject(new Error(`Malware scanner unreachable (${e.message}).`))));
    socket.on("data", (d) => {
      response += d.toString("utf8");
    });
    socket.on("close", () => {
      if (settled) return;
      const text = response.replace(/\0/g, "").trim();
      if (/OK$/.test(text)) return finish(() => resolve({ status: "clean" }));
      const found = /stream:\s*(.+?)\s+FOUND$/.exec(text);
      if (found) return finish(() => resolve({ status: "infected", signature: found[1]! }));
      if (/size limit exceeded/i.test(text)) return finish(() => resolve({ status: "skipped", reason: "File is larger than the scanner's size limit." }));
      finish(() => reject(new Error(`Unexpected scanner response: ${text.slice(0, 100)}`)));
    });

    socket.on("connect", async () => {
      try {
        socket.write("zINSTREAM\0");
        const reader = body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let off = 0; off < value.byteLength; off += 65536) {
            const part = value.subarray(off, off + 65536);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(part.byteLength);
            if (!socket.write(Buffer.concat([len, part]))) await new Promise((r) => socket.once("drain", r));
          }
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      } catch (e) {
        finish(() => reject(e as Error));
      }
    });
  });
}
