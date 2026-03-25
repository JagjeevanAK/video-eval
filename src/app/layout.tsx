import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth-gate";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VidEval",
  description: "Video evaluation platform for AI-assisted rubric scoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthGate>{children}</AuthGate>
        </Providers>
      </body>
    </html>
  );
}
