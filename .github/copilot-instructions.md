# Copilot Instructions for DigTrackPro

## Project Overview

DigTrackPro is a multi-tenant SaaS web application for managing dig tickets (utility locate requests) for construction and utility companies. It allows crews and admins to track dig tickets, jobs, photos, and team members, with full company-level data isolation.

## Tech Stack

- **Frontend**: React 19 with TypeScript, functional components only
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (utility-first; no CSS modules or styled-components)
- **Backend/Database**: Supabase (PostgreSQL with Row Level Security)
- **AI Integration**: Google Gemini AI via `@google/genai`
- **PDF Rendering**: `pdfjs-dist`

## Build & Run

```bash
npm install           # Install dependencies
npm run dev           # Start local dev server
npm run build         # Production build
npm run lint          # TypeScript type check (tsc --noEmit)
npm run preview       # Preview production build
```

Environment variables go in `.env.local`:
- `VITE_SUPABASE_URL` – Supabase project URL
- `VITE_SUPABASE_ANON_KEY` – Supabase anon key
- `GEMINI_API_KEY` – Google Gemini API key

## Project Structure

- `App.tsx` – Root component; handles auth, routing between views, and top-level state
- `types.ts` – All shared TypeScript interfaces and enums
- `components/` – React components (one component per file, named exports preferred)
- `services/apiService.ts` – All Supabase data access methods
- `services/geminiService.ts` – Google Gemini AI integration
- `lib/supabaseClient.ts` – Supabase client initialization
- `utils/` – Pure utility functions (e.g., date calculations)
- `supabase/` – SQL migration files and database documentation

## Coding Standards

- Use TypeScript; avoid `any` types
- Use functional React components with hooks only (no class components)
- All new types and interfaces go in `types.ts`
- All Supabase queries go through `services/apiService.ts`; do not call `supabase` directly from components
- Use Tailwind CSS utility classes for all styling
- Prefer `const` over `let`; avoid `var`
- Do not add comments unless they explain non-obvious logic

## Architecture: Multi-Tenant with Row Level Security

All tenant data tables (`tickets`, `jobs`, `photos`, `notes`, `no_shows`, `job_prints`, `profiles`) include a `company_id` column. Supabase RLS policies enforce strict company isolation:

- **Regular users** see only rows where `company_id` matches their own (via `get_user_company_id()`)
- **Super Admins** (`SUPER_ADMIN` role) can read all companies' data
- **Never bypass RLS** – do not use service-role keys or `supabase.rpc` calls that skip security policies

## User Roles

- `CREW` – Field workers; read/create access to their company's data
- `ADMIN` – Company admins; full access to their company's data and team management
- `SUPER_ADMIN` – Platform admins; cross-tenant read access

## Database Conventions

- Table names: `snake_case` (e.g., `dig_tickets`, `job_prints`)
- All tables have `company_id uuid` for tenant isolation
- Timestamps stored as `timestamp with time zone`; converted to milliseconds (`number`) in TypeScript
- SQL files for schema changes go in `supabase/`

## Key Design Decisions

- No routing library; views are controlled by `activeView` state in `App.tsx` (type `AppView`)
- Dark mode stored in `localStorage` under key `dig_theme_mode`
- Supabase auth session is the source of truth for authentication
- Company data is loaded once per session after login and held in React state
