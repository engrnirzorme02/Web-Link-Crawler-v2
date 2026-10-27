# Web-Link-Crawler-v2: Mobile API/CORS Patch

## What was verified

Repository: https://github.com/engrnirzorme02/Web-Link-Crawler-v2
Reviewed ref: `main` (the repository's public tree and source files as inspected on 2026-10-21).

- `package.json` builds both the Vite frontend (`vite build`) and the Node/Express server (`esbuild server.ts ... --outfile=dist/server.cjs`).
- Frontend API calls include relative `/api/...` URLs.
- `src/lib/api.ts` already has exponential-backoff retries for ordinary requests and custom SSE reconnect behavior. Its SSE retry counter resets immediately on every `onopen`, which can prevent the retry limit from working under repeated connection flaps.
- `server.ts` exposes SSE endpoints for `/api/crawl`, `/api/smart-crawl`, and `/api/fetch-bulk`, but no CORS middleware was found.
- No Capacitor/Cordova configuration, Android project/manifest, or GitHub Actions workflow was found in the reviewed `main` tree.

## What the script changes

1. Adds `apiUrl()` with optional `VITE_API_BASE_URL`, keeps same-origin mode when it is blank, and routes direct `/api/...` fetch calls plus direct `EventSource` calls through it.
2. Applies the same URL resolution inside `fetchWithRetry()` and `createEventSourceConnection()`.
3. Stops resetting the SSE retry counter after a momentary connection open; it resets only after 30 seconds of stable connection.
4. Adds an exact-origin CORS allowlist controlled by `CORS_ALLOWED_ORIGINS`, with preflight handling and a small allowlist of request headers.
5. Loads `.env` at Node server runtime via `dotenv/config`, consistent with the README's `.env` setup instructions.
6. Adds `VITE_API_BASE_URL` and `CORS_ALLOWED_ORIGINS` examples and the Vite type declaration.
7. Creates `.github/workflows/ci.yml` to run `npm ci`, `npm run lint`, `npm run build`, verify `dist/index.html` and `dist/server.cjs`, and upload the web/server build output.

## Important limits

- **This does not implement true resumable crawl jobs.** It improves the existing SSE reconnect retry behavior, but a reconnect to `/api/crawl` or `/api/smart-crawl` can start the endpoint handler again. Correct resume requires server-side job IDs, event IDs/replay/checkpoints, and changes to the crawler producer. The `/api/fetch-bulk` stream uses `fetch()` + `POST` and a response-body reader, so it needs separate resume/idempotency design. The script intentionally does not claim these are solved.
- **This does not add an Android APK build.** There is no native Android wrapper in the reviewed repo. Adding an Android build workflow before selecting/adding Capacitor or Cordova would create a workflow for files that do not exist.
- CORS is not authentication. Set `CORS_ALLOWED_ORIGINS` to only the real frontend origins in each deployment. Do not allow opaque `null` origins or use CORS as API access control.
- `VITE_API_BASE_URL` is client-visible configuration. Never place API keys/secrets in it. It is captured at Vite build time.
- The generated CI workflow has not been run against the full repository in this environment because the GitHub connection is read-only and network clone is unavailable. It will provide the first definitive type-check/build result after the patch is applied.

## Apply

From a trusted local checkout of `Web-Link-Crawler-v2`, copy the script into the repository folder and run:

```bash
python apply_web_link_crawler_mobile_fixes.py .
python apply_web_link_crawler_mobile_fixes.py . --apply
```

The first command is a dry run. The second applies changes and creates a backup under `.mobile-api-fixes-backup/<timestamp>/`.

Then run:

```bash
npm ci
npm run lint
npm run build
```

Review the diff before committing. Configure the deployed server's `CORS_ALLOWED_ORIGINS` with the exact origins from which the frontend is served. Configure `VITE_API_BASE_URL` at frontend build time only if the API is hosted on a different origin; leave it blank for same-origin deployment.
