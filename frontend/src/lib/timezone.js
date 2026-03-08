export const ETHIOPIA_TIMEZONE = "Africa/Addis_Ababa";
export const DEFAULT_BUSINESS_DAY_START_TIME = "06:00";

function getFormatter(options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ETHIOPIA_TIMEZONE,
    ...options,
  });
}

function coerceDate(value) {
  if (value instanceof Date) return value;
  if (value == null) return new Date();
  return new Date(value);
}

function parseStartTime(value) {
  const raw = typeof value === "string" ? value : DEFAULT_BUSINESS_DAY_START_TIME;
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: 6, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function getBusinessDayStartTime() {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_DAY_START_TIME;
  return localStorage.getItem("business_day_start_time") || DEFAULT_BUSINESS_DAY_START_TIME;
}

export function eatDateISO(value = new Date()) {
  const parts = getFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(coerceDate(value));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function eatBusinessDateISO(value = new Date(), startTime = getBusinessDayStartTime()) {
  const { hour: resetHour, minute: resetMinute } = parseStartTime(startTime);
  const dt = coerceDate(value);

  const dateParts = getFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const timeParts = getFormatter({
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);

  const d = Object.fromEntries(dateParts.map((p) => [p.type, p.value]));
  const t = Object.fromEntries(timeParts.map((p) => [p.type, p.value]));

  const year = Number(d.year);
  const month = Number(d.month);
  const day = Number(d.day);
  const hour = Number(t.hour);
  const minute = Number(t.minute);

  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const shiftBack = hour < resetHour || (hour === resetHour && minute < resetMinute);
  if (shiftBack) {
    asUtc.setUTCDate(asUtc.getUTCDate() - 1);
  }

  const y = asUtc.getUTCFullYear();
  const m = String(asUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(asUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function formatEatTime(value, options = {}) {
  return getFormatter({
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    ...options,
  }).format(coerceDate(value));
}

export function formatEatDateTime(value, options = {}) {
  return getFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    ...options,
  }).format(coerceDate(value));
}
