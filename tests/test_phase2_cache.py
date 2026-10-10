"""Recursive cache updates must be consistent, transitive and idempotent."""
import json
import subprocess
from pathlib import Path
import pytest
from scripts.web_asset_graph import live_graph
from scripts.check_js_tokens import baseline_rows, load_web_modules, update_refusals, describe_modules_from_git
from scripts.bump_web_tokens import bump


def put(root, name, text):
    p = root/name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def fixture(root):
    put(root, 'web/index.html', "<script src = 'app.js?v=3' type='module'></script><link href='themes.css?v=7'>")
    put(root, 'web/credits.html', '<link href="themes.css?v=7">')
    put(root, 'landing/about.html', '<link href="/astro/themes.css?v=7"><link href="style.css?v=2">')
    put(root, 'landing/style.css', 'body{}')
    put(root, 'web/themes.css', ':root{}')
    put(root, 'web/app.js', "import './nested/horizon.js?v=5'; export * from './store.js?v=9';")
    put(root, 'web/nested/horizon.js', "import '../store.js?v=9'; import('/astro/viz.js?v=4');")
    put(root, 'web/store.js', "export const a=1; // import './missing.js?v=1'\n")
    put(root, 'web/viz.js', 'export const v=1;')
    return baseline_rows(load_web_modules(root/'web'))


def test_secondary_dependency_updates_all_importers_once_and_repeat_is_noop(tmp_path):
    base = fixture(tmp_path)
    put(tmp_path, 'web/store.js', 'export const a=2;')
    put(tmp_path, 'web/viz.js', 'export const v=2;')
    assert update_refusals(load_web_modules(tmp_path/'web'), base)
    bump(tmp_path, base)
    graph = live_graph(tmp_path)
    assert not graph.problems
    assert graph.tokens['store.js'] == '10'
    assert graph.tokens['viz.js'] == '5'
    assert graph.tokens['nested/horizon.js'] == '6'
    assert graph.tokens['app.js'] == '4'
    assert not update_refusals(load_web_modules(tmp_path/'web'), base)
    before = {p: p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}
    assert bump(tmp_path, base) == []
    assert before == {p: p.read_bytes() for p in before}


def test_shared_stylesheet_updates_all_html_roots_and_preserves_manual_bump(tmp_path):
    base = fixture(tmp_path)
    put(tmp_path, 'web/themes.css', ':root{color:red}')
    put(tmp_path, 'web/store.js', 'export const a=2;')
    for name in ('web/app.js', 'web/nested/horizon.js'):
        p=tmp_path/name
        p.write_text(p.read_text().replace('store.js?v=9','store.js?v=12'))
    bump(tmp_path, base)
    graph=live_graph(tmp_path)
    assert graph.tokens['store.js']=='12'
    assert graph.tokens['themes.css']=='8'
    assert all('themes.css?v=8' in (tmp_path/name).read_text() for name in
               ('web/index.html','web/credits.html','landing/about.html'))
    assert bump(tmp_path, base)==[]


@pytest.mark.parametrize('defect', ['conflict','missing','unversioned'])
def test_invalid_graph_refuses_before_any_write_or_baseline_refresh(tmp_path, defect):
    base=fixture(tmp_path)
    if defect=='conflict': put(tmp_path,'web/credits.html', '<link href="themes.css?v=6">')
    elif defect=='missing': (tmp_path/'web/store.js').unlink()
    else: put(tmp_path,'web/credits.html', '<script src="app.js"></script>')
    before={p:p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}
    assert update_refusals(load_web_modules(tmp_path/'web'),base)
    with pytest.raises(ValueError): bump(tmp_path,base)
    assert before=={p:p.read_bytes() for p in before}


def test_cycles_converge_and_generated_core_token_is_manifest_owned(tmp_path):
    base=fixture(tmp_path)
    put(tmp_path,'web/store.js', "import './app.js?v=3'; export * from './core.js?v=11';")
    put(tmp_path,'web/nested/horizon.js', "export * from '../core.js?v=11';")
    put(tmp_path,'web/core.js', "export * from './core/0123456789abcdef/index.js';")
    put(tmp_path,'web/core/0123456789abcdef/index.js', 'export const a=1;')
    put(tmp_path,'core/core.manifest.json',json.dumps({'token':11}))
    base=baseline_rows(load_web_modules(tmp_path/'web'))
    put(tmp_path,'web/core.js', "export * from './core/0123456789abcdef/index.js';\n")
    with pytest.raises(ValueError,match='Generated core'): bump(tmp_path,base)
    put(tmp_path,'core/core.manifest.json',json.dumps({'token':12}))
    bump(tmp_path,base)
    graph=live_graph(tmp_path)
    assert graph.tokens['core.js']=='12'
    assert graph.tokens['app.js']=='4'
    assert graph.tokens['store.js']=='10'
    assert graph.tokens['nested/horizon.js']=='6'
    assert bump(tmp_path,base)==[]


def test_historical_discovery_follows_secondary_imports_and_landing(monkeypatch,tmp_path):
    import scripts.check_js_tokens as guard
    fixture(tmp_path)
    subprocess.run(['git','init','-q'],cwd=tmp_path,check=True)
    subprocess.run(['git','add','.'],cwd=tmp_path,check=True)
    subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture'],cwd=tmp_path,check=True)
    monkeypatch.setattr(guard,'ROOT',tmp_path)
    committed=describe_modules_from_git('HEAD')
    live=load_web_modules(tmp_path/'web')
    assert committed.tokens==live.tokens
    assert committed.hashes()==live.hashes()
