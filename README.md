# RedReader (skeleton)

This is a **simplified** repo skeleton for a Next.js PWA RSVP reader with Supabase sync.

## What's in here
- A clean folder layout you can open in Cursor immediately
- Placeholder files (empty or minimal) you can fill in step-by-step
- No `node_modules` and no generated Next.js boilerplate yet

## Recommended workflow (GitHub + Cursor)
1. Create a new empty GitHub repo called **RedReader** (no README/license/gitignore).
2. Clone it locally:
   ```bash
   git clone <your-repo-url>
   cd RedReader
   ```
3. Unzip this skeleton **into** the repo folder (so it creates `src/`, `public/`, etc).
4. Commit:
   ```bash
   git add .
   git commit -m "Add RedReader skeleton structure"
   git push
   ```
5. Open the folder in Cursor.

## Next steps (we'll do these together)
1) Scaffold Next.js (create-next-app) *into this repo*  
2) Add Tailwind  
3) Add Supabase auth + database tables  
4) Build RSVP reader + ORP rendering  
5) Add PDF upload (pdf.js)  
6) Add PWA manifest + offline caching  
7) Deploy to Vercel

## Environment variables (later)
Copy `.env.local.example` -> `.env.local` and fill in:
- NEXT_PUBLIC_SUPABASE_URL=
- NEXT_PUBLIC_SUPABASE_ANON_KEY=

## Supabase schema (folders + documents)
Run `supabase/schema.sql` in the Supabase SQL editor. It creates:
- `folders` (per-user)
- `documents` with `folder_id` (nullable, `on delete set null`)
- `reading_state` (cascades when a document is deleted)