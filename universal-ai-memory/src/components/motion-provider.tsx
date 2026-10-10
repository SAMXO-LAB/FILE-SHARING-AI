"use client";
import { MotionConfig } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * App-wide motion settings: animations follow the OS "reduce motion" setting, and the in-app
 * "Animations: none" preference (html[data-anim="none"]) turns them off entirely.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setOff(html.getAttribute("data-anim") === "none");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["data-anim"] });
    return () => mo.disconnect();
  }, []);
  return <MotionConfig reducedMotion={off ? "always" : "user"}>{children}</MotionConfig>;
}
