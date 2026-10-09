import type { Metadata } from "next";
import { Suspense } from "react";
import { MemoryView } from "./memory-view";

export const metadata: Metadata = { title: "My Memory" };
export default function MemoryPage() {
  return <Suspense><MemoryView /></Suspense>;
}
