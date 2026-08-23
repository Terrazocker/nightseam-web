"""Writable/runtime path resolution (works both from source and PyInstaller exe)."""

from __future__ import annotations

import sys
from pathlib import Path


def app_base_dir() -> Path:
    """Directory containing writable data (next to exe when frozen)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def resource_dir() -> Path:
    """Directory holding bundled read-only assets (static/)."""
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def static_dir() -> Path:
    return resource_dir() / "static"


def data_dir() -> Path:
    d = app_base_dir() / "data"
    (d / "panos").mkdir(parents=True, exist_ok=True)
    return d


def logs_dir() -> Path:
    d = app_base_dir() / "logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def default_archive_dir() -> Path:
    """Default folder for ingested image files: Documents (or home)."""
    home = Path.home()
    docs = home / "Documents"
    return (docs if docs.is_dir() else home) / "AstroPilot Images"
