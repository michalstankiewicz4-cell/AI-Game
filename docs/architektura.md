# Architektura

Czysty HTML i JavaScript (moduły ES), bez bundlera i bez kroku budowania. Strona hostowana jest na GitHub Pages: workflow `.github/workflows/static.yml` publikuje całe repozytorium po każdym pushu na `main`.

## Struktura
```
index.html            menu, HUD, importmapa (z cache-bustingiem ?v=WERSJA)
css/style.css         wygląd interfejsu
lib/                  Three.js r160 + OrbitControls (licencja MIT)
tools/version.py      wersjonowanie i kontrola spójności
docs/                 dokumentacja
.github/workflows/    static.yml (Pages), version-check.yml (PR), release.yml (tagi i wydania)
src/
  version.js          wersja gry (semver), jedno źródło prawdy
  main.js             punkt wejścia: pętla klatek, spina grę, render i UI
  game.js             createGame(cfg), stepGame(game) – symulacja bez DOM
  core/rng.js         losowość z ziarnem (mulberry32), szum fbm
  world/              świat (kafelki, generowanie, mosty, przyroda, dziki w boars.js, deski z budowy w pieces.js)
  ai/                 postacie (stan, decyzje, zadania, percepcja, wiedza, rozmowy, komentarze)
    llm.js            modele językowe: WebLLM i Claude API, limity zapytań, licznik tokenów
    llmWorker.js      Web Worker z silnikiem WebLLM
    building.js       budowanie z desek: polecenia modelu, majsterkowanie, opis budowy
    intent.js         pełna swoboda: opis zmysłów, mapIntent (zamiar → działanie)
  render/             Three.js: scena, modele low-poly, teren, mgła
    instances.js      Instancer: InstancedMesh dla zasobów
  ui/                 menu, panele, sterowanie, czat, wiki (wiki.js: katalog i skan odkryć do world.wikiFound)
    llmPanel.js       ustawienia modeli w menu, licznik tokenów, przesuwanie okienek
    errors.js         zakładka „⚠️ Błędy”: zbieranie i kopiowanie błędów
```

## Przepływ
1. `main.js` wywołuje `initErrors` (przechwytuje błędy strony i konsoli), `initMenu` i `initLlmMenu`. Po kliknięciu „Start” `createGame(cfg)` tworzy `World`, agentów, narratora i `Social`, a `Renderer.build(world)` buduje scenę.
2. W pętli `requestAnimationFrame` czas rzeczywisty mnożony przez prędkość trafia do akumulatora. `stepGame` wykonuje stałe kroki `STEP = 0.1 s`, najwyżej 100 na klatkę.
3. `stepGame` po kolei:
   - wywołuje `world.update`, czyli przyrodę i mosty,
   - wywołuje `agent.update` dla każdego agenta: potrzeby, decyzja, zadanie, wzrok,
   - wywołuje `social.update`,
   - przelicza brzegi po zmianie mapy,
   - wywołuje `narrator.update`.
4. Zdarzenia z `world.events` trafią do dziennika i czatu. `Renderer.frame` rysuje scenę, a co 0,25 s odświeżają się HUD, karty postaci i licznik tokenów.
5. Zapytania do modeli językowych są asynchroniczne. Odpowiedź wraca do `agent.onLLM`, a symulacja w tym czasie nie stoi.

## Świat
- **Mapa:** siatka kafelków `W × H` (`world.js`) z tablicami `type`, `height`, `island`, `res` (zasoby). Rozmiar zależy od liczby wysp.
- **Wzorzec mixinów:** metody `World` i `Agent` są rozbite na pliki i doklejane przez `Object.assign(Class.prototype, metody)`.
- **Ścieżki:** BFS po kafelkach z maską tego, co agent widział.

## Render
- **Teren:** jedna siatka z kolorami w wierzchołkach.
- **Obiekty:** modele low-poly z `models.js`. Zasoby (drzewa, palmy, skały, krzaki, wodorosty) nie trafiają do sceny jako osobne siatki. `instances.js` zbiera ich części w `InstancedMesh` pogrupowane po geometrii i materiale, co daje ok. 110 wywołań rysowania zamiast ok. 1500. Ukrycie części albo całego zasobu zeruje jego macierz.
- **Ogniska:** świecą trzema stałymi `PointLight`, przypisanymi do ognisk najbliżej kamery. Nowe ognisko nie wymusza więc przekompilowania materiałów.
- **Morze:** animowane fale, liczone co drugą klatkę na siatce 64 × 64 segmenty.
- **Jakość grafiki** (przycisk 🎨 w górnym pasku): wysoka ma cienie i rozdzielczość do 1,5×, niska wyłącza cienie i zmniejsza rozdzielczość. Licznik FPS stoi obok.
- **Mgła niewiedzy:** płaszczyzna z `DataTexture`, aktualizowana w trybie „Oczami AI”.
- **Etykiety i dymki:** elementy DOM nakładane na obraz.

## Podgląd do testów
`window.__game` to stan gry (świat, agenci, `social`, `narrator`), a `window.__renderer` to renderer (np. `renderer.info` z liczbą wywołań rysowania). Testy przewijają symulację, wywołując te same funkcje co `stepGame`.
