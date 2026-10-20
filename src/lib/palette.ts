// Avatar colours, one per seat. Jewel tones picked in OKLCH so every seat is
// about as bright as the others and no two look alike. Seats fill in order:
// seat 1 is the site's own amber, so a single player doesn't look out of place.
export const PALETTE = ['#cb904d', '#5faeff', '#3cb982', '#b37ad8', '#44bbcf', '#d2699d', '#e3b661', '#a9b741', '#7b8ed3', '#7cd1ae', '#e691a9', '#ea6a64'];

/** Each colour's stone, for its name where one is picked (the settings). */
export const STONES = ['Amber', 'Sapphire', 'Emerald', 'Amethyst', 'Aquamarine', 'Rose quartz', 'Topaz', 'Peridot', 'Iolite', 'Jade', 'Morganite', 'Ruby'];

/** Ruby, the last seat: reserved for zoe_arcana (see RESERVED_HUES in game.ts). */
export const RUBY = PALETTE.length - 1;

/** A colour a player may pick as theirs (lib/colour.ts): any seat's but ruby. */
export const isChoosableHue = (h: unknown): h is number => Number.isInteger(h) && (h as number) >= 0 && (h as number) < RUBY;
