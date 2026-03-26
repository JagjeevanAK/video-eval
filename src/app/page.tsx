import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSpreadsheet, HardDrive, ShieldCheck, Video } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const features = [
  "Uses Google OAuth to access Google Drive folders and Google Sheets for export.",
  "Reads video files that the signed-in user explicitly chooses through their Drive content.",
  "Stores Google access tokens and room configuration locally in the user’s browser.",
];

const scopes = [
  "Google Drive read-only access to locate videos in the selected folder.",
  "Google Sheets access to create and update evaluation spreadsheets.",
  "Basic Google account profile access to show the signed-in user name, email, and avatar.",
];

export const metadata: Metadata = {
  title: "VidEval",
  description: "Browser-based video evaluation with Google Drive import and Google Sheets export.",
};

export default function HomePage() {
  return (
    <PublicShell>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Google OAuth Verification</p>
            <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-foreground">
              VidEval helps teams review Drive videos and write scored results to Sheets.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              This public page exists to document the product, its Google API usage, and the legal pages required for
              Google OAuth consent screen review.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="gradient-primary text-primary-foreground">
                <Link href="/dashboard">
                  Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privacy">View Privacy Policy</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/terms">View Terms</Link>
              </Button>
            </div>
          </div>

          <div className="glass-card-elevated relative overflow-hidden p-8">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-primary/15 via-accent/10 to-transparent" />
            <div className="relative space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <ShieldCheck className="h-4 w-4" />
                Verification summary
              </div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-border bg-background/90 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <HardDrive className="h-4 w-4 text-primary" />
                    Google Drive
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Reads video files from a user-selected Drive folder after the user signs in and grants access.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background/90 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    Google Sheets
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Creates and updates a spreadsheet with evaluation scores generated from the selected videos.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background/90 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Video className="h-4 w-4 text-primary" />
                    Local-first app
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Authentication state and workspace data are kept in the browser for the current user session.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">What the app does</h2>
            <div className="mt-5 space-y-3">
              {features.map((feature) => (
                <p key={feature} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 flex-none text-success" />
                  <span>{feature}</span>
                </p>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-foreground">Google data requested</h2>
            <div className="mt-5 space-y-3">
              {scopes.map((scope) => (
                <p key={scope} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 flex-none text-success" />
                  <span>{scope}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
