# 🏝️ Wyspy AI

Symulacja przetrwania w 3D (Three.js), w którą grają autonomiczni agenci AI. Ty obserwujesz, oni muszą przeżyć.

**Zagraj:** https://michalstankiewicz4-cell.github.io/AI-Game/

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
- **Komentarze na żywo:** dymki z myślami postaci i narrator.

## Sterowanie
Lewy przycisk – obrót, prawy – przesuwanie, kółko – zoom, WASD/strzałki – ruch kamery. Klik na postać – śledzenie (F), V – oczami AI, spacja – pauza, 1–4 – prędkość.

## Struktura projektu
```
index.html            strona gry
css/style.css         wygląd interfejsu
lib/                  Three.js + OrbitControls (licencja MIT)
src/
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
  render/
    renderer.js       scena 3D, światło, aktualizacja co klatkę
    models.js         modele low-poly
    terrain.js        teren, morze, mgła niewiedzy
  ui/                 menu, panele, sterowanie, komentarze
```

## Uruchomienie lokalne
Czysty HTML + JS (moduły ES), bez budowania: `python3 -m http.server` w katalogu repo i otwórz `http://localhost:8000`.
