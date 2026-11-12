#!/usr/bin/env python3
"""Wersjonowanie Wysp AI.

Jedno źródło prawdy: src/version.js (VERSION). Skrypt:
  python3 tools/version.py bump 0.6.0   ustawia wersję i odświeża index.html (cache-busting)
  python3 tools/version.py sync         odświeża index.html dla bieżącej wersji (np. po dodaniu pliku .js)
  python3 tools/version.py check        sprawdza spójność (używane w CI): wersja, importmap, CHANGELOG

Cache-busting: index.html dostaje importmapę, która każdy moduł z src/ i lib/
przekierowuje na adres z ?v=WERSJA, więc po wydaniu przeglądarka nie bierze starych plików z pamięci.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION_JS = ROOT / 'src' / 'version.js'
INDEX = ROOT / 'index.html'
CHANGELOG = ROOT / 'CHANGELOG.md'
README = ROOT / 'README.md'
README_RE = re.compile(r'\*\*Wersja:\*\* [0-9.]+')
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')
BEGIN, END = '<!-- importmap:begin -->', '<!-- importmap:end -->'


def read_version():
    m = re.search(r"VERSION\s*=\s*'([^']+)'", VERSION_JS.read_text(encoding='utf-8'))
    if not m:
        sys.exit('Brak VERSION w src/version.js')
    return m.group(1)


def modules():
    files = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'src').rglob('*.js'))
    files += ['lib/OrbitControls.js']
    return files


def render_index(html, v):
    imports = {'three': f'./lib/three.module.min.js?v={v}'}
    for f in modules():
        imports['./' + f] = f'./{f}?v={v}'
    block = f'{BEGIN}\n<script type="importmap">\n{json.dumps({"imports": imports}, indent=1, ensure_ascii=False)}\n</script>\n{END}'
    if BEGIN in html:
        html = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END), lambda _: block, html, flags=re.S)
    else:
        html = re.sub(r'<script type="importmap">.*?</script>', lambda _: block, html, count=1, flags=re.S)
    html = re.sub(r'href="css/style\.css(\?v=[^"]*)?"', f'href="css/style.css?v={v}"', html)
    html = re.sub(r'src="src/main\.js(\?v=[^"]*)?"', f'src="src/main.js?v={v}"', html)
    return html


def write_version(v):
    VERSION_JS.write_text(
        "// Wersja gry (semver). Zmieniaj tylko przez: python3 tools/version.py bump X.Y.Z\n"
        f"export const VERSION = '{v}';\n", encoding='utf-8')


def check():
    v = read_version()
    errors = []
    if not SEMVER.match(v):
        errors.append(f'Wersja {v} nie jest w formacie X.Y.Z')
    html = INDEX.read_text(encoding='utf-8')
    if render_index(html, v) != html:
        errors.append('index.html nie pasuje do wersji (uruchom: python3 tools/version.py sync)')
    if f'**Wersja:** {v}' not in README.read_text(encoding='utf-8'):
        errors.append('README.md ma inną wersję (uruchom: python3 tools/version.py sync)')
    if f'## [{v}]' not in CHANGELOG.read_text(encoding='utf-8'):
        errors.append(f'CHANGELOG.md nie ma sekcji ## [{v}]')
    if errors:
        print('\n'.join('✗ ' + e for e in errors))
        sys.exit(1)
    print(f'✓ Wersja {v} spójna')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if cmd == 'bump':
        if len(sys.argv) < 3 or not SEMVER.match(sys.argv[2]):
            sys.exit('Użycie: python3 tools/version.py bump X.Y.Z')
        write_version(sys.argv[2])
        cmd = 'sync'
    if cmd == 'sync':
        v = read_version()
        INDEX.write_text(render_index(INDEX.read_text(encoding='utf-8'), v), encoding='utf-8')
        README.write_text(README_RE.sub(f'**Wersja:** {v}', README.read_text(encoding='utf-8')), encoding='utf-8')
        print(f'index.html zaktualizowany do {v}')
    elif cmd == 'check':
        check()
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
