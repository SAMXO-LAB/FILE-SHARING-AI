import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: { absolute: "Share Files AI · Ask your files anything" },
  description: "Keep your documents, photos, links, notes and chat exports in one private place, and get answers with sources.",
};

/** Public introduction shown to signed-out visitors at "/" (the proxy rewrites "/" here). */
export default function WelcomePage() {
  return <Landing />;
}
