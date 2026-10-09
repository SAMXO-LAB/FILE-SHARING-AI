import type { Metadata } from "next";
import { UploadsView } from "./uploads-view";

export const metadata: Metadata = { title: "Uploads" };
export default function UploadsPage() {
  return <UploadsView />;
}
