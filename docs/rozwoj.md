# Rozwój

## Uruchomienie lokalne
```bash
python3 -m http.server 8123
# otwórz http://localhost:8123
```
Moduły ES nie działają z `file://`, więc potrzebny jest dowolny serwer HTTP.

## Testy
Gra nie ma frameworka testowego. Sprawdza się ją w przeglądarce bez okna (Playwright + Chromium):
- **Chromium:** uruchom z flagami `--use-gl=swiftshader --enable-unsafe-swiftshader`, żeby WebGL działał bez karty graficznej.
- **Start gry:** kliknij `#optIslands button[data-v=N]`, `#optAgents button[data-v=N]`, a potem `#startBtn`.
- **Przewijanie symulacji:** postaw `window.__game.paused = true` i w pętli wywołuj `world.update(0.1)`, `agent.update(0.1)` oraz `social.update(0.1)`. Gdy `world.shoresDirty` jest ustawione, wywołaj `computeShores(world)` z `./src/ai/agent.js`.
- **Co sprawdzać:** czy postacie przeżywają kilka dni w różnych konfiguracjach, czy w konsoli nie ma błędów i jak wyglądają zrzuty ekranu.
- **Modele językowe:** podstaw odpowiedzi przez `page.route`:
  - dla Claude zwróć sztuczną odpowiedź z `usage` dla `https://api.anthropic.com/**`,
  - dla WebLLM zwróć mały moduł ESM z `CreateMLCEngine` dla `https://cdn.jsdelivr.net/**`,
  - `navigator.gpu` ustaw przez `addInitScript`.

## Wersjonowanie
Numeracja to [SemVer](https://semver.org/lang/pl/) `MAJOR.MINOR.PATCH`:
- **PATCH:** poprawki błędów bez nowych funkcji,
- **MINOR:** nowe funkcje i zmiany w rozgrywce,
- **MAJOR:** gra „skończona” (1.0.0) albo zmiany łamiące, np. zapisy.

Zasady:
1. Każdy PR do `main` podnosi wersję i dopisuje sekcję w [CHANGELOG.md](../CHANGELOG.md).
2. Wersję zmienia się tylko skryptem:
   ```bash
   python3 tools/version.py bump 0.6.0   # src/version.js + index.html (?v=0.6.0)
   python3 tools/version.py sync         # po dodaniu nowego pliku .js
   python3 tools/version.py check        # to samo sprawdza CI
   ```
3. Workflow `.github/workflows/version-check.yml` sprawdza każdy PR. Wersja musi być spójna, `index.html` aktualny, a CHANGELOG musi mieć sekcję tej wersji.
4. Po scaleniu commit na `main` dostaje tag `vX.Y.Z`.

Dlaczego `?v=`: GitHub Pages pozwala przeglądarkom trzymać pliki w pamięci podręcznej przez 10 minut. Importmapa w `index.html` przekierowuje każdy moduł na adres z wersją, więc nowa wersja wczytuje świeże pliki od razu.

## Konwencje
- Teksty w grze i dokumentacja są po polsku. Kod ma polskie komentarze i angielskie nazwy.
- Nowy moduł JS wymaga `python3 tools/version.py sync`, bo trafia do importmapy.
- Klucze API nigdy nie trafiają do repozytorium.
