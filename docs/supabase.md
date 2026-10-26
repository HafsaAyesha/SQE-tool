# Supabase setup (Step 1.2)

## Connect the project

1. Create or select a Supabase project. In environment settings or ignored `.env.local`, configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using its project URL and public anon key. These public values must exist before building the Next.js bundle. Restart/rebuild after changes. Do not use a service-role key as the anon key.
2. In this cloud environment's restricted network settings, allow the exact hostname from your project URL (for example, `<project-ref>.supabase.co`). No broad Supabase allowlist has been added because the project URL is not yet known.
3. Apply `supabase/migrations/0001_init.sql` once using Supabase SQL Editor or the Supabase migration workflow for your project. The migration is transactional. Do not run it again on an already-migrated database. A service-role key is not required by the application for this step; do not expose it to the browser.
4. Enable the Email provider under Authentication. Set the Site URL to the app's origin and allow the production/development origins you use. Keep email confirmation enabled for production. For SSR email confirmation, set the Confirm signup email template link to:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
   ```

   The `/auth/confirm` route validates the token through Supabase, saves session cookies, and redirects to `/projects`. Invalid/expired links return to login with a friendly error. The default Supabase confirmation template can still verify the email at Supabase, but the user may need to return and log in manually. Configure SMTP as appropriate for your deployment; hosted default email limits apply.
5. Run `npm run build` and start the application. Verify signup with a real inbox, email confirmation, login, email displayed in the user menu, logout, and signed-out redirects from `/projects`, `/import`, `/reports`, `/settings`, and nested project URLs.

No project creation UI is included in Step 1.2. The schema and policies now support user-owned projects; project creation belongs to a later step. Test project rows through Supabase SQL Editor or an authenticated client when validating the hosted database.

## Ownership contract for future steps

Every server handler receiving a project ID must first call `await requireProject(projectId)` from `lib/supabase/requireProject.ts`. It validates the UUID, verifies the user with `auth.getUser()`, and filters by both project and owner IDs. Missing, invalid and inaccessible IDs produce 404; database outages remain errors. Use the user-scoped server client for subsequent reads/writes and scope every query to the authorized project. RLS is a second boundary. Do not use a service-role client for ordinary project access.

`projects` and `mapping_templates` have owner policies; `data_sources` and `cost_items` check the owning project on every operation, including updated rows. A composite foreign key prevents a cost item from referring to a data source in a different project. Removing a source retains its cost items and nulls their source reference. Deleting a project cascades to its sources and costs. `ai_cache` has RLS, no client policies and no anon/authenticated privileges; it is reserved for future trusted server code.

## Validation and limits

`tests/unit/migration.test.ts` executes the real migration in PGlite (embedded Postgres) with minimal Supabase auth schema/roles and two users, testing RLS and constraints under a non-superuser role. `tests/unit/rls.test.ts` uses real Supabase clients and never mocks the provider: a service-role client creates/deletes its generated test users, while both user clients sign in and make all assertions using the anon key. It includes positive owner controls and requires B’s denied insert to return SQLSTATE 42501. It also tests auth validation, auth action outcomes, session cookie refresh, confirmation handling and `requireProject`. Provider calls in those unit tests are mocked.

`npm run test:e2e` runs against a production build, checking login/signup forms, invalid inputs, persistent themes, responsive layouts and signed-out route redirects. Its ordinary smoke checks need no Supabase connection. The opt-in local browser runner also creates, signs in, and removes generated test accounts; it sends no emails because local confirmation is disabled. Screenshots are saved as `docs/screenshots/1.2-signup-*.png`. Historical Step 1.1 shell screenshots remain intact; anonymous access to that shell is intentionally no longer supported.

Live hosted signup/login/logout, email delivery, and deployment of the migration remain unverified until project configuration is supplied. Passing local tests does not establish hosted service readiness.


## Reproduce the fresh local Supabase validation

The pinned Supabase CLI and `supabase/config.toml` support a real local database/Auth/Data API stack. These commands target the local project only. A reset destroys **local test data**; never replace `--local` with `--linked` against an existing hosted project.

```sh
npm ci
SUPABASE_HOME=/workspace/.supabase-cli SUPABASE_USE_SLIM_IMAGES=true npx supabase start --ignore-health-check -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
SUPABASE_HOME=/workspace/.supabase-cli SUPABASE_USE_SLIM_IMAGES=true npx supabase db reset --local --no-seed --yes
npm run test:rls:local
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
```

This managed environment requires the official slim images to fit its Docker storage. Their BusyBox wget health probe uses the container's proxy even for loopback and gets a 403. `--ignore-health-check` keeps that stack running; readiness was established separately through a direct container-loopback Auth health request, actual signed-in Data API requests, and real browser auth flows. It is not evidence of service readiness by itself. The direct local probe was:

```sh
docker exec supabase_auth_SQE-tool wget -Y off -qO- http://127.0.0.1:9999/health
```

The local runner captures CLI status privately and passes generated local keys directly to child processes. It writes no credential files and prints no keys. `--all` runs all unit/database tests against that local project. `--browser` builds with the local public config and runs all browser tests, including actual signup, email menu, logout, and login at both widths. Rebuild with hosted public variables before deploying; local build output must not be deployed as hosted configuration.

For an already-migrated hosted test project, securely configure `NEXT_PUBLIC_SUPABASE_URL` (the origin, without `/rest/v1/`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then run `npm run test:rls`. This command fails rather than skips if configuration is missing. Plain `npm run test` skips the four live tests when no connection is configured and reports them separately. The admin key is used for fixture setup/cleanup only. All application RLS assertions use anon-key clients with independent user sessions. Never reuse the privileged keys posted in chat; rotate them in Supabase and enter replacements securely.

Catalog queries are in `docs/rls-inspection.sql`. Actual fresh-local query output is saved in `docs/1.2-rls-query-results.txt`. This proves local migration and RLS readiness, not migration or authentication on the hosted project.
