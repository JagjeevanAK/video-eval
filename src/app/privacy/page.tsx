import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | VidEval",
  description: "Privacy policy for VidEval and its Google OAuth usage.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="How VidEval handles Google data"
      summary="VidEval uses Google OAuth so a signed-in user can select Google Drive videos and export evaluation results to Google Sheets. This page describes what data is accessed and how it is used."
    >
      <h2>Information collected</h2>
      <p>
        VidEval requests access to a user&apos;s basic Google profile information, selected Google Drive content, and
        Google Sheets so the application can identify the user, list videos from the chosen Drive folder, and create
        or update evaluation spreadsheets.
      </p>

      <h2>How the information is used</h2>
      <p>
        Google account information is used only to authenticate the current user and show their profile details in the
        interface. Google Drive access is used to locate and read video files chosen by that user. Google Sheets access
        is used to create or update spreadsheets that store evaluation results.
      </p>

      <h2>Storage and retention</h2>
      <p>
        VidEval stores Google access tokens and room configuration locally in the user&apos;s browser. The application
        does not use a dedicated backend database to persist Google data. Data remains available until the user clears
        local browser storage or signs out.
      </p>

      <h2>Sharing</h2>
      <p>
        VidEval does not sell Google user data. Data accessed through Google APIs is used only to provide the core app
        workflow of reviewing videos and exporting evaluation results for the authenticated user.
      </p>

      <h2>User controls</h2>
      <p>
        Users can revoke the app&apos;s Google access from their Google account permissions page at any time. Users can
        also sign out of VidEval, which clears the local authenticated session stored by the application.
      </p>
    </LegalPage>
  );
}
