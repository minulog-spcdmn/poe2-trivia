/** `n` (1 or more) in Roman numerals: 4 is IV, 11 is XI, 90 is XC. */
export function roman(n: number): string {
  const parts: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of parts) for (; n >= v; n -= v) out += s;
  return out;
}
