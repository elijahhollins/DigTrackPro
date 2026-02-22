# Copilot Instructions for DigTrackPro

## Project Overview

DigTrackPro is a multi-tenant SaaS web application for managing underground utility dig tickets and excavation job sites. It allows field crews and admins to track dig ticket statuses, manage jobs, record no-shows, upload job photos and prints, annotate site maps, and view a calendar of upcoming work dates.

## Tech Stack

- **Framework**: React 19 with TypeScript (strict mode)
- **Build tool**: Vite
- **Styling**: Tailwind CSS (utility-first, no CSS modules)
- **Backend / Database**: Supabase (PostgreSQL with Row-Level Security for multi-tenancy)
- **AI**: Google Gemini via `@google/genai`
- **PDF rendering**: `pdfjs-dist`

## Project Structure

```
/
├── App.tsx              # Root component; holds global state and routing logic
├── index.tsx            # Entry point
├── types.ts             # All shared TypeScript types and enums
├── components/          # React UI components (one file per feature area)
├── services/
│   ├── apiService.ts    # All Supabase CRUD operations; also exports SQL_SCHEMA
│   └── geminiService.ts # Google Gemini AI helpers
├── utils/
│   └── dateUtils.ts     # Ticket status calculation and status color helpers
├── lib/
│   └── supabaseClient.ts # Supabase client singleton
└── vite.config.ts
```

## Coding Conventions

- Use **TypeScript strict mode**; avoid `any` except when mapping raw Supabase responses.
- All shared types live in `types.ts`; do not define types inline in component files.
- Use **functional React components** with hooks only; no class components.
- Tailwind CSS for all styling — no inline `style` props unless dynamically computed values are unavoidable.
- Database column names use `snake_case`; TypeScript properties use `camelCase`. Map between them in `apiService.ts`.
- All Supabase calls live in `apiService.ts`; components must not import `supabase` directly.
- `dateUtils.ts` owns all ticket status and date logic; keep it pure (no side effects).
- Multi-tenancy is enforced by Supabase RLS policies — every table is filtered by `company_id`.
- Use `crypto.randomUUID()` (available in modern browsers) for client-side UUID generation.

## Key Domain Concepts

- **DigTicket**: A utility locate ticket with a `workDate`, `expires`, and computed `TicketStatus` (`PENDING`, `VALID`, `EXTENDABLE`, `REFRESH_NEEDED`, `EXPIRED`).
- **Job**: A construction job that groups multiple tickets, photos, notes, and prints.
- **No-Show**: A record that a utility company did not mark the requested area; sets `noShowRequested` on the ticket.
- **JobPrint**: A PDF/image of a site blueprint uploaded to Supabase Storage (`job-prints` bucket); can have `PrintMarker` overlays pointing to ticket locations.
- **UserRole**: `ADMIN` or `CREW`; admins can manage team members and company settings.

## Workflow Commands

```bash
# Install dependencies
npm install

# Start the dev server (requires GEMINI_API_KEY and Supabase env vars in .env.local)
npm run dev

# Type-check (lint)
npm run lint

# Production build
npm run build
```

## Environment Variables

Required in `.env.local`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_API_KEY` — Google Gemini API key (also accepted as `API_KEY` via browser `process.env` polyfill; see `getEnv` in `lib/supabaseClient.ts`)

> **Note**: The Gemini API key is currently consumed client-side. For production deployments, consider proxying Gemini requests through a server-side function to avoid exposing the key in the browser bundle.

## Testing

There is currently no automated test suite. When adding tests, prefer Vitest (already compatible with the Vite setup) and React Testing Library.
