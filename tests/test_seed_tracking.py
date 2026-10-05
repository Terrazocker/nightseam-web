"""Shipped seed inputs belong in Git; actual libraries remain ignored."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = "catalog_data/data"
SEED = SEED_DIR + "/openned.csv"

def test_seed_inputs_and_private_library_have_separate_ignore_rules(tmp_path):
    (tmp_path / ".gitignore").write_text((ROOT / ".gitignore").read_text(encoding="utf-8"), encoding="utf-8")
    result = subprocess.run(["git", "init", "--quiet", str(tmp_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    seed = tmp_path / SEED
    seed.parent.mkdir(parents=True)
    seed.write_text("seed", encoding="utf-8")
    private = tmp_path / "data/private.db"
    private.parent.mkdir(parents=True)
    private.write_bytes(b"private")
    result = subprocess.run(["git", "check-ignore", str(seed)], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 1, "shipped seed data must not be ignored"
    result = subprocess.run(["git", "check-ignore", str(private)], cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, "user library data must stay ignored"

def test_required_seed_inputs_are_tracked_in_this_project():
    result = subprocess.run(["git", "ls-files", "--", SEED_DIR], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    tracked = set(result.stdout.splitlines())
    for name in ("openned.csv", "supplement.csv", "catalog_provenance.json"):
        relative = SEED_DIR + "/" + name
        assert relative in tracked and (ROOT / relative).is_file(), relative


def test_fresh_windows_checkout_preserves_hashed_seed_and_payload_bytes(tmp_path):
    """A Windows checkout must retain the bytes used by source/cache hashes."""
    files = [SEED, SEED_DIR + "/supplement.csv",
             SEED_DIR + "/catalog_provenance.json",
             "web/catalog.json", "web/catalog-provenance.json"]
    expected = {}
    for name in files:
        result = subprocess.run(["git", "show", "HEAD:" + name], cwd=ROOT,
                                capture_output=True)
        assert result.returncode == 0, result.stderr
        expected[name] = result.stdout
    attrs = (ROOT / ".gitattributes").read_bytes()

    def git(*args):
        result = subprocess.run(["git", *args], cwd=tmp_path,
                                capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    git("init", "--quiet")
    git("config", "core.autocrlf", "false")
    (tmp_path / ".gitattributes").write_bytes(attrs)
    for name, payload in expected.items():
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    git("add", "--", ".gitattributes", *files)
    git("config", "core.autocrlf", "true")
    for name in files:
        (tmp_path / name).unlink()
    git("checkout-index", "--all", "--force")
    for name, payload in expected.items():
        assert (tmp_path / name).read_bytes() == payload, name
