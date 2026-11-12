# Wskazówki dla Claude

- Gra po polsku (teksty, dokumentacja, commity). Bez bundlera: czyste moduły ES, Three.js w `lib/`.
- **Wersjonowanie jest obowiązkowe:** każda zmiana trafiająca na `main` podnosi wersję przez `python3 tools/version.py bump X.Y.Z` (PATCH = poprawki, MINOR = nowe funkcje) i dopisuje sekcję w `CHANGELOG.md`. Przed commitem: `python3 tools/version.py check`. Tag `vX.Y.Z` i wydanie tworzy po scaleniu workflow `release.yml`.
- Nowy plik `.js` w `src/` wymaga `python3 tools/version.py sync` (importmapa z cache-bustingiem).
- Zmiany w zachowaniu lub interfejsie opisuj też w `docs/` i w `README.md`.
- Testy: Playwright headless, opis w `docs/rozwoj.md`. Klucze API nigdy w repozytorium.
