# Handoff: A2UI Vite Migration + Unified Server

## What was accomplished

### Part 1 — Frontend file moves (complete)

Moved from `C:\AI2026\a2ui\` → `C:\AI2026\a2ui\frontend\src\`:
- `StreamingEngine.ts` (no changes)
- `StateActionBus.ts` (no changes)
- `ComponentRegistry.ts` (no changes)
- `StreamingEngine.test.ts` (no changes)
- `App.ts` → overwrote `frontend/src/main.ts` (see below)

**New `frontend/src/main.ts`**: Contains the full ComponentRegistry wiring (all 8 renderers: Box, Text, Visual, Field, Button, DataGrid, Chart, Overlay) from the old `App.ts`, PLUS an SSE bootstrap at the bottom that:
- Opens `EventSource('http://localhost:3000/api/ai-stream')`
- Feeds chunks into a `StreamEngine` instance
- Handles `beginRendering`, `surfaceUpdate`, `streamComplete` frames
- Falls back to bare `{ rootId, components }` payloads
- Mounts via `registry.buildNode(rootId, componentStore)` into `#ai-surface-container`

**Updated `frontend/index.html`**: Replaced the Vite demo shell with an A2UI surface (`<div id="ai-surface-container">`), title "My A2UI Client".

**Cleaned up**: Deleted `frontend/src/counter.ts`, `frontend/src/style.css`, and all `frontend/src/assets/` demo files.

### Part 2 — Unified server.js (complete)

Rewrote `C:\AI2026\a2ui\server.js` as an ES-module Express server with:
- **CORS + JSON** middleware
- **LLM**: `import { openai } from '@ai-sdk/openai'`, model `process.env.OPENAI_MODEL || 'gpt-4o'`
- **MCP**: `import { createMCPClient } from '@ai-sdk/mcp'` (stable v2 API, NOT experimental), SSE transport, graceful degradation if unreachable
- **GET `/api/ai-stream`**: Uses `streamText({ ... }).toTextStreamResponse()` to stream A2UI component trees as SSE frames (`beginRendering` → `surfaceUpdate`s → `streamComplete`)
- **POST `/api/ai-action`**: Receives `{ action, state }` from the frontend, routes through the LLM, streams a new tree back
- Both endpoints parse the LLM's JSON response and emit it as progressive SSE frames

### Part 3 — Config + package.json (complete)

- Added `"start": "node server.js"` and `"main": "server.js"` to root `package.json`
- Updated test path to `frontend/src/StreamingEngine.test.ts`
- Installed `dotenv` (added to root dependencies)
- Created `.env.example` with `OPENAI_API_KEY`, `OPENAI_MODEL`, `MCP_SERVER_URL`, `PORT`
- Root `package.json` already had `"type": "module"`

### Root tests: PASSING
All 7 StreamEngine tests pass from their new `frontend/src/` location.

## What's blocked: frontend npm install

The frontend Vite project at `C:\AI2026\a2ui\frontend\` cannot install its dependencies. npm resolves `typescript@~6.0.2` and `vite@^8.2.0` but fails to extract tarballs to `node_modules/` — directories are created but left empty.

**What was tried:**
- Cleared `.npmrc` (had stale `omit=dev`)
- Deleted `node_modules/` + `package-lock.json` (multiple times)
- Fresh npm cache `npm install --cache <empty-dir>`
- Clean npm cache verify (3955 entries, healthy)
- File write test (works fine in the directory)
- Explicit `npm install vite@8.2.0 --loglevel=silly` — npm places vite in the ideal tree, marks packages for deletion in reify, but the ADD phase only adds rolldown native bindings (and those directories stay empty too)

**Suspect**: npm 10.9.3 on Windows with `.package-lock.json`-based reify state that claims the tree is "up to date" despite no files on disk. Not a permissions issue — manual file writes work.

**Likely fix**: Try pnpm or yarn, or upgrade npm to 12.x (`npm install -g npm@12`), or use `--install-strategy=nested` / `--prefer-online`. A fresh agent should start here.

## What still needs to happen

1. **Fix frontend dep install** — get `typescript` and `vite` into `frontend/node_modules`
2. **Run `npm run build` in frontend** — verifies TypeScript compiles and Vite bundles
3. **Smoke test the server**: `node server.js` (needs `OPENAI_API_KEY` set) + `cd frontend && npm run dev`
4. **End-to-end**: Open Vite dev URL, confirm the A2UI surface renders from the stream, type in the Field, click Button, verify action loop

## Reference files

- Plan: `C:\Users\Cyrus\.commandcode\plans\a2ui-vite-migration.md`
- Server: `C:\AI2026\a2ui\server.js`
- Frontend entry: `C:\AI2026\a2ui\frontend\src\main.ts`
- Frontend HTML: `C:\AI2026\a2ui\frontend\index.html`
- Env template: `C:\AI2026\a2ui\.env.example`

## Suggested skills

- `diagnose` — if the npm install issue persists and needs deep debugging
