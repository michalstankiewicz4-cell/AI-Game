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
- **Percepcja i pamięć:** stożek widzenia (im dalej, tym węższy), pamięć tego, co widział; trzeba się rozejrzeć, by odświeżyć wiedzę. Tryb „👁️ Oczami AI” pokazuje stożek i mgłę niewiedzy.
- **Rozmowy:** agenci spotykają się, wymieniają wiedzą o mapie, doświadczeniem i przedmiotami.
- **Komentarze na żywo:** dymki z myślami postaci i narrator.

## Sterowanie
Lewy przycisk – obrót, prawy – przesuwanie, kółko – zoom, WASD/strzałki – ruch kamery. Klik na postać – śledzenie (F), V – oczami AI, spacja – pauza, 1–4 – prędkość.

## Technicznie
Czysty HTML + JS (moduły ES), bez budowania. Three.js jest w `lib/` (licencja MIT). Uruchom lokalnie: `python3 -m http.server` i otwórz `http://localhost:8000`.
