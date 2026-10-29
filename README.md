# CostLens

A source-agnostic cost analysis app. Step 1.1 provides the landing page, responsive workspace shell, theme system, UI components and shared helpers. Step 1.2 adds Supabase SSR authentication, protected workspace routes, an ownership schema and RLS. Step 1.3 adds project cards and CRUD, editable manual cost tables with search/filter/sort/pagination, and a populated project switcher. Hosted Supabase configuration and both SQL migrations are required to use the hosted app.

Requires Node.js 22+ and npm. Uses Next.js 15, strict TypeScript, App Router, Tailwind 4 and shadcn/ui new-york.

```sh
npm ci
npm run dev
```

Public pages and offline tests require no credentials. Copy `.env.example` to `.env.local` and configure the Supabase URL and anon key to use authentication; see [Supabase setup](docs/supabase.md) for migration and email settings. Fill values securely. Only the Supabase URL and anon key are public. Keep the service role key and API/worker credentials server-only. The database migration must be applied to your Supabase project. Storage and other external integrations are future steps.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the production server, so build first. Where Chromium is preinstalled, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. No browser download is needed in this cloud environment. Tests run Chromium at desktop and mobile widths; they do not claim Safari coverage. Screenshots are generated in ignored `test-results/`.

Routes under `app/(app)` inherit the sidebar and top bar. `lib/format.ts` exports money formatting by project currency and percentage formatting from a ratio (0.125 → 12.5%). `EmptyState` and `PageHeader` provide reusable page scaffolding. Global providers include system-aware themes, tooltips and Sonner.

`components.json` initializes shadcn/ui's new-york style and aliases. UI sources came from the official shadcn-ui GitHub `apps/v4/registry/new-york-v4/ui` registry because this environment blocks ui.shadcn.com. Inter is bundled from the official rsms/inter repository using `next/font/local`; its license is in `app/fonts/OFL.txt`, so production builds require no font network requests. To add future components with the CLI, allow ui.shadcn.com in environment network settings or use the official GitHub sources.


The reusable `components/costlens/CostTable.tsx` accepts shared `CostTableRow` data and optional save/delete server actions. Omitting the mutation actions makes it read-only for future previews and reports. Project cards use the RLS-aware SQL summary view; item rows with source_id=null expose type manual. Variance columns are reserved for Step 1.7.


Steps 1.4–1.5 add the registry-based import wizard at `/projects/[id]/import`: structured files, paste, and guarded online sources. See [imports setup and security](docs/imports.md). Apply migration 0003 for optional encrypted saved sources and configure SOURCE_ENCRYPTION_KEY securely to enable saving. Step 1.6 adds shared column mapping, saved templates, validated preview/fixes and transactional append/replace. Apply migration 0004 for commits. File imports are verified; live JSON API and HTML-table checks pass, while Google Sheets remains blocked by this cloud proxy's pinned-IP policy. Normal tests no longer take screenshots unless COSTLENS_CAPTURE_SCREENSHOTS=1 is explicitly set.

Step 1.7 adds [shared decimal-safe cost calculations](docs/calculations.md) and signed variance/percentage/status columns in CostTable. Dashboard, anomaly and report features should import `lib/costs/calc.ts` rather than calculate variance separately. No additional environment variables or database migrations are needed.

Step 1.8 turns project pages into [shareable dashboards](docs/dashboard.md), with five KPIs, four responsive Recharts views, URL filters and keyboard-accessible chart drill-down. The same chart components accept data directly for future reports; an optional insights slot supports the later AI panel. No additional configuration is required.

Step 2.1 on `phase-2-ai-foundation` adds the [safe AI gateway](docs/ai.md), user/project-private cache, token/latency audit, distributed request/daily quotas and AI privacy/usage settings. Apply migration 0005 and configure Supabase service-role, Gemini and Upstash REST credentials before deploying this branch: login/import also enforce Upstash limits. Live-provider verification remains pending while those cloud credentials are absent.

Phase 2 document/media imports, insights and report work is on `phase-2-ai-foundation`. See [media setup](docs/media.md), [insight semantics](docs/insights.md), [report exports](docs/reports.md) and [worker deployment](worker/README.md). Apply migrations 0006–0007 for jobs/private Storage and summary invalidation. The worker requires an OpenAI speech key; Gemini remains the single cost-extraction/summarization provider. Raw recordings stay private for review and are deleted after commit.
