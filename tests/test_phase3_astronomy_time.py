"""Independent calendar/DST contracts, culmination and coming-night regressions."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def node(source, zone='UTC'):
    p = subprocess.run(['node', '--input-type=module', '-e', source], cwd=ROOT,
                       env={**os.environ, 'TZ': zone}, capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout)


@pytest.mark.parametrize('browser_zone', ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles'])
def test_site_wall_resolution_is_independent_of_browser_zone(browser_zone):
    rows = [
        ['Europe/Berlin', [2026,2,29,1,30], '2026-03-29T00:30:00.000Z'],
        ['Europe/Berlin', [2026,2,29,2,30], '2026-03-29T01:30:00.000Z'], # gap forward
        ['Europe/Berlin', [2026,9,25,2,30], '2026-10-25T00:30:00.000Z'], # earlier fold
        ['Australia/Lord_Howe', [2026,9,4,2,15], '2026-10-03T15:45:00.000Z'],
        ['Australia/Lord_Howe', [2026,3,5,1,45], '2026-04-04T14:45:00.000Z'],
        ['Pacific/Apia', [2011,11,30,12,0], '2011-12-30T22:00:00.000Z'],
        ['America/Los_Angeles', [2026,2,8,12,0], '2026-03-08T19:00:00.000Z'],
    ]
    actual = node('''import * as W from './web/webstore.js';
      const rows = ''' + json.dumps(rows) + ''';
      console.log(JSON.stringify(rows.map(([zone,fields]) => {
        W.setActiveTz(zone); return W.wallFieldsToUtc(...fields).toISOString();
      })));''', browser_zone)
    assert actual == [r[2] for r in rows]


def test_site_wall_inverse_across_host_dst_boundary():
    result = node('''import * as W from './web/webstore.js'; W.setActiveTz('Pacific/Kiritimati');
      const t=new Date('2026-03-08T09:30:00Z'), wall=W.utcToWall(t);
      console.log(JSON.stringify({fields:[wall.getFullYear(),wall.getMonth()+1,wall.getDate(),wall.getHours(),wall.getMinutes()],
        back:W.wallToUtc(wall).toISOString()}));''', 'America/Los_Angeles')
    assert result == {'fields':[2026,3,8,23,30], 'back':'2026-03-08T09:30:00.000Z'}


def test_complete_calendar_day_culminations():
    result = node('''import * as C from './core/index.js';
      const objects = [[16.695*15,36.467],[4*15,20]];
      console.log(JSON.stringify(objects.map(([ra,dec]) => C.objectDayInfo(ra,dec,
        new Date('2026-10-04T22:00:00Z'),52.52,13.4,new Date('2026-10-05T22:00:00Z')))));''')
    assert result[0]['maxAlt'] == pytest.approx(73.90, abs=.03)
    from datetime import datetime
    transit = datetime.fromisoformat(result[0]['transit'].replace('Z','+00:00')).timestamp()
    assert transit == pytest.approx(1791211920, abs=1)
    assert '2026-10-05T02:' in result[1]['transit'] # morning is retained too


def _meridian_ms(ra_hours, dec_deg, lon, near_ms):
    """Independent upper-transit instant: local sidereal time equals the
    precessed RA (Meeus 12.4 GMST; annual precession 3.075 + 1.336 sin RA tan Dec
    seconds of time), solved by fixed-point iteration from `near_ms`."""
    import math
    years = (near_ms / 86400000 + 2440587.5 - 2451545.0) / 365.25
    ra = ra_hours * 15 + years * (3.075 + 1.336 * math.sin(math.radians(ra_hours * 15))
                                  * math.tan(math.radians(dec_deg))) * 15 / 3600
    t = near_ms
    for _ in range(4):
        d = t / 86400000 + 2440587.5 - 2451545.0
        lst = (280.46061837 + 360.98564736629 * d + lon) % 360
        ha = (lst - ra + 180) % 360 - 180
        t -= ha / 360.98564736629 * 86400000
    return t


def test_detail_card_events_describe_the_coming_night():
    """Owner decision (October 11, 2026): the detail card's rise, set and
    culmination belong to the planned night, from the site's noon on the
    selected date to the next site noon, not to the calendar day."""
    result = node('''import * as C from './core/index.js';
      const noon=new Date('2026-10-11T10:00:00Z'),next=new Date('2026-10-12T10:00:00Z');
      const m31=[0.7123*15,41.269],altair=[19.8464*15,8.8683];
      const night=C.nightInfo(noon,52.52,13.405,noon);
      const dst=[new Date('2026-10-24T10:00:00Z'),new Date('2026-10-25T11:00:00Z')];
      console.log(JSON.stringify({m31:C.objectNightInfo(...m31,noon,next,52.52,13.405),
        old:C.objectDayInfo(...m31,new Date('2026-10-10T22:00:00Z'),52.52,13.405,new Date('2026-10-11T22:00:00Z')),
        altair:C.objectNightInfo(...altair,noon,next,52.52,13.405),
        dst:C.objectNightInfo(...m31,...dst,52.52,13.405),
        dusk:night.astroDusk,dawn:night.astroDawn}));''')
    from datetime import datetime
    ms = lambda iso: datetime.fromisoformat(iso.replace('Z', '+00:00')).timestamp() * 1000
    transit = ms(result['m31']['transit'])
    assert ms(result['dusk']) < transit < ms(result['dawn']), 'culmination is inside tonight'
    assert abs(transit - _meridian_ms(0.7123, 41.269, 13.405, transit)) < 3 * 60000
    assert result['m31']['maxAlt'] == pytest.approx(90 - 52.52 + 41.269 + 0.4, abs=0.6)
    assert transit - ms(result['old']['transit']) == pytest.approx(86164090.5, abs=4 * 60000),         'the calendar-day value was the previous night, one sidereal day earlier'
    assert result['m31']['rise'] is None and result['m31']['set'] is None, 'circumpolar at Berlin'
    altair = result['altair']
    assert ms('2026-10-11T10:00:00Z') < ms(altair['rise']) < ms(altair['set']) < ms('2026-10-12T10:00:00Z')
    assert ms(result['dusk']) < ms(altair['set']), 'Altair sets during this night'
    dst = ms(result['dst']['transit'])
    assert ms('2026-10-24T10:00:00Z') < dst < ms('2026-10-25T11:00:00Z'), '25 h DST span'
    assert abs(dst - _meridian_ms(0.7123, 41.269, 13.405, dst)) < 3 * 60000


def test_explicit_polar_fallback_endpoints_cross_dst():
    result = node('''import * as C from './core/index.js';
      const instant=(day,h)=>C.zonedWallToUtcMs('Europe/Berlin',Date.UTC(2026,2,day,h));
      const fallback={dusk:new Date(instant(28,20)),dawn:new Date(instant(29,4))};
      const w=C.pickDarkWindow({},new Date(instant(28,12)),null,fallback);
      const scrub=C.scrubWindowMs({noonMs:instant(28,12),fallbackStartMs:+fallback.dusk,fallbackEndMs:+fallback.dawn});
      console.log(JSON.stringify({dusk:w.dusk,dawn:w.dawn,scrub}));''')
    assert result['dusk'] == '2026-03-28T19:00:00.000Z'
    assert result['dawn'] == '2026-03-29T02:00:00.000Z'
    assert result['scrub']['endMs'] - result['scrub']['startMs'] == 7*3600000


def test_review_near_horizon_moon_is_below_apparent_horizon():
    # Independent PyEphem pressure=0 true altitude -1.494687755°, then the
    # shared Saemundsson correction gives -0.775613° (Berlin review trigger).
    alt = node("""import * as E from './web/astro.js';
      console.log(JSON.stringify(E.moonAltAz(E.julianDay(new Date('2026-10-05T14:53Z')),
        52.52,13.4)[0]));""")
    assert alt == pytest.approx(-0.775613, abs=.12)
    assert alt < 0
