# Rozgrywka

Wyspy AI to symulacja: gracz nie steruje postaciami, tylko patrzy, jak rozbitkowie próbują przeżyć. Może przy tym obracać kamerę, śledzić wybraną postać i podglądać jej myśli.

## Tryby
W menu wybierasz:
- **Liczbę AI:** od 1 do 4.
- **Liczbę wysp:** od 1 do 4, w dowolnej kombinacji z liczbą AI.
- **Ziarno świata:** ta sama liczba daje ten sam świat.
- **Mózg postaci:** model w przeglądarce albo Claude API, opisane w [modele-jezykowe.md](modele-jezykowe.md).

Każda wyspa ma mniej więcej rozmiar ekranu. Przy kilku wyspach:
- wyspa startowa jest uboga w jedzenie, więc opłaca się zbudować most,
- kopalnia z rudą żelaza leży na najdalszej wyspie.

## Świat
- Ocean z falami i wyspy w stylu low-poly z poszarpaną linią brzegu.
- Stawy ze słodką wodą. Wody morskiej nie da się pić, a postacie muszą to odkryć same.
- Zasoby: drzewa i palmy (odrastają po ścięciu), skały, krzaki z jagodami (owoce odrastają), wodorosty przy brzegu, a na wzgórzu kopalnia.
- Zwierzęta: ptaki do polowania i ławice ryb do łowienia.
- Cykl dnia i nocy: doba trwa 180 s czasu gry (`DAY_LENGTH`). W nocy postacie chętniej śpią.

## Potrzeby
Każda postać ma cztery paski w skali 0–100, gdzie 100 oznacza stan najlepszy:

| Potrzeba | Spada | Uzupełnia |
|---|---|---|
| 🍖 Głód | z czasem, szybciej przy pracy | jedzenie (pieczone daje więcej, surowe może zaszkodzić) |
| 💧 Pragnienie | najszybciej | woda ze stawu |
| ⚡ Energia | przy pracy | sen; szałas i ognisko przyspieszają |
| ❤️ Zdrowie | gdy któryś pasek spadnie do 0 | samo wraca, gdy potrzeby są zaspokojone; w szałasie szybciej |

Postać ginie, gdy zdrowie spadnie do zera. Gra kończy się, gdy zginą wszyscy.

## Rzemiosło
Na starcie każda postać ma siekierę i kilof. Receptur nie zna, odkrywa je, łącząc materiały (zobacz [ai.md](ai.md#uczenie-się-od-zera)).

| Co | Z czego | Uwagi |
|---|---|---|
| Kłody i gałęzie | ścięte drzewo | siekierą |
| Deski | 1 kłoda → 2 deski | siekierą |
| Lina | 2 wodorosty | |
| Wędka | 2 gałęzie + lina | pozwala łowić ryby |
| Włócznia | 2 gałęzie + kamień + lina | pozwala polować na ptaki |
| Ognisko | 3 gałęzie + kłoda + 4 kamienie | pieczenie jedzenia, ciepło w nocy |
| Szałas | 2 kłody + 4 deski + 2 liny | szybszy sen i leczenie |
| Żelazne narzędzia | 2 rudy + gałąź | wykuwane przy ognisku; szybsze ścinanie i kopanie |

Plecak mieści 30 rzeczy (`INV_CAP`). Nadmiar postać odkłada.

## Mosty
- Gra wyznacza najkrótsze przesmyki między wyspami. Mosty tworzą minimalne drzewo rozpinające, więc każda wyspa jest osiągalna.
- Most buduje się segment po segmencie, a każdy segment kosztuje 2 deski i 1 linę.
- Budowa idzie z obu brzegów naraz.
- Postępy widać na pasku pod górnym menu.

## Sterowanie
| Akcja | Klawisz lub mysz |
|---|---|
| Obrót, przesuwanie, zoom kamery | lewy przycisk, prawy przycisk, kółko |
| Ruch kamery | WASD lub strzałki |
| Przelot do postaci i śledzenie | klik na postać na mapie lub w okienku „Postacie” |
| Następna / poprzednia postać | Tab / Shift+Tab |
| Wyłączenie śledzenia | F |
| Widok „Oczami AI” (stożek widzenia i mgła niewiedzy) | V |
| Pauza | spacja |
| Prędkość 1×, 2×, 4×, 8× | 1–4 |
| Jakość grafiki (cienie) | przycisk 🎨 w górnym pasku |
| Błędy do skopiowania | zakładka „⚠️ Błędy” pod czatem |

Okienko „Postacie” i kartę postaci przesuwasz, chwytając za nagłówek.
