#!/usr/bin/env python3
"""Minimal FTPS deploy helper for the Plesk webspace (<server-ip> / pitop.net).

Reads credentials from ftp.env (same directory by default; override with
`--env <path>` — the file itself is never committed), uses explicit FTPS
(AUTH TLS) with an encrypted data channel (prot_p) — required because
curl/Schannel is broken on this machine for TLS.

Usage:
  python ftps_deploy.py list [remote-dir] [--env PATH]
  python ftps_deploy.py mkdir <remote-dir> [--env PATH]
  python ftps_deploy.py upload <local-file> <remote-name> [--env PATH]
  python ftps_deploy.py download <remote-name> <local-file> [--env PATH]
  python ftps_deploy.py uploadmany <local-dir> <remote-dir> [--env PATH]   # flat files
  python ftps_deploy.py uploadtree <local-dir> <remote-dir> [--env PATH]   # recursive
"""
import pathlib
import sys
from ftplib import FTP_TLS


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
    ftp = FTP_TLS()
    ftp.connect(env["FTP_HOST"], int(env.get("FTP_PORT", "21")), timeout=30)
    ftp.login(env["FTP_USER"], env["FTP_PASS"])
    ftp.prot_p()  # TLS for the data channel
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
SKIP = {".gitignore", "build_web.py", "ftps_deploy.py", "whale", "dev", "node_modules"}


def skip(name):
    return name in SKIP


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


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        sys.exit(1)
    argv, env_path = args_of(argv)
    env = load_env(env_path)
    ftp = connect(env)
    try:
        cmd = argv[0]
        if cmd == "list":
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
            files = sorted(pathlib.Path(local).iterdir())
            for f in files:
                if not f.is_file() or skip(f.name):
                    continue
                with open(f, "rb") as fh:
                    ftp.storbinary(f"STOR {remote}/{f.name}", fh)
                print(f"uploaded {f.name} -> {remote}/{f.name}")
        elif cmd == "uploadtree":
            local, remote = pathlib.Path(argv[1]), argv[2].rstrip("/")
            mkd_tree(ftp, remote)
            items = sorted(local.iterdir())
            for item in items:
                if skip(item.name):
                    continue
                if item.is_dir():
                    sub = f"{remote}/{item.name}"
                    print(f"-> {sub}/")
                    # recurse with the same command semantics
                    ftp.cwd("/")  # keep paths absolute below
                    mkd_tree(ftp, sub)
                    _upload_tree(ftp, item, sub)
                elif item.is_file():
                    with open(item, "rb") as fh:
                        ftp.storbinary(f"STOR {remote}/{item.name}", fh)
                    print(f"uploaded {item.name} -> {remote}/{item.name}")
        else:
            print(f"unknown command: {cmd}", file=sys.stderr)
            sys.exit(2)
    finally:
        try:
            ftp.quit()
        except Exception:
            pass


def _upload_tree(ftp, local_dir, remote_dir):
    for item in sorted(local_dir.iterdir()):
        if skip(item.name):
            continue
        if item.is_dir():
            sub = f"{remote_dir}/{item.name}"
            mkd_tree(ftp, sub)
            _upload_tree(ftp, item, sub)
        elif item.is_file():
            with open(item, "rb") as fh:
                ftp.storbinary(f"STOR {remote_dir}/{item.name}", fh)
            print(f"uploaded {item.name} -> {remote_dir}/{item.name}")


if __name__ == "__main__":
    main()