"""The pairing relay (web/relay.php) under PHP's built-in server.

Each test gets its own webspace: a document root holding the script at
/astro/relay.php and, unless the test says otherwise, the data folder
nightseam-relay/ beside it, as on the host (HOSTING_CONFIGURATION.md).
PHP 8.3 CLI is required, like Node for the JavaScript checks.
"""

import json
import os
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BOX = 'A' * 21 + 'g'          # 22 base64url characters
BODY = bytes([1]) + bytes(40)  # version byte, IV and tag sized


def php():
    exe = shutil.which('php')
    if not exe:
        pytest.fail('php is not installed - the pairing relay cannot be checked here (PHP 8.3 CLI)')
    return exe


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Relay:
    def __init__(self, base: Path, data: bool = True):
        self.docroot = base / 'httpdocs'
        (self.docroot / 'astro').mkdir(parents=True)
        shutil.copyfile(ROOT / 'web' / 'relay.php', self.docroot / 'astro' / 'relay.php')
        self.data = base / 'nightseam-relay'
        if data:
            self.data.mkdir()
        self.port = free_port()
        self.url = f'http://127.0.0.1:{self.port}/astro/relay.php'
        try:
            self.proc = subprocess.Popen([php(), '-S', f'127.0.0.1:{self.port}', '-t', str(self.docroot)],
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as exc:
            pytest.fail(f'cannot spawn php here: {exc}')
        deadline = time.monotonic() + 10
        while True:
            try:
                socket.create_connection(('127.0.0.1', self.port), timeout=0.5).close()
                break
            except OSError:
                if time.monotonic() > deadline or self.proc.poll() is not None:
                    self.stop()
                    pytest.fail('php -S did not start')
                time.sleep(0.05)

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def call(self, op, box=BOX, body=None, method=None, content_type='application/octet-stream', headers=None):
        req = urllib.request.Request(f'{self.url}?box={box}&op={op}', data=body,
                                     method=method or ('POST' if body is not None or op == 'close' else 'GET'))
        if body is not None and content_type:
            req.add_header('Content-Type', content_type)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, dict(res.headers), res.read()
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers), err.read()

    def box_file(self, box=BOX):
        return self.data / f'{box}.box'


def age(path: Path, seconds: int):
    """Make a file look `seconds` old (the relay reads a box's age from its mtime)."""
    t = time.time() - seconds
    os.utime(path, (t, t))


@pytest.fixture
def relay(tmp_path):
    r = Relay(tmp_path)
    yield r
    r.stop()


def test_open_offer_reply_poll_until_closed(relay):
    status, headers, _ = relay.call('open', body=BODY)
    assert status == 201 and headers['X-Relay-Remaining'] == '600'
    assert relay.call('open', body=BODY)[0] == 409, 'an existing id is refused'

    status, headers, _ = relay.call('poll')
    assert status == 204 and headers['X-Relay-State'] == 'open'

    status, headers, body = relay.call('offer')
    assert status == 200 and body == BODY
    assert headers['Content-Type'] == 'application/octet-stream'
    assert relay.call('poll')[1]['X-Relay-State'] == 'connected'
    assert relay.call('offer')[2] == BODY, 'the phone may read the offer again'

    reply = bytes([1]) + os.urandom(2000)
    assert relay.call('reply', body=reply)[0] == 201
    assert relay.call('reply', body=reply)[0] == 409, 'a second reply is refused'

    status, _, body = relay.call('poll')
    assert status == 200 and body == reply
    status, _, body = relay.call('poll')
    assert status == 200 and body == reply, 'a lost poll answer can be fetched again'
    assert relay.call('close')[0] == 204, 'the desktop closes the box once it has the horizon'
    assert not relay.box_file().exists()
    assert relay.call('poll')[0] == 404
    assert relay.call('offer')[0] == 404


def test_close_deletes_the_box(relay):
    relay.call('open', body=BODY)
    assert relay.call('close')[0] == 204
    assert not relay.box_file().exists()
    assert relay.call('offer')[0] == 404
    assert relay.call('close')[0] == 204, 'closing twice is harmless'


def test_expired_and_unknown_boxes_answer_404(relay):
    assert relay.call('poll')[0] == 404
    assert relay.call('reply', body=BODY)[0] == 404, 'no reply into a box nobody opened'
    relay.call('open', body=BODY)
    age(relay.box_file(), 601)
    for op in ('offer', 'poll'):
        assert relay.call(op)[0] == 404
    assert relay.call('reply', body=BODY)[0] == 404
    assert not relay.box_file().exists(), 'an expired box is removed'


def test_requests_sweep_expired_boxes_and_stale_rate_data(relay):
    old = {'opened': int(time.time()) - 700, 'state': 'open', 'offer': '', 'reply': None}
    for i in range(5):
        path = relay.data / f'{"B" * 21}{i}.box'
        path.write_text(json.dumps(old))
        age(path, 700)
    relay.call('open', body=BODY)
    assert relay.box_file().exists()
    rates = relay.data / 'rate.json'
    assert rates.exists()
    age(rates, 600)
    relay.call('poll', box='Z' * 22)
    assert not list(relay.data.glob('B*.box')), 'expired boxes go with any request'
    assert not rates.exists(), 'address hashes older than ten minutes go with any request'
    assert relay.box_file().exists(), 'a live box stays'


def test_the_salt_is_replaced_daily(relay):
    relay.call('open', body=BODY)
    salt = relay.data / 'salt'
    first = salt.read_text()
    age(salt, 86400)
    relay.call('open', box='Y' * 22, body=BODY)
    assert salt.read_text() != first


def test_refuses_bad_requests(relay):
    assert relay.call('nope')[0] == 400
    assert relay.call('poll', box='short')[0] == 400
    assert relay.call('poll', box='A' * 21 + '%2F')[0] == 400, 'no path characters in an id'
    assert relay.call('poll', box='A' * 23)[0] == 400
    assert relay.call('open', box=BOX + '%0A', body=BODY)[0] == 400, 'no trailing newline in an id'
    status, headers, _ = relay.call('open', method='GET')
    assert status == 405 and headers['Allow'] == 'POST'
    assert relay.call('offer', body=BODY)[0] == 405
    assert relay.call('open', body=BODY, content_type='text/plain')[0] == 415
    assert relay.call('open', body=b'\x01short')[0] == 400
    assert relay.call('open', body=bytes(65537))[0] == 413
    assert relay.call('open', body=bytes(65536))[0] == 201, 'exactly 64 KB is accepted'
    assert relay.call('poll', headers={'Sec-Fetch-Site': 'cross-site'})[0] == 403


def test_box_count_and_rate_limits(relay):
    now = int(time.time())
    for i in range(200):
        (relay.data / f'{"C" * 19}{i:03d}.box').write_text(
            json.dumps({'opened': now, 'state': 'open', 'offer': '', 'reply': None}))
    assert relay.call('open', body=BODY)[0] == 503, 'at most 200 live boxes'
    for f in relay.data.glob('C*.box'):
        f.unlink()
    for i in range(30):
        assert relay.call('open', box=f'{"D" * 20}{i:02d}', body=BODY)[0] == 201
    assert relay.call('open', box='E' * 22, body=BODY)[0] == 429, 'opens are limited per address'
    rates = (relay.data / 'rate.json').read_text()
    assert '127.0.0.1' not in rates, 'addresses are stored only as salted hashes'


def test_response_headers(relay):
    for status, headers, _ in (relay.call('open', body=BODY), relay.call('poll'), relay.call('offer'),
                               relay.call('nope')):
        assert headers['Cache-Control'] == 'no-store', status
        assert headers['X-Content-Type-Options'] == 'nosniff'
        assert headers['Content-Security-Policy'] == "default-src 'none'; frame-ancestors 'none'"
        assert headers['Referrer-Policy'] == 'no-referrer'
        assert 'Access-Control-Allow-Origin' not in headers, 'no CORS: only the planner origin uses it'


def test_no_plaintext_or_addresses_in_storage(relay):
    relay.call('open', body=BODY)
    relay.call('reply', body=bytes([1]) + b'secret-looking-bytes' * 3)
    stored = relay.box_file().read_text()
    assert 'secret-looking-bytes' not in stored, 'bodies are stored encoded, never parsed'
    assert '127.0.0.1' not in stored


TOKEN = 'T' * 21 + 'A'          # 16 bytes, base64url
OTHER = 'U' * 21 + 'A'


def share_file(relay, box=BOX):
    return relay.data / f'{box}.share'


def test_horizon_codes_last_a_day_and_only_their_maker_changes_them(relay):
    mine = {'X-Share-Token': TOKEN}
    status, headers, _ = relay.call('put', body=BODY, headers=mine)
    assert status == 201 and headers['X-Relay-Remaining'] == '86400'
    status, headers, body = relay.call('get')
    assert status == 200 and body == BODY and headers['Content-Type'] == 'application/octet-stream'
    assert int(headers['X-Relay-Remaining']) > 86390

    edited = bytes([1]) + os.urandom(500)
    status, headers, _ = relay.call('put', body=edited, headers=mine)
    assert status == 204, 'the maker replaces it'
    assert relay.call('get')[2] == edited
    rec = json.loads(share_file(relay).read_text())
    rec['created'] -= 3600
    share_file(relay).write_text(json.dumps(rec))
    age(share_file(relay), 3600)
    relay.call('put', body=BODY, headers=mine)
    assert int(relay.call('get')[1]['X-Relay-Remaining']) <= 86400 - 3600, 'an edit keeps the expiry'

    assert relay.call('put', body=BODY, headers={'X-Share-Token': OTHER})[0] == 409, 'another token: the code is taken'
    assert relay.call('drop', method='POST', headers={'X-Share-Token': OTHER})[0] == 403
    assert relay.call('put', body=BODY)[0] == 400, 'a token is required'
    assert relay.call('drop', method='POST', headers={'X-Share-Token': 'short'})[0] == 400
    assert relay.call('drop', method='POST', headers=mine)[0] == 204
    assert not share_file(relay).exists()
    assert relay.call('get')[0] == 404
    assert relay.call('drop', method='POST', headers=mine)[0] == 204, 'deleting twice is harmless'


def test_horizon_codes_expire_after_24_hours(relay):
    relay.call('put', body=BODY, headers={'X-Share-Token': TOKEN})
    age(share_file(relay), 86401)
    assert relay.call('get')[0] == 404
    assert not share_file(relay).exists(), 'an expired code is removed'
    relay.call('put', box='V' * 22, body=BODY, headers={'X-Share-Token': TOKEN})
    age(share_file(relay, 'V' * 22), 86401)
    relay.call('poll', box='Z' * 22)
    assert not share_file(relay, 'V' * 22).exists(), 'expired codes go with any request'


def test_horizon_code_limits(relay):
    now = int(time.time())
    for i in range(1000):
        p = relay.data / f'{"F" * 18}{i:04d}.share'
        p.write_text(json.dumps({'created': now, 'token': '', 'body': ''}))
    assert relay.call('put', body=BODY, headers={'X-Share-Token': TOKEN})[0] == 503, 'at most 1000 live codes'
    for f in relay.data.glob('F*.share'):
        f.unlink()
    for i in range(30):
        assert relay.call('put', box=f'{"G" * 20}{i:02d}', body=BODY, headers={'X-Share-Token': TOKEN})[0] == 201
    assert relay.call('put', box='H' * 22, body=BODY, headers={'X-Share-Token': TOKEN})[0] == 429
    for i in range(60):
        assert relay.call('get', box=f'{"J" * 20}{i:02d}')[0] == 404
    assert relay.call('get', box=f'{"G" * 20}00')[0] == 429, 'lookups are limited per address, found or not'
    stored = share_file(relay, f'{"G" * 20}00').read_text()
    assert TOKEN not in stored, "only the token's hash is kept"
    assert '127.0.0.1' not in stored


def test_refuses_to_run_without_the_data_folder(tmp_path):
    r = Relay(tmp_path, data=False)
    try:
        assert r.call('open', body=BODY)[0] == 503
        assert not (tmp_path / 'httpdocs' / 'astro' / f'{BOX}.box').exists()
    finally:
        r.stop()


def test_refuses_a_data_folder_inside_the_document_root(tmp_path):
    r = Relay(tmp_path, data=False)
    try:
        inside = r.docroot / 'astro' / 'store'
        inside.mkdir()
        try:
            os.symlink(inside, r.data, target_is_directory=True)
        except (OSError, NotImplementedError) as exc:
            pytest.skip(f'symlinks need privileges on this machine: {exc}')
        assert r.call('open', body=BODY)[0] == 503
        assert not list(inside.iterdir()), 'nothing is written where a URL could reach it'
    finally:
        r.stop()


def test_pairing_transport_against_the_real_relay(relay):
    node = shutil.which('node')
    if not node:
        pytest.fail('node is not installed - JS behaviour cannot be checked here')
    proc = subprocess.run([node, str(ROOT / 'tests' / 'js' / 'pairing_relay.mjs')],
                          capture_output=True, text=True, encoding='utf-8', timeout=120, cwd=str(ROOT),
                          env={**os.environ, 'NIGHTSEAM_RELAY_URL': relay.url})
    assert proc.returncode == 0, f'{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}'
    assert 'pairing relay round trip held' in proc.stdout
