// Which point of a chart is being read, for Analytics' charts: a
// mouse reads where it passes; a finger reads where it touches, and the note
// stays until a touch lands outside the chart; the arrow keys step through
// once the chart has focus, Escape puts the note away.

export class Crosshair {
  at = $state<number | null>(null);
  #pinned = false;
  #svg: SVGSVGElement | undefined;
  private count: () => number;
  private index: (x: number) => number;

  /** `count`: how many points; `index`: the point under an x within the chart. */
  constructor(count: () => number, index: (x: number) => number) {
    this.count = count;
    this.index = index;
  }

  attach = (svg: SVGSVGElement) => {
    this.#svg = svg;
    const away = (e: PointerEvent) => {
      if (this.#pinned && !svg.contains(e.target as Node)) {
        this.#pinned = false;
        this.at = null;
      }
    };
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('pointerdown', away);
      this.#svg = undefined;
    };
  };

  #near(clientX: number): number | null {
    const n = this.count();
    if (!this.#svg || !n) return null;
    return Math.max(0, Math.min(n - 1, this.index(clientX - this.#svg.getBoundingClientRect().left)));
  }

  move = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || this.#pinned) this.at = this.#near(e.clientX);
  };
  down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    this.#pinned = true;
    this.at = this.#near(e.clientX);
  };
  leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.at = null;
  };
  blur = () => {
    if (!this.#pinned) this.at = null;
  };
  key = (e: KeyboardEvent) => {
    const n = this.count();
    if (e.key === 'Escape') this.at = null;
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !n) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    this.at = Math.max(0, Math.min(n - 1, (this.at ?? (step > 0 ? -1 : n)) + step));
  };
}
