import type { Metadata } from "next";
import { Suspense } from "react";
import { FileManager } from "@/components/app/file-manager";

export const metadata: Metadata = { title: "Images and Videos" };
export default function MediaPage() {
  return <Suspense><FileManager title="Images and Videos" description="Photos and videos you've added. Text in images is read only when your privacy mode and server allow it." categories={["image", "video"]} grid extraViews={false} /></Suspense>;
}
