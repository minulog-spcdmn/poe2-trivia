import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AtRule, Node, Rule } from 'postcss';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { backdropsErrors, formatBackdrops, type Backdrops } from './src/lib/backdropData.ts';
import { PROFILE_NAMES } from './src/lib/emberProfiles.ts';
import { glslMinify } from './glslMinify.ts';

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
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Svelte sets inline style attributes (animations, positions).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${signalling}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

/**
 * The beta build (VITE_CHANNEL=beta, served at poe2.quest/beta/): kept out of
 * search results, and its tabs and link previews say Beta and point to it.
 */
function betaPages(env: Record<string, string>): Plugin {
  return {
    name: 'beta-pages',
    apply: 'build',
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
 * The app's own mouse pointer (src/lib/ownCursor.ts): every `cursor: pointer`
 * and `cursor: default` reads its picture from a variable, falling back to
 * the system's own where it isn't set (pages that don't draw one).
 */
const CURSOR_VARS: Record<string, string> = { pointer: '--cursor-pointer', default: '--cursor' };

const themedCursors = {
  postcssPlugin: 'themed-cursors',
  Declaration: {
    cursor(decl: { value: string }) {
      const name = CURSOR_VARS[decl.value.trim()];
      if (name) decl.value = `var(${name}, ${decl.value.trim()})`;
    },
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Relative base so the build works on any GitHub Pages sub-path.
    base: './',
    plugins: [svelte(), glslMinify(), csp(env), betaPages(env), preloadFonts(), backdropSave()],
    css: { postcss: { plugins: [hoverOnlyWhereHoverable, themedCursors] } },
    build: {
      rollupOptions: {
        // Legal pages are plain static pages so they work without JavaScript.
        input: {
          main: 'index.html',
          impressum: 'impressum.html',
          datenschutz: 'datenschutz.html',
          // The effects lab (src/lab), the backdrop tool (src/backdropTool),
          // the zone gate's tuning page (src/zonebanner) and the descent's
          // test page (src/descentPreview): the dev server serves them by
          // itself; of the builds only the beta has them, never the live game.
          ...(env.VITE_CHANNEL === 'beta' ? { lab: 'lab.html', backdrop: 'backdrop.html', zones: 'zones.html', descent: 'descent.html' } : {}),
          // The room bot (src/bot), only in the build scripts/room-bot.mjs makes for itself.
          ...(env.VITE_BOT === '1' ? { bot: 'bot.html' } : {}),
        },
      },
    },
  };
});
