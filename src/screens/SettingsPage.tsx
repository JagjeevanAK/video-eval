"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import Layout from "@/components/Layout";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <Layout>
      <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
      </Button>

      <h1 className="mb-1 text-2xl font-bold text-foreground">Settings</h1>
      <p className="mb-8 text-muted-foreground">Configure your platform settings</p>

      <div className="max-w-lg space-y-6">
        <section className="glass-card-elevated animate-fade-in space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Google Account</h2>
          <p className="text-sm text-muted-foreground">
            Google OAuth Client ID is configured via the{" "}
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span>{" "}
            environment variable.
          </p>
          <p className="text-sm text-muted-foreground">
            Google Drive folder picker uses{" "}
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_GOOGLE_PICKER_API_KEY</span>
            {" "}and can optionally use{" "}
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_GOOGLE_APP_ID</span>
            {" "}for the Google Cloud project number.
          </p>
          <SignOutButton
            variant="outline"
            size="sm"
            onSignedOut={() => router.push("/dashboard")}
          >
            Sign out &amp; Re-authenticate
          </SignOutButton>
        </section>
      </div>
    </Layout>
  );
}
