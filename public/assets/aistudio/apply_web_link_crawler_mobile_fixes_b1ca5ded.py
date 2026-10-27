#!/usr/bin/env python3
"""Safely apply the verified mobile API/CORS fixes to Web-Link-Crawler-v2.

Run from a trusted checkout:
  python apply_web_link_crawler_mobile_fixes.py /path/to/Web-Link-Crawler-v2 --apply

The script backs up each changed file under .mobile-api-fixes-backup/<timestamp>/.
It does not create an Android/Capacitor project: none is present in the reviewed repo.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
import re
import shutil
import sys


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def relative_api_import(file_path: Path, src_root: Path) -> str:
    target = src_root / "lib" / "api"
    rel = os.path.relpath(target, start=file_path.parent).replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel


def patch_api_lib(content: str) -> str:
    helper = r'''/**
 * Resolve API paths for same-origin web deployment or a separately hosted backend.
 * VITE_API_BASE_URL is public client configuration only; never place secrets in it.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

'''
    if "export function apiUrl(path: string)" not in content:
        marker = "export interface RetryOptions"
        require(marker in content, "src/lib/api.ts RetryOptions marker was not found")
        content = content.replace(marker, helper + marker, 1)

    # Resolve standard fetch URLs in the helper once, including retry logs.
    start = content.index("export async function fetchWithRetry(")
    end = content.index("export interface SSEOptions", start)
    block = content[start:end]
    destructure = "const { maxRetries = 3, initialDelayMs = 1000, backoffFactor = 2, onLog } = retryOpts;"
    if "const requestUrl = apiUrl(url);" not in block:
        require(destructure in block, "fetchWithRetry options marker was not found")
        block = block.replace(destructure, destructure + "\n  const requestUrl = apiUrl(url);", 1)
    block = block.replace("${url}", "${requestUrl}")
    block = block.replace("fetch(url, options)", "fetch(requestUrl, options)")
    content = content[:start] + block + content[end:]

    # Route EventSource through the same base URL helper and do not reset a retry
    # streak on a momentary onopen; only reset after a stable 30-second connection.
    start = content.index("export function createEventSourceConnection(")
    # This helper is the final export in the reviewed module; retain its full tail.
    block = content[start:]
    if "const resolvedUrl = apiUrl(url);" not in block:
        marker = "}: SSEOptions) {\n  let eventSource: EventSource | null = null;"
        require(marker in block, "createEventSourceConnection setup marker was not found")
        block = block.replace(marker, "}: SSEOptions) {\n  const resolvedUrl = apiUrl(url);\n  let eventSource: EventSource | null = null;", 1)
    if "stableConnectionTimer" not in block:
        marker = "  let reconnectTimer: NodeJS.Timeout | null = null;"
        require(marker in block, "SSE reconnect timer marker was not found")
        block = block.replace(marker, marker + "\n  let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;", 1)

    block = block.replace("${url}", "${resolvedUrl}")
    block = block.replace("new EventSource(url)", "new EventSource(resolvedUrl)")
    block = block.replace(
        """      // Reset retry count on successful connection
      retryCount = 0;""",
        """      // Do not reset on a fleeting onopen: mobile networks/backgrounding can flap.
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      stableConnectionTimer = setTimeout(() => {
        retryCount = 0;
        stableConnectionTimer = null;
      }, 30_000);""",
    )
    block = block.replace(
        """      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      retryCount++;""",
        """      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (stableConnectionTimer) {
        clearTimeout(stableConnectionTimer);
        stableConnectionTimer = null;
      }

      retryCount++;""",
        1,
    )
    block = block.replace(
        """      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {""",
        """      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      if (eventSource) {""",
        1,
    )
    content = content[:start] + block
    return content


def patch_tsx_files(root: Path) -> dict[Path, str]:
    src_root = root / "src"
    changed: dict[Path, str] = {}
    # The helper itself is treated separately above. Search all TS/TSX frontend files,
    # not just a hard-coded short list, to avoid missing endpoint calls.
    pat = re.compile(r"\b(fetch|new\s+EventSource)\(\s*([\"'`])(/api/.*?)(\2)", re.S)
    for file_path in sorted(list(src_root.rglob("*.ts")) + list(src_root.rglob("*.tsx"))):
        if file_path.name == "api.ts" and file_path.parent.name == "lib":
            continue
        old = file_path.read_text(encoding="utf-8")

        def replace_call(match: re.Match[str]) -> str:
            call, quote, url, _same_quote = match.groups()
            gap = " " if match.group(0).startswith(call + " ") else ""
            return f"{call}({gap}apiUrl({quote}{url}{quote})"

        new = pat.sub(replace_call, old)
        if new == old:
            continue

        import_path = relative_api_import(file_path, src_root)
        existing_import = re.compile(
            r"^import\s*\{([^}]+)\}\s*from\s*([\"'])" + re.escape(import_path) + r"\2;?\s*$",
            re.M,
        )
        match = existing_import.search(new)
        if match:
            names = [item.strip() for item in match.group(1).split(",") if item.strip()]
            if "apiUrl" not in names:
                names.append("apiUrl")
                replacement = "import { " + ", ".join(names) + " } from " + match.group(2) + import_path + match.group(2) + ";"
                new = existing_import.sub(replacement, new, count=1)
        else:
            new = f"import {{ apiUrl }} from '{import_path}';\n" + new

        changed[file_path] = new
    return changed


def patch_server(content: str) -> str:
    marker = """async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
"""
    middleware = r'''async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Explicit CORS allowlist for a separately hosted API and mobile WebView.
  // APP_URL is included automatically for the existing same-origin deployment.
  const configuredOrigins = [
    process.env.APP_URL || "",
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ].map((value) => {
    const candidate = value.trim();
    if (!candidate) return "";
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
    } catch { return ""; }
  }).filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins);
  const allowedRequestHeaders = new Set([
    "content-type", "authorization", "x-requested-with", "last-event-id"
  ]);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next(); // Same-origin and non-browser clients need no CORS headers.

    let normalizedOrigin = "";
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") normalizedOrigin = parsed.origin;
    } catch { /* invalid or opaque Origin */ }
    if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
      if (req.method === "OPTIONS") return res.status(403).end();
      return next(); // Browser will reject the response because no allow-origin is emitted.
    }

    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");

    const requestedHeaders = (req.headers["access-control-request-headers"] || "")
      .split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (requestedHeaders.some((header) => !allowedRequestHeaders.has(header))) {
      return res.status(403).end();
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Last-Event-ID");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
'''
    if "const allowedRequestHeaders = new Set([" not in content:
        require(marker in content, "server.ts startServer marker was not found")
        content = content.replace(marker, middleware, 1)
    if "import 'dotenv/config';" not in content and 'import "dotenv/config";' not in content:
        content = "import 'dotenv/config';\n" + content
    return content


def patch_env(content: str) -> str:
    if "VITE_API_BASE_URL=" in content and "CORS_ALLOWED_ORIGINS=" in content:
        return content
    marker = "APP_URL=http://localhost:3000\n"
    require(marker in content, ".env.example APP_URL marker was not found")
    addition = marker + "\n# Public frontend API origin. Leave empty for same-origin web deployment.\n# For a bundled APK, set this to the HTTPS origin of the hosted Node.js API.\nVITE_API_BASE_URL=\n\n# Comma-separated exact frontend origins allowed to call the API cross-origin.\n# Keep only origins actually used by your deployment. Capacitor's default Android origin is https://localhost.\nCORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://localhost\n"
    return content.replace(marker, addition, 1)


def patch_vite_env(content: str) -> str:
    marker = "interface ImportMetaEnv {\n"
    require(marker in content, "src/vite-env.d.ts ImportMetaEnv marker was not found")
    if "VITE_API_BASE_URL" in content:
        return content
    return content.replace(marker, marker + "  readonly VITE_API_BASE_URL?: string;\n", 1)


def ci_workflow_content() -> str:
    return """name: Web Link Crawler CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Type-check frontend and server
        run: npm run lint
      - name: Build Vite frontend and bundled Node.js server
        run: npm run build
      - name: Verify build outputs
        run: |
          test -s dist/index.html
          test -s dist/server.cjs
      - name: Upload web/server build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: web-link-crawler-dist
          path: dist/
          if-no-files-found: error
          retention-days: 7
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", type=Path, help="Path to a checkout of Web-Link-Crawler-v2")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write changes (default: dry-run only)")
    mode.add_argument("--dry-run", action="store_true", help="Preview changes without writing (default)")
    args = parser.parse_args()
    root = args.repo.resolve()
    require((root / "package.json").is_file(), f"No package.json at {root}")
    require((root / "src/lib/api.ts").is_file(), "This does not look like the reviewed repository: src/lib/api.ts is missing")
    require((root / "server.ts").is_file(), "This does not look like the reviewed repository: server.ts is missing")
    require(not (root / "android/app/src/main/AndroidManifest.xml").exists(),
            "An Android wrapper is now present. Stop and re-audit its actual build/manifest before applying this web-only patch.")

    planned: dict[Path, str] = {}
    api_path = root / "src/lib/api.ts"
    api_original = api_path.read_text(encoding="utf-8")
    api_new = patch_api_lib(api_original)
    if api_new != api_original:
        planned[api_path] = api_new

    planned.update(patch_tsx_files(root))

    server_path = root / "server.ts"
    server_original = server_path.read_text(encoding="utf-8")
    server_new = patch_server(server_original)
    if server_new != server_original:
        planned[server_path] = server_new

    env_path = root / ".env.example"
    env_original = env_path.read_text(encoding="utf-8")
    env_new = patch_env(env_original)
    if env_new != env_original:
        planned[env_path] = env_new

    vite_env_path = root / "src/vite-env.d.ts"
    vite_env_original = vite_env_path.read_text(encoding="utf-8")
    vite_env_new = patch_vite_env(vite_env_original)
    if vite_env_new != vite_env_original:
        planned[vite_env_path] = vite_env_new

    # The reviewed main branch has no GitHub Actions workflow. Add web/server CI only;
    # an Android APK workflow would be incorrect until a native wrapper is created.
    ci_path = root / ".github/workflows/ci.yml"
    ci_original = ci_path.read_text(encoding="utf-8") if ci_path.exists() else None
    if ci_original is None:
        planned[ci_path] = ci_workflow_content()

    # Ensure every transformed component has an import, and list all exact modifications.
    for path, new_content in planned.items():
        if path.suffix in {".ts", ".tsx"} and path.name != "api.ts":
            require("apiUrl" not in new_content or re.search(r"import\s*\{[^}]*\bapiUrl\b[^}]*\}\s*from", new_content),
                    f"apiUrl import validation failed for {path.relative_to(root)}")

    print("Planned changes:")
    for path in sorted(planned):
        print(f"  - {path.relative_to(root)}")
    if not args.apply:
        print(f"\nDRY RUN: {len(planned)} files would change. Add --apply to write changes.")
        return 0

    backup_name = ".mobile-api-fixes-backup/" + dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = root / backup_name
    for path in planned:
        if not path.exists():
            continue
        rel = path.relative_to(root)
        target = backup_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    for path, new_content in planned.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(new_content, encoding="utf-8")
    print(f"\nApplied {len(planned)} files. Backup: {backup_name}")
    print("IMPORTANT: CORS headers/origin routing are improved, but this does not add server-side resumable crawl jobs or Android wrapper/build files.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
