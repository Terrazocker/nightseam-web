"""Independent web release version and staged-byte integrity contracts."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("web_release_guard", ROOT / "scripts/check_release.py")
CR = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = CR
_spec.loader.exec_module(CR)


def state(root, describe="v0.6.34"):
    return CR.State(root, describe, {"describe": describe, "version": describe.removeprefix("v")}, None)


def problems(value, **kwargs):
    return CR.evaluate(value, include_stage=False, **kwargs)


def test_clean_exact_tag_and_matching_web_version_pass(tmp_path):
    assert problems(state(tmp_path)) == []


@pytest.mark.parametrize("describe", ["v0.6.34-1-gabcd", "v0.6.34-dirty", "abcd123", "0.6.34", "v0.6.34-fabricated"])
def test_public_release_requires_a_clean_exact_tag(tmp_path, describe):
    assert any(f.level == CR.ERROR and f.check == "git" for f in problems(state(tmp_path, describe)))


def test_development_mode_demotes_off_tag_version_findings(tmp_path):
    findings = problems(state(tmp_path, "v0.6.34-1-gabcd-dirty"), allow_dirty=True)
    assert findings and all(f.level == CR.WARNING for f in findings)


def test_missing_git_never_passes_development_mode(tmp_path):
    assert any(f.level == CR.ERROR and f.check == "git" for f in problems(state(tmp_path, ""), allow_dirty=True))


@pytest.mark.parametrize("key,value", [("version", "0.1.0"), ("describe", "v0.1.0")])
def test_web_version_must_match_repository_tag(tmp_path, key, value):
    data = state(tmp_path)
    data.web[key] = value
    assert any(f.level == CR.ERROR and f.check == "web-version" for f in problems(data))


def test_missing_or_malformed_version_document_fails(tmp_path):
    data = state(tmp_path)
    data.web_problem = "version.json must be an object"
    assert any(f.check == "web-version" and f.level == CR.ERROR for f in problems(data))


def stage(root):
    source = root / "web"
    destination = root / "dist/web-release"
    source.mkdir(parents=True)
    destination.mkdir(parents=True)
    content = b"standalone web release"
    (source / "index.html").write_bytes(content)
    (destination / "index.html").write_bytes(content)
    manifest = {"describe": "v0.6.34", "files": {"index.html": hashlib.sha256(content).hexdigest()}}
    (destination / "release.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return source, destination, manifest


def test_matching_web_stage_passes_without_an_executable(tmp_path):
    stage(tmp_path)
    assert CR.evaluate(state(tmp_path)) == []
    assert not (tmp_path / "dist/NightSeam.exe").exists()


@pytest.mark.parametrize("mutation", ["staged", "source", "extra", "missing", "version", "empty"])
def test_stage_rejects_changed_bytes_or_manifest(tmp_path, mutation):
    source, destination, manifest = stage(tmp_path)
    if mutation == "staged":
        (destination / "index.html").write_bytes(b"changed")
    elif mutation == "source":
        (source / "index.html").write_bytes(b"changed")
    elif mutation == "extra":
        (destination / "extra.js").write_bytes(b"unexpected")
    elif mutation == "missing":
        (destination / "index.html").unlink()
    elif mutation == "version":
        manifest["describe"] = "v0.1.0"
    elif mutation == "empty":
        manifest["files"] = {}
    (destination / "release.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert any(f.check == "web-stage" and f.level == CR.ERROR for f in CR.evaluate(state(tmp_path)))


def test_missing_stage_is_a_failure_when_requested(tmp_path):
    assert any(f.check == "web-stage" for f in CR.evaluate(state(tmp_path)))
    assert problems(state(tmp_path)) == []


def test_collect_reports_bad_version_document_and_reads_git(monkeypatch, tmp_path):
    (tmp_path / "web").mkdir()
    (tmp_path / "web/version.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(CR, "git", lambda *args: (0, "v0.6.34"))
    data = CR.collect(tmp_path)
    assert data.describe == "v0.6.34"
    assert "object" in data.web_problem


def test_run_reports_failure_count_and_exit_code(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(CR, "collect", lambda *args: state(tmp_path, ""))
    monkeypatch.setattr(CR, "source_findings", lambda *args: [])
    assert CR.run(include_stage=False, root=tmp_path, stream=sys.stdout) == 1
    assert "Web release check: 1 error(s)" in capsys.readouterr().out


def test_run_checks_source_guards_without_stage(monkeypatch, tmp_path):
    monkeypatch.setattr(CR, "collect", lambda *args: state(tmp_path, "v0.6.34-dirty"))
    monkeypatch.setattr(CR, "source_findings", lambda *args: [CR.Finding(CR.ERROR, "check_core", "drift")])
    assert CR.run(allow_dirty=True, include_stage=False, root=tmp_path) == 1


def test_stage_cannot_silently_omit_a_shipped_source_file(tmp_path):
    source, _destination, _manifest = stage(tmp_path)
    (source / "required.js").write_bytes(b"export const needed = true;")
    assert any(f.check == "web-stage" and f.level == CR.ERROR for f in CR.evaluate(state(tmp_path)))
