from scripts.prepare_publication import prepare, verify, retired_paths, ROOT
import json
import pytest


def test_candidate_covers_both_trees_omits_credentials_and_detects_drift(tmp_path):
    for name in ('web/index.html','web/core/0123456789abcdef/index.js','landing/index.html',
                 'landing/.htaccess','web/ftp.env','landing/.env'):
        p=tmp_path/name
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text('content',encoding='utf-8')
    candidate=prepare(tmp_path,'v0.6.36-dirty',('/astro/img/old.jpg',))
    assert verify(tmp_path)==4
    assert not (candidate/'web/ftp.env').exists()
    assert not (candidate/'landing/.env').exists()
    (tmp_path/'landing/index.html').write_text('changed',encoding='utf-8')
    with pytest.raises(ValueError,match='differs'): verify(tmp_path)


def test_retired_inventory_survives_clean_candidate_regeneration(tmp_path):
    (tmp_path/'scripts').mkdir()
    (tmp_path/'web').mkdir()
    (tmp_path/'landing').mkdir()
    expected=retired_paths(ROOT)
    assert len(expected)==82
    assert len([p for p in expected if p.endswith('.jpg')])==81
    (tmp_path/'scripts/publication_cleanup.json').write_text(json.dumps(expected),encoding='utf-8')
    (tmp_path/'web/index.html').write_text('planner',encoding='utf-8')
    (tmp_path/'landing/index.html').write_text('home',encoding='utf-8')
    # No .git or pending deletions exist. Both dirty and clean preparation must
    # retain the exact reviewed inventory, including all obsolete object photos.
    for describe in ('v0.6.36-dirty','v0.1.0'):
        candidate=prepare(tmp_path,describe,retired_paths(tmp_path))
        manifest=json.loads((candidate/'publication.manifest.json').read_text(encoding='utf-8'))
        assert manifest['cleanup_after_authorized_acceptance']==expected
        assert verify(tmp_path)==2


@pytest.mark.parametrize('paths',[
    ['/astro/img/'], ['/astro/core/hash/index.js'], ['/astro/img/../index.html'],
    ['/astro/img/ngc281.jpg','/astro/img/ngc281.jpg'], [None], {},
])
def test_retired_inventory_rejects_unreviewed_cleanup_paths(tmp_path,paths):
    (tmp_path/'scripts').mkdir()
    (tmp_path/'scripts/publication_cleanup.json').write_text(json.dumps(paths),encoding='utf-8')
    with pytest.raises(ValueError,match='Unexpected retired'): retired_paths(tmp_path)
