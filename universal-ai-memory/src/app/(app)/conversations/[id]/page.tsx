import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationViewer } from "./viewer";

export const metadata: Metadata = { title: "Conversation" };
export default function ConversationPage() {
  return <Suspense><ConversationViewer /></Suspense>;
}
