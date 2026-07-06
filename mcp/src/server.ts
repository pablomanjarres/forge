#!/usr/bin/env node
/**
 * Forge Video MCP
 * ----------------
 * A local stdio MCP server that lets Claude (Desktop app / Claude Code) create
 * videos on this Mac:
 *   - Remotion (motion graphics / text / branded) — rendered directly by
 *     shelling out to `remotion render`, so it works even when the Forge app
 *     is closed.
 *   - Generative (Google Veo via Forge's /api/generate/video) — needs the
 *     Forge app running because it owns the GCP/Gemini credentials.
 *
 * Renders land as .mp4 files under FORGE_VIDEO_OUTPUT_DIR and the tools return
 * absolute paths + file:// URLs so you can open them from the chat.
 *
 * Register in Claude Desktop's config (claude_desktop_config.json):
 *   "forge": { "command": "/opt/homebrew/bin/node",
 *              "args": ["/Users/pablo/Projects/forge/mcp/dist/server.js"] }
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REMOTION_DIR =
  process.env.FORGE_REMOTION_DIR || '/Users/pablo/Projects/skills/remotion-demos';
const SHORTFORM_ENTRY = 'src/mcp/index.ts'; // MCP's own entry (independent of Root.tsx)
const SHARED_ENTRY = 'src/index.ts'; // the branded compositions
const FORGE_URL = process.env.FORGE_URL || 'http://localhost:3400';
const OUTPUT_DIR =
  process.env.FORGE_VIDEO_OUTPUT_DIR ||
  path.join(os.homedir(), 'Projects/media/videos/mcp');
const RENDER_TIMEOUT_MS = Number(process.env.FORGE_RENDER_TIMEOUT_MS || 10 * 60 * 1000);

// Branded compositions available through the shared entry.
const BRANDED_TEMPLATES = [
  'NellaDemo',
  'RagIndexing',
  'ContextTracking',
  'AssumptionTracking',
  'DependencyTracking',
  'SemanticSearch',
  'PromptInjection',
  'Graph',
  'AgentBenchmark',
  'WorkflowPipelineTemplate',
  'ClaudeTerminalTemplate',
  'ClaudeIdeTemplate',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Result = {content: {type: 'text'; text: string}[]; isError?: boolean};

const ok = (payload: unknown): Result => ({
  content: [{type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}],
});
const fail = (message: string): Result => ({
  content: [{type: 'text', text: message}],
  isError: true,
});

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'video';

const fileUrl = (p: string): string => `file://${p}`;

const remotionBin = (): {cmd: string; prefix: string[]} => {
  const local = path.join(REMOTION_DIR, 'node_modules', '.bin', 'remotion');
  if (existsSync(local)) return {cmd: local, prefix: []};
  return {cmd: 'npx', prefix: ['remotion']};
};

/** Run `remotion render` and resolve with the tail of its output. */
function runRender(
  entry: string,
  compositionId: string,
  outputPath: string,
  propsFile?: string,
): Promise<{ok: boolean; code: number | null; tail: string}> {
  const {cmd, prefix} = remotionBin();
  const args = [
    ...prefix,
    'render',
    entry,
    compositionId,
    outputPath,
    '--codec',
    'h264',
    '--log=info',
  ];
  if (propsFile) args.push(`--props=${propsFile}`);

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {cwd: REMOTION_DIR, env: process.env});
    let buf = '';
    const push = (d: Buffer) => {
      buf += d.toString();
      if (buf.length > 8000) buf = buf.slice(-8000);
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ok: false, code: null, tail: buf + '\n[timed out]'});
    }, RENDER_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ok: false, code: null, tail: `spawn error: ${String(err)}\n${buf}`});
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ok: code === 0, code, tail: buf.slice(-4000)});
    });
  });
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ok: boolean; status: number; body: unknown}> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {...init, signal: ctrl.signal});
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    return {ok: res.ok, status: res.status, body};
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Make sure the Forge app is up (needed for the generative/Veo path). */
async function ensureForge(): Promise<{up: boolean; note: string}> {
  const ping = async () => {
    try {
      const r = await fetchJson(`${FORGE_URL}/api/health`, {method: 'GET'}, 2500);
      return r.ok;
    } catch {
      return false;
    }
  };
  if (await ping()) return {up: true, note: 'forge already running'};

  // Try to launch the packaged app, then wait for it to answer.
  try {
    spawn('open', ['-a', 'Forge'], {detached: true, stdio: 'ignore'}).unref();
  } catch {
    // ignore — we'll report below if it never comes up
  }
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    if (await ping()) return {up: true, note: 'started forge'};
  }
  return {up: false, note: 'forge not reachable'};
}

// ---------------------------------------------------------------------------
// Scene schema (mirrors src/mcp/types.ts in remotion-demos)
// ---------------------------------------------------------------------------
const bg = z.enum(['default', 'warm', 'cool']).optional().describe('Background palette');
const secs = z.number().positive().optional().describe('Seconds on screen (per-type default if omitted)');

const sceneSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('title'), title: z.string(), subtitle: z.string().optional(), seconds: secs, background: bg}),
  z.object({type: z.literal('caption'), text: z.string(), seconds: secs, background: bg}),
  z.object({type: z.literal('bullets'), heading: z.string().optional(), items: z.array(z.string()).min(1), seconds: secs, background: bg}),
  z.object({type: z.literal('terminal'), subtitle: z.string().optional(), lines: z.array(z.string()).min(1), seconds: secs, background: bg}),
  z.object({type: z.literal('code'), code: z.string(), caption: z.string().optional(), seconds: secs, background: bg}),
  z.object({type: z.literal('stat'), value: z.string(), label: z.string().optional(), seconds: secs, background: bg}),
  z.object({type: z.literal('image'), src: z.string().describe('http(s):// URL or absolute file path'), caption: z.string().optional(), fit: z.enum(['cover', 'contain']).optional(), seconds: secs, background: bg}),
  z.object({type: z.literal('outro'), title: z.string().optional(), subtitle: z.string().optional(), seconds: secs, background: bg}),
]);

const DEFAULT_SECONDS: Record<string, number> = {
  title: 3.5, caption: 3, bullets: 4.5, terminal: 6, code: 5, stat: 3, image: 3.5, outro: 3.5,
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = new McpServer({name: 'forge-video', version: '0.1.0'});

server.registerTool(
  'create_video',
  {
    title: 'Create a video (Remotion)',
    description:
      'Render a polished motion-graphics video from an ordered list of scenes. ' +
      'Great for explainers, feature announcements, tips, quotes, terminal/code walkthroughs, and social short-form. ' +
      'Scene types: title, caption, bullets, terminal, code, stat, image, outro. ' +
      'Returns the absolute path + file:// URL of the rendered .mp4.',
    inputSchema: {
      scenes: z.array(sceneSchema).min(1).describe('Ordered scenes that make up the video.'),
      orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('landscape=1920x1080 (default), portrait=1080x1920 (reels/shorts), square=1080x1080'),
      fps: z.number().int().min(15).max(60).optional().describe('Frames per second (default 30).'),
      accent: z.string().optional().describe("Accent hex color, e.g. '#10b981' or '#c1440e'."),
      slug: z.string().optional().describe('Filename slug for the output.'),
      outputDir: z.string().optional().describe('Override output directory (defaults to ~/Projects/media/videos/mcp).'),
    },
  },
  async (args): Promise<Result> => {
    const fps = args.fps ?? 30;
    const props = {
      orientation: args.orientation ?? 'landscape',
      fps,
      accent: args.accent,
      scenes: args.scenes,
    };
    const totalSeconds = args.scenes.reduce(
      (n, s) => n + (s.seconds ?? DEFAULT_SECONDS[s.type] ?? 3),
      0,
    );
    const outDir = args.outputDir || OUTPUT_DIR;
    await fs.mkdir(outDir, {recursive: true});
    const slug = slugify(args.slug || firstText(args.scenes) || 'video');
    const outPath = path.join(outDir, `${slug}-${Date.now()}.mp4`);
    const propsFile = path.join(os.tmpdir(), `forge-shortform-${Date.now()}.json`);
    await fs.writeFile(propsFile, JSON.stringify(props), 'utf-8');

    try {
      const r = await runRender(SHORTFORM_ENTRY, 'ShortForm', outPath, propsFile);
      if (!r.ok) return fail(`Render failed (exit ${r.code}).\n\n${r.tail}`);
      return ok({
        status: 'rendered',
        path: outPath,
        url: fileUrl(outPath),
        orientation: props.orientation,
        fps,
        approxSeconds: Math.round(totalSeconds * 10) / 10,
        scenes: args.scenes.length,
        tip: 'Use reveal_in_finder to open it, or list_rendered_videos to see all renders.',
      });
    } finally {
      fs.unlink(propsFile).catch(() => {});
    }
  },
);

server.registerTool(
  'generate_ai_video',
  {
    title: 'Generate a video with AI (Veo)',
    description:
      'Generate a short generative/cinematic clip from a text prompt using Google Veo (via Forge). ' +
      'Use this for photorealistic or live-action-style footage, NOT for text/graphics (use create_video for those). ' +
      'Requires the Forge app; this tool will try to launch it automatically. Takes 1-3 minutes.',
    inputSchema: {
      prompt: z.string().describe('What the video should show.'),
      model: z.string().optional().describe('Override the Veo model (default veo-2.0-generate-001).'),
    },
  },
  async (args): Promise<Result> => {
    const forge = await ensureForge();
    if (!forge.up) {
      return fail(
        `The Forge app is not running and could not be started automatically (${FORGE_URL}). ` +
          'Open Forge (/Applications/Forge.app), then try again. ' +
          'Veo needs Forge because it holds the GCP/Gemini credentials.',
      );
    }
    try {
      const r = await fetchJson(
        `${FORGE_URL}/api/generate/video`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({prompt: args.prompt, provider: 'gemini', model: args.model}),
        },
        5 * 60 * 1000,
      );
      if (!r.ok) return fail(`Forge /api/generate/video returned ${r.status}:\n${JSON.stringify(r.body, null, 2)}`);
      return ok({status: 'generated', provider: 'gemini-veo', result: r.body});
    } catch (err) {
      return fail(`Veo request failed: ${String(err)}`);
    }
  },
);

server.registerTool(
  'render_template',
  {
    title: 'Render a branded template',
    description:
      'Render one of the pre-built branded Remotion compositions (product demo, feature clips, architecture graph) by id. ' +
      'Use list_video_templates to see the ids. Returns the rendered .mp4 path.',
    inputSchema: {
      compositionId: z.string().describe(`One of: ${BRANDED_TEMPLATES.join(', ')}`),
      outputName: z.string().optional().describe('Filename slug for the output.'),
    },
  },
  async (args): Promise<Result> => {
    await fs.mkdir(OUTPUT_DIR, {recursive: true});
    const slug = slugify(args.outputName || args.compositionId);
    const outPath = path.join(OUTPUT_DIR, `${slug}-${Date.now()}.mp4`);
    const r = await runRender(SHARED_ENTRY, args.compositionId, outPath);
    if (!r.ok)
      return fail(
        `Render failed (exit ${r.code}). If the id is wrong, run list_video_templates.\n\n${r.tail}`,
      );
    return ok({status: 'rendered', compositionId: args.compositionId, path: outPath, url: fileUrl(outPath)});
  },
);

server.registerTool(
  'render_custom_remotion',
  {
    title: 'Render custom Remotion code (advanced)',
    description:
      'Render an arbitrary Remotion composition from TSX you provide, for videos the scene templates cannot express. ' +
      'The module MUST export a component named `Comp` (e.g. `export const Comp: React.FC = () => { ... }`). ' +
      'It can import from "remotion" and use useCurrentFrame/interpolate/spring/AbsoluteFill/Series etc. ' +
      'The file is written to a sandbox, rendered, and cleaned up. Returns the rendered .mp4 path.',
    inputSchema: {
      tsx: z.string().describe('A complete TSX module that exports `const Comp`.'),
      durationInFrames: z.number().int().positive().optional().describe('Default 150.'),
      fps: z.number().int().min(15).max(60).optional().describe('Default 30.'),
      width: z.number().int().positive().optional().describe('Default 1920.'),
      height: z.number().int().positive().optional().describe('Default 1080.'),
      slug: z.string().optional(),
    },
  },
  async (args): Promise<Result> => {
    if (!/export\s+const\s+Comp\b/.test(args.tsx)) {
      return fail('The tsx must export a component named `Comp` (e.g. `export const Comp: React.FC = () => (...)`).');
    }
    const fps = args.fps ?? 30;
    const durationInFrames = args.durationInFrames ?? 150;
    const width = args.width ?? 1920;
    const height = args.height ?? 1080;
    const slug = slugify(args.slug || 'custom');
    const sandbox = path.join(REMOTION_DIR, 'src', 'mcp', 'ai-generated');
    await fs.mkdir(sandbox, {recursive: true});
    const compFile = path.join(sandbox, `${slug}.tsx`);
    const entryFile = path.join(sandbox, `${slug}.entry.tsx`);
    const entrySrc = `import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {FontLoader} from '../../components/FontLoader';
import {Comp} from './${slug}';

const Wrapped: React.FC = () => (
  <FontLoader>
    <Comp />
  </FontLoader>
);

const Root: React.FC = () => (
  <>
    <Composition
      id="Custom"
      component={Wrapped}
      durationInFrames={${durationInFrames}}
      fps={${fps}}
      width={${width}}
      height={${height}}
    />
  </>
);

registerRoot(Root);
`;
    await fs.mkdir(OUTPUT_DIR, {recursive: true});
    const outPath = path.join(OUTPUT_DIR, `${slug}-${Date.now()}.mp4`);
    try {
      await fs.writeFile(compFile, args.tsx, 'utf-8');
      await fs.writeFile(entryFile, entrySrc, 'utf-8');
      const r = await runRender(
        path.relative(REMOTION_DIR, entryFile),
        'Custom',
        outPath,
      );
      if (!r.ok) return fail(`Custom render failed (exit ${r.code}).\n\n${r.tail}`);
      return ok({status: 'rendered', path: outPath, url: fileUrl(outPath), durationInFrames, fps, width, height});
    } finally {
      fs.unlink(compFile).catch(() => {});
      fs.unlink(entryFile).catch(() => {});
    }
  },
);

server.registerTool(
  'list_video_templates',
  {
    title: 'List video templates & capabilities',
    description:
      'Describe what this server can render: the create_video scene types and the branded template ids. Call this before create_video/render_template if unsure.',
    inputSchema: {},
  },
  async (): Promise<Result> =>
    ok({
      create_video: {
        description: 'Prop-driven Remotion video built from ordered scenes.',
        orientations: ['landscape (1920x1080)', 'portrait (1080x1920)', 'square (1080x1080)'],
        sceneTypes: {
          title: 'title + optional subtitle',
          caption: 'one big centered line',
          bullets: 'optional heading + bullet items',
          terminal: 'animated terminal with lines[]',
          code: 'code block + optional caption',
          stat: 'big number/value + optional label',
          image: 'image (URL or file path) + optional caption',
          outro: 'closing title + subtitle with accent rule',
        },
      },
      render_template: {branded_composition_ids: BRANDED_TEMPLATES},
      generate_ai_video: 'Google Veo generative clip (needs Forge running).',
      outputDir: OUTPUT_DIR,
    }),
);

server.registerTool(
  'list_rendered_videos',
  {
    title: 'List rendered videos',
    description: 'List the .mp4 files this server has rendered, newest first, with paths and sizes.',
    inputSchema: {limit: z.number().int().positive().optional().describe('Max results (default 20).')},
  },
  async (args): Promise<Result> => {
    try {
      const entries = await fs.readdir(OUTPUT_DIR);
      const vids = entries.filter((f) => f.endsWith('.mp4'));
      const stat = await Promise.all(
        vids.map(async (f) => {
          const p = path.join(OUTPUT_DIR, f);
          const s = await fs.stat(p);
          return {name: f, path: p, url: fileUrl(p), sizeMB: Math.round((s.size / 1e6) * 10) / 10, modified: s.mtime.toISOString()};
        }),
      );
      stat.sort((a, b) => (a.modified < b.modified ? 1 : -1));
      return ok({dir: OUTPUT_DIR, count: stat.length, videos: stat.slice(0, args.limit ?? 20)});
    } catch {
      return ok({dir: OUTPUT_DIR, count: 0, videos: [], note: 'No renders yet.'});
    }
  },
);

server.registerTool(
  'reveal_in_finder',
  {
    title: 'Reveal a video in Finder',
    description: 'Open Finder highlighting a rendered file (or the output folder if no path is given).',
    inputSchema: {path: z.string().optional().describe('Absolute path to reveal. Omit to open the output folder.')},
  },
  async (args): Promise<Result> => {
    const target = args.path;
    try {
      if (target && existsSync(target)) {
        spawn('open', ['-R', target], {detached: true, stdio: 'ignore'}).unref();
        return ok({revealed: target});
      }
      await fs.mkdir(OUTPUT_DIR, {recursive: true});
      spawn('open', [OUTPUT_DIR], {detached: true, stdio: 'ignore'}).unref();
      return ok({opened: OUTPUT_DIR});
    } catch (err) {
      return fail(`Could not open Finder: ${String(err)}`);
    }
  },
);

function firstText(scenes: readonly unknown[]): string | undefined {
  for (const raw of scenes) {
    const s = raw as Record<string, unknown>;
    if (typeof s.title === 'string') return s.title;
    if (typeof s.text === 'string') return s.text;
    if (typeof s.heading === 'string') return s.heading;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP channel.
  process.stderr.write(`forge-video MCP up. remotion=${REMOTION_DIR} out=${OUTPUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${String(err)}\n`);
  process.exit(1);
});
