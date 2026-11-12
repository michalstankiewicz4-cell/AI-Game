# Rozgrywka

Wyspy AI to symulacja: gracz nie steruje postaciami, tylko patrzy, jak rozbitkowie próbują przeżyć. Może przy tym obracać kamerę, śledzić wybraną postać i podglądać jej myśli.

## Tryby
Przycisk Start działa, gdy gra się wczyta (do tego czasu pokazuje „Ładowanie gry…”). Po kliknięciu widać „Budowanie świata…”, dopóki scena się nie zbuduje.

W menu wybierasz:
- **Liczbę AI:** od 1 do 4 (domyślnie 1).
- **Liczbę wysp:** od 1 do 4 (domyślnie 1), w dowolnej kombinacji z liczbą AI.
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
- Klimat umiarkowany (`world.airTemp`):
  - średnia temperatura dnia to 7–21°C i zmienia się płynnie z dnia na dzień (cieplejsze i chłodniejsze dni),
  - w ciągu doby temperatura waha się o ±3–6°C: najzimniej jest ok. 4:00, najcieplej ok. 15:00,
  - na wzgórzach jest chłodniej,
  - o świcie narrator podaje prognozę, a przed zimną nocą ostrzega.
  - Temperaturę powietrza widać w górnym pasku.

## Potrzeby
Każda postać ma cztery paski w skali 0–100, gdzie 100 oznacza stan najlepszy:

| Potrzeba | Spada | Uzupełnia |
|---|---|---|
| 🍖 Głód | z czasem, szybciej przy pracy | jedzenie (pieczone daje więcej, surowe może zaszkodzić) |
| 💧 Pragnienie | najszybciej | woda ze stawu |
| ⚡ Energia | przy pracy | sen; szybciej w szałasie, namiocie, przy ognisku, a najszybciej w łóżku |
| ❤️ Zdrowie | gdy któryś pasek spadnie do 0 | samo wraca, gdy potrzeby są zaspokojone; w szałasie szybciej |

### 🌡️ Temperatura ciała
Normalna temperatura ciała to 36,6°C. Ciało powoli dąży do temperatury odczuwalnej:
- **Odczuwalna temperatura:** powietrze, do tego ognisko w pobliżu (+14°C), dach szałasu (+7°C) i praca (+4°C), a we śnie −2°C.
- **Poniżej 36°C:** szybciej rośnie głód.
- **Poniżej 35°C:** wychłodzenie, które odbiera zdrowie.
- **Powyżej 37,5°C:** szybciej rośnie pragnienie.
- **Powyżej 39°C:** przegrzanie, które odbiera zdrowie.
- **Zdrowie nie wraca,** gdy postać jest wychłodzona.

Temperaturę ciała widać w okienku „Postacie” i w karcie postaci, razem z temperaturą odczuwalną.

Postać ginie, gdy zdrowie spadnie do zera. Gra kończy się, gdy zginą wszyscy.

## Rzemiosło
Na starcie każda postać ma siekierę i kilof. Receptur nie zna, odkrywa je, łącząc materiały (zobacz [ai.md](ai.md#uczenie-się-od-zera)).

| Co | Z czego | Uwagi |
|---|---|---|
| Kłody, gałęzie i liście | ścięte drzewo (drzewo: 2 + 2 + 3, palma: 1 + 1 + 2) | siekierą |
| Deski | 1 kłoda → 2 deski | siekierą |
| Lina | 2 wodorosty | |
| Wędka | 2 gałęzie + lina | pozwala łowić ryby |
| Włócznia | 2 gałęzie + kamień + lina | pozwala polować na ptaki |
| Ognisko | 3 gałęzie + kłoda + 4 kamienie | pieczenie jedzenia, ciepło; wypala się (patrz niżej) |
| Ruszt | 3 gałęzie + 2 kamienie | odkrywany i zakładany przy palącym się ognisku; smażenie 2× szybciej, po dwie sztuki |
| Namiot | 4 gałęzie + 6 liści | lekki dach: trochę cieplej i lepszy sen |
| Stół rzemieślniczy | 2 kłody + 3 deski | przy nim postacie próbują nowych połączeń |
| Szałas | 2 kłody + 4 deski + 2 liny | szybszy sen i leczenie |
| Żelazne narzędzia | 2 rudy + gałąź | wykuwane przy ognisku; szybsze ścinanie i kopanie |
| Łóżko | 3 deski + 2 gałęzie + 4 liście | odkrywane tylko przy stole rzemieślniczym; dużo szybszy sen |

Niektóre rzeczy da się odkryć tylko w odpowiednim miejscu: ruszt i żelazo przy ogniu, łóżko przy stole rzemieślniczym. Próba w złym miejscu kończy się wskazówką w myślach postaci.

### Ognisko
- Pali się ok. 200 s czasu gry, czyli nieco ponad dobę. Maksymalnie można je podsycić do 300 s.
- Postać podsyca je kłodami (+60 s), gałęziami (+25 s) albo liśćmi (+8 s).
- Wygasłe ognisko nie grzeje i nie piecze. Rozpala się je na nowo dwiema gałęziami.

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
