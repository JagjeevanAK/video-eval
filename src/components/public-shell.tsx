import type { ReactNode } from "react";
import Link from "next/link";
import { FileText, ShieldCheck, Video } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PublicShellProps {
  children: ReactNode;
}

const footerLinks = [
  { href: "/", label: "Home", icon: Video },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck },
  { href: "/terms", label: "Terms", icon: FileText },
];

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl">
              <Video className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">VidEval</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/privacy">Privacy</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/terms">Terms</Link>
            </Button>
            <Button asChild size="sm" className="gradient-primary text-primary-foreground">
              <Link href="/dashboard">Open App</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70 bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">VidEval</p>
            <p className="text-sm text-muted-foreground">
              A browser-based tool for evaluating videos from Google Drive and exporting results to Google Sheets.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {footerLinks.map((item) => (
              <Link key={item.href} href={item.href} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
