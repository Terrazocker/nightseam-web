// DE-02 second pass: the full desktop path (tzOffAt -> zoneOffsetAtLocalNoon)
import { offsetEastMin, zoneOffsetAtLocalNoon } from '../core/time.js';

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

const zones = ['Australia/Lord_Howe', 'Asia/Kolkata', 'Asia/Kathmandu',
               'Australia/Adelaide', 'America/St_Johns', 'Pacific/Chatham'];
const dates = ['2026-10-03', '2026-10-04', '2026-06-15', '2026-01-15'];

let bad = 0;
for (const tz of zones) {
  for (const d of dates) {
    const got = zoneOffsetAtLocalNoon(tz, d);
    // authoritative: the offset in effect at local noon of that date in that zone
    const guess = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12);
    let ms = guess;
    for (let i = 0; i < 3; i++) ms = guess - trueOffsetMin(tz, ms) * 60000;
    const want = trueOffsetMin(tz, ms);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${tz.padEnd(22)} ${d}  core=${String(got).padStart(5)}  true=${String(want).padStart(5)}  ${ok ? 'OK' : '<-- MISMATCH'}`);
  }
}
console.log(bad === 0
  ? '\nALL OK - no half-hour/45-min zone mis-resolves through zoneOffsetAtLocalNoon'
  : `\n${bad} MISMATCH(es)`);
