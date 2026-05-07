# Forge Agent Instructions

## Project Shape

- Forge is a Vite + React + Express + Electron app. It is not itself a Remotion project.
- In the packaged macOS app, Electron launches the Express backend as a separate child process with `ELECTRON_RUN_AS_NODE=1` from `dist-electron/server.mjs`. Do not import the Express server directly into Electron main; that previously bound port 3400 while leaving HTTP requests hanging.
- Forge discovers the Remotion project from `FORGE_REMOTION_DIR`, then known local locations. The current source project is `/Users/pablo/Projects/skills/remotion-demos`.
- The shared media root is `/Users/pablo/Projects/media`.
- Forge development commands:
  - `npm run dev` for Vite + Express.
  - `npm run dev:electron` for the desktop shell.
  - `npm run build` for TypeScript and Vite validation.

## Remotion Templates

Forge has two Remotion paths:

- Repo-scanned templates are defined in `server/remotion-templates.ts` and discovered from the active Remotion project `src/Root.tsx`.
- AI-generated templates live under the active Remotion project `src/ai-generated/<compositionId>/` with rendered files in that project's `out/ai-generated/`.

For repo templates:

- Add the composition component in `/Users/pablo/Projects/skills/remotion-demos/src/scenes` or `src/components`.
- Register it as a literal self-closing `<Composition />` in `src/Root.tsx`.
- Use simple numeric constants for `durationInFrames`, `fps`, `width`, and `height`; Forge's scanner only resolves literals or simple `const NAME = 123` values.
- Add a matching definition in `server/remotion-templates.ts`.
- Set `renderPath` relative to `/Users/pablo/Projects/media`, preferably using the versioned media layout: `videos/rendered/<category>/<slug>/current.mp4`.
- Render repo templates through Forge's `/api/templates/:id/render-repo` flow so the Templates UI receives task progress and updates.

For AI-generated templates:

- Generated component code must stay self-contained and import only from `react` and `remotion`.
- Composition IDs must be lowercase kebab-case.
- Do not promote failed generated experiments into repo templates.

## Video Pacing Rules

- Start with content on frame 0. The first frame should already show a terminal, workflow canvas, UI, metric, comparison, or other proof.
- Avoid slow logo/title-only intros. Use the title as a compact overlay while the real demo is already visible.
- Put the strongest result, artifact, or failure state in the first second, then explain it.
- Do not spend more than 0.5 seconds on context before showing the product or evidence.
- Prefer jump-cut pacing for short Forge videos: skip directly into the run, patch, benchmark, render, or workflow state.
- When validating a new template, render or inspect frame 0 as well as a middle frame. Frame 0 must be useful as a thumbnail.

## Claude Code Visual Accuracy

- Claude terminal templates should match the real Claude Code CLI boot surface: black terminal, `~/projects`, `claude`, orange Clawd mark, version/model/context lines, horizontal no-side-rail prompt rules, pointer prompt with block cursor, shortcut hint, tool chips, effort indicator, and folder status.
- When `/Users/pablo/Projects/claude-code` is available, inspect it before recreating Claude terminal visuals. Start with `src/components/LogoV2/CondensedLogo.tsx`, `src/components/LogoV2/Clawd.tsx`, `src/components/PromptInput/PromptInput.tsx`, `src/components/PromptInput/PromptInputFooter*.tsx`, and `src/utils/theme.ts`; use screenshots for placement checks after the source-derived pieces are in place.
- Claude IDE templates should match the real Claude Code desktop app: dark left nav with `Code` selected, pinned/routines/recents lists, central chat transcript with markdown tables and inline code pills, bottom composer with permission/model controls, and right-side `Plan` plus `Terminal` panes.
- Do not turn Claude Code IDE videos into generic VS Code/editor layouts unless the user explicitly asks for a fictional IDE. If screenshots are provided, treat them as the product reference and copy the surface structure before adding cinematic polish.

## Cleanup Rules

- Treat `src/ai-generated` and `out/ai-generated` as disposable generated work unless a specific composition is still useful.
- Before deleting generated artifacts, confirm `Forge/data/templates.json` does not reference them.
- It is safe to clean failed n8n/workflow/PQR experiments when they are untracked and not referenced by Forge data.
- Do not delete repo-scanned compositions or files under `/Users/pablo/Projects/media/videos/rendered` unless the user explicitly asks.

## Figma To Remotion Workflow

When a future video needs Figma objects or reusable component kits:

1. Use the Figma plugin to inspect the provided file/node first. Prefer `get_design_context` for structure and `get_screenshot` for visual verification.
2. Create reusable Figma components for recurring demo surfaces such as n8n-style workflow nodes, Claude terminal chrome, Claude IDE panels, benchmark cards, MCP tool-call rows, and status badges.
3. Store reusable Figma-derived material under `/Users/pablo/Projects/media/design/figma/<kit-or-template-slug>/`, not inside a one-off task folder.
4. Use this per-kit layout when possible: `exports/` for PNG/SVG assets, `screenshots/` for visual references, `components/` for JSON/SVG component pieces, and `manifest.json` for source metadata.
5. Export only the needed node or frame as an asset. If the asset must be bundled with the active Remotion source, copy the final export into `/Users/pablo/Projects/skills/remotion-demos/public`; otherwise keep the canonical copy in `/Users/pablo/Projects/media/design/figma`.
6. In Remotion, load project-local public files with `staticFile()`. For shared media assets, use Forge media paths or copy a pinned version into `public` during implementation.
7. Keep Figma-derived elements as inspectable layers when animation needs per-part control; otherwise export a single PNG/SVG frame for stability.
8. Document the source Figma file URL, node id, component name, exported asset path, dimensions, scale, crop decisions, and intended Remotion templates in the kit manifest.
9. If a component kit is improved for a new video, update the stored kit material first, then update the Remotion scene so future demos inherit the better source.

## Verification

- Run a Remotion still before full renders: `npx remotion still src/index.ts <CompositionId> /tmp/<name>.png --frame <frame>`.
- Render through Forge when the output should appear in the Forge Templates UI.
- Run `npm run build` in Forge after changing server or UI code.
- Start the installed macOS Forge app and confirm `/api/health` responds from port 3400 before testing UI flows.
- Confirm the video card plays from the expected `renderPath` in the installed app, not only in a localhost browser or dev Electron shell.
