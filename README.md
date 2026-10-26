# CostLens

A source-agnostic cost analysis app. Step 1.1 provides the landing page, responsive workspace shell, theme system, UI components and shared helpers. Authentication and data integrations are placeholders for later steps.

Requires Node.js 22+ and npm. Uses Next.js 15, strict TypeScript, App Router, Tailwind 4 and shadcn/ui new-york.

```sh
npm ci
npm run dev
```

No credentials are required for the current shell. Copy `.env.example` to `.env.local` when implementing integrations; fill values securely. Only the Supabase URL and anon key are public. Keep the service role key and API/worker credentials server-only. Auth, RLS, storage and external services are not configured in this step.

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
