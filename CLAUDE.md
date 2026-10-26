You are helping me build CostLens, a source-agnostic cost analysis web app, for a university Software Quality Engineering lab. It must look polished enough to show off.

WHAT IT DOES
Users bring cost data from ANY source (CSV, Excel, ODS, JSON, XML, MS Project XML, Word, PDF, images, PowerPoint, audio, video, web pages, email, Google Sheets, REST APIs, copy-paste, manual entry). Every source is converted into ONE standard cost model, the user confirms a column mapping and a preview, and then the app computes estimated vs actual cost, variance and % variance, draws charts, adds AI insight (anomaly detection, a summary, AI-assisted mapping and extraction) and exports a PDF/Excel report. The demo dataset is the costs of my final-year project, CodeAudit.

STACK (do not swap without asking me)
- Next.js 15 App Router, TypeScript strict mode, React Server Components where sensible
- Tailwind CSS + shadcn/ui (new-york style), lucide-react icons, Recharts for charts
- Supabase: Postgres, Auth (email + password), Storage, Row Level Security
- Zod for every input, API body and AI response
- Claude API (@anthropic-ai/sdk), called only from server code
- Speech-to-text API for audio (OpenAI Whisper by default)
- Upstash Redis + @upstash/ratelimit for rate limiting
- Media worker: a separate Node + ffmpeg Docker service in /worker, deployed on Render
- Tests: Vitest (unit), Playwright (end-to-end)
- Hosting: Vercel (app), Supabase (DB + storage), Render (worker)

STANDARD COST MODEL (every importer must output exactly this)
type CostRow = {
  item: string;            // what the cost is
  group: string | null;    // phase, task or WBS level
  category: string | null; // Labour, Cloud, AI API, Tools...
  estimated: number | null;
  actual: number | null;
  currency: string;        // ISO code, default "USD"
  date: string | null;     // ISO yyyy-mm-dd
  notes: string | null;
  sourceRef: string | null;// e.g. "Sheet1!B7", "page 3", "00:12:41"
  confidence: number | null; // 0..1, only for AI-extracted rows
};

FOLDER STRUCTURE
/app
  /(auth)/login, /(auth)/signup
  /(app)/projects                    project list
  /(app)/projects/[id]               dashboard (KPIs, charts, table, AI panel)
  /(app)/projects/[id]/import        import wizard (source → mapping → preview → save)
  /(app)/projects/[id]/report        report preview + downloads
  /api/...                           route handlers (import, ai, report, jobs)
/components/ui                       shadcn components
/components/costlens                 app components (KpiCard, CostTable, charts...)
/lib/supabase                        server + browser clients
/lib/costs                           calc.ts, anomalies.ts (pure functions)
/lib/import/adapters                 one file per source, all implementing ImportAdapter
/lib/import                          registry.ts, mapping.ts, schema.ts
/lib/ai                              client.ts, prompts.ts, schemas.ts
/lib/security                        rateLimit.ts, fileGuard.ts, urlGuard.ts, sanitize.ts
/supabase/migrations                 SQL migrations
/worker                              media worker (Dockerfile, src/)
/tests/unit, /tests/e2e, /tests/fixtures (one sample file per format)
/docs                                security.md, testing.md, report notes

THEME AND UI
- Clean fintech dashboard look. Light and dark mode via next-themes, following the system by default.
- Colours (as CSS variables in globals.css): primary indigo #4F46E5, over budget rose #E11D48, under budget emerald #059669, warning/low confidence amber #D97706, neutral slate greys. Background white / slate-950.
- Font: Inter (next/font). Numbers use tabular-nums and are right-aligned.
- Cards: rounded-2xl, subtle border, shadow-sm, p-6. Generous spacing (gap-6).
- Layout: left sidebar (Projects, Import, Reports, Settings) + top bar (project switcher, theme toggle, user menu). Collapses to a sheet menu on mobile.
- Every page has loading skeletons, empty states with a clear call to action, and toast notifications (sonner) for success and errors.
- Accessible: labelled inputs, keyboard navigable, colour is never the only signal (add icons or +/- signs).
- Money formatted with Intl.NumberFormat using the project currency.

CONVENTIONS
- Security is built in, not added later: validate on the server with Zod, check project ownership on every query, never expose secrets to the client, never execute or store raw uploaded files longer than needed.
- Every project-scoped server route must call `requireProject(projectId)` from `/lib/supabase/requireProject.ts` before reading or writing project data; use the user-scoped Supabase server client and retain RLS.
- Pure logic lives in /lib and is unit-tested; components stay thin.
- Every importer registers itself in /lib/import/registry.ts, so the import wizard picks it up automatically.
- Errors shown to users are friendly; details are logged on the server only.
- After each task, list the files you changed, how the feature connects to the rest of the app, and anything I must configure (env vars, Supabase settings).


STANDARD VALIDATION FORMAT
When I ask you to validate a step:
1. Run: npm run lint, npm run typecheck, npm run test (and npm run test:e2e if the step has UI).
2. Check every acceptance criterion I list, by reading the code AND by running it (tests, curl, or Playwright). Do not assume.
3. Reply with a table: Criterion | How checked | Result (PASS/FAIL) | Evidence (file:line, test name or command output).
4. For every FAIL, explain the cause and fix it, then re-run the checks.
5. List any gaps that are not covered by a test, and add tests for them.
6. Finish with: "Step X.Y: READY" or "Step X.Y: NOT READY" plus what remains.


reference to this to get the master prompt at the start of every prompt below
