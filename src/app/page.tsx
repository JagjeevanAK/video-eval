import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "VidEval",
  description: "Browser-based video evaluation with Google Drive import and Google Sheets export.",
};

export default function HomePage() {
  return (
    <PublicShell>
      <section className="overflow-hidden">
        <div className="mx-auto flex max-w-6xl justify-center px-6 py-16 lg:py-24">
          <div className="max-w-4xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Video evaluation platform</p>
            <h1 className="text-5xl font-bold tracking-tight text-foreground">Review videos with custom rubrics and generate consistent scores.</h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">Built for teams to evaluate submissions quickly in one workspace.</p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild className="gradient-primary text-primary-foreground">
                <Link href="/dashboard">
                  Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
