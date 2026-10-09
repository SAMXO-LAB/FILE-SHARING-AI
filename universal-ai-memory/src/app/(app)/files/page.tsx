import type { Metadata } from "next";
import { Suspense } from "react";
import { FileManager } from "@/components/app/file-manager";

export const metadata: Metadata = { title: "All Files" };
export default function FilesPage() {
  return <Suspense><FileManager title="All Files" description="Everything you've uploaded or imported. Drag files onto a folder to organize them." folders /></Suspense>;
}
