import type { Metadata } from "next";
import { IntegrationsView } from "./integrations-view";

export const metadata: Metadata = { title: "Connected Apps" };
export default function IntegrationsPage() {
  return <IntegrationsView />;
}
