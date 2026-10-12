const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isValidDay(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function resolveDateRange(from?: string, to?: string) {
  const today = isoDay(new Date());
  let end = isValidDay(to) ? to : today;
  let start = isValidDay(from) ? from : isoDay(new Date(Date.now() - 6 * DAY_MS));
  if (start > end) [start, end] = [end, start];
  return { from: start, to: end };
}

export function presetRange(days: number) {
  return {
    from: isoDay(new Date(Date.now() - days * DAY_MS)),
    to: isoDay(new Date()),
  };
}

export const DATE_PRESETS = [
  { label: "Hari ini", days: 0 },
  { label: "7 hari", days: 6 },
  { label: "30 hari", days: 29 },
] as const;
