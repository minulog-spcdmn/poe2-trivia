import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Every @keyframes the page may come to need, in the CSS it starts with
 * (build only; vite.config.ts).
 *
 * The screens fetched later (the game's, the Codex, the dialogs) each bring
 * a stylesheet, and Chrome restyles every element on the page when a sheet
 * with @keyframes in it is added: should any element's animation have found
 * no @keyframes of its name, the whole document; else every element with an
 * animation, finished ones holding their last frame among them, which on the
 * start page is most of it (Blink's ScopedStyleResolver::KeyframesRulesAdded).
 * On the owner's machine the Codex's sheet, fetched in an idle moment while
 * the start page shows, held a frame up by 38 to 40 ms, and the game's
 * screens' by 13 to 20. A sheet without @keyframes is matched against the
 * page's elements instead, and restyles only those it styles: none, there.
 *
 * So each later sheet's top-level @keyframes are moved to the end of the
 * last sheet a page links from the start, for every page that can come to
 * load it. Their names are the components' own (Svelte makes them so), so
 * nothing else changes: an animation finds the same frames, only sooner. (A
 * sheet another page links from the start loses them too: they're in that
 * page's last sheet, and a name no other @keyframes has finds them wherever
 * they are.) A sheet is left as it is where moving could change which of two
 * @keyframes of one name wins (the same name with other frames anywhere in
 * the build), or where a page that loads it links no other sheet from the
 * start to take them. A sheet that takes them is named afresh by its new
 * contents, so no browser keeps an old copy under the new name.
 */

/** One top-level @keyframes block: its name and its whole text. */
export type Keyframes = { name: string; text: string };

/** The sheet without its top-level @keyframes, and those, in order. (Nested ones, in @media say, stay.) */
export function splitKeyframes(css: string): { rest: string; keyframes: Keyframes[] } {
  const keyframes: Keyframes[] = [];
  let rest = '';
  let from = 0;
  let depth = 0;
  let i = 0;
  /** The index just past a string or comment starting at `j`, or `j` if neither starts there. */
  const skip = (j: number) => {
    const c = css[j];
    if (c === '/' && css[j + 1] === '*') {
      const end = css.indexOf('*/', j + 2);
      return end < 0 ? css.length : end + 2;
    }
    if (c === '"' || c === "'") {
      let k = j + 1;
      while (k < css.length && css[k] !== c) k += css[k] === '\\' ? 2 : 1;
      return k + 1;
    }
    return j;
  };
  while (i < css.length) {
    const past = skip(i);
    if (past !== i) {
      i = past;
      continue;
    }
    const c = css[i];
    if (depth === 0 && c === '@') {
      const at = /^@(-webkit-)?keyframes\s*([^{;]*?)\s*\{/i.exec(css.slice(i, i + 300));
      if (at) {
        // The block's end: its closing brace, strings and comments skipped.
        let d = 0;
        let j = i + at[0].length - 1;
        while (j < css.length) {
          const p = skip(j);
          if (p !== j) {
            j = p;
            continue;
          }
          if (css[j] === '{') d++;
          else if (css[j] === '}' && --d === 0) break;
          j++;
        }
        const end = Math.min(css.length, j + 1);
        rest += css.slice(from, i);
        keyframes.push({ name: at[2].replace(/^["']|["']$/g, ''), text: css.slice(i, end) });
        from = i = end;
        continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    i++;
  }
  return { rest: rest + css.slice(from), keyframes };
}

/** What stands for the sheet made for a page that links none (followed by its entry chunk's name). */
const NEW = '\0new sheet for ';

/** A JS chunk as far as moving @keyframes goes: what it imports, and the sheets it brings. */
export type ChunkInfo = { fileName: string; isEntry: boolean; imports: string[]; dynamicImports: string[]; css: string[] };

/**
 * The sheets' new contents (`sheets`): each later sheet that can lose its
 * top-level @keyframes without them, and the last sheet each page links from
 * the start with theirs added (once each, in a fixed order; these are the
 * `hosts`). Sheets left as they are aren't in it. A page that links no sheet
 * from the start (a dev page that fetches all it shows) gets one made for
 * them (`created`, by its entry chunk).
 */
export function moveKeyframes(
  chunks: readonly ChunkInfo[],
  sheets: Readonly<Record<string, string>>,
): { sheets: Map<string, string>; hosts: Set<string>; created: Map<string, string> } {
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const closure = (start: readonly string[], withDynamic: boolean) => {
    const seen = new Set<string>();
    const walk = (f: string) => {
      const c = byName.get(f);
      if (!c || seen.has(f)) return;
      seen.add(f);
      for (const g of c.imports) walk(g);
      if (withDynamic) for (const g of c.dynamicImports) walk(g);
    };
    for (const f of start) walk(f);
    return seen;
  };
  const cssOf = (files: Set<string>) => new Set([...files].flatMap((f) => byName.get(f)!.css));

  const split = new Map(Object.entries(sheets).map(([f, css]) => [f, splitKeyframes(css)]));
  // A name given other frames anywhere: whichever comes last wins, so none of its sheets is touched.
  const texts = new Map<string, Set<string>>();
  for (const { keyframes } of split.values()) for (const k of keyframes) texts.set(k.name, (texts.get(k.name) ?? new Set()).add(k.text));
  const clashes = (f: string) => split.get(f)!.keyframes.some((k) => texts.get(k.name)!.size > 1);

  /** The sheets a page links from the start, in the order it links them (each chunk's after those of what it imports). */
  const linked = (entry: string) => {
    const seen = new Set<string>();
    const order: string[] = [];
    const walk = (f: string) => {
      const c = byName.get(f);
      if (!c || seen.has(f)) return;
      seen.add(f);
      for (const g of c.imports) walk(g);
      order.push(...c.css.filter((s) => split.has(s)));
    };
    walk(entry);
    return order;
  };
  const entries = chunks.filter((c) => c.isEntry);
  const pages = entries.map((e) => {
    const atStart = cssOf(closure([e.fileName], false));
    const later = [...cssOf(closure([e.fileName], true))].filter((f) => !atStart.has(f));
    // The last sheet it links takes them (a page's later sheets came after all of those), or one made for them.
    return { entry: e.fileName, host: linked(e.fileName).at(-1) ?? NEW + e.fileName, atStart, later };
  });
  const movable = new Set<string>();
  for (const f of split.keys()) {
    if (!split.get(f)!.keyframes.length || clashes(f)) continue;
    const reaching = pages.filter((p) => p.atStart.has(f) || p.later.includes(f));
    if (reaching.length && reaching.every((p) => p.host !== f)) movable.add(f);
  }

  const out = new Map<string, string>();
  for (const f of movable) out.set(f, split.get(f)!.rest);
  const added = new Map<string, Keyframes[]>();
  for (const p of pages) {
    if (movable.has(p.host)) continue;
    const list = added.get(p.host) ?? [];
    for (const f of [...p.atStart, ...p.later].sort()) if (movable.has(f)) list.push(...split.get(f)!.keyframes);
    added.set(p.host, list);
  }
  const created = new Map<string, string>();
  for (const [host, list] of added) {
    const own = new Set(split.get(host)?.keyframes.map((k) => k.text));
    const fresh = [...new Set(list.map((k) => k.text))].filter((t) => !own.has(t));
    if (!fresh.length) continue;
    if (host.startsWith(NEW)) created.set(host.slice(NEW.length), fresh.join(''));
    else out.set(host, sheets[host] + fresh.join(''));
  }
  return { sheets: out, hosts: new Set([...added.keys()].filter((h) => !h.startsWith(NEW))), created };
}

/** `fileName` with its content hash (the last `-xxxxxxxx` before the extension) made from `source`. */
export function renamed(fileName: string, source: string): string {
  const hash = createHash('sha256').update(source).digest('base64url').slice(0, 8);
  return fileName.replace(/-[\w-]{8}(\.css)$/, `-${hash}$1`);
}

export function keyframesFirst(): Plugin {
  return {
    name: 'keyframes-first',
    apply: 'build',
    // After the CSS is split and the HTML written (both name the sheets), before the
    // preloads are written into the scripts (they name the sheets from viteMetadata).
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks: ChunkInfo[] = [];
      const sheets: Record<string, string> = {};
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          chunks.push({ fileName: file.fileName, isEntry: file.isEntry, imports: file.imports, dynamicImports: file.dynamicImports, css: [...(file.viteMetadata?.importedCss ?? [])] });
        } else if (file.fileName.endsWith('.css') && typeof file.source === 'string') sheets[file.fileName] = file.source;
      }
      const moved = moveKeyframes(chunks, sheets);
      const names = new Map<string, string>();
      for (const [fileName, source] of moved.sheets) {
        const asset = bundle[fileName];
        if (asset.type !== 'asset') continue;
        // A later sheet keeps its name: what it is now follows from what it was.
        if (!moved.hosts.has(fileName)) {
          asset.source = source;
          continue;
        }
        const next = renamed(fileName, source);
        delete bundle[fileName];
        this.emitFile({ type: 'asset', fileName: next, source });
        names.set(fileName, next);
      }
      // A page that linked no sheet links the one made for it.
      for (const [entry, source] of moved.created) {
        const chunk = bundle[entry];
        const page = chunk.type === 'chunk' && chunk.facadeModuleId?.replaceAll('\\', '/');
        const html = page && Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html') && page.endsWith('/' + f.fileName));
        if (!html || html.type !== 'asset' || typeof html.source !== 'string' || !html.source.includes('</head>')) {
          this.error(`keyframes-first: found no page to link the @keyframes of ${entry} from`);
        }
        const fileName = renamed('assets/keyframes-00000000.css', source);
        this.emitFile({ type: 'asset', fileName, source });
        const up = '../'.repeat(html.fileName.split('/').length - 1) || './';
        html.source = html.source.replace('</head>', `  <link rel="stylesheet" crossorigin href="${up}${fileName}">\n  </head>`);
      }
      if (!names.size) return;
      const base = (f: string) => f.slice(f.lastIndexOf('/') + 1);
      const rename = (text: string) => {
        for (const [from, to] of names) text = text.replaceAll(base(from), base(to));
        return text;
      };
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          // (In their order: the page links them in it.)
          const css = file.viteMetadata?.importedCss;
          if (css && [...css].some((f) => names.has(f))) {
            const order = [...css].map((f) => names.get(f) ?? f);
            css.clear();
            for (const f of order) css.add(f);
          }
          file.code = rename(file.code);
        } else if (file.fileName.endsWith('.html') && typeof file.source === 'string') file.source = rename(file.source);
      }
    },
  };
}
