import type { Metadata } from "next";
import { Suspense } from "react";
import { AskView } from "./ask-view";

export const metadata: Metadata = { title: "Ask AI" };
export default function AskPage() {
  return <Suspense><AskView /></Suspense>;
}
