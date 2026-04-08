# VidEval

VidEval is a Next.js app for creating AI-assisted video evaluation rooms, pulling candidate videos from Google Drive, and exporting rubric scores to Google Sheets.

## Requirements

- Node.js 20+ or Bun 1.1+
- A Google OAuth client ID with Drive and Sheets access enabled

## Environment

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=your_google_picker_browser_api_key
NEXT_PUBLIC_GOOGLE_APP_ID=your_google_cloud_project_number
```

`NEXT_PUBLIC_GOOGLE_APP_ID` is optional, but recommended when using the Google Drive picker.

## Development

```bash
bun install
bun run dev
```

You can also use `npm install` and `npm run dev`.

## Scripts

- `bun run dev` starts the Next.js dev server
- `bun run build` builds the production app
- `bun run start` runs the production server
- `bun run lint` runs ESLint
- `bun run typecheck` runs TypeScript checks
- `bun run test` runs Vitest
