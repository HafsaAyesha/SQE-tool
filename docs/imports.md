# Structured and online imports (Steps 1.4–1.6)

## Registry and handoff

`lib/import/schema.ts` defines the exact standard CostRow and the guarded RawTable. The cost UI re-exports that shared CostRow type. Each adapter implements `ImportAdapter`; register new adapters in `lib/import/registry.ts`. `getAdapterFor` is asynchronous and examines signatures before compatible MIME hints and then extensions. Signatures do not waive the selected adapter's extension allowlist. The registry guards runtime plugins too. Client descriptors omit parser functions; supported upload formats are rendered from descriptors, so adding file/AI/media adapters does not require rewriting the source screen.

The source wizard lives at `/projects/[id]/import`, with a project-page Import link and project-aware sidebar navigation. It retains the original File or transient online-source details plus the RawTable, selected sheet/path/table, preview count, and optional saved source ID in component memory. Continue to mapping advances the shared Stepper and supplies an `ImportDraft` callback contract. Step 1.6 now implements column mapping, validation, correction, confirmation and transactional saving in the same wizard. A 200-row preview is not the complete import when totalCount is larger: Continue to mapping reparses the original file or refetches the online source with full=true, still under all original limits. It verifies that rows.length equals totalCount before opening mapping, so all rows are reviewed and committed. Do not persist drafts or credentials to browser storage.

All parse/fetch requests call requireProject first. Responses are private/no-store. Both routes return RawTable fields plus totalCount, previewLimit=200 (the default preview limit), and optional sourceId for an explicitly saved online source. The authorized full-data request returns up to 5,000 rows instead of slicing at 200. File parsing never writes uploads to disk. Source parsing does not create cost items.

## Structured adapters and limits

- PapaParse auto-detects CSV delimiters and also accepts TSV/TXT; paste mode fixes the delimiter to tab. Headers are normalized and deduplicated; reserved object-property names are replaced, with warnings.
- SheetJS 0.20.3 reads XLSX/XLS/ODS and exposes sheet names. It is pinned to the official HTTPS tarball at `cdn.sheetjs.com` with lockfile integrity, rather than npm's older vulnerable xlsx version. Parsing reads cached cell values; it never executes formulas, macros or links.
- JSON discovers arrays of objects, exposing JSON Pointer paths (including the empty root path). XML uses fast-xml-parser with processEntities=false; DOCTYPE/ENTITY declarations are rejected before parsing, including UTF-16. XML depth and JSON traversal complexity are bounded.
- MS Project XML selects Tasks and primary baseline Number=0, returns Name/WBS/OutlineLevel/BaselineCost/ActualCost/Cost/Start, and divides cost values by 100. UID 0 project-summary tasks are excluded, while other summary rows remain visible for review.
- Documents are limited to 10 MiB, 5,000 data rows and 256 columns. Workbook ZIP directories are checked before decompression, then actual streamed expansion is verified against declared sizes and a 32 MiB total. Encrypted, ZIP64, traversal, duplicate-entry, unsupported-compression, malformed and entity-containing spreadsheet archives are rejected. A small compressed archive cannot bypass limits by lying in directory sizes.

Sources for MS Project conversion: [Microsoft Cost element documentation](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/cost-element) describes the XML fields; [MPXJ MSPDI DatatypeConverter](https://github.com/joniles/mpxj/blob/master/src/main/java/org/mpxj/mspdi/DatatypeConverter.java) implements parseCurrency as value/100 and printCurrency as value*100. Fixtures assert 300000 → 3000 and 280000 → 2800.

Fixtures under `tests/fixtures` include CSV, TSV, a two-sheet XLSX, two-sheet XLS/ODS, multi-path JSON, generic XML, MS Project XML, and tab-separated paste text. `fake.csv` contains an executable signature, `huge.csv` has 6,000 rows, `bomb.xlsx` expands past 32 MiB, and `doctype.xml` contains an external entity declaration. Regenerate them with `node scripts/generate-import-fixtures.mjs`; this generator is test tooling, never used by production routes.

## Online sources and SSRF

`urlGuard.ts` accepts HTTP(S) only, rejects URL userinfo and internal hostnames, resolves all A/AAAA records and rejects the whole result if any record is non-public. ipaddr.js blocks private, loopback, link-local, metadata, CGNAT, multicast, reserved and IPv4-mapped/translation ranges. WHATWG URL canonicalization handles alternate IPv4 spellings before IP validation.

The HTTP socket connects to the validated numeric IP, preserving the original hostname for Host and verified TLS SNI/certificate identity. This closes the DNS preflight/rebinding gap. Deployments without a proxy use native DNS and pinned TCP/TLS. In a proxy-only environment, the same numeric address is used as CONNECT authority; the configured proxy is a trusted transport and must honor that authority. A fixed Google DNS-over-HTTPS resolver is used through the proxy because native public DNS is unavailable in this machine. No user credentials are sent to the resolver, and the returned IPs receive the same public-range checks. TLS verification stays enabled.

Requests are GET-only with User-Agent CostLens/0.1. The overall DNS/connect/header/body operation has a 10-second deadline. Declared, streamed and decompressed responses are limited to 10 MiB. Redirects are disabled for ordinary URL/HTML sources. Google exports permit up to three validated HTTPS hops within docs.google.com/googleusercontent.com, re-resolving and pinning every hop. API-key headers never cross origins. Routing, proxy, cookie, forwarding and user-agent header overrides are forbidden; authenticated sources require HTTPS. HTML is parsed statically with Cheerio, never rendered/executed; scripts/resources do not run. Tables are selectable, merged cells are expanded within limits, and headerless tables receive generated column names.

Google share links become /export?format=csv; published links use /pub?output=csv. URL mode reuses guarded JSON/CSV adapters, with optional JSON Pointer selection. Automatic mode detects HTML responses and offers table selection; manual override is available.

## Saved sources

Apply `supabase/migrations/0003_online_source_config.sql` after the previous migrations. No new table or RLS bypass is added. By default, credentials are transient, no source row is written, and no credential is echoed in the response.

To enable Save this source, configure a **server-only** `SOURCE_ENCRYPTION_KEY`: canonical base64 for 32 independently random bytes (for example, generate using `openssl rand -base64 32` and enter the value in secure environment settings, never chat or Git). Do not reuse a Supabase or AI API credential. Keep the key stable and backed up securely; replacing it requires re-encrypting existing source configs.

AES-256-GCM encrypts the entire source configuration, including URLs that may contain secret query parameters. Each envelope has a version, random 12-byte IV, 16-byte tag and project/type authenticated context. Only the ciphertext is stored in data_sources.config_encrypted. Names are generic adapter labels, not credential-bearing URLs. Missing/invalid keys fail closed before fetching a requested saved source. Selecting another table/path on a saved source updates only the source ID within the already-authorized project. No plaintext fallback exists. last_imported_at is not changed by source preview/configuration saving; the Step 1.6 transaction sets it only when cost rows are committed.

Future saved-source readers must decrypt on the server and still run urlGuard on every use; encryption does not authorize the destination. The browser cannot obtain the encryption key or decrypt saved configs.

## Managed network settings and validation limits

The draft preserves existing domains and adds cdn.sheetjs.com, dns.google, docs.google.com, *.googleusercontent.com, jsonplaceholder.typicode.com and www.w3.org. IP-pinned CONNECT also requires approval of actual public destination IPs in restrictive proxy deployments. Initial test-source addresses saved for review were 142.251.210.238, 172.67.167.151, 104.21.59.19, 104.18.23.19 and 104.18.22.19. These are DNS observations, not permanent addresses; DNS changes and Google export redirects may require additional validated public destinations. Do not replace IP pinning with an unchecked hostname proxy request to get around a denial.

On the latest live rerun, JSONPlaceholder returned 200 rows and the W3C page returned a 3-row table through the real DNS/IP-pinned guard. Google Sheets still fails at the proxy CONNECT policy check, so the three-source completion criterion remains blocked. Saving a draft does not establish runtime application or publication. Review/save the network changes in environment settings and publish when appropriate, then rerun the exact checks below. A Vercel deployment with normal native DNS/outbound networking does not need this managed-proxy allowlist, but still uses the same SSRF validation and pinned connections.

```sh
npm run lint
npm run typecheck
node scripts/test-local-rls.mjs --all
node scripts/test-local-rls.mjs --browser
# Explicit real-network checks; never count skips/mocks as live validation:
COSTLENS_LIVE_ONLINE=1 npx vitest run tests/unit/publicSources.test.ts
```

The local runner generates an ephemeral encryption key only for throwaway test fixtures; it does not configure a production key. Unit tests exercise real cryptography, guard logic and parser output with controlled DNS/transport responses. Online API tests mock outbound fetching and DB dependencies and assert encryption/no-persistence behavior. Browser tests use real local Supabase and actual internal-URL rejection; positive online UI handoff uses explicitly controlled API responses. Separate live checks target a public Google sample sheet, JSONPlaceholder's todos endpoint, and W3C's table tutorial. JSON API and HTML live checks now pass; Google Sheets remains blocked at the proxy allowlist check before parsing. Full three-source readiness has not been established.

Screenshots are opt-in via COSTLENS_CAPTURE_SCREENSHOTS=1. Routine tests in these steps do not create or replace screenshots.


## Mapping, preview and commit (Step 1.6)

`lib/import/mapping.ts` is the shared pure mapping gate, including synonyms and confidence scores for future AI suggestions. Suggestions use normalized whole names/words (including camel case), assign each column once, and leave unknown headings for manual selection. `applyMapping` returns valid CostRows, all candidate rows and field/row-indexed errors. It parses currency symbols/codes, grouped thousands, European decimals, parenthesized credits, numeric/string Excel serial dates (with Excel's fictitious 1900-02-29 rejected), ISO dates and day/month/year dates. Ambiguous separators have an explicit decimal convention selector. Imports support signed amounts for credits/refunds; manual-entry forms retain their nonnegative rule. Imported amounts must fit numeric(14,2) without silent rounding.

The mapping card list displays samples and automatic/manual status. Saved templates are restricted by owner RLS and auto-apply only for the same source type and exact column set, using the most recently saved matching template. Default currency and decimal convention are saved with the mapping. The template is saved atomically with a successful import, never for a failed transaction.

Preview reuses CostTable without dashboard mutation actions. Invalid visible cells receive rose outlines, problem badges and editable inputs; a labelled correction panel also covers fields not displayed by CostTable (notes/currency/confidence). Apply fixes revalidates locally, and Skip bad rows excludes entire invalid rows. Unapplied edits prevent saving. The summary distinguishes valid rows from rows with problems. Selecting an existing source enables replacement of only its rows; append is the default. A same-name/type source is preselected when available, and all available sources of that type can be chosen explicitly.

`POST /api/projects/[id]/import/commit` calls requireProject before reading a bounded JSON body (16 MiB), validates every confirmed row and mapping with Zod, and calls one user-scoped RPC. It does not use the service-role key. `lib/security/sanitize.ts` prefixes formula-like text with an apostrophe, including a formula prefix hidden behind whitespace/control characters, and preserves numeric amounts. Values are validated again after escaping to avoid overflowing field lengths. The SQL RPC also escapes text when called directly.

Apply **0004_import_commit.sql** after migrations 0001–0003. `commit_cost_import` is SECURITY INVOKER, checks auth.uid() ownership explicitly, retains existing table RLS, and serializes imports on a project row lock. It verifies that an existing source belongs to the same project and source type. Source creation/update, optional source-only deletion, bulk insertion, last_imported_at and optional template creation happen in one transaction. Any failure rolls back every change. Anonymous execution is revoked. No new environment variable is needed for Step 1.6.

`tests/unit/mapping.test.ts`, `commitRoute.test.ts` and `importTransaction.test.ts` cover conversion/data quality, direct route validation, direct RPC authorization, formula escaping, append/replace scoping and rollback after a later failure. `tests/e2e/mapping.spec.ts` runs every structured fixture through real parsing → mapping → commit → local Supabase; also tests unusual headings, automatic template reuse, inline fixes, skipped invalid rows, reload persistence, cross-user rejection and saving all 501 rows from a 200-row initial preview. Its explicit live-network test imports JSONPlaceholder and W3C tables through the actual link UI, mapping and commit. Google Sheets live validation is excluded at the user's instruction.

To include the real JSON/HTML browser imports:

```sh
COSTLENS_LIVE_ONLINE=1 node scripts/test-local-rls.mjs --browser
```

Retrying an append request after an ambiguous network failure can create duplicates: the UI advises checking the dashboard before retrying. The commit API does not yet provide an idempotency token. No screenshots are captured by routine validation.
