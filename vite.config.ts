import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { channelOf } from './src/lib/channel.ts';
import { COUNTER_ORIGIN } from './src/lib/counter.ts';
import type { AtRule, Node, Rule } from 'postcss';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { backdropsErrors, formatBackdrops, type Backdrops } from './src/lib/backdropData.ts';
import { PROFILE_NAMES } from './src/lib/emberProfiles.ts';
import { preloadedWith } from './src/lib/retriedPages.ts';
import { glslMinify } from './glslMinify.ts';
import { keyframesFirst } from './keyframesFirst.ts';
import { polyfillsFirst, polyfillsScript } from './polyfillsFirst.ts';
import { peerjsProbe } from './peerjsProbe.ts';
import { qaServer } from './qaServer.ts';
import { weaveTile } from './weaveTile.ts';

/**
 * Content Security Policy for the production build: the page may only run its
 * own scripts and talk to itself and the PeerJS signalling server. (WebRTC
 * connections between players aren't covered by CSP.) Not applied in dev,
 * where Vite needs inline scripts and its own websocket.
 */
function csp(env: Record<string, string>): Plugin {
  const peerHost = env.VITE_PEER_HOST || '0.peerjs.com';
  const secure = (env.VITE_PEER_SECURE ?? 'true') === 'true';
  const port = env.VITE_PEER_HOST && env.VITE_PEER_PORT ? `:${env.VITE_PEER_PORT}` : '';
  const signalling = `${secure ? 'https' : 'http'}://${peerHost}${port} ${secure ? 'wss' : 'ws'}://${peerHost}${port}`;
  const policy = (inline: string) => [
    "default-src 'self'",
    // And the one inline script, the built-ins an older browser lacks (polyfillsFirst), by its hash.
    `script-src 'self' 'sha256-${createHash('sha256').update(inline).digest('base64')}'`,
    // Svelte sets inline style attributes (animations, positions).
    "style-src 'self' 'unsafe-inline'",
    // The counts (lib/count.ts) go out as a beacon, or an image where a beacon can't.
    `img-src 'self' data: blob: ${COUNTER_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${signalling} ${COUNTER_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: async (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy(await polyfillsScript())}" />`),
  };
}

/**
 * The beta build (VITE_CHANNEL=beta, served at poe2.quest/beta/): kept out of
 * search results, and its tabs, link previews and home screen app say Beta and
 * point to it. (The app's start_url and scope are relative, so they point to
 * the beta by themselves, and it installs apart from the live one.)
 */
function betaPages(env: Record<string, string>): Plugin {
  let outDir = '';
  let publicDir = '';
  return {
    name: 'beta-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      publicDir = config.publicDir;
    },
    // After the public folder is copied out. Read from the public folder, not
    // the copy, so a second call (a watched build) never says Beta twice; and
    // only where the copy is, so a failed build's own error isn't hidden.
    closeBundle() {
      if (env.VITE_CHANNEL !== 'beta') return;
      const file = join(outDir, 'manifest.webmanifest');
      if (!existsSync(file)) return;
      const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'));
      manifest.name = `Beta • ${manifest.name}`;
      manifest.short_name = 'PoE2 Beta';
      writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    },
    transformIndexHtml(html) {
      if (env.VITE_CHANNEL !== 'beta') return html;
      // The legal pages carry noindex already.
      const noindex = html.includes('name="robots"') ? '' : '<meta name="robots" content="noindex" />\n    ';
      return (
        html
          .replace('<title>', `${noindex}<title>Beta • `)
          // A noindex page shouldn't name another as its canonical.
          .replace(/\n\s*<link rel="canonical"[^>]*>/, '')
          .replace(/(property="og:url" content=")https:\/\/poe2\.quest\//, '$1https://poe2.quest/beta/')
          .replace(/((?:property="og:title"|name="twitter:title") content=")/g, '$1Beta • ')
      );
    },
  };
}

/**
 * The fonts the start page shows, as their built file names begin. The page
 * is rendered by script, so the browser would only find them once the bundle
 * has run and laid out text; preloading fetches them alongside the bundle, so
 * the text appears in its own fonts instead of swapping from a fallback.
 */
const FIRST_SCREEN_FONTS = [
  'maragsa-display-',
  'cinzel-latin-700-normal-',
  'eb-garamond-latin-400-normal-',
  'eb-garamond-latin-400-italic-',
];

function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle || !ctx.filename.endsWith('/index.html')) return;
        const files = Object.keys(ctx.bundle).filter(
          (f) => f.endsWith('.woff2') && FIRST_SCREEN_FONTS.some((name) => f.split('/').pop()!.startsWith(name)),
        );
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `./${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

/** The module that counts the game's script errors (count.ts countScriptErrors), as the first thing the game runs. */
const COUNT_ERRORS = /src[\\/]lib[\\/]countErrors\.ts$/;

/**
 * The game's script errors are counted from before anything else of its
 * start runs. A module's imports run before its own code, depth first, so
 * the chunks the game's entry imports (the session, the effects, the sounds)
 * all run before main.ts's first line: a throw at the top of one of them
 * leaves the page blank, and went uncounted while lib/countErrors.ts ran
 * after them. Its chunk group (below) puts it, and what it imports, in a
 * chunk the bundler runs first; this fails the build if any module it
 * doesn't import comes to run before it, however the chunks fall.
 */
function errorsFirst(): Plugin {
  return {
    name: 'errors-first',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = new Map<string, { fileName: string; name: string; isEntry: boolean; imports: string[]; moduleIds: string[] }>();
      for (const file of Object.values(bundle)) if (file.type === 'chunk') chunks.set(file.fileName, file);
      const entry = [...chunks.values()].find((c) => c.isEntry && c.name === 'main');
      if (!entry) throw new Error('errors-first: no main entry chunk to check.');
      const id = [...chunks.values()].flatMap((c) => c.moduleIds).find((m) => COUNT_ERRORS.test(m));
      if (!id) throw new Error("errors-first: lib/countErrors.ts isn't in the build, so the game's script errors go uncounted.");
      // What it imports, all the way down: what may run before it.
      const needs = new Set<string>();
      const need = (m: string) => {
        for (const i of this.getModuleInfo(m)?.importedIds ?? []) {
          if (needs.has(i)) continue;
          needs.add(i);
          need(i);
        }
      };
      need(id);
      // The modules in the order they run: each chunk's imports, in order, before its own modules, which run in theirs.
      const seen = new Set<string>();
      const order: string[] = [];
      const visit = (name: string) => {
        if (seen.has(name)) return;
        seen.add(name);
        const chunk = chunks.get(name);
        for (const i of chunk?.imports ?? []) visit(i);
        order.push(...(chunk?.moduleIds ?? []));
      };
      visit(entry.fileName);
      if (!order.includes(id)) throw new Error('errors-first: the game no longer imports lib/countErrors.ts statically, so its script errors go uncounted.');
      const before = order.slice(0, order.indexOf(id)).filter((m) => !needs.has(m));
      if (before.length) throw new Error(`errors-first: ${before.length} modules run before lib/countErrors.ts, so their errors go uncounted, among them ${before.slice(0, 5).map((m) => m.replace(/^.*?(?=(src|node_modules)\/)/, '')).join(', ')}.`);
    },
  };
}

/**
 * Fontin's license (app.css) asks for its notice beside the @font-face that
 * embeds it. The CSS minifier drops every comment, even a /*! one, so the
 * build puts it back before each Fontin face.
 */
const FONTIN_NOTICE = '/* A font by Jos Buivenga (exljbris) -> www.exljbris.com */';

function fontinNotice(): Plugin {
  return {
    name: 'fontin-notice',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css') || typeof file.source !== 'string') continue;
        file.source = file.source.replace(/@font-face\s*\{\s*font-family:\s*["']?Fontin\b/g, (face) => FONTIN_NOTICE + face);
      }
    },
  };
}

/**
 * Which build of the rune circles' plates this is (src/lib/plates, built in
 * the browser and kept: lib/plateStore.svelte.ts): a hash of the plates and
 * of everything they import (what's imported only as a type left out), so a
 * device keeps a plate it built until the code that draws it changes.
 */
function platesVersion() {
  const hash = createHash('sha256');
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    hash.update(file.slice(file.indexOf('src')).replaceAll('\\', '/')).update(code);
    for (const m of code.matchAll(/^(?!import type)(?:import|export)[^;]*?from '(\.{1,2}\/[^']+)'|import\('(\.{1,2}\/[^']+)'\)/gm)) {
      const path = join(dirname(file), m[1] ?? m[2]);
      walk(path.endsWith('.ts') ? path : `${path}.ts`);
    }
  };
  walk(fileURLToPath(new URL('./src/lib/plates/index.ts', import.meta.url)));
  return hash.digest('hex').slice(0, 12);
}

/** Where the backdrop tool saves to (and the game reads its zones' looks from). */
const BACKDROPS_FILE = fileURLToPath(new URL('./src/data/backdrops.json', import.meta.url));

/**
 * The backdrop tool's Save (backdrop.html, src/backdropTool): on the dev
 * server only (never in a build), a POST of the whole backdrops file to
 * /__backdrops/save writes src/data/backdrops.json, once it is checked
 * (backdropsErrors: every zone, look, motion and the endgame's settings in
 * shape, the zones' names as they are). JSON from this page only.
 */
function backdropSave(): Plugin {
  return {
    name: 'backdrop-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__backdrops/save', (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const origin = req.headers.origin;
        if (req.method !== 'POST') return reply(405, { errors: ['POST only'] });
        if (!String(req.headers['content-type']).startsWith('application/json') || (origin && new URL(origin).host !== req.headers.host)) {
          return reply(403, { errors: ['JSON from the tool itself only'] });
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 1_000_000) req.destroy();
        });
        req.on('end', () => {
          let data: Backdrops;
          try {
            data = JSON.parse(body) as Backdrops;
          } catch {
            return reply(400, { errors: ['not JSON'] });
          }
          const names = (JSON.parse(readFileSync(BACKDROPS_FILE, 'utf8')) as Backdrops).zones.map((z) => z.name);
          const errors = backdropsErrors(data, names, PROFILE_NAMES);
          if (errors.length) return reply(400, { errors });
          writeFileSync(BACKDROPS_FILE, formatBackdrops(data));
          reply(200, { saved: 'src/data/backdrops.json' });
        });
      });
    },
  };
}

/**
 * Hover styles only for devices that can really hover. A touch screen fakes
 * a hover on tap and keeps it until the next tap elsewhere, so a tapped card
 * or button would stay lifted and lit. Every selector with `:hover` (in the
 * app's CSS and every component's) moves into `@media (hover: hover)`; the
 * other selectors of the same rule (`:focus-visible` and the like) stay put.
 */
const HOVER_MEDIA = '(hover: hover)';

const hoverOnlyWhereHoverable = {
  postcssPlugin: 'hover-only-where-hoverable',
  Rule(rule: Rule, { AtRule }: { AtRule: typeof import('postcss').AtRule }) {
    if (!rule.selector.includes(':hover')) return;
    for (let p: Node | undefined = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && (p as AtRule).params.includes(HOVER_MEDIA)) return;
    }
    const hover = rule.selectors.filter((s) => s.includes(':hover'));
    const rest = rule.selectors.filter((s) => !s.includes(':hover'));
    const media = new AtRule({ name: 'media', params: HOVER_MEDIA });
    media.append(rule.clone({ selectors: hover }));
    if (rest.length) {
      rule.selectors = rest;
      rule.after(media);
    } else {
      rule.replaceWith(media);
    }
  },
};

/**
 * The app's own mouse pointer (src/lib/ownCursor.ts): every `cursor: pointer`,
 * `default`, `not-allowed`, `text`, `zoom-in`, `grab` and `grabbing` reads its picture from a variable, falling back to
 * the system's own where it isn't set (pages that don't draw one).
 *
 * And every cursor is handed down as a variable rather than inherited:
 * `cursor: X` becomes `--cursor-now: X; cursor: var(--cursor-now)`, and
 * app.css gives every element `cursor: var(--cursor-now)`. So a cursor set
 * on one element alone (the pressed pointer, ownCursor.ts) stays on it: what
 * it holds keeps taking the variable, unchanged, and isn't restyled. (An
 * inherited cursor changed on a big element restyles all it holds.)
 */
const CURSOR_VARS: Record<string, string> = {
  pointer: '--cursor-pointer',
  default: '--cursor',
  'not-allowed': '--cursor-disabled',
  text: '--cursor-text',
  'zoom-in': '--cursor-zoom',
  grab: '--cursor-grab',
  grabbing: '--cursor-grabbing',
};
const HANDED_DOWN = 'var(--cursor-now)';

const themedCursors = {
  postcssPlugin: 'themed-cursors',
  Declaration: {
    cursor(decl: { value: string; important: boolean; cloneBefore(o: { prop: string; value: string }): unknown }) {
      const v = decl.value.trim();
      if (v.startsWith('var(--cursor-now')) return;
      const name = CURSOR_VARS[v];
      decl.cloneBefore({ prop: '--cursor-now', value: name ? `var(${name}, ${v})` : v });
      decl.value = HANDED_DOWN;
    },
  },
};

/**
 * This machine (and user), for the local channel's room names
 * (src/lib/channel.ts): the dev server and the room bot's --localhost
 * build here share them; anyone else's local rooms stay apart.
 */
function localId() {
  let who = '';
  try {
    who = userInfo().username;
  } catch {
    /* no user name to be had */
  }
  return createHash('sha256').update(`${hostname()}:${who}`).digest('hex').slice(0, 8);
}

/**
 * The dev hub (dev.html) lists the room bot, which only the dev server and
 * the bot's own build have; any other build drops its card rather than link
 * to a page it doesn't have.
 */
function devHub(env: Record<string, string>): Plugin {
  return {
    name: 'dev-hub',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('/dev.html') || env.VITE_BOT === '1') return html;
      const card = /\s*<!-- bot -->[\s\S]*?<!-- \/bot -->/;
      // Without its markers the card would ship, linking to a page that isn't there.
      if (!card.test(html)) throw new Error('dev.html: the room bot card has lost its <!-- bot --> ... <!-- /bot --> markers.');
      return html.replace(card, '');
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // A channel named wrongly stops here, rather than quietly playing in the live game. The local
  // one's rooms are this machine's: set before Vite reads the env, so the app sees import.meta.env.VITE_LOCAL_ID.
  if (channelOf({ VITE_CHANNEL: env.VITE_CHANNEL, DEV: command === 'serve' }) === 'local') process.env.VITE_LOCAL_ID ??= localId();
  process.env.VITE_PLATES_VERSION = platesVersion();
  // Without the owner key's public half, nobody (the creator included) can play under the held name. Said loudly, in the
  // deploy's summary too, but not in the way: everything else goes out as it should.
  if (command === 'build' && channelOf({ VITE_CHANNEL: env.VITE_CHANNEL }) === 'live' && /OWNER_PUBLIC_KEY = ''/.test(readFileSync(`${process.cwd()}/src/lib/ownerKey.ts`, 'utf8'))) {
    const text = 'OWNER_PUBLIC_KEY in src/lib/ownerKey.ts is empty, so nobody can play under the held name. Run node --experimental-strip-types scripts/owner-key.mjs "<the owner words>" and paste what it prints there.';
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${text}` : `\x1b[33m${text}\x1b[0m`);
  }
  return {
    // Relative base so the build works on any GitHub Pages sub-path.
    base: './',
    plugins: [svelte(), glslMinify(), peerjsProbe(), polyfillsFirst(), csp(env), errorsFirst(), betaPages(env), preloadFonts(), fontinNotice(), keyframesFirst(), backdropSave(), devHub(env), weaveTile(), qaServer(process.cwd())],
    css: { postcss: { plugins: [hoverOnlyWhereHoverable, themedCursors] } },
    // Module workers, so one (the plates', lib/plateWorker.ts) can load only what it's asked for.
    worker: { format: 'es' },
    build: {
      // The codex's and the settings' chunks are linked ahead without their
      // imports, so a dropped connection that fails them leaves those to be
      // fetched once it's back (lib/retriedPages.ts). The codex is fetched ahead
      // in the background, so it waits for them there, not as it opens.
      modulePreload: { resolveDependencies: preloadedWith },
      rollupOptions: {
        // Legal pages are plain static pages that work without JavaScript; only the privacy page's opt-out switch needs it.
        input: {
          main: 'index.html',
          impressum: 'impressum.html',
          datenschutz: 'datenschutz.html',
          // Analytics (src/statsPage): the counts from GoatCounter, read with the owner's key.
          stats: 'stats.html',
          // The effects lab (src/lab), the backdrop tool (src/backdropTool),
          // the zone tuning page (src/zonebanner), the card bench (src/cardBench), the
          // spatial sound page (src/spatialPage), the hover tuning page
          // (src/hoverPage), the sound levels page (src/levelsPage), the QA
          // desk (src/qa) and the hub linking them all (dev.html): the dev
          // server serves them by itself; of the builds only the beta has
          // them, never the live game.
          ...(env.VITE_CHANNEL === 'beta' ? { dev: 'dev.html', qa: 'qa.html', lab: 'lab.html', backdrop: 'backdrop.html', zones: 'zones.html', cards: 'cards.html', spatial: 'spatial.html', hover: 'hover.html', levels: 'levels.html' } : {}),
          // The room bot (src/bot), only in the build scripts/room-bot.mjs makes for itself.
          ...(env.VITE_BOT === '1' ? { bot: 'bot.html' } : {}),
        },
        // The module counting the game's script errors (lib/countErrors.ts)
        // and what it imports, in a chunk of their own: the bundler runs it
        // before the other chunks the game's entry imports (errorsFirst
        // checks it does).
        output: { codeSplitting: { groups: [{ name: 'errors', test: COUNT_ERRORS, priority: 100 }] } },
      },
    },
  };
});
