# @forge/mcp — Forge Video MCP

A **local stdio MCP server** that lets Claude (the **Claude Desktop app** on this
Mac, or Claude Code) create videos and drop them on your filesystem.

Two lanes:

- **Remotion** (motion graphics / text / branded) — rendered by shelling out to
  `remotion render`. Works **even when the Forge app is closed**.
- **Generative (Google Veo)** — proxied to the Forge app's `/api/generate/video`.
  Needs Forge running (it holds the GCP/Gemini credentials); the server tries to
  launch Forge automatically.

Renders are written as `.mp4` under `FORGE_VIDEO_OUTPUT_DIR`
(default `~/Projects/media/videos/mcp`), and every tool returns the absolute path
+ a `file://` URL.

## Tools

| Tool | What it does |
|---|---|
| `create_video` | Render a prop-driven Remotion video from an ordered list of scenes (`title`, `caption`, `bullets`, `terminal`, `code`, `stat`, `image`, `outro`). landscape / portrait / square. **The main one.** |
| `generate_ai_video` | Google Veo generative clip from a text prompt (via Forge). |
| `render_template` | Render one of the pre-built branded compositions by id. |
| `render_custom_remotion` | Render arbitrary Remotion TSX (must `export const Comp`). Sandboxed + auto-cleaned. The "anything" escape hatch. |
| `list_video_templates` | Describe scene types + branded ids. |
| `list_rendered_videos` | List renders, newest first. |
| `reveal_in_finder` | Open a render (or the output folder) in Finder. |

## Build

```bash
cd /Users/pablo/Projects/forge/mcp
npm install
npm run build   # -> dist/server.js
```

Rebuild `dist/` after any change to `src/server.ts` (the Desktop app runs the
compiled file).

## Register

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forge": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/pablo/Projects/forge/mcp/dist/server.js"]
    }
  }
}
```

Then **fully quit and reopen** the Claude Desktop app.

**Claude Code:**

```bash
claude mcp add forge -- /opt/homebrew/bin/node /Users/pablo/Projects/forge/mcp/dist/server.js
```

## Config (env)

| Var | Default |
|---|---|
| `FORGE_REMOTION_DIR` | `/Users/pablo/Projects/skills/remotion-demos` |
| `FORGE_URL` | `http://localhost:3400` |
| `FORGE_VIDEO_OUTPUT_DIR` | `~/Projects/media/videos/mcp` |
| `FORGE_RENDER_TIMEOUT_MS` | `600000` |

## How the Remotion lane stays isolated

`create_video` renders through a dedicated entry —
`remotion-demos/src/mcp/index.ts` → the `ShortForm` composition — which is
completely separate from the project's shared `src/Root.tsx`. Nothing here edits
the existing branded compositions.
