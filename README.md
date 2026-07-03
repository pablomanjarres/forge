<p align="center"><a href="https://pablo-oss.vercel.app/forge"><img src=".github/banner.png" alt="Forge" width="100%" /></a></p>

<h1 align="center">Forge</h1>

<p align="center"><em>A local macOS control panel for AI media generation, Remotion video renders, and agent tasks, that Claude Code can drive over MCP.</em></p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img alt="Electron 41" src="https://img.shields.io/badge/Electron_41-2C2E3B?style=flat-square&logo=electron&logoColor=9FEAF9" />
  <img alt="Express 5" src="https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white" />
  <img alt="Google Gemini" src="https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-22C55E?style=flat-square" /></a>
  <img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha_(v0.1.0)-F59E0B?style=flat-square" />
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-111111?style=flat-square&logo=apple&logoColor=white" />
  <a href="https://pablomanjarres.com/portfolio/projects/forge"><img alt="Portfolio write-up" src="https://img.shields.io/badge/Portfolio-write--up-EA580C?style=flat-square&logo=readme&logoColor=white" /></a>
  <a href="https://pablo-oss.vercel.app/forge"><img alt="Landing page" src="https://img.shields.io/badge/Landing-pablo--oss-000000?style=flat-square&logo=vercel&logoColor=white" /></a>
</p>

<p align="center">
  <a href="#highlights">Highlights</a>
  &nbsp;·&nbsp;
  <a href="#how-it-works">How it works</a>
  &nbsp;·&nbsp;
  <a href="#whats-inside">What's inside</a>
  &nbsp;·&nbsp;
  <a href="#getting-started">Getting started</a>
  &nbsp;·&nbsp;
  <a href="#claude-code-over-mcp">MCP</a>
</p>

---

## What Forge is

Forge is a local macOS app for AI media work. It runs in the menu bar and gives you one dashboard to generate images, video, and audio across several providers, turn a prompt into a rendered Remotion video, run Codex and Gemini agent tasks against a working directory, and manage the git repos and media folders behind your content.

It also runs an MCP server, so Claude Code can call into Forge and make media or read your repos without leaving the terminal. Everything runs on your machine at `localhost:3400`, reachable over your LAN or Tailscale, with API keys held in the macOS Keychain and data stored as plain JSON.

<p align="center"><img src="https://pablomanjarres.com/portfolio/previews/forge.png" alt="Forge screenshot" width="720" /></p>

---

## Highlights

- **Generate media in one place.** Images and video (Gemini, Veo), speech (Gemini TTS, ElevenLabs, RunPod Qwen3-TTS), plus image edit and upscale (RunPod Qwen-Edit, RealESRGAN). Every output lands in a gallery tagged with its prompt and model.
- **Prompt to video with Remotion.** Describe a video and Gemini writes a self-contained Remotion composition. Forge renders it with `npx remotion render` and streams progress live. Chat to modify it, fork variations, re-render after manual edits, or open it in Remotion Studio.
- **Repo-scanned video templates.** Point Forge at a Remotion project and it reads parameterized templates straight out of `Root.tsx`: feature demos, a full product demo, an architecture graph, a workflow pipeline, and Claude terminal + IDE scenes. Renders version into your media folder as `current.mp4`.
- **Run agent tasks.** Launch an OpenAI Codex CLI run or a Gemini task against a directory and watch the output stream in over WebSocket. Cancel any run mid-flight.
- **Manage repos and media.** Clone and pull git repos, browse their file tree, read files, and organize `~/Projects/media` into weekly project folders with `sources/` and `exports/`.
- **Claude Code drives it over MCP.** A stdio MCP server exposes Forge's generation and library tools, so Claude Code can create media and read your repos directly.
- **Local-first and private.** The API only answers localhost, LAN, and Tailscale addresses. Keys stay in the Keychain and never touch config on disk. Data lives as JSON in iCloud Drive.

---

## How it works

Forge is one Electron app wrapping three parts: a React dashboard, an Express API on port `3400`, and provider integrations that shell out to local CLIs or call hosted APIs. A WebSocket pushes task and render progress to the UI as it happens.

The video path is the center of gravity. When you run a template or ask for a new one:

```text
your prompt (+ optional SKILL.md context)
   -> Gemini returns JSON: component code, composition id, fps, size, frames
   -> Forge writes src/ai-generated/<id>/composition.tsx + a scoped entry.tsx
   -> npx remotion render  ->  out/ai-generated/<id>.mp4
   -> WebSocket streams each render line back to the dashboard
```

The scoped `entry.tsx` registers only that one composition, so Forge never touches the Remotion project's own `Root.tsx` and can render generated compositions without clashing with repo templates. Repo templates take a parallel path: Forge scans the project's `Root.tsx`, renders the chosen composition with `remotion render`, and promotes each result into a versioned folder (`versions/vNNN-<timestamp>.mp4` plus `current.mp4`) under `~/Projects/media/videos/rendered/`.

Skills feed the prompt. Forge reads `SKILL.md` files from `~/.claude/skills`, `~/Projects/stitch-skills/skills`, and `~/Projects/skills/skills`, then injects the ones you pick into Gemini's system instruction so generated compositions follow your house style.

---

## Providers

Configure each provider on the **Providers** page. Gemini keys are stored in the Keychain and can be routed per purpose (image, video, audio, chat, agent tasks); the rest read from the Keychain or an env var fallback.

| Provider | What it does | Models / tools |
|---|---|---|
| **Google Gemini** | Images, video, speech, chat, and Remotion composition | `gemini-2.0-flash-exp` (image), `veo-2.0-generate-001` (video), `gemini-2.5-flash-preview-tts` (speech), `gemini-2.5-pro` (chat + compose) |
| **OpenAI Codex CLI** | Agent tasks in a working directory | `codex exec --json` subprocess, streamed and cancelable |
| **RunPod** | Image edit, upscale, and TTS on serverless GPUs | Qwen-Edit, RealESRGAN, Qwen3-TTS |
| **ElevenLabs** | Speech and sound effects | `eleven_multilingual_v2` |
| **Claude Code** | Calls into Forge over MCP | `forge_*` tools (see below) |

Provider health shows live on the Dashboard, checked against each API or by looking for the CLI binary on your PATH.

---

<h2 id="whats-inside">What's inside</h2>

Forge is a single desktop app, not a monorepo. The tree below maps the real modules:

```text
forge/
├─ electron/                 Menu-bar desktop shell
│  ├─ main.ts                Single-instance app, spawns the Express server, tray + login item
│  ├─ preload.ts             Context-isolated bridge to the Keychain
│  └─ keychain.ts            macOS Keychain read/write for API keys
├─ server/                   Express API + provider integrations (port 3400)
│  ├─ index.ts               All HTTP routes: tasks, media, templates, repos, workspace
│  ├─ ws.ts                  WebSocket broadcast for live task + render progress
│  ├─ storage.ts             JSON file store (iCloud Drive in production, ./data in dev)
│  ├─ mcp-server.ts          stdio MCP server so Claude Code can call Forge
│  ├─ gemini-compose.ts      Gemini writes a Remotion composition, Forge renders it
│  ├─ remotion-templates.ts  Scans a Remotion project's Root.tsx for repo templates
│  ├─ remotion-process.ts    Starts and stops Remotion Studio
│  ├─ media-workspace.ts     Browses ~/Projects/media, scaffolds weekly projects
│  ├─ skills.ts              Reads SKILL.md files and feeds them to Gemini
│  ├─ bin-path.ts            Finds npx / codex / claude for the packaged-app PATH
│  └─ providers/             gemini.ts · codex.ts · runpod.ts · elevenlabs.ts
├─ src/                      React 19 dashboard (Vite + Tailwind 4 + shadcn/ui)
│  ├─ features/              dashboard, providers, agents, templates, editor,
│  │                         images, videos, audio, workspace, repos, gallery, settings
│  ├─ components/            layout · shared · ui
│  └─ lib/                   api client, types, utils
├─ scripts/                  build-app.js · verify-packaged-app.js · verify-template-actions.js
├─ build/                    App and tray icons
├─ data/                     Local JSON store (dev)
└─ AGENTS.md                 Instructions for coding agents working in this repo
```

---

## Tech stack

| Layer | Tools |
|---|---|
| **Dashboard** | React 19, React Router 7, Vite 8, Tailwind CSS 4, shadcn/ui + Base UI, Framer Motion, lucide-react, Instrument Serif + Inter |
| **API** | Node, Express 5, `ws` (WebSocket), `simple-git`, tsx |
| **Desktop** | Electron 41, electron-builder, macOS Keychain, menu-bar tray |
| **AI** | Google Gemini (`@google/genai`), OpenAI Codex CLI, RunPod, ElevenLabs |
| **Video** | Remotion, rendered from a separate Remotion project |
| **Language + tooling** | TypeScript 5.9, ESLint 9 |

---

## Getting started

> Requires macOS, Node 20+, and npm. Remotion renders need a local Remotion project (Forge auto-discovers `~/Projects/skills/remotion-demos`, or set `FORGE_REMOTION_DIR`).

**1. Clone and install**

```bash
git clone https://github.com/pablomanjarres/forge.git
cd forge
npm install
```

**2. Run the dashboard** (Vite client + Express API)

```bash
npm run dev
# open http://localhost:5173  (the client proxies /api and /ws to :3400)
```

**3. Or run the desktop app** (macOS menu-bar shell)

```bash
npm run dev:electron     # compiles the preload, then Vite + Express + Electron
```

**Build and install `Forge.app` into `/Applications`:**

```bash
npm run install:app      # builds, installs, code-signs, and verifies the packaged app
```

**Run the production server without Electron:**

```bash
npm run build            # tsc -b && vite build
npm run start            # Express serves the built app on http://localhost:3400
```

<details>
<summary>Every npm script</summary>

| Script | Does |
|---|---|
| `npm run dev` | Vite client + Express API together |
| `npm run dev:client` | Vite client only |
| `npm run dev:server` | Express API only (`tsx watch`) |
| `npm run dev:electron` | Preload compile, then Vite + Express + Electron |
| `npm run build` | Type-check and build the client (`tsc -b && vite build`) |
| `npm run build:app` | Package the macOS `.app` and verify it |
| `npm run install:app` | Build, install to `/Applications`, code-sign, verify |
| `npm run update:app` | Alias of `install:app` |
| `npm run start` | Production Express server (`NODE_ENV=production`) |
| `npm run lint` | ESLint over the repo |
| `npm run preview` | Preview the built client |
| `npm run verify:template-actions` | Smoke-test the template action endpoints |

</details>

---

## Configuration

Forge reads secrets from the macOS Keychain in the packaged app, and from env vars in development.

| Variable | Purpose |
|---|---|
| `FORGE_PORT` | API port (default `3400`) |
| `FORGE_REMOTION_DIR` | Path to your Remotion project (otherwise auto-discovered) |
| `FORGE_DATA_DIR` | Override the dev data directory |
| `FORGE_GEMINI_API_KEY` | Gemini key (env fallback) |
| `FORGE_GEMINI_IMAGE_API_KEY`, `..._VIDEO_...`, `..._AUDIO_...`, `..._CHAT_...` | Per-purpose Gemini keys |
| `FORGE_RUNPOD_API_KEY` | RunPod key (env fallback) |
| `FORGE_ELEVENLABS_API_KEY` | ElevenLabs key (env fallback) |
| `FORGE_URL` | Where the MCP server reaches Forge (default `http://localhost:3400`) |

The shared media root is `~/Projects/media`. Codex and Claude are CLI-based: Forge shells out to `codex` and `claude` on your PATH, and adds the common Homebrew and `~/.local/bin` locations for the packaged app.

> **Local-first by default.** The API rejects any request that is not from localhost, a private LAN (`192.168.x`, `10.x`), or the Tailscale range (`100.64.0.0/10`). CORS is locked to those same origins plus `*.ts.net`. API keys are stripped before anything is written to config on disk. The tray menu shows your LAN address so you can open Forge from your phone.

---

<h2 id="claude-code-over-mcp">Claude Code over MCP</h2>

Register Forge as an MCP server so Claude Code can generate media and read repos through it:

```bash
claude mcp add forge -- node /path/to/forge/server/mcp-server.ts
```

Wired tools:

| Tool | Does |
|---|---|
| `forge_generate_image` | Generate an image with Gemini |
| `forge_generate_video` | Generate a video with Gemini Veo |
| `forge_generate_audio` | Generate speech with Gemini TTS or ElevenLabs |
| `forge_list_media` | List gallery media, filterable by type |
| `forge_list_repos` | List managed repositories |
| `forge_read_repo_file` | Read a file from a managed repo |
| `forge_list_templates` | List available templates |
| `forge_create_template` | Create a template definition |

Every MCP call is logged to Forge's activity feed. `forge_edit_image`, `forge_upscale_image`, and `forge_run_template` are registered as placeholders over MCP for now; image edit, upscale, and template runs work today through the HTTP API and the dashboard.

---

## License

Forge is released under the [MIT License](https://opensource.org/licenses/MIT).

---

<p align="center">
  <a href="https://pablo-oss.vercel.app/forge">Landing page</a>
  &nbsp;·&nbsp;
  <a href="https://pablomanjarres.com/portfolio/projects/forge">Portfolio write-up</a>
  &nbsp;·&nbsp;
  Built by <a href="https://pablomanjarres.com">Pablo Manjarres</a>
</p>
