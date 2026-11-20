import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** How index.html writes the item count, for the build to fill in. */
export const ITEM_COUNT_MARK = '{{items}}';

/** The page with the count of items in the game's data in place of each mark. */
export const fillItemCount = (html: string, count: number) => html.replaceAll(ITEM_COUNT_MARK, String(count));

/**
 * The number of items (uniques and lineage gems) that index.html's
 * description, JSON-LD and noscript give, as `{{items}}` there, filled in
 * from src/data/items.json as the page is built or served. A data refresh
 * (npm run fetch-data, after a patch adds uniques) then needs no edit to the
 * page for search engines to read the new count.
 */
export function itemCount(): Plugin {
  let root = process.cwd();
  return {
    name: 'item-count',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.includes(ITEM_COUNT_MARK) ? fillItemCount(html, (JSON.parse(readFileSync(resolve(root, 'src/data/items.json'), 'utf8')) as unknown[]).length) : html,
    },
  };
}
