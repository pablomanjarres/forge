# Forge

> A menu-bar control room for AI media, coding agents, and Remotion renders.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB)
![Electron](https://img.shields.io/badge/Electron-2C2E3B?style=flat&logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Remotion](https://img.shields.io/badge/Remotion-000000?style=flat&logo=remotion&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat&logo=googlegemini&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-server-c8542a?style=flat)
![Status](https://img.shields.io/badge/status-personal_tool_v0.1-6b7280?style=flat)
[![Portfolio](https://img.shields.io/badge/portfolio-pablomanjarres.com-c8542a?style=flat)](https://pablomanjarres.com/portfolio/projects/forge)

Forge is a native macOS desktop app that unifies AI media generation, coding-agent tasks, and Remotion video rendering into one menu-bar surface. It runs a local Express backend inside an Electron shell, streams progress to a React UI over WebSocket, and exposes its own powers as an MCP server so agents can drive it headlessly. One operator, one window, no tab-hopping between provider dashboards.

## Highlights

- **AI-to-Remotion pipeline.** Describe a video in plain English. Gemini returns a schema-constrained component; Forge writes a self-contained `.tsx` under `src/ai-generated/<id>/` with an isolated entry that registers only that composition, runs `remotion render`, and streams the log to the UI. The source project's `Root.tsx` is never touched.
- **Built-in MCP server.** 11 tools over JSON-RPC/stdio (`forge_generate_image`, `forge_generate_video`, `forge_generate_audio`, `forge_list_repos`, `forge_read_repo_file`, `forge_list_templates`, `forge_create_template`, `forge_list_media`) let Claude or any agent operate Forge headlessly. (Image edit, upscale, and template-run are declared but still stubbed on the MCP surface.)
- **Four backends, one surface.** Gemini for image/video/speech/chat, ElevenLabs for voice, RunPod serverless GPU for Qwen-Edit / RealESRGAN / Qwen3-TTS, and the OpenAI Codex CLI run as a subprocess agent.
- **Per-purpose key routing.** A pool of Gemini API keys where image, video, audio, chat, and agent tasks each pin to their own key and model.
- **Live streaming.** Agent output and Remotion render logs are pushed over WebSocket as they happen, each message tagged with its `taskId` so the UI can follow one run.
- **Keys stay off disk.** API keys are encrypted at rest with Electron `safeStorage`; the config write path strips secrets and never stores plaintext.

## How it works

Electron main spawns the Express server as a child process (`ELECTRON_RUN_AS_NODE=1`) on port `3400` and puts a tray icon in the menu bar. The React client talks to that backend over REST + WebSocket. A skills bridge scans `SKILL.md` files across three roots and injects relevant ones into the Gemini system prompt for grounded generation.

```
electron/        Electron main, menu-bar tray, safeStorage keychain (IPC)
server/
  index.ts             60+ REST endpoints + orchestration
  ws.ts                WebSocket broadcast, task-tagged
  mcp-server.ts        11-tool MCP server (JSON-RPC over stdio)
  gemini-compose.ts    prompt -> schema-constrained component -> render
  remotion-process.ts  spawn `remotion studio` / `remotion render`
  skills.ts            SKILL.md scanner -> system-prompt context
  providers/           gemini · elevenlabs · runpod · codex
src/features/    dashboard · providers · agents · templates · editor ·
                 images · videos · audio · workspace · repos · gallery · settings
```

## Tech stack

TypeScript 5.9 · React 19 · Electron 41 · Vite 8 · Express 5 · Remotion · `@google/genai` · Tailwind 4 · shadcn / base-ui · framer-motion · `ws` · simple-git.

## Getting started

Requires macOS (Apple Silicon) for the packaged app, the `codex` CLI on `PATH` for agent tasks, and a Remotion project on disk that `FORGE_REMOTION_DIR` points at for the render path.

```bash
git clone https://github.com/pablomanjarres/forge.git
cd forge
npm install

npm run dev          # Vite client + Express backend (browser)
npm run dev:electron # full desktop shell with tray
```

Package and install the menu-bar app:

```bash
npm run install:app  # build, codesign, and copy to /Applications
```

Register Forge as an MCP server for Claude:

```bash
claude mcp add forge -- node /absolute/path/to/forge/server/mcp-server.ts
```

Keys are added in-app on the Providers page (encrypted via `safeStorage`). For headless dev the server also reads env fallbacks:

```bash
# .env: placeholders only, never commit real keys
FORGE_PORT=3400
FORGE_REMOTION_DIR=/absolute/path/to/remotion-demos
FORGE_GEMINI_API_KEY=your-gemini-key
FORGE_ELEVENLABS_API_KEY=your-elevenlabs-key
FORGE_RUNPOD_API_KEY=your-runpod-key
```

---

Part of [Pablo Manjarres' portfolio](https://pablomanjarres.com/portfolio/projects/forge).