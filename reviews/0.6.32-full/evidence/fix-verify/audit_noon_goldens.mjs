// Audit every tests/test_core_time.py::_NOON_GOLDENS entry against Node's Intl
// tz database (independent of core/time.js) AFTER the zoneOffsetAtLocalNoon fix.
import { zoneOffsetAtLocalNoon } from '../core/time.js';

const GOLDENS = [
  ['Europe/Berlin', '2026-01-15', 60],
  ['Europe/Berlin', '2026-03-29', 120],
  ['Europe/Berlin', '2026-06-21', 120],
  ['Europe/Berlin', '2026-10-25', 60],
  ['Europe/Berlin', '2026-12-21', 60],
  ['America/Los_Angeles', '2026-01-15', -480],
  ['America/Los_Angeles', '2026-03-08', -480],
  ['America/Los_Angeles', '2026-06-21', -420],
  ['America/Los_Angeles', '2026-11-01', -420],
  ['Australia/Sydney', '2026-01-15', 660],
  ['Australia/Sydney', '2026-04-05', 600],
  ['Australia/Sydney', '2026-06-21', 600],
  ['Australia/Sydney', '2026-10-04', 660],
  ['Australia/Sydney', '2026-12-21', 660],
  ['Asia/Kathmandu', '2026-01-15', 345],
  ['Asia/Kathmandu', '2026-06-21', 345],
  ['Pacific/Chatham', '2026-01-15', 825],
  ['Pacific/Chatham', '2026-06-21', 765],
  ['UTC', '2026-06-21', 0],
];

function offsetAt(tz, ms) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - ms) / 60000);
}

// authoritative true offset at local noon
function trueNoon(tz, d) {
  if (tz === 'UTC') return 0;
  const guess = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12);
  let ms = guess;
  for (let i = 0; i < 4; i++) ms = guess - offsetAt(tz, ms) * 60000;
  return offsetAt(tz, ms);
}

const wrong = [];
for (const [tz, d, golden] of GOLDENS) {
  const want = trueNoon(tz, d);
  const now = zoneOffsetAtLocalNoon(tz, d);
  const goldenOk = golden === want;
  if (!goldenOk) wrong.push([tz, d, golden, want]);
  console.log(
    `${tz.padEnd(21)} ${d}  golden=${String(golden).padStart(5)}  true=${String(want).padStart(5)}  fixedCore=${String(now).padStart(5)}` +
    `  ${goldenOk ? '' : 'GOLDEN WRONG'}${now === want ? '' : '  CORE STILL WRONG'}`);
}
console.log(`\n${wrong.length} wrong golden(s):`);
for (const [tz, d, g, w] of wrong) console.log(`  ("${tz}", "${d}"): ${g}  ->  ${w}`);
