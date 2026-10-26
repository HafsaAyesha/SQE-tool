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

`npm run test` executes the real migration in PGlite (embedded Postgres) with minimal Supabase auth schema/roles and two users, testing RLS and constraints under a non-superuser role. It also tests auth validation, auth action outcomes, session cookie refresh, confirmation handling and `requireProject`. Provider calls in those unit tests are mocked.

`npm run test:e2e` runs against a production build, checking login/signup forms, invalid inputs, persistent themes, responsive layouts and signed-out route redirects. It never creates accounts or sends emails. It requires no Supabase connection. Screenshots are saved as `docs/screenshots/1.2-signup-*.png`. Historical Step 1.1 shell screenshots remain intact; anonymous access to that shell is intentionally no longer supported.

Live hosted signup/login/logout, email delivery, and deployment of the migration remain unverified until project configuration is supplied. Passing local tests does not establish hosted service readiness.
