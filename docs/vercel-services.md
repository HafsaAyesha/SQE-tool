# Vercel services: Next.js plus an internal media gateway

The user confirmed the service names, public routing and binding in `vercel.json`: public `costlens`, internal `worker`, and the `costlens → worker` binding via `WORKER_SERVICE_URL`. Long-running media processing stays on Render. Configuration is ready for publication; a live Vercel deployment is not claimed.

## Request flow and routing

| Component | Runtime / entrypoint | Reachability | Calls |
| --- | --- | --- | --- |
| `costlens` | Next.js at repository root | Public: the final `/(.*)` rewrite routes every public path here | Calls the internal gateway through the injected `WORKER_SERVICE_URL`; calls Supabase, Redis and Gemini as before |
| `worker` | Express gateway at `worker/src/app.ts` | Internal: no public rewrite targets it | Relays only `/jobs` and `/health` to the external Render processor in `WORKER_URL` |
| Render processor | Existing Docker service, `worker/src/server.ts` | Separate Render domain; job triggers remain HMAC authenticated | ffmpeg, Whisper and the existing HMAC callback to the public app's `/api/media/worker` |

The only Vercel-to-Vercel call is **costlens → worker**, so the binding belongs on `costlens`. Its complete declaration is `{ "type": "service", "service": "worker", "format": "url", "env": "WORKER_SERVICE_URL" }`. The gateway does not call the Next.js service, so it has no unused reverse binding. Render is external to the Vercel services project and continues to use the public `APP_URL` for its authenticated callback.

No public path prefix is mounted on the gateway. Browser URLs remain `/api/projects/...` and are handled by Next.js. A request to the public app's `/health` or `/jobs` is not routed to the gateway. The external Render `/health` remains available at its own domain. Internal gateway health reflects Render health rather than reporting a false success while the processor is unavailable.

All project-level Vercel rewrites stay at the top level. Framework, entrypoint and build commands are service-level fields. No top-level framework/build/install/functions override is added. Service roots are relative to the root `vercel.json`.

## Environment variables

- `WORKER_SERVICE_URL`: injected by Vercel into the calling Next.js service at function runtime. **Never set this variable manually** in the dashboard or an environment file. It is not used by builds, middleware, client code, or the Render processor.
- `WORKER_URL`: the manually configured HTTPS origin of the external Render processor. In services mode the gateway uses it; outside services mode Next.js retains direct-to-Render fallback for the existing deployment/local workflow.
- `WORKER_SECRET`: the same server-only secret in Vercel and Render. The gateway validates timestamps/HMAC before forwarding and forwards only the signed job protocol, not browser cookies or Authorization headers.
- `APP_URL`: the public CostLens origin used by Render callbacks, existing auth/demo logic and production scripts. It is not replaced with an internal URL.
- `OPENAI_API_KEY`: required by the Render processor, not by the gateway. Vercel services share project environment settings, so the gateway is inside the same trust boundary as the app; no project secrets are forwarded to Render.

`lib/media/server.ts` reads the binding inside `requireWorkerConfig()` during API execution. A binding takes precedence over the legacy Render URL and is not silently ignored when invalid. Trusted bound HTTP URLs are accepted for internal/local service transport; manually configured non-local processor URLs retain HTTPS validation. Endpoint construction preserves any binding base path instead of resetting it with a leading slash.

## Gateway runtime boundary

`worker/src/app.ts` exports the request-scoped Express app. It imports `gateway.ts`, not `server.ts` or `process.ts`. Consequently it starts neither a listener/polling interval nor ffmpeg/Whisper processing at import time. The conventional `src/app.ts` entrypoint also takes precedence over the Render `src/server.ts` in the Express builder's autodetection. The service explicitly names that entrypoint in `vercel.json`.

`worker/src/gateway.ts` accepts a strict, at-most-2-KB job envelope, checks the HMAC and timestamp window, enforces an eight-second upstream timeout and a small JSON response cap, rejects redirects, and returns friendly errors without exposing upstream bodies. Invalid requests never reach Render. Render remains responsible for its existing atomic job claims and replay-safe processing. If dispatch fails, the Next.js job remains queued and Render's polling can still claim it.

The Render Dockerfile/start command and `render.yaml` are unchanged. The worker package's build command typechecks/compiles the gateway and processor; the gateway's runtime import graph excludes processing code. Root Next.js typechecking still excludes the worker package and tests, preserving the earlier Express-dependency build fix.

## Local testing with Vercel services

1. Install app and worker dependencies: `npm ci` and `npm --prefix worker ci`.
2. In a trusted terminal, authenticate/link the existing Vercel project with a current CLI. Keep its root at the repository root. Use the branch containing this configuration. Do not create a second project accidentally.
3. Configure development Supabase/Redis/Gemini credentials, `WORKER_SECRET` and an appropriate external/development `WORKER_URL`. Do not manually supply `WORKER_SERVICE_URL`.
4. Run `vercel dev`. It starts both configured services and supplies the internal binding. Keep this command, rather than plain `next dev`, for validating Vercel service routing.
5. For fully local media processing, use a separate terminal with ffmpeg installed, load speech/HMAC credentials securely, build the worker, and start its existing processor on a free port such as 3901. Use `APP_URL=http://127.0.0.1:3000`, `PORT=3901`, and `WORKER_URL=http://127.0.0.1:3901` in the appropriate local processes. The processor's public app callback must point to the dev router; do not mix a development database/job with a production processor callback.

Do not use real customer media or production credentials for local smoke tests. A separate development Render processor is also possible if its callbacks reach the matching development app.

## Checks performed

- `npm run lint`, `npm run typecheck`, worker typecheck and the separate test typecheck: PASS.
- `npx vitest run tests/unit/services.test.ts`: seven HTTP/transport tests PASS. They cover actual app dispatcher → local gateway → local synthetic processor, prefixed URLs, valid signatures, credential stripping, invalid/expired/oversized requests, health, upstream errors/redirects and secret-free/no-poll entrypoint loading. No ffmpeg job, provider request or new fixture/user was created.
- Current Vercel CLI 65.7.0 was used to attempt `vercel dev`. It stopped with **No existing credentials found** before starting the services. Full Vercel dev orchestration, injected URLs and deployment are therefore **not verified**.
- The installed official Express builder's entrypoint detector selects `src/app.ts`, confirming it does not select the background Render server.
- No Playwright, full suite or production build was run, following FAST TESTING RULES.

The two service names, catch-all public Next.js route, internal-only gateway visibility and calling-service binding are confirmed. Run authenticated `vercel dev` and deploy the configuration from the production branch after merging it. The full production checks in `docs/deployment.md` still apply.
