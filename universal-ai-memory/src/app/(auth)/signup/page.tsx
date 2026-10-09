import type { Metadata } from "next";
import { enabledProviders } from "@/lib/server/auth-providers";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const { google } = await enabledProviders();
  return <SignupForm google={google} />;
}
