"use client";
import { motion } from "framer-motion";

/** Re-mounts on every navigation inside the app, so each page eases in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
