"""The Changes route remains useful without optional runtime requests."""
import importlib.util
import json
import pytest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def generator():
    spec = importlib.util.spec_from_file_location(
        "landing_history", ROOT / "scripts" / "build_changelog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Notes(HTMLParser):
    """Each release's bullet list, as the visible text of its items."""
    def __init__(self):
        super().__init__()
        self.items = None
        self.current = None
        self.notes = []

    def handle_starttag(self, tag, attrs):
        if tag == "ul" and dict(attrs).get("class") == "cl-notes":
            self.items = []
        elif tag == "li" and self.items is not None:
            self.current = []

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == "li" and self.current is not None:
            self.items.append("".join(self.current))
            self.current = None
        elif tag == "ul" and self.items is not None:
            self.notes.append(self.items)
            self.items = None


def test_generated_history_contains_only_independent_website_releases():
    module = generator()
    entries = json.loads((ROOT / "landing" / "changelog.json").read_text(encoding="utf-8"))
    page = (ROOT / "landing" / "download.html").read_text(encoding="utf-8")
    assert module.generated_page(page, entries) == page
    assert entries == module.public_entries()
    assert [entry["version"] for entry in entries] == ["0.8.0", "0.7.0", "0.1.1", "0.1.0"]
    rendered = Notes()
    rendered.feed(page)
    assert rendered.notes == [entry["summary"] for entry in entries]
    assert all(isinstance(entry["summary"], list) for entry in entries),         "public release notes are bullet lists"
    assert '<h2 class="release-heading">v0.1.0 ' in page
    assert 'release-archive' not in page
    assert 'v0.6.' not in page
    assert 'v0.4.' not in page


def test_release_text_is_escaped_not_interpreted_as_markup():
    module = generator()
    entry = {"version": '1"><img src=x onerror=alert(1)>',
             "date": '2026-10-05" onfocus="bad',
             "summary": '<script>alert("oops")</script> & copied text'}
    markup = module.render_entry(entry)
    assert "<script>" not in markup
    assert "<img " not in markup
    assert 'datetime="2026-10-05&quot; onfocus=&quot;bad"' in markup
    notes = Notes()
    notes.feed(markup)
    assert notes.notes == [[entry["summary"]]]
    listed = module.render_entry(dict(entry, summary=["<b>one</b>", "two & three"]))
    assert "<b>" not in listed
    notes = Notes()
    notes.feed(listed)
    assert notes.notes == [["<b>one</b>", "two & three"]]


def test_no_runtime_dependency_can_leave_loading_or_fake_empty_history():
    page = (ROOT / "landing" / "download.html").read_text(encoding="utf-8")
    assert "<script" not in page
    assert "fetch(" not in page
    assert '<p class="hero-note">loading' not in page.lower()
    assert "Latest tagged website version" not in page
    assert 'class="cl-notes"' in page
    assert '<a href="download.html" aria-current="page">Changes</a>' in page


def test_empty_generated_history_is_explicit_and_still_usable():
    markup = generator().render_history([])
    assert "No website release notes are available yet." in markup
    assert "release-archive" not in markup
    assert "Latest tagged website version" not in markup
    assert "loading" not in markup.lower()


def test_check_detects_stale_html_without_writing(tmp_path, monkeypatch):
    module = generator()
    page = tmp_path / "download.html"
    out = tmp_path / "changelog.json"
    entries = module.public_entries()
    out.write_text(json.dumps(entries, indent=1) + "\n", encoding="utf-8")
    initial = module.START + "stale history" + module.END
    page.write_text(initial, encoding="utf-8")
    monkeypatch.setattr(module, "OUT", out)
    monkeypatch.setattr(module, "PAGE", page)
    monkeypatch.setattr(module, "git", lambda *args: "v0.6.36" if args[0] == "tag" else "2026-10-05")
    assert module.main(["--check"]) == 1
    assert page.read_text(encoding="utf-8") == initial
    page.write_text(module.generated_page(initial, entries), encoding="utf-8")
    assert module.main(["--check"]) == 0


def test_inherited_tags_cannot_restore_old_public_history(tmp_path, monkeypatch):
    module = generator()
    page = tmp_path / "download.html"
    out = tmp_path / "changelog.json"
    page.write_text(module.START + "old history" + module.END, encoding="utf-8")
    monkeypatch.setattr(module, "OUT", out)
    monkeypatch.setattr(module, "PAGE", page)
    monkeypatch.setattr(module, "git", lambda *args: "v0.6.36\nv0.6.35\nv0.4.2")
    assert module.main([]) == 0
    assert json.loads(out.read_text(encoding="utf-8")) == module.public_entries()
    assert "v0.6." not in page.read_text(encoding="utf-8")


def test_public_ledger_rejects_missing_summary_and_duplicate_version():
    module = generator()
    with pytest.raises(ValueError, match="non-empty curated summary"):
        module.public_entries(curated={"0.1.0": " "})
    for blank in ([], ["fine", " "]):
        with pytest.raises(ValueError, match="non-empty curated summary"):
            module.public_entries(curated={"0.1.0": blank}, releases=[{"version": "0.1.0", "date": "2026-10-07"}])
    with pytest.raises(ValueError, match="duplicate public release"):
        module.public_entries(releases=module.PUBLIC_RELEASES * 2)
