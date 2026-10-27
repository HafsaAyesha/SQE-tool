# Step 1.3 acceptance validation

Validated against the real local Supabase instance. Final results: production build, lint, strict typecheck, all 60 unit/database tests and all 10 Chromium browser tests pass. Local runners inject the CLI-generated test bindings privately; no live tests were skipped in these runs. Hosted Supabase and non-Chromium browsers remain outside this validation.

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Project create/rename/delete persist | Real UI mutations followed by reloads | PASS | tests/e2e/projects.spec.ts: project and cost item CRUD, reload persistence, summaries, filters and pagination |
| Row add/edit/delete persist | UI mutations, reloads and authenticated database checks | PASS | Same browser test; manual source_id=null and preserved currency/notes checked |
| Invalid values rejected on client | Submit empty item, negative amount and 10,000-character note; assert inline errors and no inserted row | PASS | Same browser test at desktop/mobile widths |
| Invalid values rejected on server | Import and call saveCostItem directly with bad data on both insert/update paths; assert no DB mutation | PASS | tests/unit/projectActions.test.ts: direct server action rejects %s on both insert and update (five cases) |
| Sorting/filtering/search/pagination with 120 seeded rows | Seed 120 rows; verify page sizes 50/50/20, 120 distinct items, amount ordering, group/category filters, zero-result intersection and case-insensitive search | PASS | tests/e2e/projects.spec.ts |
| B cannot open A's project | Create independent A/B accounts, authenticate browser as B, navigate directly to A's URL, assert HTTP 404 and no private name displayed | PASS | tests/e2e/projects.spec.ts: signed-in user B gets HTTP 404 for user A’s project |
| Screenshots saved | Fresh screenshots and PNG dimension checks at 1440px and 390px | PASS | docs/screenshots/1.3-*.png (10 files) |

## Corrections made during validation

- The note input's native maxLength previously truncated long text. It now accepts the pasted value into the draft and rejects it explicitly through the shared 2,000-character Zod limit, with an inline error; the server enforces the same limit independently.
- requireProject prevented access, but its asynchronous notFound() could occur after a loading boundary started streaming HTTP 200. Session middleware now validates project IDs and ownership before rendering, returning a real uncached 404 rewrite for inaccessible projects. It preserves refreshed session cookies, reports DB failures as 503, and retains requireProject in pages and actions. Four new middleware unit tests protect these behaviors.
- A reload assertion was scoped to the visible Cost items region so Next.js's transient hidden old page cannot create an ambiguous text locator. The final full browser rerun passes.

## Screenshots

- Empty list: `1.3-projects-empty-1440-light.png`, `1.3-projects-empty-1440-dark.png`, `1.3-projects-empty-390-light.png`, `1.3-projects-empty-390-dark.png`.
- Filled list: `1.3-projects-1440-light.png`, `1.3-projects-1440-dark.png`, `1.3-projects-390-light.png`, `1.3-projects-390-dark.png`.
- Project page: `1.3-cost-table-1440.png`, `1.3-cost-table-390.png`.

All generated users and their cascading fixtures were removed (matching test-user count: 0). No new environment variables or migrations are introduced by this validation; Step 1.3 still requires 0002_project_summaries.sql. All requested acceptance gaps have automated coverage. Server-action unit tests execute the real action and schema with auth/database dependencies mocked; browser tests use real local Supabase and server actions.

Step 1.3: READY (local Supabase).
