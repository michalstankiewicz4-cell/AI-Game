# Lista zmian

Wszystkie istotne zmiany w grze. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), numeracja: [SemVer](https://semver.org/lang/pl/).
Każda zmiana na `main` podnosi wersję (zasady w [docs/rozwoj.md](docs/rozwoj.md#wersjonowanie)).

## [0.11.0] - 2026-11-12
### Dodane
- Loadery: przycisk Start pokazuje „Ładowanie gry…”, dopóki moduły się nie wczytają; po kliknięciu Start widać „Budowanie świata…” do pierwszej narysowanej klatki; w grze, na dole ekranu, pasek ładowania modelu w przeglądarce z procentem i nazwą pliku.
### Naprawione
- Pasek postępu pobierania modelu w menu nie miał stylu i był niewidoczny.

## [0.10.0] - 2026-11-12
### Dodane
- Większe modele w przeglądarce na mocniejszą kartę: Qwen3.5 2B, Llama 3.2 3B, Gemma 4 E2B i Qwen3.5 4B.
- Przełącznik „Tryb myślenia” dla Qwen3.5 (domyślnie wyłączony): model najpierw rozważa sytuację, a tok myślenia nie trafia do dymka.
- Wyszarzony przycisk „LM Studio (wkrótce)” w wyborze mózgu postaci.

## [0.9.0] - 2026-11-12
### Zmienione
- Model w przeglądarce działa w osobnym wątku (Web Worker, `src/ai/llmWorker.js`), więc obsługa modelu nie przycina gry. Gdy wątek się nie uruchomi, model startuje jak dotąd w głównym wątku. W menu i w podpowiedzi licznika tokenów widać „osobny wątek”.

## [0.8.1] - 2026-11-12
### Zmienione
- Dokumentacja (README, `docs/`) zaktualizowana do stanu gry: mowa skryptu 📜 i dymek 💭, pełna swoboda, jakość grafiki i FPS, zakładka błędów, nowe pliki (`intent.js`, `instances.js`, `errors.js`, `llmPanel.js`), workflowy i wskazówki do testów.

## [0.8.0] - 2026-11-12
### Dodane
- Zakładka „⚠️ Błędy” obok dziennika: zbiera błędy modelu, strony i konsoli (także ostrzeżenia WebLLM). Przycisk „📋 Kopiuj wszystko” kopiuje je razem z wersją gry, przeglądarką i nazwą karty graficznej (WebGL i WebGPU).
### Naprawione
- Model w przeglądarce: „Failed to initialize the grammar matcher for response format json_object”. Schemat JSON jest teraz przekazywany jako tekst, a gdy wymuszony JSON mimo to nie działa, gra przechodzi na zwykły tekst zamiast zgłaszać błąd przy każdym zapytaniu.

## [0.7.1] - 2026-11-12
### Naprawione
- Brak dymków, gdy model się ładuje albo nie działa: wtedy za postacie mówi skrypt (dymek kursywą, w czacie 📜). Gdy model liczy odpowiedź, nad postacią jest „💭 …”.
- Łagodniejsze czytanie odpowiedzi małego modelu: inne klucze albo zwykły tekst zamiast JSON-a nie kończą się błędem, tylko wypowiedzią.

## [0.7.0] - 2026-11-12
### Zmienione
- Wydajność grafiki: drzewa, skały, krzaki i wodorosty rysowane przez instancjonowanie. Wywołań rysowania jest ok. 110 zamiast ok. 1500, a czas przygotowania klatki spadł z ok. 10–21 ms do ok. 2–3 ms (pomiar w przeglądarce testowej).
- Ogniska świecą trzema stałymi światłami, więc zbudowanie ogniska nie powoduje przycięcia na kompilację shaderów.
- Fale morza liczone co drugą klatkę, na lżejszej siatce. Rozdzielczość ograniczona do 1,5×.
- Model w przeglądarce pyta rzadziej (co najmniej 4 s przerwy między zapytaniami, postać co 20 s), żeby zostawić kartę graficzną grafice.
### Dodane
- Przełącznik jakości grafiki (🎨 Wysoka / Niska: bez cieni, mniejsza rozdzielczość) i licznik FPS w górnym pasku.

## [0.6.0] - 2026-11-12
### Dodane
- Przełącznik „Pełna swoboda” w menu: model dostaje tylko to, co postać czuje (głód, pragnienie, zmęczenie opisane słowami), widzi i pamięta w pobliżu oraz co ma przy sobie. Sam wymyśla zamiar, a gra tłumaczy go na dostępne działanie (`src/ai/intent.js`). Zamiar i jego wykonanie widać w karcie postaci, a niewykonalny zamiar jest oznaczony.

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

[0.11.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.11.0
[0.10.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.10.0
[0.9.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.9.0
[0.8.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.8.1
[0.8.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.8.0
[0.7.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.7.1
[0.7.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.7.0
[0.6.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.6.0
[0.5.2]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.2
[0.5.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.0
[0.4.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.1
[0.4.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.2.0
