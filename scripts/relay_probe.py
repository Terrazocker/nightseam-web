"""Phase 0 hosting probe for the pairing relay (docs/horizon/HORIZON_PAIRING_PLAN.md).

Usage, with docs/horizon/relay_probe.php uploaded by hand to the host:

    python scripts/relay_probe.py https://nightseam.de/astro/relay_probe.php

It asks the probe to write, read and delete a file in nightseam-relay/, then
posts random binary bodies (1 KB, 60 KB and 64 KB) and checks that each
arrives unchanged. Exit 0 when everything the relay needs works, 1 otherwise.
Record the printed result in RELEASES.md, then delete the probe from the host.
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request


def call(url, body=None):
    req = urllib.request.Request(url, data=body, method='POST' if body is not None else 'GET')
    if body is not None:
        req.add_header('Content-Type', 'application/octet-stream')
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, dict(res.headers), res.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read().decode('utf-8', 'replace')


def main(argv):
    if len(argv) != 2 or not argv[1].startswith('https://'):
        print(__doc__)
        return 2
    url = argv[1]
    ok = True
    status, headers, text = call(url)
    print(f'GET {status}  server: {headers.get("Server", "?")}')
    print(text)
    try:
        info = json.loads(text)
    except ValueError:
        print('FAIL: the probe did not answer JSON (blocked or not executed as PHP)')
        return 1
    for key in ('data_folder_found', 'data_folder_outside_document_root', 'write', 'rename', 'read_back', 'lock', 'delete',
                'remote_addr_is_public'):
        if info.get(key) is not True:
            print(f'FAIL: {key}')
            ok = False
    if headers.get('Cache-Control') != 'no-store':
        print(f'NOTE: Cache-Control is {headers.get("Cache-Control")!r}; relay.php needs no-store '
              '(web/.htaccess applies only when Apache serves PHP)')
    for size in (1024, 60000, 65536):
        body = os.urandom(size)
        status, _, text = call(url, body)
        try:
            got = json.loads(text)
        except ValueError:
            got = {}
        same = got.get('body_bytes') == size and got.get('body_sha256') == hashlib.sha256(body).hexdigest()
        print(f'POST {size:>5} bytes: {status} {"unchanged" if same else "CHANGED OR BLOCKED"}')
        ok = ok and status == 200 and same
    print('PASS: the host can run the relay' if ok else 'FAIL: see above; do not deploy the relay')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
