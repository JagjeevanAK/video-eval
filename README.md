# VidEval

VidEval is a Next.js app for creating AI-assisted video evaluation rooms, pulling candidate videos from Google Drive, and exporting rubric scores to Google Sheets.

## Requirements

- Node.js 20+ or Bun 1.1+
- A Google OAuth client ID with Drive and Sheets access enabled

## Environment

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

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
