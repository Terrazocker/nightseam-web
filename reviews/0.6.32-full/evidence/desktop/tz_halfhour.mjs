/*
 * PROBE (desktop lane candidate): does `tzOffAt` (static/js/util.js:89 ->
 * core/time.js::zoneOffsetAtLocalNoon) return the TRUE minutes-east offset for
 * half-hour DST zones? A wrong offset shifts the whole desktop day grid
 * (planning_client.js:173 `Date.UTC(y,m-1,d,12) - tzMin*60000`) and every
 * timestamp the scrub and charts derive from it.
 *
 * Run: node reviews/0.6.32-full/evidence/desktop/tz_halfhour.mjs
 */
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL("<workspace>/AstroPilot-local/").href;
const util = await import(ROOT + "static/js/util.js");
const { zoneOffsetAtLocalNoon } = await import(ROOT + "static/js/core.js");

const truth = (tz, ms) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset",
                                               hour12: false }).formatToParts(new Date(ms));
  const v = (p.find((x) => x.type === "timeZoneName") || {}).value;
  if (v === "GMT" || v === "UTC") return 0;
  const m = v.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
};

const CASES = [
  ["Australia/Lord_Howe", "2026-10-04", 630],   // DST starts: +10:30 at noon
  ["Australia/Lord_Howe", "2026-10-03", 630],
  ["Australia/Lord_Howe", "2026-04-05", 660],   // DST ends
  ["Asia/Kolkata", "2026-09-12", 330],
  ["Asia/Kathmandu", "2026-09-12", 345],
  ["Australia/Adelaide", "2026-01-15", 630],
  ["America/St_Johns", "2026-01-15", -210],
  ["Pacific/Chatham", "2026-01-15", 825],
  ["Europe/Berlin", "2026-09-12", 120],
  ["America/New_York", "2026-09-12", -240],
];

let bad = 0;
for (const [tz, date, want] of CASES) {
  const [y, m, d] = date.split("-").map(Number);
  const realNoon = Date.UTC(y, m - 1, d, 12);
  const intl = truth(tz, realNoon);
  util.setDisplayZone(tz);
  const viaTzOffAt = util.tzOffAt(date);
  const viaCore = zoneOffsetAtLocalNoon(tz, date);
  const ok = viaTzOffAt === intl;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "BAD "} ${tz.padEnd(22)} ${date} ` +
    `tzOffAt=${String(viaTzOffAt).padStart(5)} core=${String(viaCore).padStart(5)} ` +
    `Intl=${String(intl).padStart(5)} (expected ${want})` +
    (ok ? "" : `  -> grid shifted by ${(viaTzOffAt - intl) / 60} h`));
}
console.log(bad ? `\n${bad} of ${CASES.length} offsets WRONG` : "\nall offsets correct");
process.exit(0);
