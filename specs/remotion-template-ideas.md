# Remotion Template Ideas For Forge

## Active Template Source

- Remotion source project: `/Users/pablo/Projects/skills/remotion-demos`
- Shared media root: `/Users/pablo/Projects/media`
- Preferred rendered output shape: `videos/rendered/<category>/<slug>/current.mp4`
- Versioned renders live beside `current.mp4` under `versions/vNNN-<timestamp>.mp4`.

Forge should avoid hardcoding only `/Users/pablo/Projects/remotion-demos`; use `FORGE_REMOTION_DIR` first, then known local candidates.

## Templates Implemented In This Pass

### Workflow Pipeline

- Forge id: `remotion-workflow-pipeline`
- Remotion composition: `WorkflowPipelineTemplate`
- Render path: `videos/rendered/templates/workflow-pipeline/current.mp4`
- Design: n8n-style automation canvas with node cards, animated curved links, execution status, and media-versioning language.
- Best for: explaining multi-step automation, AI pipelines, video production flows, and publish/review gates.

### Claude Terminal

- Forge id: `remotion-claude-terminal`
- Remotion composition: `ClaudeTerminalTemplate`
- Render path: `videos/rendered/templates/claude-terminal/current.mp4`
- Design: Claude Code terminal boot screen, source-derived from `/Users/pablo/Projects/claude-code` Ink components with black background, orange Clawd mark, version/model/context copy, no-side-rail prompt rules, pointer prompt, block cursor, shortcut hint, tool chips, effort status, and folder chip.
- Best for: showing agent work without relying on raw screen recordings.

### Claude IDE

- Forge id: `remotion-claude-ide`
- Remotion composition: `ClaudeIdeTemplate`
- Render path: `videos/rendered/templates/claude-ide/current.mp4`
- Design: Claude Code desktop app surface with left app navigation/routines/recents, central chat transcript and composer, and right-side Plan plus Terminal panes.
- Best for: coding-agent demos, before/after refactors, bug-fix walkthroughs, and PR review stories.

## Next Template Ideas

- Benchmark Scorecard: compact comparison table with model rows, error classes, attack success, pass/fail badges, and an evidence upload drawer.
- Repo Diff Story: split-panel code diff, file tree, test output, and final shipped patch for bug-fix videos.
- Agent Swarm Board: task cards moving through queued/running/review/done columns for multi-agent orchestration demos.
- Incident Timeline: horizontally scrolling timeline with alert, root cause, patch, deploy, and postmortem moments.
- Product Changelog Reel: one feature per beat with generated screenshots, terminal proof, and small metrics.
- MCP Tool Call Inspector: tool-call transcript with inputs, outputs, latency, and trust boundaries.
- Security Boundary Explainer: red-team input on one side, sanitized context/result isolation on the other.
- Media Render Control Room: queue, render workers, versions, current export, and final publish status.

## Reusable Figma Material Library

- Store reusable design material in `/Users/pablo/Projects/media/design/figma`.
- Use one folder per kit or template slug, for example `workflow-pipeline`, `claude-terminal`, `claude-ide`, `benchmark-scorecard`, or `mcp-tool-call-inspector`.
- Each kit should include `manifest.json` with source Figma URL, node ids, component names, export scale, dimensions, intended Remotion compositions, and notes about crop or animation constraints.
- Keep canonical exports in the media library. Copy only the exact pinned assets needed by the active Remotion project into `/Users/pablo/Projects/skills/remotion-demos/public`.
- Prefer reusable component kits over one-off screenshots when the visual language will recur across demos.

Suggested kits:

- Workflow Node Kit: n8n-style trigger, transform, model, review, publish, and error nodes with ports and status variants.
- Claude Terminal Kit: realistic terminal frame, prompt rows, plan/edit/check/done states, tool-call chips, and interruption/error states.
- Claude IDE Kit: file explorer, code tabs, diff blocks, Claude side panel, task timeline, test runner, and review badges.
- Benchmark Scorecard Kit: compact table, upload drawer, model comparison rows, attack-success badges, and verdict cards.
- MCP Inspector Kit: request/response cards, latency chips, trust-boundary labels, and redacted-secret treatment.

## Design Rules

- Every template should start at the useful moment. Frame 0 must already contain a meaningful terminal, workflow, UI, metric, or evidence artifact.
- Avoid title-only or logo-only openings. Titles should sit over active content, not delay it.
- The first second should answer why the viewer should keep watching: show the result, failure, comparison, or live system state immediately.
- Pipeline templates should feel like real workflow tools: compact nodes, visible ports, curved links, status chips, and execution logs.
- Claude terminal templates should look like the real Claude Code CLI when the user references Claude Code: boot command, source-derived orange Clawd mark, version/model lines, horizontal prompt rules, prompt pointer, shortcut row, tool chips, and effort/folder status. Avoid generic terminal chrome unless the brief asks for a fictional terminal.
- Claude IDE templates should look like the real Claude Code desktop app: left nav, routines, recents, central chat transcript/composer, and right Plan/Terminal panes. Do not default to a VS Code-style file tree/code editor for Claude Code.
- Keep all text readable at 1920x1080 and preserve 8px-or-less radii except for macOS chrome and pills.
- New templates should register in `server/remotion-templates.ts`, validate with `npx remotion still`, and render through Forge when shipping an MP4.
- When Figma improves the design, store the reusable material and manifest before wiring it into a Remotion composition.
