import type { ReactNode } from "react";

import { PublicShell } from "@/components/public-shell";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}

export function LegalPage({ eyebrow, title, summary, children }: LegalPageProps) {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
        <div className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
          <div className="glass-card-elevated relative mb-6 overflow-hidden border-border/70 p-8 lg:p-10">
            <div className="gradient-primary absolute inset-x-0 top-0 h-1.5" />
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground lg:text-5xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground lg:text-lg">{summary}</p>
          </div>

          <div className="glass-card legal-content border-border/70 p-8 lg:p-10">{children}</div>
        </div>
      </section>
    </PublicShell>
  );
}
