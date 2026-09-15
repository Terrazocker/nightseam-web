// DE-02 corrected diagnosis: is it half-hour-specific, or any DST-transition date?
import { zoneOffsetAtLocalNoon } from '../core/time.js';

function trueOffsetMin(tz, ms) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - ms) / 60000);
}

// local noon of `d` in `tz`, authoritatively
function trueNoonOffset(tz, d) {
  const guess = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12);
  let ms = guess;
  for (let i = 0; i < 4; i++) ms = guess - trueOffsetMin(tz, ms) * 60000;
  return trueOffsetMin(tz, ms);
}

const cases = [
  // [zone, transition date, kind]
  ['Europe/Berlin', '2026-03-29', 'whole-hour DST start'],
  ['Europe/Berlin', '2026-10-25', 'whole-hour DST end'],
  ['America/New_York', '2026-03-08', 'whole-hour DST start'],
  ['Europe/London', '2026-03-29', 'whole-hour DST start'],
  ['Australia/Sydney', '2026-10-04', 'whole-hour DST start'],
  ['Australia/Lord_Howe', '2026-10-03', '30-min zone, DST transition'],
  ['Australia/Adelaide', '2026-10-03', '30-min zone, DST transition'],
  ['Asia/Kolkata', '2026-10-03', 'no DST (control)'],
  ['Europe/Berlin', '2026-06-15', 'no transition (control)'],
];

let bad = 0;
for (const [tz, d, kind] of cases) {
  const got = zoneOffsetAtLocalNoon(tz, d);
  const want = trueNoonOffset(tz, d);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${tz.padEnd(22)} ${d}  core=${String(got).padStart(5)}  true=${String(want).padStart(5)}  ${ok ? 'OK' : 'MISMATCH'}   (${kind})`);
}
console.log(`\n${bad} of ${cases.length} mismatch - spread across: ${bad ? 'see above' : 'none'}`);
