"""Image credit records identify real bytes and never invent absent rights."""
from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_no_legacy_photo_assets_or_loader_dependencies():
    assert not list((ROOT / "web/img").glob("*.jpg"))
    assert not (ROOT / "web/image-attributions.json").exists()
    assert not (ROOT / "scripts/build_image_credits.py").exists()
    source = (ROOT / "web/app.js").read_text(encoding="utf-8")
    assert 'src="img/' not in source
    assert "bundledImageCredit" not in source
    assert "image-attributions.json" not in (ROOT / "web/imagecredits.js").read_text(encoding="utf-8")


def test_wikimedia_credit_keeps_exact_file_and_safe_optional_metadata():
    node = load_script("check_js_syntax").find_node()
    assert node, "Node is required for image-attribution behavior checks"
    script = r'''
const fs = require('fs');
(async () => {
  const source = fs.readFileSync(process.argv[1], 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_%26_image.jpg/330px-Test.jpg';
  const credit = await mod.wikiImageCredit(url, {fetcher: async () => ({ok:true, json:async () => ({query:{pages:{1:{imageinfo:[{extmetadata:{Artist:{value:'<a href="javascript:x">A &amp; B</a><img src=x onerror=x>'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'javascript:bad'}}}]}}}})})});
  const fallback = await mod.wikiImageCredit(url, {fetcher:async () => {throw Error('offline')}});
  const unsupported = mod.wikimediaCredit('https://example.org/wikipedia/commons/a/ab/Fake.jpg');
  console.log(JSON.stringify({credit, fallback, unsupported}));
})().catch(err => {console.error(err);process.exit(1)});
'''
    result = subprocess.run([node, "-e", script, str(ROOT / "web/imagecredits.js")],
                            capture_output=True, text=True, check=True, encoding="utf-8")
    value = json.loads(result.stdout)
    assert value["credit"]["source_url"] == "https://commons.wikimedia.org/wiki/File:Test_%26_image.jpg"
    assert value["credit"]["author"] == "A & B"
    assert value["credit"]["license"] == "CC BY 4.0"
    assert value["credit"]["license_url"] == ""
    assert value["fallback"]["status"] == "file-page"
    assert value["fallback"]["author"] == value["fallback"]["license"] == ""
    assert value["unsupported"] is None
