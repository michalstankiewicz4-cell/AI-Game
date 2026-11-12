# 🏝️ Wyspy AI

Symulacja przetrwania w 3D (Three.js), w którą grają autonomiczni agenci AI. Ty obserwujesz, oni muszą przeżyć.

**Zagraj:** https://michalstankiewicz4-cell.github.io/AI-Game/ · **Wersja:** 0.5.0 ([lista zmian](CHANGELOG.md))

## Dokumentacja
- [Rozgrywka](docs/rozgrywka.md): tryby, świat, potrzeby, rzemiosło, mosty, sterowanie
- [Sztuczna inteligencja](docs/ai.md): decyzje, percepcja i pamięć, uczenie się, rozmowy
- [Modele językowe](docs/modele-jezykowe.md): model w przeglądarce (WebLLM) i Claude API, licznik tokenów
- [Architektura](docs/architektura.md): struktura plików i przepływ symulacji
- [Rozwój](docs/rozwoj.md): uruchomienie lokalne, testy, wersjonowanie

## Co jest w grze
- **Tryby:** 1–4 AI × 1–4 wysp (dowolna kombinacja), ziarno świata.
- **Świat:** ocean, duże wyspy low-poly, drzewa (odrastają), palmy, skały, krzaki z jagodami, wodorosty, stawy ze słodką wodą, kopalnia z rudą żelaza, ptaki, ryby, cykl dnia i nocy.
- **Potrzeby:** głód, pragnienie, energia, zdrowie.
- **Rzemiosło:** drzewo → kłody + gałęzie, kłoda → deski (toporkiem), wodorosty → lina, gałęzie + lina → wędka, włócznia, ognisko, szałas, żelazne narzędzia.
- **Mosty:** budowane segment po segmencie (2 deski + 1 lina), od obu brzegów.
- **AI:** decyzje oparte na użyteczności (utility AI) – w panelu postaci widać, co rozważa. Każdy agent ma charakter.
- **Start bez wiedzy:** AI nie znają mapy, receptur ani jadalności. Z ciekawości badają nowe zasoby, eksperymentują łącząc materiały i tak odkrywają receptury; uczą się, co jest jadalne (surowe może zaszkodzić) i że morskiej wody nie da się pić.
- **Percepcja i pamięć:** stożek widzenia (im dalej, tym węższy), pamięć tego, co widział; trzeba się rozejrzeć, by odświeżyć wiedzę. Tryb „👁️ Oczami AI” pokazuje stożek i mgłę niewiedzy.
- **Rozmowy:** agenci spotykają się, wymieniają wiedzą o mapie, recepturami, doświadczeniem (umiejętności rosną z praktyką) i przedmiotami.
- **Komentarze na żywo:** postacie mówią tylko przez model językowy (🤖); narrator komentuje sytuację.
- **Mózg postaci (menu):** model językowy decyduje, co postać robi, i układa jej wypowiedzi. Do wyboru darmowy model z Hugging Face w przeglądarce (WebLLM na WebGPU: Qwen2.5 0.5B, Llama 3.2 1B lub Qwen2.5 1.5B; pobiera się raz, potem z pamięci przeglądarki; po przeciążeniu karty gra sama schodzi na lżejszy model) albo Claude API. Chodzenie, zbieranie i odruchy przy krytycznych potrzebach wykonuje kod gry, więc postacie żyją także, gdy model się ładuje.
- **Okienka:** „Postacie” (klik przenosi kamerę do postaci) i karta postaci dają się przesuwać za nagłówek.

## Sterowanie
Lewy przycisk – obrót, prawy – przesuwanie, kółko – zoom, WASD/strzałki – ruch kamery. Klik na postać (na mapie lub w okienku „Postacie”) – przelot i śledzenie (F wyłącza), Tab – następna postać, V – oczami AI, spacja – pauza, 1–4 – prędkość.

## Struktura projektu
```
index.html            strona gry
CHANGELOG.md          lista zmian
docs/                 dokumentacja
tools/version.py      wersjonowanie
css/style.css         wygląd interfejsu
lib/                  Three.js + OrbitControls (licencja MIT)
src/
  version.js          numer wersji
  main.js             punkt wejścia: pętla klatek, spina grę, render i UI
  game.js             tworzenie gry i krok symulacji
  core/rng.js         losowość z ziarnem i szum
  world/
    world.js          mapa kafelków, stałe, ścieżki, pora dnia
    generate.js       generowanie wysp, zasobów, ryb i ptaków
    bridges.js        mosty: wyszukiwanie przesmyków i budowa
    nature.js         przyroda: odrastanie, ryby, ptaki
  ai/
    agent.js          stan agenta i pętla życia
    data.js           osobowości, jedzenie, receptury, nazwy
    decide.js         mózg: wybór działania (utility AI)
    tasks.js          akcje (picie, łowienie, ścinanie, budowa...)
    perception.js     stożek widzenia i pamięć
    knowledge.js      ciekawość, eksperymenty, odkrywanie receptur
    social.js         rozmowy i wymiana wiedzy/przedmiotów
    commentary.js     myśli w dymkach i narrator
    llm.js            opcjonalny mózg z modelem językowym: Claude API lub WebLLM, licznik tokenów
  render/
    renderer.js       scena 3D, światło, aktualizacja co klatkę
    models.js         modele low-poly
    terrain.js        teren, morze, mgła niewiedzy
  ui/                 menu, panele, sterowanie, komentarze, ustawienia Claude
```

## Uruchomienie lokalne
Czysty HTML + JS (moduły ES), bez budowania: `python3 -m http.server` w katalogu repo i otwórz `http://localhost:8000`.

## Wersjonowanie
SemVer. Każda zmiana podnosi wersję (`python3 tools/version.py bump X.Y.Z`) i dopisuje wpis w [CHANGELOG.md](CHANGELOG.md). CI sprawdza spójność, a wydania mają tagi `vX.Y.Z`. Szczegóły w [docs/rozwoj.md](docs/rozwoj.md#wersjonowanie).
