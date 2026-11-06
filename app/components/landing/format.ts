const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-04-05` → `Apr 5`. Reviews carry a day, never a time. */
export function formatDay(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${Number(iso.slice(8, 10))}`;
}

/** `2026-04-05` → `Apr 5 2026`. */
export function formatDate(iso: string): string {
  return `${formatDay(iso)} ${iso.slice(0, 4)}`;
}
