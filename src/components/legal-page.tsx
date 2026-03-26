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
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="glass-card-elevated mb-8 p-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{summary}</p>
        </div>

        <div className="glass-card prose prose-slate max-w-none p-8">{children}</div>
      </section>
    </PublicShell>
  );
}
