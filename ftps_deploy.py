#!/usr/bin/env python3
"""Minimal FTPS deploy helper for the Plesk webspace (<server-ip> / pitop.net).

Reads credentials from ftp.env (same directory), uses explicit FTPS (AUTH TLS)
with an encrypted data channel (prot_p) — required because curl/Schannel is
broken on this machine for TLS.

Usage:
  python ftps_deploy.py list [remote-dir]
  python ftps_deploy.py mkdir <remote-dir>
  python ftps_deploy.py upload <local-file> <remote-name>
  python ftps_deploy.py download <remote-name> <local-file>
  python ftps_deploy.py uploadmany <local-dir> <remote-dir>   # all files, basenames preserved
"""
import sys
from ftplib import FTP_TLS


def load_env(path="ftp.env"):
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
    ftp.connect(env["FTP_HOST"], int(env.get("FTP_PORT", "21")), timeout=20)
    ftp.login(env["FTP_USER"], env["FTP_PASS"])
    ftp.prot_p()  # TLS for the data channel
    return ftp


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    env = load_env()
    ftp = connect(env)
    try:
        cmd = sys.argv[1]
        if cmd == "list":
            path = sys.argv[2] if len(sys.argv) > 2 else "/"
            for name in ftp.nlst(path):
                print(name)
        elif cmd == "upload":
            local, remote = sys.argv[2], sys.argv[3]
            with open(local, "rb") as fh:
                ftp.storbinary(f"STOR {remote}", fh)
            print(f"uploaded {local} -> {remote}")
        elif cmd == "download":
            remote, local = sys.argv[2], sys.argv[3]
            with open(local, "wb") as fh:
                ftp.retrbinary(f"RETR {remote}", fh.write)
            print(f"downloaded {remote} -> {local}")
        elif cmd == "mkdir":
            ftp.mkd(sys.argv[2])
            print(f"created {sys.argv[2]}")
        elif cmd == "uploadmany":
            import pathlib
            local, remote = sys.argv[2], sys.argv[3]
            remote = remote.rstrip("/")
            files = sorted(pathlib.Path(local).iterdir())
            for f in files:
                if not f.is_file():
                    continue
                with open(f, "rb") as fh:
                    ftp.storbinary(f"STOR {remote}/{f.name}", fh)
                print(f"uploaded {f.name} -> {remote}/{f.name}")
        else:
            print(f"unknown command: {cmd}", file=sys.stderr)
            sys.exit(2)
    finally:
        try:
            ftp.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()