import type { Metadata } from "next";
import { CollectionsView } from "./collections-view";

export const metadata: Metadata = { title: "Collections" };
export default function CollectionsPage() {
  return <CollectionsView />;
}
