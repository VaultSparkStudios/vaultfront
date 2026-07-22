const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoCalendarDate(value) {
  if (typeof value !== "string") return false;
  const match = value.match(ISO_DATE);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

export function freshestIsoDate(values) {
  const dates = values.filter(isIsoCalendarDate);
  return dates.length ? dates.sort().at(-1) : null;
}

export function averageLatestTotals(values, count = 3) {
  const totals = values
    .filter((value) => Number.isFinite(value))
    .slice(0, Math.max(1, count));
  if (!totals.length) return null;
  return Number(
    (totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(1),
  );
}
