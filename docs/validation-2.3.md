# Step 2.3 validation

| Criterion | How checked | Result | Evidence |
| --- | --- | --- | --- |
| DOCX/PDF/scanned PDF/image/PPTX/email and attachments end in shared commit | Real fixture parsers, controlled AI provider, local database transaction | PASS | tests/unit/documents.test.ts; extractCosts.test.ts; aiIntegration.test.ts |
| HEIC conversion, MSG parsing and image limits | Genuine format fixtures, metadata-before-pixel checks | PASS | tests/unit/documents.test.ts |
| Page limits, preflight estimate and >5-page explicit confirmation | Route and adapter rejection tests | PASS | tests/unit/documentRoutes.test.ts |
| Confidence warnings, source thumbnails/text comparison and mobile review | Production desktop/mobile browser flows | PASS | tests/e2e/documents.spec.ts |
| Real model image extraction | Real Gemini receipt call returns validated present amounts | PASS | tests/unit/aiLive.test.ts, opt-in live/vision run |
| No retained original document | In-memory parsers, hash-only source metadata and reviewed row commit | PASS | Parse/commit integration and source inspection |

Changed files: lib/ai/tasks/extractCosts.ts, extractionPrompt.ts and schemas; lib/import document helpers and ai-kind adapters; fileGuard/registry/schema extensions; parse route; ExtractionEstimate/ImportWizard/CostTable preview components; document fixture generators and fixtures; document/unit/integration/browser tests; dependency/build/environment documentation.

Connections: structured Word/slide tables use deterministic mapping first; remaining text or visual pages use the shared Gemini gateway. Email attachments re-enter the registry with depth and cumulative-unit limits. All resulting rows use the existing mapping, preview, sanitization, RLS and atomic commit gate.

Configuration: existing Gemini, Supabase and Upstash variables. The same gateway supports Gemini multimodal requests; no Anthropic key is required. Masking is enabled by default and raw visual extraction is blocked while it is on, since pixels cannot be reliably redacted. Disable masking explicitly in Settings only when appropriate for the document. Text extraction stays masked.

Gaps: deterministic end-to-end fixtures use controlled model responses; separate live tests verify real JSON, receipt vision and summaries. Model output must still be confirmed by the user. HEIC decoding is bounded before allocating pixels. The fixture PDF native-input path is tested through the controlled transport; live receipt vision is the real multimodal smoke proof.

Step 2.3: READY locally; hosted deployment is separate.
