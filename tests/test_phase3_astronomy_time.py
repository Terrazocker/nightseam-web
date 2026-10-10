"""Independent calendar/DST contracts and complete-day culmination regressions."""
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
