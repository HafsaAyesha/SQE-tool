# Step 4A: production deployment and demo

## Current status

The two-service Vercel configuration has been confirmed: `costlens` is public on all paths, `worker` stays internal, and the caller receives `WORKER_SERVICE_URL`. Follow `docs/vercel-services.md` alongside this deployment guide. It adds an internal Express gateway; the Render media processor remains unchanged. `WORKER_SERVICE_URL` is injected by the calling-service binding and must not be entered in dashboard environment settings.


Deployment preparation is complete; a live deployment is **not yet verified**. The user selected a new deployment with dashboard instructions. This environment has no Vercel/Render management credentials, Supabase management token or OpenAI speech key. No new Redis database, paid service or provider budget was created here. The existing configured Supabase project already has application tables; none were reset or migrated during this step.

Use the `phase-2-ai-foundation` GitHub branch. It contains the current app, worker and demo. Deploying `main` would deploy older work. The steps below use the providers' normal dashboards; labels may vary slightly by account. Keep keys out of chat and Git.

The project uses **Gemini**, not Anthropic. No Anthropic key or spending setting is needed. The worker intentionally receives only `APP_URL`, `WORKER_SECRET` and `OPENAI_API_KEY`; it receives signed, job-specific Storage URLs and sends extraction back through the app's Gemini gateway. Do not give it a Supabase service key or an AI extraction key.

## 1. Supabase: choose the production database and apply migrations

1. Open the Supabase dashboard and select your organisation. For a completely new production/demo database, click **New project**, choose a project name and nearby region, generate a database password, and store it in your password manager. Wait until the project is ready. Do not reset the existing CostLens database to make this easier.
2. Open **SQL Editor → New query** and run:

   ```sql
   select to_regclass('public.projects') as existing_projects,
          to_regclass('supabase_migrations.schema_migrations') as migration_history;
   ```

3. For a fresh database (`existing_projects` is null), open `docs/production-migrations.sql`, paste its complete contents into the editor, and click **Run**. The bundle contains migrations 0001–0008, records each successful version and skips recorded versions on a later run. It does not drop existing application data.
4. If the database already contains projects, first back it up. If `migration_history` exists, run `select version, name from supabase_migrations.schema_migrations order by version;`. Only use the bundle when that history accurately describes the applied SQL. If earlier migrations were applied manually without history, stop and reconcile the schema/history before continuing; do not blindly run initial table creation or mark unverified migrations as applied. Send only the non-secret history/schema results if you need help with that reconciliation.
5. Save the final migration query results. This query must show all application tables with `rls: true`, the private media bucket, and `demoProtection: true`:

   ```sql
   select public.production_security_status();
   select schemaname, tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
      or (schemaname = 'storage' and tablename = 'objects')
   order by schemaname, tablename;
   select schemaname, tablename, policyname, cmd
   from pg_policies
   where schemaname in ('public', 'storage')
   order by schemaname, tablename, policyname;
   ```

6. Open **Storage → media-uploads → Configuration**. Confirm **Public bucket is off**, allowed types match the media migration, and the project upload limit supports 500 MB. Keep the bucket private. Open **Database → Publications → supabase_realtime** and confirm `public.jobs` is included; migration 0006 configures it.
7. Open **Project Settings → API / API Keys**. Copy the project URL, legacy anon key and service-role key into your secure environment settings. Use the exact variable names below. The service-role key is server-only. Use fresh production credentials or rotate any key previously exposed in chat or a committed environment file; review session effects before rotating a legacy JWT secret.

You can alternatively apply tracked migrations with Supabase CLI `supabase link` and `supabase db push` after supplying the project reference and database password securely. That route is not available to this session without those credentials. Regenerate the dashboard bundle with `npm run prepare:production` after adding migrations.

## 2. Upstash: create production Redis

1. Open the Upstash console and select **Redis → Create Database**.
2. Name it `costlens-production`, choose a region near Vercel/Supabase, and select a plan appropriate to your expected traffic. Review the displayed price before creating it.
3. Open the database's **REST API** section. Copy its REST URL and REST token, not a Redis TCP connection string.
4. Save them as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel Production environment settings. This session did not create a new database; do not label an existing development database as a newly isolated production database.

## 3. Vercel: import and make the first deployment

1. Open Vercel → **Add New → Project → Import Git Repository**. Connect GitHub if prompted and select `HafsaAyesha/SQE-tool`.
2. Choose a project name, **Next.js** as the framework, repository root `.` and Node.js **22.x**. Use `npm ci` for installation and `npm run build` for the build. Do not set the root to `worker`.
3. Ensure the deployment uses `phase-2-ai-foundation`. If the import screen defaults to `main`, finish project creation, open **Settings → Git → Production Branch**, change it to `phase-2-ai-foundation`, and deploy that branch from **Deployments → Create Deployment**. The Render blueprint also names this branch.
4. Add these environment variables for **Production**. Keep sensitive values out of Preview deployments unless intentionally configured there:

   | Variable | Value / purpose |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase project origin. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production legacy anon key. This is the only public key. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production service-role key; server only. |
   | `GEMINI_API_KEY` | Your existing Gemini key, restricted to the appropriate project/API where supported. |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | New production database's REST credentials. |
   | `SOURCE_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes; create with `openssl rand -base64 32`. Keep it stable after saving sources. |
   | `DEMO_ENABLED` | `false` until the seed finishes and verification is ready. |
   | `DEMO_EMAIL` | `demo@costlens.example`, or a dedicated synthetic demo address you control. |
   | `DEMO_PASSWORD` | Generate at least 16 random characters with `openssl rand -base64 36`; save the same value securely for the seed command. Never publish it. |
   | `GEMINI_MODEL_SMART`, `GEMINI_MODEL_FAST` | Optional. Omit for the verified default `gemini-flash-lite-latest`, or choose an available model. |
   | `TRUST_PROXY_HEADERS` | Omit on Vercel; its trusted ingress is detected automatically. |
   | `APP_URL`, `WORKER_URL`, `WORKER_SECRET` | Add actual values in the following steps. The initial deployment can run without media/demo being enabled. |

   `OPENAI_API_KEY` is listed in the whole-project environment example for the worker; put it in Render, not Vercel. No variable containing a private key, demo password or worker secret should have a `NEXT_PUBLIC_` prefix.

5. Click **Deploy**. Open the resulting **Production** domain and copy its canonical HTTPS origin, without a path or trailing slash. Set `APP_URL` to that origin in Vercel and redeploy. Do not invent a URL before Vercel assigns it.
6. Do not test public signups or enable the demo until the following Supabase and worker settings are finished.

## 4. Supabase: production authentication URLs and confirmation

1. In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to the actual Vercel production origin.
2. Under **Redirect URLs**, add that origin and the exact URLs ending in `/auth/confirm` and `/login`. Add a custom production domain separately if you use one. Avoid broad preview-domain wildcards for a production-only release.
3. Open **Authentication → Sign In / Providers → Email** (called **Providers → Email** in some dashboard versions). Turn **Confirm email on** and save. Keep email/password sign-in enabled.
4. Open **Authentication → Email Templates → Confirm signup**. Use this confirmation link so the implemented callback can exchange the token:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your CostLens account</a>
   ```

5. Configure a suitable mail sender/SMTP service and its allowed sending domain before a real launch. Test with an address you control: signup must require confirmation, and its email link must return to the production app. The synthetic demo is administrator-created and deliberately pre-confirmed; it does not prove that signup emails work.

## 5. Render: deploy the Docker worker

1. Open Render → **New → Blueprint**, connect the GitHub repository and select `phase-2-ai-foundation`. Render reads `render.yaml` from the repository root. Alternatively choose **New → Web Service**, select the repo/branch and Docker runtime.
2. Confirm Docker context `.`, Dockerfile `worker/Dockerfile`, and health-check path `/health`. Do not use `worker` as the Docker context: the image also needs `shared`.
3. Choose an always-on service with sufficient CPU, memory and temporary disk. The blueprint uses the paid **Starter** plan; review Render's current price. A sleeping free service is unsuitable for reliable background processing and cleanup polling.
4. Supply `APP_URL` = the actual Vercel origin and `OPENAI_API_KEY` = a project-scoped speech-to-text key. Render supplies `PORT`. The blueprint generates `WORKER_SECRET`; in **Environment**, reveal/copy it securely and set the identical value as Vercel's `WORKER_SECRET`.
5. Click **Apply / Create Web Service** and wait for a successful deployment. Copy the service's HTTPS origin and set it as Vercel's `WORKER_URL`; redeploy Vercel so the worker URL and secret take effect.
6. Open the worker's `/health` URL. It must return JSON with `"ok": true`. The endpoint confirms the service is running, not that Whisper credentials are valid. The seed will test the real recording pipeline.

The worker does **not** need `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`. Database/AI access stays inside the app's guarded callbacks. Both URLs must be canonical HTTPS origins so worker request signatures reach the correct app.

## 6. Provider spending controls

No billing setting was changed by this session. Choose your monthly amounts before enabling real usage; a suggested small demo budget is not an enforced limit.

- **Gemini / Google Cloud:** there is no Anthropic account in this architecture. Open the Google Cloud project associated with the Gemini key → **Billing → Budgets & alerts → Create budget**. Choose a monthly period, scope it to this project, enter your chosen amount and enable useful alert thresholds. Then review **APIs & Services → Generative Language API → Quotas** and reduce available request/token quotas where supported. Google budgets are alerts, not automatic monetary hard stops. A hard monthly stop requires additional enforcement/operations; it is not implemented or claimed here.
- **OpenAI:** open the API platform → **Settings → Organisation / Project → Limits**. Set the available project budget and notification thresholds for your chosen amount; restrict the key to the required speech endpoint if the account supports that permission. Review **Billing → Usage limits / Credits** for any account-level enforced cap or prepaid option. Project budgets may be alerts rather than hard stops. If using prepaid billing, leave automatic recharge off unless deliberately wanted, and check the provider's delayed-usage/overrun terms. Do not describe an alert-only setting as a guaranteed spending cap.

CostLens enforces per-user daily/request AI quotas, but these are not organisation-wide monthly monetary caps. The public demo can load only previously generated summaries; it cannot start new paid extraction or summary calls.

## 7. Seed the real synthetic demo

1. On your trusted machine, check out the same branch and run `npm ci` with Node 22.x. Put the production values in ignored `.env.local`: `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_URL`, `DEMO_EMAIL` and `DEMO_PASSWORD`. These must match the deployed project. Do not paste them into chat or commit the file. Alternatively, save them securely in this cloud environment and provide the new public origins so this assistant can run the command.
2. Keep Vercel's `DEMO_ENABLED=false` while seeding. Check the local plan without creating accounts or making AI requests:

   ```sh
   npm run seed:demo -- --dry-run
   ```

3. Run the actual production seed:

   ```sh
   npm run seed:demo
   ```

   This creates only a dedicated synthetic account. CodeAudit uses CSV (with outliers/duplicates/missing estimates), the existing MS Project XML, a PDF invoice and the **real recording upload → Render → Whisper → Gemini → review/commit** flow. Marketing uses an in-memory Word budget and generated receipt image. AI-derived amounts must match their known synthetic source amounts before automatic confirmation. The seed temporarily permits unmasked visual input for this synthetic-only account, restores masking, generates real summaries for both projects, then enables authoritative read-only protection.

4. Wait for `docs/demo-seed-results.json` and the success message. Do not treat the dry run as a production seed. A failed worker/model call is not replaced with a transcript fixture or canned summary. Incomplete accounts are locked and are not accepted by public demo sign-in.
5. Re-running against an existing account stops safely. To deliberately rebuild an already marked synthetic demo, use `npm run seed:demo -- --reset-demo`; it deletes that demo account and its sample records. It never resets an unmarked real account. Keep `DEMO_ENABLED=false` during rebuilding and follow the recording-cleanup guidance in `docs/media.md` if an earlier seed failed mid-job.
6. In Vercel, set `DEMO_ENABLED=true` and redeploy. Visitors use **Try the demo**; they never receive the password. They can filter, inspect anomalies, load saved AI insights and export reports. Editing, uploads, privacy changes and fresh AI generation are blocked. The shared account's credential-change trigger prevents a visitor taking over the password/email through the Auth API.

The shared account may still experience contention on its read/export quotas or session availability; this is a small public demonstration, not an isolated multi-tenant sandbox. Its saved, synthetic summaries can be reused beyond the normal seven-day cache window; ordinary users retain the normal cache policy.

## 8. Verify and publish the actual URL

Run this with the production variables after the final deployment:

```sh
npm run verify:production
```

It checks actual RLS/demo protections/private Storage, email-confirmation configuration, worker health, the home page/headers, public demo login, the CodeAudit dashboard, and denial of a direct Supabase mutation. On success it writes `docs/production-verification.json` and replaces the README's pending-live-URL marker with the verified origin. It does not verify the provider billing dashboards, SMTP delivery, custom-API CSRF coverage or a penetration test.

You can also open the home page, click **Try the demo**, confirm the CodeAudit title, and open the worker's `/health` page manually. For the app/worker CLI checks from this managed cloud environment, allow the new Vercel and Render hostnames in its outbound network settings; do not bypass a denied policy. Provider dashboard actions and a user's own terminal do not depend on this environment's network allow-list.

## Remaining production checks

- [ ] Production migrations/RLS, private bucket and Realtime verified against the chosen database.
- [ ] Actual Vercel and Render URLs exist and are configured in both services.
- [ ] Email confirmation, exact redirect URLs and email delivery tested.
- [ ] New production Upstash database configured.
- [ ] Provider budgets/alerts reviewed; any true monetary stop verified separately.
- [ ] Production seed completed through the real worker and AI pipeline.
- [ ] Demo enabled; verified URL and evidence files written.

There is no live success claim until these are completed. Local preparation checks are recorded in `docs/validation-4A.md`.
