# Lista zmian

Wszystkie istotne zmiany w grze. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), numeracja: [SemVer](https://semver.org/lang/pl/).
Każda zmiana na `main` podnosi wersję (zasady w [docs/rozwoj.md](docs/rozwoj.md#wersjonowanie)).

## [0.5.2] - 2026-11-12
### Zmienione
- Karta postaci: nagłówek z imieniem stoi w miejscu, przewijają się tylko statystyki (pozycja przewinięcia nie skacze przy odświeżaniu).
- Paski przewijania w stylu gry (cienkie, niebieskie, przezroczyste tło).
- Zdarzenia gry w czacie (odkrycia, śmierć, nowa wyspa) mają znak 📜, żeby nie myliły się z wypowiedziami modelu (🤖).

## [0.5.1] - 2026-11-12
### Dodane
- Automatyczne tagi `vX.Y.Z` i wydania na GitHub po każdej nowej wersji na `main` (workflow `release.yml`).

## [0.5.0] - 2026-11-12
### Dodane
- Wersjonowanie: `src/version.js` jako jedno źródło wersji, numer wersji w menu i w górnym pasku, ten plik ze zmianami, tagi `vX.Y.Z`.
- Skrypt `tools/version.py` (podbijanie wersji, sprawdzanie spójności) i kontrola wersji w GitHub Actions dla każdego PR.
- Cache-busting: importmapa w `index.html` dokleja `?v=WERSJA` do każdego modułu, więc po wydaniu przeglądarka nie używa starych plików.
- Dokumentacja w `docs/`: rozgrywka, AI, modele językowe, architektura, rozwój.
- Numer wersji przy tytule gry.
### Zmienione
- Postacie mówią wyłącznie przez model językowy. Szablonowe teksty nie trafiają do dymków, tylko jako notatki do modelu, który opisuje je po swojemu i nie powtarza poprzedniej wypowiedzi.
- Wskazówka, jak przełączyć Chrome na mocniejszą kartę graficzną w laptopie z dwiema kartami.

## [0.4.1] - 2026-11-12
### Zmienione
- Mózgiem postaci jest zawsze model językowy (w przeglądarce albo Claude API), który decyduje i mówi; usunięty wybór lokalnego skryptu i trybu „tylko mowa”.
- Domyślny model w przeglądarce to najlżejszy Qwen2.5 0.5B, z mniejszym oknem kontekstu.
### Naprawione
- Utrata karty graficznej (np. `DXGI_ERROR_DEVICE_HUNG`): gra schodzi na lżejszy model i prosi o odświeżenie strony zamiast pokazywać „brak GPU”.
- Pole klucza API w formularzu (ostrzeżenie Chrome) i ikona strony (404 na `favicon.ico`).

## [0.4.0] - 2026-11-12
### Dodane
- Darmowy model z Hugging Face uruchamiany w przeglądarce (WebLLM na WebGPU), z paskiem postępu pobierania i licznikiem tokenów.

## [0.3.0] - 2026-11-12
### Dodane
- Opcjonalny mózg postaci przez Claude API; klucz tylko w localStorage przeglądarki, limit kosztu.
- Licznik tokenów i szacunkowego kosztu w górnym pasku.
- Okienko „Postacie”: kliknięcie przenosi kamerę do postaci, Tab przełącza postacie.
- Karta postaci i okienko „Postacie” przesuwane za nagłówek.

## [0.2.0] - 2026-11-12
### Dodane
- Postacie startują bez wiedzy: ciekawość, eksperymenty z materiałami, odkrywanie receptur i jadalności.
- Projekt podzielony na foldery (`src/world`, `src/ai`, `src/render`, `src/ui`).

## 0.1.0 - 2026-11-12 (wersja robocza, wydana razem z 0.2.0)
### Dodane
- Pierwsza wersja: 3D low-poly (Three.js), 1–4 AI × 1–4 wysp, rzemiosło, mosty, łowienie, odrastające drzewa, pole widzenia z pamięcią, widok „Oczami AI”, rozmowy i wymiana między postaciami, komentarze na żywo.

[0.5.2]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.2
[0.5.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.0
[0.4.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.1
[0.4.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.2.0
