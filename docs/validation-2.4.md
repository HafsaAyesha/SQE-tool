# Step 2.4 validation

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| Private direct uploads, owner RLS, 500 MB reservation and Realtime jobs | Actual local Storage/Auth/Postgres/Realtime; owner/foreign/replay checks | PASS | tests/unit/mediaIntegration.test.ts; mediaMigration.test.ts; docs/2.4-rls-query-results.txt |
| HMAC and timestamp validation, atomic claim, bounded callbacks | Unit/integration checks | PASS | tests/unit/mediaProtocol.test.ts; mediaIntegration.test.ts |
| Probe true media, mono chunks, scene/uniform frames, limits and cleanup | Actual ffmpeg/ffprobe against both fixtures and invalid media | PASS | tests/unit/mediaWorker.test.ts |
| Node 20 non-root Docker image | Image build and runtime UID/Node/ffmpeg checks | PASS | worker/Dockerfile; worker/README.md |
| Live progress, timestamp playback, review/commit and Storage cleanup | Production browser tests on desktop/mobile; controlled worker callbacks | PASS | tests/e2e/media.spec.ts |
| Actual Whisper transcription and deployed worker round trip | Runtime configuration inspection | FAIL | OPENAI_API_KEY, WORKER_URL and WORKER_SECRET are not configured in this environment; no live transcription/deployment is claimed |

Changed files: supabase/migrations/0006_media_jobs.sql; shared/media*.ts; lib/media/*; media upload/job/worker API routes; MediaUpload.tsx and import/preview/commit integrations; /worker (Node/TypeScript/ffmpeg Docker service); media fixtures/generator; media tests; docs/media.md; environment/config/build files.

Connections: jobs produce validated CostRows through the same AI gateway, mapping, preview and transactional commit flow. A private original stays available for timestamp comparison until commit; then Storage deletion runs and retries if needed. Temporary worker files are always deleted. The worker receives job-specific signed URLs through authenticated callbacks, not a broad Supabase service key (Supabase does not issue bucket-scoped service-role keys).

Configuration: deploy worker using worker/README.md; configure app WORKER_URL/WORKER_SECRET and worker APP_URL/WORKER_SECRET/OPENAI_API_KEY. Apply migration 0006 on hosted Supabase, enable Realtime jobs and ensure the project Storage upload allowance supports 500 MB. Fixture narration is synthetic and the screen video is a generated spreadsheet animation, not a human recording.

Step 2.4: NOT READY for live use — deploy/configure the worker and run the real Whisper round trip. Local processing/security/UI tests pass.
