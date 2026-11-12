# 🏝️ Wyspy AI

Symulacja przetrwania w 3D (Three.js), w którą grają autonomiczni agenci AI. Ty obserwujesz, oni muszą przeżyć.

**Zagraj:** https://michalstankiewicz4-cell.github.io/AI-Game/ · **Wersja:** 0.24.0 ([lista zmian](CHANGELOG.md))

## Dokumentacja
- [Rozgrywka](docs/rozgrywka.md): tryby, świat, potrzeby, rzemiosło, mosty, sterowanie
- [Sztuczna inteligencja](docs/ai.md): decyzje, percepcja i pamięć, uczenie się, rozmowy
- [Modele językowe](docs/modele-jezykowe.md): model w przeglądarce (WebLLM) i Claude API, licznik tokenów
- [Architektura](docs/architektura.md): struktura plików i przepływ symulacji
- [Rozwój](docs/rozwoj.md): uruchomienie lokalne, testy, wersjonowanie

## Co jest w grze
- **Tryby:** 1–4 AI × 1–4 wysp (dowolna kombinacja, domyślnie 1 × 1), ziarno świata.
- **Świat:** ocean, duże wyspy low-poly, drzewa (odrastają), palmy, skały, krzaki z jagodami, wodorosty, stawy ze słodką wodą, kopalnia z rudą żelaza, ptaki, ryby, cykl dnia i nocy.
- **Potrzeby:** głód, pragnienie, energia, zdrowie, samopoczucie i temperatura ciała.
- **Dziki:** szarżują na postacie, które podejdą za blisko. Z włócznią albo mieczem postacie walczą i polują, tarcza osłabia ciosy, a bez broni uciekają.
- **Plecak:** limit 30 rzeczy i 25 kg; ciężar spowalnia, nadmiar trafia do składzików albo do zbitej z desek skrzyni (ta trzyma też jedzenie), z których postacie potem biorą.
- **Klimat umiarkowany:** temperatura zmienia się w ciągu doby i z dnia na dzień. To, że ogień i dach grzeją, postacie odkrywają same.
- **Rzemiosło:** drzewo → kłody, gałęzie i liście; kłoda → deski (toporkiem); wodorosty → lina; dalej wędka, włócznia, ognisko (wypala się i trzeba je podsycać), ruszt, namiot, szałas, stół rzemieślniczy, łóżko, żelazne narzędzia, nóż kamienny, motyka, drewniana miska, łuk ze strzałami, ubranie ze skóry i gliniana doniczka. Niektóre receptury wychodzą tylko przy ogniu albo przy stole.
- **Budowanie z desek:** deski kładzione pojedynczo jako podłoga, ściana albo skos, przyciągane do siatki, z nazwami, do zdjęcia i przeniesienia. Model językowy dostaje analizę kształtu budowy (same liczby) i może wydawać polecenia. Bez nich postacie budują metodą prób i błędów; dom (przykryte, obudowane pola grzeją) wychodzi sam albo wcale.
- **Noc i pochodnie:** w nocy postać widzi na ok. 1/4 dziennego zasięgu, z pochodnią w ręku na połowę. Pochodnię odkrywa się i zapala przy ognisku. Postać ma dwie ręce: w prawej narzędzie albo broń, w lewej pochodnię albo tarczę.
- **Uprawa i łowy:** nasiona z jagód, ziarno dzikiego żyta i nasiona kwiatów sieje się na grządkach przygotowanych motyką albo w doniczkach z gliny i miskach z ziemią; rośliny trzeba podlewać; miska i doniczka noszą wodę; kwiaty cieszą postacie; dzika skóruje się nożem (mięso i skóra), ptaki dają mięso i pióra na strzały do łuku.
- **Mosty:** budowane segment po segmencie (2 deski + 1 lina), od obu brzegów.
- **AI:** decyzje oparte na użyteczności (utility AI) – w panelu postaci widać, co rozważa. Każdy agent ma charakter.
- **Wiedza postaci (menu):** „🧪 Odkrywa sam” albo „📚 Wie wszystko”. W pierwszym trybie AI nie znają mapy, receptur ani jadalności. Z ciekawości badają nowe zasoby, eksperymentują łącząc materiały i tak odkrywają receptury; uczą się, co jest jadalne (surowe może zaszkodzić) i że morskiej wody nie da się pić. W drugim znają wszystko od startu (receptury, jedzenie, mapę, zjawiska) i od razu zbierają oraz budują.
- **Percepcja i pamięć:** stożek widzenia (im dalej, tym węższy), pamięć tego, co widział; trzeba się rozejrzeć, by odświeżyć wiedzę. Tryb „👁️ Oczami AI” pokazuje stożek i mgłę niewiedzy.
- **Rozmowy:** agenci spotykają się, wymieniają wiedzą o mapie, recepturami, doświadczeniem (umiejętności rosną z praktyką) i przedmiotami.
- **Komentarze na żywo:** gdy model działa, postacie mówią jego słowami (🤖), a nad myślącą postacią widać „💭 …”. Gdy model się ładuje albo nie działa, mówi za nie skrypt (dymek kursywą, 📜). Narrator komentuje sytuację.
- **Mózg postaci (menu):** model językowy decyduje, co postać robi, i układa jej wypowiedzi. Do wyboru darmowy model z Hugging Face w przeglądarce (WebLLM na WebGPU: od Qwen2.5 0.5B po Qwen3.5 4B i Gemmę 4 E2B, z opcjonalnym trybem myślenia Qwen3.5; pobiera się raz, potem z pamięci przeglądarki, a pobrane mają na liście ✅; liczy w osobnym wątku, żeby nie przycinać gry; po przeciążeniu karty gra sama schodzi na lżejszy model) albo Claude API. LM Studio jest zapowiedziane (wyszarzone w menu). Chodzenie, zbieranie i odruchy przy krytycznych potrzebach wykonuje kod gry, więc postacie żyją także, gdy model się ładuje.
- **Pełna swoboda (przełącznik w menu):** model dostaje tylko to, co postać czuje, widzi, pamięta i ma, i sam wymyśla zamiar, który gra tłumaczy na działanie.
- **Grafika:** zasoby rysowane przez instancjonowanie, przełącznik jakości 🎨 (cienie, rozdzielczość) i licznik FPS w górnym pasku.
- **Błędy:** zakładka „⚠️ Błędy” pod czatem zbiera błędy modelu, strony i konsoli; „📋 Kopiuj wszystko” kopiuje je z wersją gry i nazwą karty graficznej.
- **Wiki w grze (📖, klawisz K):** receptury, budowle, materiały, jedzenie, narzędzia, obiekty świata i doświadczenia w kategoriach. Widać wszystko, a to, co odkryła któraś postać, ma znaczek ✓. Postacie wiki nie widzą.
- **Pomiar wydajności (⏱️, klawisz P):** ile czasu klatki zajmuje świat, AI, rysowanie (procesor i karta graficzna) i interfejs, liczba przycięć i ich najczęstsza przyczyna, raport do skopiowania.
- **Okienka:** „Postacie” (klik przenosi kamerę do postaci) i karta postaci dają się przesuwać za nagłówek.

## Sterowanie
Lewy przycisk – obrót, prawy – przesuwanie, kółko – zoom, WASD/strzałki – ruch kamery. Klik na postać (na mapie lub w okienku „Postacie”) – przelot i śledzenie (F wyłącza), Tab / Shift+Tab – następna / poprzednia postać, V – oczami AI, K – wiki, P – pomiar wydajności, spacja – pauza, 1–4 – prędkość, 🎨 – jakość grafiki.

## Struktura projektu
```
index.html            strona gry (importmapa z ?v=WERSJA)
CHANGELOG.md          lista zmian
CLAUDE.md             zasady pracy dla Claude
.github/workflows/    publikacja na Pages, kontrola wersji, wydania
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
    llm.js            mózg z modelem językowym: WebLLM lub Claude API, licznik tokenów
    llmWorker.js      wątek roboczy dla modelu w przeglądarce
    intent.js         pełna swoboda: opis zmysłów i tłumaczenie zamiaru na działanie
  render/
    renderer.js       scena 3D, światło, aktualizacja co klatkę
    models.js         modele low-poly
    terrain.js        teren, morze, mgła niewiedzy
    instances.js      instancjonowanie zasobów (mniej wywołań rysowania)
  ui/                 menu, panele, sterowanie, czat, ustawienia modeli (llmPanel.js), błędy (errors.js), pomiar wydajności (perf.js)
```

## Uruchomienie lokalne
Czysty HTML + JS (moduły ES), bez budowania: `python3 -m http.server 8123` w katalogu repo i otwórz `http://localhost:8123`.

## Wersjonowanie
SemVer. Każda zmiana podnosi wersję (`python3 tools/version.py bump X.Y.Z`) i dopisuje wpis w [CHANGELOG.md](CHANGELOG.md). CI sprawdza spójność, a wydania mają tagi `vX.Y.Z`. Szczegóły w [docs/rozwoj.md](docs/rozwoj.md#wersjonowanie).
