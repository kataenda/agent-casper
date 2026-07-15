/**
 * One place for rendering timestamps, so every panel reads the same way.
 *
 * Two problems this fixes app-wide:
 *  - Backend timestamps are often naive UTC (no "Z"). Parsed directly, the browser
 *    reads them as LOCAL time and the clock lands hours off. We tag them UTC first.
 *  - Panels each rolled their own format — some sliced the raw ISO ("07-14T15:39"),
 *    some used 24-hour, some the verbose full locale string. All now use 12-hour AM/PM.
 */

const toUtc = (iso: string) =>
  /[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;

/** "Jul 14, 10:39 PM" — date + time, 12-hour, in the viewer's local zone. */
export function fmtTs(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(toUtc(iso));
  if (isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/** "10:39:07 PM" — time only, 12-hour, local. */
export function fmtTime(iso?: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(toUtc(iso));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}
