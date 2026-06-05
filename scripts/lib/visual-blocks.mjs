const SPARK_CHARS = "▁▂▃▄▅▆▇█".split("");
const SPARK_CHARS_ASCII = " .:-=+*#".split("");

export function sparkline(values, opts = {}) {
  if (!Array.isArray(values) || values.length === 0) return "—";
  const chars = opts.ascii ? SPARK_CHARS_ASCII : SPARK_CHARS;
  const max = opts.max ?? Math.max(...values, 1);
  const min = opts.min ?? 0;
  const range = Math.max(0.0001, max - min);
  return values
    .map((value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return chars[0];
      }
      const index = Math.min(
        chars.length - 1,
        Math.max(0, Math.floor(((value - min) / range) * (chars.length - 1))),
      );
      return chars[index];
    })
    .join("");
}
