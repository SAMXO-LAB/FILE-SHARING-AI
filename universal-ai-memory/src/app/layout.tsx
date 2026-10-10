import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "@fontsource-variable/sora/index.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import { MotionProvider } from "@/components/motion-provider";
import { Toaster } from "@/components/ui/toaster";
import { getThemeState } from "@/lib/server/theme";
import { themeStylesheet } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Share Files AI", template: "%s · Share Files AI" },
  description: "Send smarter. Share securely. Store and share any file, then ask Sam about your files, chats, links and notes, with sources.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f8fafc" }, { media: "(prefers-color-scheme: dark)", color: "#0b1120" }],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint: resolves "system" colour mode so there is no flash of the wrong theme.
const MODE_SCRIPT = `(function(){try{var d=document.documentElement;var m=d.getAttribute('data-color-mode');var mode=(m==='light'||m==='dark')?m:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.setAttribute('data-mode',mode);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const theme = await getThemeState();
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`} {...theme.attrs} style={theme.style as CSSProperties}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body>
        <div className="app-bg" aria-hidden />
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
