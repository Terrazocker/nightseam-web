"""Update every recursive cache reference, propagating changes once per importer.

Ambiguous or incomplete graphs are refused before writing. Generated core tokens
come only from core.manifest.json. Repeating the command is a no-op.
"""
from pathlib import Path
import json
import re
try:
    from .web_asset_graph import live_graph, module_name
    from .check_js_tokens import load_baseline, _sha
except ImportError:
    from web_asset_graph import live_graph, module_name
    from check_js_tokens import load_baseline, _sha

ROOT = Path(__file__).resolve().parents[1]


def bump(root=ROOT, baseline=None):
    root = Path(root)
    graph = live_graph(root)
    if graph.problems:
        raise ValueError('\n'.join(graph.problems))
    base = load_baseline() if baseline is None else baseline
    tokens = dict(graph.tokens)
    texts = dict(graph.texts)
    manifest = root/'core/core.manifest.json'
    if 'core.js' in tokens:
        token = str(json.loads(manifest.read_text(encoding='utf-8'))['token'])
        old = base.get('core.js', {})
        if old.get('sha256') != _sha(graph.contents['core.js']) and token == old.get('token'):
            raise ValueError('Generated core changed without a manifest token bump; run build_core.py')
        tokens['core.js'] = token
    # Finite fixed point: each changed module can advance at most once, and
    # rewriting an edge always uses its final desired token (also for cycles).
    while True:
        changed = False
        for name, text in list(texts.items()):
            key = module_name(name)
            old = base.get(key)
            if key != 'core.js' and old and key in tokens:
                if _sha(text.encode()) != old['sha256'] and tokens[key] == str(old['token']):
                    tokens[key] = str(int(old['token']) + 1)
                    changed = True
        for name, refs in graph.refs.items():
            text = graph.texts[name]
            for start, end, target, url in reversed(refs):
                desired = tokens[module_name(target)]
                replacement = re.sub(r'([?&]v=)\d+', lambda m: m.group(1)+desired, url)
                text = text[:start] + replacement + text[end:]
            if texts[name] != text:
                texts[name] = text
                changed = True
        if not changed:
            break
    modified = []
    for name, text in texts.items():
        if text != graph.texts[name]:
            (root/name).write_text(text, encoding='utf-8', newline='')
            modified.append(name)
    return sorted(modified)


def main():
    try:
        changed = bump()
    except (ValueError, OSError) as exc:
        print(f'Refusing cache update: {exc}')
        return 1
    print('Updated recursive cache references: ' + (', '.join(changed) or 'none'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
