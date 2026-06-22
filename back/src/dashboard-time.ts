export type DashboardPeriod = "weekly" | "monthly" | "semester";
export type Granularity = "day" | "week";

export type ContributionBucket = {
  label: string;
  shortLabel: string;
  start: string;
  end: string;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  return next;
}

export function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function periodConfig(period: DashboardPeriod) {
  const now = new Date();
  if (period === "weekly") return { start: addDays(startOfDay(now), -6), end: now, granularity: "day" as const, cadence: "Daily" };
  if (period === "monthly") return { start: addDays(startOfDay(now), -29), end: now, granularity: "day" as const, cadence: "Daily" };
  return { start: addDays(startOfWeek(now), -7 * 15), end: endOfWeek(now), granularity: "week" as const, cadence: "Weekly" };
}

export function bucketForDate(date: Date, granularity: Granularity) {
  return granularity === "day" ? startOfDay(date) : startOfWeek(date);
}

export function bucketEnd(start: Date, granularity: Granularity) {
  const end = granularity === "day" ? startOfDay(start) : endOfWeek(start);
  if (granularity === "day") end.setHours(23, 59, 59, 999);
  return end;
}

export function formatLongLabel(date: Date, granularity: Granularity) {
  return granularity === "day"
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function formatShortLabel(date: Date, granularity: Granularity) {
  return granularity === "day"
    ? date.toLocaleDateString(undefined, { weekday: "short" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
