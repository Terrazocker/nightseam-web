#!/usr/bin/env python3
"""Minimal FTPS deploy helper for the Plesk webspace (nightseam.de).

Reads credentials from ftp.env (same directory by default; override with
`--env <path>` — the file itself is never committed), uses explicit FTPS
(AUTH TLS) with an encrypted data channel (prot_p) — required because
curl/Schannel is broken on this machine for TLS.

Usage:
  python ftps_deploy.py publish <prepared-bundle> [remote-root] [--env PATH]
  python ftps_deploy.py list [remote-dir] [--env PATH]
  python ftps_deploy.py mkdir <remote-dir> [--env PATH]
  python ftps_deploy.py upload <local-file> <remote-name> [--env PATH]
  python ftps_deploy.py download <remote-name> <local-file> [--env PATH]
  python ftps_deploy.py uploadmany <local-dir> <remote-dir> [--env PATH]   # flat files
  python ftps_deploy.py uploadtree <local-dir> <remote-dir> [--env PATH]   # recursive
  python ftps_deploy.py remove <remote-path> --yes [--env PATH]   # needs --yes

uploadmany/uploadtree refuse to publish .html files that still contain template
placeholders (e.g. landing/impressum.html) - pass --force to override.
"""
import hashlib
import io
import json
import re
import uuid
import pathlib
import ssl
import sys
from ftplib import FTP_TLS, error_perm


def load_env(path):
    env = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def connect(env):
    # FTP_TLS's compatibility default does not verify certificates. Use the
    # system/inherited CA trust and require the configured host to match before
    # login can send credentials (AUTH TLS happens inside FTP_TLS.login).
    ftp = FTP_TLS(context=ssl.create_default_context())
    ftp.connect(env["FTP_HOST"], int(env.get("FTP_PORT", "21")), timeout=30)
    try:
        ftp.login(env["FTP_USER"], env["FTP_PASS"])
        ftp.prot_p()  # TLS for the data channel, using the same verified context
    except Exception:
        ftp.close()
        raise
    return ftp


def args_of(argv):
    """Split --env PATH out of argv."""
    env_path = "ftp.env"
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--env" and i + 1 < len(argv):
            env_path = argv[i + 1]
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    return rest, env_path


# Never uploaded: repo tooling / dev leftovers (names at any depth).
SKIP = {".gitignore", "build_web.py", "ftps_deploy.py", "whale", "dev",
        "node_modules", "__pycache__", ".git", ".env"}


def skip(name):
    # .pyc as well: a __pycache__ created by running the build scripts locally
    # got published once, and bytecode of the deploy tool has no business on
    # the webspace.
    return name in SKIP or name.endswith((".pyc", ".env"))


def upload_order(path: pathlib.Path):
    """Generic transfer ordering. Website publication uses publish_bundle:
    HTML-last alone cannot protect clients from overwritten dependencies.
    """
    is_html = path.suffix.lower() == ".html"
    return (is_html, path.name == "index.html", path.name.lower())


def mkd_tree(ftp, remote):
    """mkdir -p on the remote (idempotent)."""
    parts = [p for p in remote.strip("/").split("/") if p]
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            ftp.mkd(cur)
        except Exception:
            pass  # already exists


PLACEHOLDER_MARKERS = ("[Dein Name]", "[Straße", "[PLZ", "name@example.com")


def check_placeholders(local, force: bool) -> None:
    """Refuse to publish pages that still carry template placeholders.

    landing/impressum.html ships placeholders until the operator fills in their
    real legal details; uploading it as-is publishes a false provider notice."""
    if force:
        return
    bad = []
    for p in pathlib.Path(local).rglob("*.html"):
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            continue
        if any(m in text for m in PLACEHOLDER_MARKERS):
            bad.append(str(p))
    if bad:
        print("refusing to upload pages with unfilled placeholders:",
              file=sys.stderr)
        for b in bad:
            print(f"  {b}", file=sys.stderr)
        print("fill in the real details (landing/impressum.html) or pass "
              "--force to publish anyway", file=sys.stderr)
        sys.exit(2)


def remove_remote(ftp, path):
    """Delete a remote file, or a directory and everything under it."""
    try:
        ftp.delete(path)
        print(f"deleted {path}")
        return
    except Exception:
        pass  # not a file - try as directory
    try:
        names = ftp.nlst(path)
    except Exception as exc:
        raise SystemExit(f"cannot remove {path}: {exc}")
    for name in names:
        child = name if name.startswith("/") else f"{path}/{name}"
        remove_remote(ftp, child)
    try:
        ftp.rmd(path)
        print(f"removed dir {path}")
    except Exception as exc:
        raise SystemExit(f"rmdir {path} failed: {exc}")


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        sys.exit(1)
    argv, env_path = args_of(argv)
    cmd = argv[0]
    bundle = None
    # Refuse unsafe website uploads and validate the entire candidate before
    # reading credentials or opening a connection.
    if cmd == 'publish':
        bundle = load_bundle(pathlib.Path(argv[1]))
        check_placeholders(argv[1], '--force' in argv)
    elif cmd in ('upload', 'uploadmany', 'uploadtree'):
        refuse_mutable_website(pathlib.Path(argv[1]))
    env = load_env(env_path)
    ftp = connect(env)
    try:
        cmd = argv[0]
        if cmd == 'publish':
            publish_bundle(ftp, bundle, argv[2] if len(argv) > 2 and not argv[2].startswith('--') else '/')
        elif cmd == "list":
            path = argv[1] if len(argv) > 1 else "/"
            for name in ftp.nlst(path):
                print(name)
        elif cmd == "upload":
            with open(argv[1], "rb") as fh:
                ftp.storbinary(f"STOR {argv[2]}", fh)
            print(f"uploaded {argv[1]} -> {argv[2]}")
        elif cmd == "download":
            with open(argv[2], "wb") as fh:
                ftp.retrbinary(f"RETR {argv[1]}", fh.write)
            print(f"downloaded {argv[1]} -> {argv[2]}")
        elif cmd == "mkdir":
            ftp.mkd(argv[1])
            print(f"created {argv[1]}")
        elif cmd == "uploadmany":
            local, remote = argv[1], argv[2].rstrip("/")
            check_placeholders(local, "--force" in argv)
            files = sorted(pathlib.Path(local).iterdir(), key=upload_order)
            for f in files:
                if not f.is_file() or skip(f.name):
                    continue
                with open(f, "rb") as fh:
                    ftp.storbinary(f"STOR {remote}/{f.name}", fh)
                print(f"uploaded {f.name} -> {remote}/{f.name}")
        elif cmd == "uploadtree":
            local, remote = pathlib.Path(argv[1]), argv[2].rstrip("/")
            check_placeholders(local, "--force" in argv)
            mkd_tree(ftp, remote)
            ftp.cwd("/")
            _upload_tree(ftp, local, remote)
        elif cmd == "remove":
            target = (argv[1] if len(argv) > 1 else "").strip()
            # recursive delete with no undo: refuse the webspace root outright
            # and require an explicit --yes for everything else
            if target in ("", "/", ".", "./", ".."):
                print("refusing to remove the webspace root", file=sys.stderr)
                sys.exit(2)
            if "--yes" not in argv:
                print(f"about to delete '{target}' (a directory is removed "
                      f"with everything under it).", file=sys.stderr)
                print("nothing was deleted - re-run with --yes to confirm:",
                      file=sys.stderr)
                print(f"  python web/ftps_deploy.py remove {target} --yes",
                      file=sys.stderr)
                sys.exit(2)
            remove_remote(ftp, target)
        else:
            print(f"unknown command: {cmd}", file=sys.stderr)
            sys.exit(2)
    finally:
        try:
            ftp.quit()
        except Exception:
            pass


def _upload_tree(ftp, local_dir, remote_dir):
    # Flatten first: per-directory HTML-last sorting still publishes nested
    # entry points before dependencies in later sibling directories.
    files = [p for p in local_dir.rglob('*') if p.is_file()
             and not any(skip(part) for part in p.relative_to(local_dir).parts)]
    for item in sorted(files, key=lambda p: (*upload_order(p), p.relative_to(local_dir).as_posix())):
        rel = item.relative_to(local_dir).as_posix()
        destination = f"{remote_dir}/{rel}"
        mkd_tree(ftp, destination.rsplit('/', 1)[0])
        with open(item, "rb") as fh:
            ftp.storbinary(f"STOR {destination}", fh)
        print(f"uploaded {rel} -> {destination}")


def refuse_mutable_website(local):
    files = list(local.rglob('*')) if local.is_dir() else [local]
    in_source_tree = any(part in ('web', 'landing') for part in local.resolve().parts)
    if any(p.is_file() and (in_source_tree or p.suffix.lower() in ('.html', '.js', '.css', '.json', '.svg')
                           or p.name == '.htaccess') for p in files):
        raise ValueError('Mutable website uploads are unsafe; prepare an immutable bundle and use publish')


def load_bundle(directory):
    directory = pathlib.Path(directory)
    if directory.is_symlink() or any(p.is_symlink() for p in directory.rglob('*')):
        raise ValueError('Publication bundle must not contain symlinks')
    combined = (directory/'publication.manifest.json').is_file()
    manifest_name = 'publication.manifest.json' if combined else 'release.manifest.json'
    manifest = json.loads((directory/manifest_name).read_text(encoding='utf-8'))
    metadata = manifest.get('publication', {})
    if metadata.get('format') != 'nightseam-immutable-v1':
        raise ValueError('Only immutable publication bundles can be published')
    payload = {p.relative_to(directory).as_posix(): p.read_bytes()
               for p in directory.rglob('*') if p.is_file() and p != directory/manifest_name}
    if not payload or {n: hashlib.sha256(b).hexdigest() for n,b in payload.items()} != manifest.get('files'):
        raise ValueError('Publication bundle differs from its manifest')
    source = metadata.get('source_files')
    if not isinstance(source, dict) or not source:
        raise ValueError('Publication source inventory is missing')
    expected = set()
    for name, digest in source.items():
        tree, rel = name.split('/', 1)
        if '..' in pathlib.PurePosixPath(rel).parts or rel.startswith('/') or not re.fullmatch('[0-9a-f]{64}', digest):
            raise ValueError('Invalid publication source inventory')
        namespace = metadata.get('web_namespace' if tree == 'web' else 'landing_namespace', '')
        if tree not in ('web', 'landing') or (not combined and tree != 'web'):
            raise ValueError('Unexpected publication source tree')
        prefix = tree+'/' if combined else ''
        if rel == '.htaccess':
            expected.add(prefix+rel)
            if hashlib.sha256(payload.get(prefix+rel, b'')).hexdigest() != digest:
                raise ValueError('Server policy differs from source inventory')
        else:
            snapshot = prefix+'releases/'+namespace+'/'+rel
            expected.add(snapshot)
            if rel.endswith('.html') or name == 'web/version.json':
                expected.add(prefix+rel)
            if not rel.endswith('.html') and hashlib.sha256(payload.get(snapshot, b'')).hexdigest() != digest:
                raise ValueError('Publication snapshot differs from source inventory: '+name)
        if rel.endswith('.html') and payload.get(prefix+rel) != payload.get(snapshot):
            raise ValueError('Public entry differs from its immutable snapshot: '+name)
    if set(payload) != expected:
        raise ValueError('Publication bundle is incomplete or has unexpected files')
    mapped = {}
    for name, data in payload.items():
        if combined:
            tree, rel = name.split('/', 1)
        else:
            tree, rel = 'web', name
        if tree not in ('web', 'landing') or '..' in pathlib.PurePosixPath(rel).parts or rel.startswith('/'):
            raise ValueError('Unexpected publication path: ' + name)
        namespace = metadata.get('web_namespace' if tree == 'web' else 'landing_namespace', '')
        if not re.fullmatch('[0-9a-f]{64}', namespace):
            raise ValueError('Invalid immutable namespace')
        if not (rel.startswith('releases/'+namespace+'/') or rel.endswith('.html')
                or rel == '.htaccess' or (tree == 'web' and rel == 'version.json')):
            raise ValueError('Mutable asset in publication: ' + name)
        mapped[('astro/' if tree == 'web' else '') + rel] = data
    return mapped


def _remote_bytes(ftp, path):
    chunks = []
    try:
        ftp.retrbinary('RETR ' + path, chunks.append)
    except error_perm as exc:
        if str(exc).startswith('550'):
            return None
        raise
    return b''.join(chunks)


def _atomic_store(ftp, path, data):
    temporary = path + '.upload-' + uuid.uuid4().hex
    mkd_tree(ftp, path.rsplit('/', 1)[0])
    try:
        ftp.storbinary('STOR '+temporary, io.BytesIO(data))
        if _remote_bytes(ftp, temporary) != data:
            raise ValueError('Remote verification failed: '+path)
        ftp.rename(temporary, path)
    finally:
        try:
            ftp.delete(temporary)
        except Exception:
            pass  # Cleanup must not mask the transfer/verification failure.


def publish_bundle(ftp, payload, remote_root='/'):
    """Install immutable graphs, verify all bytes, then atomically switch pages.

    Existing release paths are never overwritten or removed. Atomic rename is
    required from the server. A failed transfer leaves each page naming a
    complete old or new graph; already open clients retain their old graph.
    """
    remote_root = remote_root.rstrip('/')
    paths = {remote_root+'/'+name: data for name, data in payload.items()}
    immutable = {p: b for p,b in paths.items() if '/releases/' in p}
    if not immutable:
        raise ValueError('Publication has no immutable assets')
    # Refuse an unreviewed server-policy migration before installing anything.
    for path, data in paths.items():
        if path.endswith('/.htaccess') and path not in immutable:
            old = _remote_bytes(ftp, path)
            if old is not None and old != data:
                raise ValueError('Server policy differs; review .htaccess migration separately: '+path)
    for path, data in sorted(immutable.items()):
        existing = _remote_bytes(ftp, path)
        if existing is not None and existing != data:
            raise ValueError('Immutable remote asset differs: '+path)
        if existing is None:
            _atomic_store(ftp, path, data)
    # Check the complete graph after installation, before ANY public switch.
    for path, data in sorted(immutable.items()):
        if _remote_bytes(ftp, path) != data:
            raise ValueError('Incomplete remote publication: '+path)
    entries = [(p,b) for p,b in paths.items() if p not in immutable]
    for path, data in sorted(entries, key=lambda item: upload_order(pathlib.Path(item[0]))):
        if _remote_bytes(ftp, path) != data:
            _atomic_store(ftp, path, data)
    print(f'Published verified immutable bundle: {len(paths)} files; older releases retained')


if __name__ == "__main__":
    main()
