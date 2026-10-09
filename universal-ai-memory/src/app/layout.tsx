import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { Toaster } from "@/components/ui/toaster";
import { getThemeState } from "@/lib/server/theme";
import { themeStylesheet } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Universal AI Memory", template: "%s · Universal AI Memory" },
  description: "Ask anything about your files, chats, links and notes, and get answers with sources.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0f1f", colorScheme: "dark light", width: "device-width", initialScale: 1 };

// Runs before first paint: resolves "system" colour mode so there is no flash of the wrong theme.
const MODE_SCRIPT = `(function(){try{var d=document.documentElement;var m=d.getAttribute('data-color-mode');var mode=(m==='light'||m==='dark')?m:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');d.setAttribute('data-mode',mode);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const theme = await getThemeState();
  return (
    <html lang="en" suppressHydrationWarning {...theme.attrs} style={theme.style as CSSProperties}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body>
        <div className="app-bg" aria-hidden />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
