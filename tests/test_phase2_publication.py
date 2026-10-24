"""Immutable graphs survive interruption and reject unknown served artifacts."""
import copy
import hashlib
import json
import re
import subprocess
from pathlib import Path
from ftplib import error_perm
import pytest
from scripts.publication_assets import immutable_payload, require_tracked
from scripts.prepare_publication import prepare
from web.ftps_deploy import load_bundle, publish_bundle, refuse_mutable_website


def tracked_fixture(root):
    data={'web/index.html':'<script type="module" src="app.js?v=1"></script><a href="../about.html">About</a>',
          'web/app.js':"import {oldAPI} from './dep.js?v=1'; export const answer=oldAPI();",
          'web/dep.js':'export const oldAPI=()=>41;',
          'web/catalog.json':'[{"name":"old"}]', 'web/themes.css':':root{}',
          'landing/index.html':'<meta property="og:image" content="https://nightseam.de/social-preview.png?v=1"><link href="/astro/themes.css?v=1"><a href="about.html#content">About</a>',
          'landing/about.html':'About', 'landing/social-preview.png':'PNG'}
    for name,text in data.items():
        p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    subprocess.run(['git','init','-q'],cwd=root,check=True)
    subprocess.run(['git','add','web','landing'],cwd=root,check=True)


class FTP:
    def __init__(self, files=(), fail=None, corrupt=False):
        self.files=dict(files);self.fail=fail;self.stores=0;self.corrupt=corrupt;self.switched=[]
    def mkd(self,path): pass
    def retrbinary(self,command,callback):
        name=command.removeprefix('RETR ')
        if name not in self.files: raise error_perm('550 Missing')
        callback(self.files[name])
    def storbinary(self,command,stream):
        name=command.removeprefix('STOR ');data=stream.read();self.stores+=1
        if self.stores==self.fail:
            self.files[name]=data[:len(data)//2]
            raise ConnectionError('Interrupted upload')
        self.files[name]=data+b'bad' if self.corrupt else data
    def rename(self,source,target):
        self.files[target]=self.files.pop(source)
        if '/releases/' not in target: self.switched.append(target)
    def delete(self,path):
        if path not in self.files: raise error_perm('550 Missing')
        del self.files[path]


def bundle(root):
    return load_bundle(prepare(root,'test-dirty'))


def assert_page_graphs(files):
    # Every public entry points exclusively at a fully installed namespace.
    for name,data in files.items():
        if not name.endswith('.html') or '/releases/' in name: continue
        for ref in re.findall(r'(?:src|href)=[\"\']([^\"\']+)',data.decode()):
            if '/releases/' in ref:
                assert ref.split('?')[0] in files
                prefix=ref.split('/releases/')[0]+'/releases/'+ref.split('/releases/')[1].split('/')[0]+'/'
                if ref.split('?')[0].endswith('app.js'):
                    app=files[ref.split('?')[0]].decode()
                    dep=re.search(r"from '([^']+)'",app).group(1).split('?')[0].removeprefix('./')
                    depbytes=files[prefix+dep].decode()
                    assert ('oldAPI' in app and 'oldAPI' in depbytes) or ('newAPI' in app and 'newAPI' in depbytes)


def test_every_upload_interruption_keeps_complete_old_or_new_graphs(tmp_path):
    tracked_fixture(tmp_path)
    old=bundle(tmp_path)
    ftp=FTP();publish_bundle(ftp,old)
    initial=copy.deepcopy(ftp.files)
    (tmp_path/'web/app.js').write_text("import {newAPI} from './dep.js?v=2'; export const answer=newAPI();")
    (tmp_path/'web/dep.js').write_text('export const newAPI=()=>42;')
    new=bundle(tmp_path)
    success=FTP(initial);publish_bundle(success,new)
    assert_page_graphs(success.files)
    for stop in range(1,success.stores+1):
        interrupted=FTP(initial,fail=stop)
        with pytest.raises(ConnectionError): publish_bundle(interrupted,new)
        assert_page_graphs(interrupted.files)
        assert all(interrupted.files[name]==data for name,data in initial.items() if '/releases/' in name)
        assert not any('.upload-' in name for name in interrupted.files)
        # Retrying resumes an incomplete graph without rewriting old assets.
        interrupted.fail=None
        publish_bundle(interrupted,new)
        assert_page_graphs(interrupted.files)
    assert all(success.files[name]==data for name,data in initial.items() if '/releases/' in name)


def test_remote_corruption_or_conflicting_immutable_path_never_switches_html(tmp_path):
    tracked_fixture(tmp_path);payload=bundle(tmp_path)
    corrupt=FTP(corrupt=True)
    with pytest.raises(ValueError,match='verification'): publish_bundle(corrupt,payload)
    assert not corrupt.switched
    name=next(n for n in payload if '/releases/' in n)
    conflict=FTP({'/'+name:b'foreign bytes'})
    with pytest.raises(ValueError,match='Immutable remote'): publish_bundle(conflict,payload)
    assert not conflict.switched


@pytest.mark.parametrize('tree', ['web','landing'])
@pytest.mark.parametrize('suffix', ['html','css','json','png','config'])
def test_all_untracked_served_formats_refused_before_replacing_candidate(tmp_path,tree,suffix):
    tracked_fixture(tmp_path);candidate=prepare(tmp_path,'test')
    receipt=(candidate/'publication.manifest.json').read_bytes()
    (tmp_path/tree/f'unknown.{suffix}').write_bytes(b'untracked')
    with pytest.raises(ValueError,match='not tracked'): prepare(tmp_path,'test')
    assert (candidate/'publication.manifest.json').read_bytes()==receipt


def test_only_exact_generated_version_allowance_and_no_symlinks(tmp_path):
    tracked_fixture(tmp_path)
    (tmp_path/'web/version.json').write_text('{"describe":"test"}')
    require_tracked(tmp_path)
    (tmp_path/'landing/version.json').write_text('{}')
    with pytest.raises(ValueError,match='not tracked'): require_tracked(tmp_path)
    (tmp_path/'landing/version.json').unlink()
    (tmp_path/'web/link.png').symlink_to(tmp_path/'web/catalog.json')
    with pytest.raises(ValueError,match='symlink'): require_tracked(tmp_path)


def test_shared_assets_pinned_while_page_navigation_stays_canonical(tmp_path):
    tracked_fixture(tmp_path)
    payload,meta=immutable_payload(tmp_path)
    assert f'/astro/releases/{meta["web_namespace"]}/themes.css?v=1'.encode() in payload['landing/index.html']
    assert f'https://nightseam.de/releases/{meta["landing_namespace"]}/social-preview.png?v=1'.encode() in payload['landing/index.html']
    assert b'href="about.html#content"' in payload['landing/index.html']
    assert b'href="../about.html"' in payload['web/index.html']
    candidate=prepare(tmp_path,'test')
    (candidate/'web/index.html').write_bytes(b'tampered')
    with pytest.raises(ValueError,match='manifest'): load_bundle(candidate)
    with pytest.raises(ValueError,match='Mutable'): refuse_mutable_website(tmp_path/'web')


def test_complete_old_and_new_modules_execute_after_publication(tmp_path):
    tracked_fixture(tmp_path)
    old=prepare(tmp_path,'old')
    old_manifest=json.loads((old/'publication.manifest.json').read_text())
    old_id=old_manifest['publication']['web_namespace']
    ftp=FTP();publish_bundle(ftp,load_bundle(old))
    (tmp_path/'web/app.js').write_text("import {newAPI} from './dep.js?v=2'; export const answer=newAPI();")
    (tmp_path/'web/dep.js').write_text('export const newAPI=()=>42;')
    new=prepare(tmp_path,'new')
    new_id=json.loads((new/'publication.manifest.json').read_text())['publication']['web_namespace']
    publish_bundle(ftp,load_bundle(new))
    remote=tmp_path/'remote'
    for name,data in ftp.files.items():
        p=remote/name.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    script='''const old = await import(process.argv[1]);
const current = await import(process.argv[2]);
if (old.answer !== 41 || current.answer !== 42) throw new Error('Mixed release graph');'''
    subprocess.run(['node','--input-type=module','-e',script,
                    (remote/f'astro/releases/{old_id}/app.js').as_uri(),
                    (remote/f'astro/releases/{new_id}/app.js').as_uri()],check=True,capture_output=True)


def test_incomplete_bundle_cannot_be_blessed_by_removing_manifest_row(tmp_path):
    tracked_fixture(tmp_path);candidate=prepare(tmp_path,'test')
    receipt=candidate/'publication.manifest.json'
    manifest=json.loads(receipt.read_text())
    missing=next(n for n in manifest['files'] if n.endswith('/dep.js'))
    (candidate/missing).unlink();del manifest['files'][missing]
    receipt.write_text(json.dumps(manifest))
    with pytest.raises(ValueError,match='source inventory|incomplete'): load_bundle(candidate)


def test_changed_server_policy_refuses_before_asset_upload(tmp_path):
    tracked_fixture(tmp_path)
    (tmp_path/'web/.htaccess').write_text('new policy')
    subprocess.run(['git','add','web/.htaccess'],cwd=tmp_path,check=True)
    ftp=FTP({'/astro/.htaccess':b'old policy'})
    with pytest.raises(ValueError,match='Server policy'): publish_bundle(ftp,bundle(tmp_path))
    assert ftp.stores==0


def test_raw_website_cli_refuses_before_credentials_or_connection(monkeypatch,tmp_path):
    import web.ftps_deploy as deploy
    tracked_fixture(tmp_path)
    monkeypatch.setattr(deploy.sys,'argv',['ftps_deploy.py','uploadtree',str(tmp_path/'web'),'/astro'])
    monkeypatch.setattr(deploy,'load_env',lambda path:pytest.fail('must refuse before credentials'))
    monkeypatch.setattr(deploy,'connect',lambda env:pytest.fail('must refuse before network'))
    with pytest.raises(ValueError,match='Mutable'): deploy.main()


def test_the_pairing_relay_keeps_one_stable_path_and_no_other_script_ships(tmp_path):
    """web/relay.php is published only at /astro/relay.php, so every release
    talks to the same relay; it never lands in a release namespace, and any
    other server script is refused before a candidate is built."""
    tracked_fixture(tmp_path)
    (tmp_path/'web/relay.php').write_text('<?php echo 1;')
    subprocess.run(['git','add','web/relay.php'],cwd=tmp_path,check=True)
    payload, meta = immutable_payload(tmp_path)
    assert payload['web/relay.php'] == b'<?php echo 1;'
    assert not any(n.endswith('relay.php') and '/releases/' in n for n in payload)
    files = bundle(tmp_path)
    assert files['astro/relay.php'] == b'<?php echo 1;'
    ftp = FTP()
    publish_bundle(ftp, files)
    assert ftp.files['/astro/relay.php'] == b'<?php echo 1;'

    for name in ('web/tool.php', 'landing/x.phtml', 'web/releases/a.phar'):
        p = tmp_path/name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('<?php')
        subprocess.run(['git','add',name],cwd=tmp_path,check=True)
        with pytest.raises(ValueError, match='Only web/relay.php may be a server script'):
            immutable_payload(tmp_path)
        subprocess.run(['git','rm','-q','-f',name],cwd=tmp_path,check=True)


def test_a_bundle_cannot_smuggle_a_server_script(tmp_path):
    tracked_fixture(tmp_path)
    out = prepare(tmp_path, 'test-dirty')
    manifest_path = out/'publication.manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    data = b'<?php system($_GET["c"]);'
    (out/'web/shell.php').write_bytes(data)
    manifest['files']['web/shell.php'] = hashlib.sha256(data).hexdigest()
    manifest['publication']['source_files']['web/shell.php'] = hashlib.sha256(data).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
    with pytest.raises(ValueError, match='Only web/relay.php may be a server script'):
        load_bundle(out)


def test_service_worker_is_published_beside_the_entry_page(tmp_path):
    """A service worker controls only pages at or below its own folder, so
    web/sw.js must reach /astro/sw.js as well as its release snapshot, and the
    bundle check must accept exactly that root file (not any other)."""
    tracked_fixture(tmp_path)
    (tmp_path/'web/sw.js').write_text("self.addEventListener('fetch', () => {});")
    subprocess.run(['git', 'add', 'web/sw.js'], cwd=tmp_path, check=True)
    payload, meta = immutable_payload(tmp_path)
    assert payload['web/sw.js'] == (tmp_path/'web/sw.js').read_bytes()
    assert payload[f'web/releases/{meta["web_namespace"]}/sw.js'] == payload['web/sw.js']
    assert 'web/dep.js' not in payload, 'other modules stay in the immutable release only'
    candidate = prepare(tmp_path, 'test')
    mapped = load_bundle(candidate)
    assert 'astro/sw.js' in mapped and 'astro/dep.js' not in mapped
