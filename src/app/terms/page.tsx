import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | VidEval",
  description: "Terms of service for using VidEval.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of Service"
      title="Terms for using VidEval"
      summary="These terms govern access to VidEval, a browser-based tool for reviewing videos from Google Drive and exporting structured evaluation scores to Google Sheets."
    >
      <h2>Use of the service</h2>
      <p>
        VidEval may be used to review video files and generate evaluation results for lawful business, hiring, or
        internal assessment workflows. Users are responsible for ensuring they have the right to access and process the
        content they submit through the application.
      </p>

      <h2>Google account permissions</h2>
      <p>
        By signing in with Google, the user authorizes VidEval to access the Google APIs required for the product
        workflow, including Google Drive and Google Sheets. The granted permissions should be used only by the
        authenticated account owner or an authorized team member.
      </p>

      <h2>User responsibilities</h2>
      <p>
        Users are responsible for the accuracy of any prompts, rubric files, and exported results they create in
        VidEval. Users must not use the service to process unlawful, infringing, or unauthorized content.
      </p>

      <h2>Availability</h2>
      <p>
        VidEval is provided on an as-is basis. Availability, features, and integrations may change over time as the
        application evolves.
      </p>

      <h2>Termination</h2>
      <p>
        Access to VidEval may be suspended or terminated if the service is misused, if required third-party
        integrations become unavailable, or if continued access would violate applicable law or platform policies.
      </p>
    </LegalPage>
  );
}
