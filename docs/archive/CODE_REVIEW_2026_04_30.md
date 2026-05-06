# Parcela Code Review — April 30, 2026

## Critical Issues

1. **Rate limiting is trivially bypassable by spoofing `X-Forwarded-For`.** `api/src/lib/middleware/rate-limiter.ts:85`-`91` trusts the first `x-forwarded-for` value supplied by the request and uses it as the rate-limit key. `api/src/index.ts:57`-`61` repeats the same trust model for logging. Unless every deployment strips and rewrites this header at a trusted edge proxy, any client can rotate the header and evade the 10 req/min LLM limit. This is a production cost and abuse-control failure for `/api/chat`.

2. **Production defaults expose the API cross-origin with no authentication.** CORS defaults to `'*'` in `api/src/index.ts:29`-`38`, and the API has no production API-key middleware despite `AGENTS.md:41`-`44` and `README.md:153`-`160` explicitly calling out API keys/CORS hardening. Combined with the spoofable rate limiter, any website can drive a user's browser against the public API and burn LLM/DuckDB capacity.

3. **The layer registry can advertise missing or failed tables as loaded.** `initDatabase()` catches layer load failures and still resolves the database in `api/src/lib/db/init.ts:42`-`48`, while `loadAllLayers()` logs per-layer failures and continues in `api/src/lib/db/init.ts:87`-`92`. `buildLayerRegistry()` then marks a layer loaded from manifest presence alone in `api/src/lib/layers/registry.ts:115`-`118`, not from successful table existence. A stale manifest entry with a missing/corrupt parquet produces `/api/layers` saying the layer is queryable, lets `prepareQuery()` pass, and then fails at execution with table/binder errors.

4. **StructuredQuery validation accepts invalid spatial queries that become 500s.** `spatialFilterSchema` makes `distance` optional for every operation in `api/src/lib/orchestrator/validator.ts:36`-`48`; `within_distance` without a distance passes route validation and registry validation, then `QueryBuilder` throws in `api/src/lib/orchestrator/builder.ts:226`-`229`. `/api/query` treats that as an internal execution failure in `api/src/routes/query.ts:148`-`159`. This is an adversarial input path that should be a 400, not a 500.

5. **The Docker image is not a reliable production build.** The Dockerfile never builds the API TypeScript, copies the full API tree including build-time dependencies, and runs `npx tsx src/index.ts` in production at `Dockerfile:37`-`55`. It also relies on `INSTALL spatial` at runtime in `api/src/lib/db/init.ts:29`, which can require network access/extension download inside the container. This is neither minimal nor reproducible, and it can fail on cold deploys without outbound network.

## Significant Issues

1. **Multi-turn parse caching ignores conversation context and language.** `/api/chat` caches parser output by `body.message` only in `api/src/routes/chat.ts:180`-`189`. The parser prompt changes based on `context` and `lang` in `api/src/lib/orchestrator/parser.ts:79`-`85` and `parser.ts:150`-`177`, but those inputs are excluded from the key. Repeating "filter those to parks" after different prior queries can reuse a stale StructuredQuery from another conversation context.

2. **The server trusts client-supplied conversation state.** `chatBodySchema` accepts arbitrary `previousQuery` records and previous explanation text in `api/src/routes/chat.ts:31`-`41`, casts it to `ConversationContext` in `api/src/routes/chat.ts:155`-`157`, and injects it into the LLM prompt in `api/src/lib/orchestrator/parser.ts:150`-`158`. There is no server-owned conversation id or validation of the previous query against the user's actual prior result. A client can prompt-inject through `previousExplanation` or bias the LLM with fabricated prior state.

3. **User text is inserted directly into the parser prompt.** `api/src/lib/orchestrator/parser.ts:212`-`215` wraps `userQuery` in quotes without delimiting, escaping, or using provider-native structured-output controls. A malicious query can include quote-breaking instructions. Zod and registry validation reduce SQL impact, but the NL-to-query layer can still be confused into wrong but valid queries.

4. **Provider failure handling is provider-specific and misclassifies production failures.** `/api/chat` only maps errors containing "Cannot connect to Ollama" or "timed out" to 503 in `api/src/routes/chat.ts:190`-`205`. Together auth failures, 429s, and network failures from `api/src/lib/llm/together.ts:91`-`118` generally fall through as "Could not understand query" 400s. That hides real infrastructure failures from clients and logs.

5. **LLM explanation timeout does not abort the underlying provider call.** `generateEquityExplanation()` uses `Promise.race()` in `api/src/lib/utils/explanation.ts:251`-`255`, and `/api/chat` waits up to 12 seconds in `api/src/routes/chat.ts:270`-`275`. The losing `llm.complete()` keeps running until the provider client's own timeout. Under load, timed-out explanations can continue consuming sockets and LLM capacity after the response has degraded.

6. **Spatial relationship semantics are wrong for `contains` and fragile for large target layers.** `buildSpatialCondition()` compares each source geometry to a single `ST_Union_Agg()` target geometry in `api/src/lib/orchestrator/builder.ts:215`-`254` and `builder.ts:270`-`288`. `ST_Contains(source, union(all targets))` asks whether a source contains the entire union, not whether it contains any matching target feature. Even when the semantics happen to work for `intersects`/`within_distance`, unioning large polygon layers is memory-heavy and defeats spatial-index style execution.

7. **Distance is uncapped.** Zod only requires a positive number for `distance` in `api/src/lib/orchestrator/validator.ts:46`; result caps in `api/src/lib/orchestrator/query-grounding.ts:367`-`418` do not cap spatial radius. An adversarial `within_distance` over all parcels with a huge radius still forces expensive target union and spatial checks before the result limit is applied.

8. **Aggregate validation only checks field existence, not operation compatibility.** `validateQueryAgainstRegistry()` verifies aggregate group/metric fields exist in `api/src/lib/orchestrator/query-grounding.ts:280`-`300`, but it does not reject `sum`, `avg`, or `median` on strings. The builder then emits `SUM("address")`/`MEDIAN("business_name")` in `api/src/lib/orchestrator/builder.ts:93`-`112`, which relies on DuckDB errors instead of returning a controlled validation failure.

9. **Registry schema and display labels drift from loaded/runtime fields.** `shared/locales/field-labels.json:27`-`31`, `46`-`50`, and `57`-`61` use layer keys like `zoning`, `transit`, and `affordable_housing`, while the app passes actual layer names from `ResultsPanel` via `layerName` at `web/src/components/ResultsPanel/index.tsx:95` and looks them up in `localizeKey()` at `web/src/components/ResultsPanel/index.tsx:335`-`339`. Labels for `zoning_districts`, `transit_access`, and `affordable_housing_units` silently fall back or drift.

10. **The frontend API types are not fully aligned with actual requests.** `ChatRequest` only declares `message` and optional `conversationId` in `web/src/types/api.ts:62`-`65`, while `sendChatMessage()` sends `context` and `lang` by locally extending the type in `web/src/lib/api.ts:153`-`162`. The backend has its own Zod shape in `api/src/routes/chat.ts:31`-`42`. This is type drift at the api/web boundary.

11. **The Zustand store has stale-response races.** `sendMessage()` captures `conversationContext` at `web/src/store/chat-store.ts:113`, sends an async request, and then blindly overwrites `features`, `currentQuery`, metadata, and context in `web/src/store/chat-store.ts:135`-`153`. The UI disables input, but the store action itself can be called concurrently from tests, devtools, or future UI paths; an older response can overwrite newer results.

12. **Map updates contain untracked async work after unmount/style changes.** Choropleth updates use `setTimeout(updateChoropleth, 100)` and `m.once('load', () => setTimeout(...))` in `web/src/components/MapView/index.tsx:419`-`424` without cleanup. If the map is removed or style changes before the timeout fires, this can call `setPaintProperty()` on a removed/stale map instance.

13. **Production logging is missing request ids and LLM metadata.** The architecture asks for request id, `queryHash`, LLM provider/model, and latency in `docs/ARCHITECTURE.md:681`, but request logging only emits method/path/status/duration/ip in `api/src/index.ts:52`-`70`. Chat parse/execution logs omit provider/model and do not tie parse and execute phases to a request id in `api/src/routes/chat.ts:220`-`259`.

14. **GeoParquet/CRS validation is mostly claimed, not enforced at runtime.** Runtime loading assumes each parquet's `geometry` column is already EPSG:4326 and transforms it to UTM in `api/src/lib/db/init.ts:122`-`142`. It does not read GeoParquet CRS metadata, compare against manifest CRS, validate extents, or reject malformed geometries. The exported files are WKB-in-Parquet rather than true GeoParquet metadata per `api/scripts/prepare-data.ts:676`-`686`.

15. **Data source paths leak local machine history into shipped metadata.** `api/data/manifest.json:3`-`6`, `46`-`49`, and `73`-`76` include absolute paths under `/Users/richard/Documents/projects/santa-fe-spatial-chat/...`. This is not exploitable by itself, but it is production metadata leakage and makes provenance non-portable.

16. **Frontend tests currently fail.** `npm test` in `web/` fails 25 of 36 tests because the component tests never initialize i18next; `ChatPanel` reads `i18n.language.startsWith()` at `web/src/components/ChatPanel/index.tsx:19`-`22` and `ResultsPanel` does the same at `web/src/components/ResultsPanel/index.tsx:93`-`95`. `web/tests/setup.ts:1`-`4` only installs jest-dom and a scroll stub.

## Minor Issues

1. **The README test count is stale.** `README.md:236` claims "Vitest test suites (91 tests)". The current API suite reports 76 tests passing, and the web suite reports 36 tests with 25 failures. The public docs overstate test health.

2. **`/api/chat/stats` exposes cache internals without auth or rate limiting concern.** `api/src/routes/chat.ts:337`-`341` returns parse/query cache stats to anyone. It is not sensitive data, but it is operational metadata that should be behind the same production posture as the rest of chat.

3. **The frontend logs choropleth internals in normal use.** `web/src/components/MapView/index.tsx:409` logs the choropleth expression to the browser console. This is noise in production and can expose query/detail metadata unnecessarily.

4. **Some script failures are swallowed.** Several fetch scripts end with `.catch(console.error)` without `process.exit(1)`, for example `scripts/fetch-flood-zones-city.ts:164`, `scripts/fetch-parks.ts:138`, and `scripts/fetch-bikeways.ts:136`. CI or shell automation can treat a failed data fetch as successful.

5. **There are duplicate/stale data-prep paths.** The root `scripts/prepare-data.ts` writes to `api/data` at `scripts/prepare-data.ts:319`-`321`, while `api/scripts/prepare-data.ts` writes to `data` relative to `api/` at `api/scripts/prepare-data.ts:798`-`800`. Keeping both versions invites divergent behavior.

## Untested Risk Areas

1. No test covers spoofed `X-Forwarded-For` behavior through the Hono middleware stack.
2. No test covers malformed, stale, or missing manifest entries versus actual loaded DuckDB tables.
3. No test covers `within_distance` without `distance`, aggregate numeric operation on string fields, huge distance values, or large target filter arrays.
4. Spatial tests mostly assert SQL strings. There is limited real-geometry verification for `contains`, `within`, `intersects`, nearest behavior, empty target filters, invalid geometries, or CRS/extents.
5. LLM tests use stubs and do not test provider-specific 401/429/network failures, prompt injection attempts, Spanish prompt quality, or repeated multi-turn messages with different contexts.
6. The parse/query caches are not tested for context/language keying, eviction correctness under large GeoJSON values, or stale data after layer changes.
7. Frontend tests do not cover MapLibre lifecycle behavior; the map component is effectively untested.
8. Store tests do not cover concurrent `sendMessage()` calls or out-of-order responses.
9. Docker is not exercised by tests; there is no check that the production image can start offline with the spatial extension and mounted data.

## What's Working Well

The core design is directionally sound: user input is constrained to a StructuredQuery, SQL values are parameterized, identifiers are at least quoted and registry-validated, geometry columns are separated for display versus metric operations, and the backend has a real preparation pipeline before execution. The implementation is not production-safe yet because the edges around trust, validation, deployment, and test coverage are weaker than the architecture implies.

## Remediation Log — April 30, 2026

### Pass 1: Critical — Security & Reliability

- Changed rate limiting and request logging to derive client identity via `TRUSTED_PROXY_COUNT` instead of trusting the leftmost `X-Forwarded-For` value. Documented the proxy setting in `api/.env.example`.
- Added production startup guards requiring concrete `CORS_ORIGIN` and `API_KEY`, plus a placeholder API-key enforcement middleware for `/api/*`.
- Changed layer registry load state to query actual DuckDB tables after startup, and added structured warnings for manifest/table mismatches. `/api/layers` now exposes only loaded runtime layers.
- Added Zod validation so `within_distance` requires `distance`; `/api/query` now returns formatted 400 validation details for these payload errors.
- Updated Docker build to compile the API TypeScript, run compiled JavaScript in production, and install/load DuckDB spatial at image build time with a comment documenting the build-time network requirement.
- Unblocked the required per-pass web test gate early from Pass 3a by initializing i18next in `web/tests/setup.ts` and aligning stale ChatPanel assertions with the current localized UI text.
- Verification: `api`: `npm run typecheck && npm test` passed, 76 tests. `web`: `npm run typecheck && npm test` passed, 36 tests.

Deferred:

- Docker image size/minimality is improved only at the entrypoint/build correctness level; production still copies the API package tree and `node_modules`.
- Spatial extension fallback still attempts `INSTALL spatial` outside Docker when `LOAD spatial` fails, so non-container local development remains self-healing.

### Pass 2: Significant — Correctness & Trust Boundaries

- Changed parse-cache keys to use a stable JSON key over `{ message, lang, previousQuery }`.
- Removed `previousExplanation` from the chat request schema, shared chat types, frontend store context, and parser prompt. Added parser prompt trust-boundary comments and XML-style user query delimiters.
- Added typed LLM provider failures with provider/model/status metadata. Chat now maps auth to 502, rate limits to 503 with `Retry-After`, network/timeout to 503, and model/provider failures to 500.
- Added abort-signal support to Ollama/Together completion calls and aborts timed-out equity explanation calls.
- Reworked spatial predicates to use capped target-row subqueries and `EXISTS` checks instead of `ST_Union_Agg()` for `contains`, `within`, `intersects`, and `within_distance`; nearest now uses minimum per-target distance.
- Added a 50,000 meter distance cap in validation and documented it in the shared query type.
- Added aggregate metric type validation for `sum`, `avg`, and `median`.
- Moved canonical `ChatRequest`/`ChatResponse` definitions into `shared/types/api.ts` and imported them from both API and web code.
- Added request-id middleware, request-id propagation in logs, and LLM provider/model/latency fields in chat logs.
- Added GeoParquet extent validation against New Mexico bounds and records `isValidated` in the runtime registry without hard-failing layer loads.
- Replaced absolute and parent-relative manifest source paths with paths relative to `api/data`, and added metadata integrity tests for path leakage and field-label layer coverage.
- Updated field-label keys to match runtime layer names and schema fields.
- Added a request generation counter to the Zustand chat store so stale async responses are discarded.
- Cleaned up delayed MapLibre choropleth updates on effect cleanup/unmount and removed the choropleth console log.
- Verification: `api`: `npm run typecheck && npm test` passed, 78 tests. `web`: `npm run typecheck && npm test` passed, 36 tests.

Deferred:

- The chat route still accepts client-returned structured `previousQuery` context; raw explanation prompt injection is removed, but a server-owned conversation store would be the stronger trust boundary.
- Target feature cap logging currently reports that the cap is applied as a guard; it does not pre-count target rows to log only when rows exceed the cap.

### Pass 3: Test Coverage

- Fixed the frontend i18next test setup earlier as a prerequisite to meaningful gates; web tests now run cleanly.
- Added a rate-limiter middleware test proving spoofed `X-Forwarded-For` values do not bypass the limit when `TRUSTED_PROXY_COUNT=0`.
- Added a registry/manifest test proving manifest-only layers are excluded from loaded layer summaries.
- Added a route test proving `within_distance` without `distance` returns 400 with a validation message.
- Added real DuckDB spatial execution tests for `contains`, `within`, `intersects`, and `within_distance` using fixture geometries.
- Added LLM provider failure tests for auth, rate-limit, and network errors, including structured provider/model/status logging assertions.
- Added a concurrent Zustand store test proving stale earlier responses do not overwrite newer results.
- Verification: `api`: `npm run typecheck && npm test` passed, 88 tests. `web`: `npm run typecheck && npm test` passed, 37 tests.

### Pass 4: Minor Cleanup

- Updated `README.md` to report the current passing test counts: 88 API tests and 37 web tests.
- Removed `/api/chat/stats` rather than leaving cache internals exposed as a route.
- Confirmed the choropleth debug `console.log` was already removed during Pass 2.
- Updated the root data-fetch scripts that used `.catch(console.error)` so failures print the error and exit with status 1.
- Verification: `api`: `npm run typecheck && npm test` passed, 88 tests. `web`: `npm run typecheck && npm test` passed, 37 tests.

### Server-Owned Conversation State

- Server-owned conversation state implemented. Client-provided previousQuery removed from schema. In-memory session store with 2-hour TTL and 1000-session cap.
- Clients now send only `conversationId`; `/api/chat` returns `conversationId` and `conversationTurn` on successful responses.
- Verification: `api`: `npm run typecheck && npm test` passed, 95 tests. `web`: `npm run typecheck && npm test` passed, 37 tests. `shared`: `npm run typecheck` passed.
