import type { Metadata } from "next";
import { Suspense } from "react";
import { enabledProviders } from "@/lib/server/auth-providers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { google } = await enabledProviders();
  return <Suspense><LoginForm google={google} /></Suspense>;
}
