# Rozgrywka

Wyspy AI to symulacja: gracz nie steruje postaciami, tylko patrzy, jak rozbitkowie próbują przeżyć. Może przy tym obracać kamerę, śledzić wybraną postać i podglądać jej myśli.

## Tryby
Przycisk Start działa, gdy gra się wczyta (do tego czasu pokazuje „Ładowanie gry…”). Po kliknięciu widać „Budowanie świata…”, dopóki scena się nie zbuduje.

W menu wybierasz:
- **Liczbę AI:** od 1 do 4 (domyślnie 1).
- **Liczbę wysp:** od 1 do 4 (domyślnie 1), w dowolnej kombinacji z liczbą AI.
- **Wiedzę postaci:**
  - **🧪 Odkrywa sam** (domyślnie): rozbitkowie nie wiedzą nic. Badają zasoby, łączą materiały, próbują jedzenia i sami czują, co grzeje. Opis w [ai.md](ai.md#uczenie-się-od-zera-srcaiknowledgejs).
  - **📚 Wie wszystko:** od startu znają wszystkie receptury (także te przy ogniu i przy stole), wiedzą, co jest jadalne, że morska woda nie gasi pragnienia, że ogień i dach grzeją, łóżko daje lepszy sen, a dziki atakują. Znają też mapę wszystkich wysp z zasobami (zwierzęta i ryby się ruszają, więc tych nie). Nie eksperymentują, tylko od razu zbierają materiały i budują obóz. Dalej muszą jednak wszystko zdobyć i zrobić, a ograniczają je plecak, pora dnia, wzrok i potrzeby.
- **Ziarno świata:** ta sama liczba daje ten sam świat.
- **Mózg postaci:** model w przeglądarce albo Claude API, opisane w [modele-jezykowe.md](modele-jezykowe.md).

Każda wyspa ma mniej więcej rozmiar ekranu. Przy kilku wyspach:
- wyspa startowa jest uboga w jedzenie, więc opłaca się zbudować most,
- kopalnia z rudą żelaza leży na najdalszej wyspie.

## Świat
- Ocean z falami i wyspy w stylu low-poly z poszarpaną linią brzegu.
- Stawy ze słodką wodą. Wody morskiej nie da się pić, a postacie muszą to odkryć same.
- Zasoby: drzewa i palmy (odrastają po ścięciu), skały, krzaki z jagodami (owoce odrastają), kępy dzikiego żyta i kwiaty na łąkach (też odrastają), wodorosty przy brzegu, a na wzgórzu kopalnia. Brzeg stawu jest gliniasty.
- Zwierzęta: ptaki do polowania, ławice ryb do łowienia i dziki (`src/world/boars.js`).

### 🐗 Dziki
- **Gdzie:** na każdej wyspie jest jeden dzik, a na wyspie startowej dodatkowy, daleko od miejsca startu. Przez pierwszą dobę dziki są spokojne.
- **Szarża:** postać, która podejdzie do dzika na ok. 4 kafelki, może sprowokować szarżę. Dzik biega wolniej niż postać (1,75 wobec 1,9 kafelka/s, a po drodze postać idzie jeszcze szybciej), więc ucieczka się udaje, jeśli zacznie się na czas.
- **Cios:** odbiera 7 zdrowia, a z tarczą o 60% mniej. Często to tylko ostrzeżenie: po ciosie dzik odpuszcza.
- **Obrona:** postać z włócznią (9) albo mieczem (14) staje i walczy, a bez broni ucieka.
- **Ucieczka dzika:** gdy zostanie mu mniej niż 15 z 40 punktów życia.
- **Mięso:** pokonany dzik daje 3 mięsa i odradza się po 300 s.
- **Doświadczenie:** dopiero po pierwszym ataku postać wie, że dziki są groźne, i chętniej robi broń i tarczę.
- **Polowanie:** z bronią i przy zdrowiu powyżej 60 postać sama poluje na dziki, gdy potrzebuje jedzenia.
- Cykl dnia i nocy: doba trwa 180 s czasu gry (`DAY_LENGTH`). W nocy postacie chętniej śpią.
- Klimat umiarkowany (`world.airTemp`):
  - średnia temperatura dnia to 7–21°C i zmienia się płynnie z dnia na dzień (cieplejsze i chłodniejsze dni),
  - w ciągu doby temperatura waha się o ±3–6°C: najzimniej jest ok. 4:00, najcieplej ok. 15:00,
  - na wzgórzach jest chłodniej,
  - o świcie narrator podaje prognozę, a przed zimną nocą ostrzega.
  - Temperaturę powietrza widać w górnym pasku.

## Potrzeby
Każda postać ma pięć pasków w skali 0–100, gdzie 100 oznacza stan najlepszy:

| Potrzeba | Spada | Uzupełnia |
|---|---|---|
| 🍖 Głód | z czasem, szybciej przy pracy | jedzenie (pieczone daje więcej, surowe może zaszkodzić) |
| 💧 Pragnienie | najszybciej | woda ze stawu |
| ⚡ Energia | przy pracy | sen; szybciej w szałasie, namiocie, przy ognisku, a najszybciej w łóżku |
| 😊 Samopoczucie | gdy brakuje czegokolwiek, przy zimnie, w samotności | zaspokojone potrzeby, dach, łóżko, ognisko w nocy, rozmowy, odkrycia, ciepły posiłek, budowa |
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

Samopoczucie wpływa na tempo pracy: poniżej 30 postać pracuje o 20% wolniej, a powyżej 75 o 10% szybciej. Model językowy dostaje nastrój opisany słowami.

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
| Miecz | 2 rudy + deska | wykuwany przy ogniu; najlepsza broń na dziki |
| Tarcza | 3 deski + lina | odkrywana tylko przy stole rzemieślniczym; cios dzika słabszy o 60% |
| Łóżko | 3 deski + 2 gałęzie + 4 liście | odkrywane tylko przy stole rzemieślniczym; dużo szybszy sen |
| Pochodnia | gałąź + 2 liście + lina | odkrywana tylko przy ognisku; zapala się od palącego się ogniska, w ręku pali się ok. 70 s |
| Skrzynia | 4 deski + 2 gałęzie | odkrywana wszędzie; stawiana przy ognisku albo pod dachem; trzyma materiały i jedzenie |
| Nóż kamienny | 2 kamienie + lina | skórowanie dzika (3 mięsa i skóra), struganie łuku i drążenie miski |
| Motyka | deska + 2 kamienie + lina | spulchnia ziemię na grządkę |
| Drewniana miska | deska | drążona nożem; można w niej nosić wodę ze stawu |
| Łuk | kłoda + lina | strugany nożem; ze strzałami poluje na ptaki i walczy z dzikiem z daleka |
| Strzały | gałąź + pióra + kamień | 4 sztuki; czasem się gubią albo łamią |
| Ubranie ze skóry | 2 skóry + lina | odkrywane tylko przy stole rzemieślniczym; +7°C odczuwalnej temperatury |
| Łopata | deska + gałąź + kamień | ubija drogi, szybciej wyrywa pnie |
| Gliniana doniczka | 3 grudki gliny | wypalana w ognisku; naczynie na wodę i doniczka na rośliny |

Niektóre rzeczy da się odkryć tylko w odpowiednim miejscu: ruszt i żelazo przy ogniu, łóżko przy stole rzemieślniczym. Miski i łuku nie zrobi się bez noża. Próba w złym miejscu kończy się wskazówką w myślach postaci.

### Ognisko
- Pali się ok. 200 s czasu gry, czyli nieco ponad dobę. Maksymalnie można je podsycić do 300 s.
- Postać podsyca je kłodami (+60 s), gałęziami (+25 s) albo liśćmi (+8 s).
- Wygasłe ognisko nie grzeje i nie piecze. Rozpala się je na nowo dwiema gałęziami.

| Ubranie z liści | 6 liści + 2 liny | odkrywane tylko przy stole rzemieślniczym; +4°C odczuwalnej temperatury (ze skóry +7°C) |

### Plecak i składziki
- **Limity:** plecak mieści 30 rzeczy (`INV_CAP`) i 25 kg (`MAX_WEIGHT`). Wagi są w `WEIGHT` w `src/ai/data.js`, np. kłoda 3 kg, kamień 2 kg, ruda 3 kg, deska 1,5 kg, gałąź 0,5 kg, liść 0,1 kg.
- **Ciężar:** powyżej 70% udźwigu postać chodzi wolniej.
- **Przeładowanie:** postać odkłada połowę najcięższego materiału na kupkę, czyli składzik, w miejscu, gdzie stoi.
- **Odkładanie zapasów:** gdy plecak jest cięższy niż ok. 55%, postać odnosi to, czego teraz nie potrzebuje, do składziku przy ognisku albo pod dachem.
- **Branie z zapasów:** gdy czegoś brakuje do planów, postać najpierw bierze to ze znanego składziku, zanim pójdzie zbierać.
- **Skrzynia:** postać, która odkryje skrzynię, zbija ją przy obozie. Do skrzyni trafia nadmiar materiałów (ma pierwszeństwo przed kupką na ziemi) i nadmiar jedzenia (przy sobie zostają po 2 sztuki). Głodna postać bez jedzenia w plecaku idzie po nie do skrzyni, a jedzenie w skrzyni liczy się do zapasu, więc postacie nie zbierają jagód bez końca.
- **Wiedza o składzikach:** postacie mówią sobie o nich w rozmowach. Pusty składzik znika z mapy.

## Uprawa, naczynia i zdobycze z polowania
- **Nasiona:** jedząc jagody, postać czasem znajduje pestki (ok. 1 na 3 garście, najwyżej 12 przy sobie). Nasiona, pióra i strzały to drobiazgi: nie zajmują miejsca w plecaku.
- **Grządka:** postać z motyką i nasionami spulchnia ziemię na trawie obok obozu (najchętniej przy innych grządkach, do 6 grządek). Zasiane nasiona po ok. 270 s czasu gry (półtorej doby) wyrastają w krzak z 6 jagodami. Przy zbiorze wracają 2 nasiona, a grządka czeka na kolejne sadzenie. W trybie „Odkrywa sam” postać sieje najpierw z ciekawości, a dopiero po pierwszym zbiorze wie, że to działa.
- **Co się sieje:** nasiona jagód, ziarno żyta (z kłosów dzikiego żyta, 2 z kłosa) i nasiona kwiatów (z co drugiego zerwanego kwiatu). Na grządce postać sieje to, czego ma nasiona i czego najmniej rośnie. Plon z grządki: krzak jagód 6 jagód i 2 nasiona, żyto 8 ziaren, kwiaty 3 kwiaty i 2 nasiona.
- **Podlewanie:** podlana roślina rośnie pełnym tempem, sucha grządka prawie trzy razy wolniej, a sucha doniczka wcale. Woda w ziemi starcza na ok. 220 s (mokra ziemia jest ciemniejsza). Postać nabiera wody do misek i doniczek przy stawie i niesie ją do roślin. W trybie „Odkrywa sam” podlewa najpierw z ciekawości, a po zbiorze z podlewanej rośliny wie, że to pomaga.
- **Kwiaty:** zerwane cieszą postać (najchętniej zrywa je w złym nastroju, najwyżej 8 przy sobie). Zbiór kwiatów z uprawy cieszy jeszcze bardziej.
- **Glina i doniczka:** pijąc ze stawu, postać czasem zauważa gliniasty brzeg i bierze grudkę. Doniczkę odkrywa, eksperymentując z gliną przy ogniu; potem nabiera 3 grudki z brzegu stawu i wypala je w ognisku.
- **Naczynia:** miska i doniczka niosą wodę: przy stawie postać napełnia wszystkie puste naczynia. Spragniona, z dala od stawu (ponad 12 pól), pije z naczynia (+40 do pragnienia), a z wodą podlewa rośliny.
- **Doniczka z rośliną:** postać nasypuje ziemi do doniczki albo miski, sadzi w niej nasiona i stawia ją przy obozie (do 6 doniczek). Motyka nie jest potrzebna, ale roślina rośnie tylko podlewana i daje mniej więcej połowę plonu grządki. Po zbiorze w doniczce można znów coś posadzić. Jedno naczynie postać zawsze zostawia sobie na wodę.
- **Dzik:** z nożem postać skóruje upolowanego dzika (ok. 4 s): 3 mięsa i skóra. Bez noża urwie tylko 1 kawałek mięsa. Martwy dzik leży na boku, dopóki ktoś go nie oskóruje.
- **Ptaki:** upolowany ptak daje mięso i 2 pióra.
- **Łuk:** ze strzałami trafia ptaka częściej niż włócznia (75% zamiast 50% na start). Postać z łukiem i strzałami może też walczyć z dzikiem i na niego polować.

## Drogi i pnie
- **Wydeptane ścieżki:** gra liczy, ile razy postacie przeszły przez każde pole. Pole, przez które przeszły co najmniej 6 razy, nadaje się na drogę.
- **Droga:** postać z łopatą ubija drogę na wydeptanych polach do 22 pól od obozu (ok. 3 s na pole, za dnia). Po drodze chodzi się o połowę szybciej (postacie chodzą 1,9 kafelka/s, po drodze ok. 2,85).
- **Pnie:** po ściętym drzewie zostaje pień, który z czasem odrasta w drzewo. Kilofem (5 s) albo łopatą (3 s) można go wyrwać: daje kłodę, ale drzewo już nie odrośnie. Postacie wyrywają pnie w obozie (do 3 pól od ogniska), na wydeptanej ścieżce przed ubiciem drogi i wtedy, gdy potrzebne są kłody, a w pobliżu nie ma drzew.

## Noc, pochodnie i przedmioty w rękach
- **Widoczność:** w dzień postać widzi na 18 pól. W nocy widzi na ok. 1/4 tego (4–5 pól), a z płonącą pochodnią w ręku albo przy palącym się ognisku na połowę (9 pól). O zmierzchu i świcie zasięg zmienia się płynnie.
- **Pochodnia:** robi się ją przy ognisku (zapas 2 sztuk). Po zmroku postać idzie do ogniska i od niego zapala pochodnię. Pali się tylko w ręku, w dzień postać ją gasi i chowa.
- **Dwie ręce:** w prawej postać trzyma narzędzie albo broń: w walce z dzikiem miecz, włócznię albo łuk, przy ścinaniu siekierę, przy kopaniu kilof, przy łowieniu wędkę, przy skórowaniu i drążeniu nóż, przy grządce motykę. W lewej trzyma po zmroku płonącą pochodnię, a w walce tarczę. Łuk trzyma oburącz, więc wtedy pochodnię odkłada (nie pali się). Widać to na modelu postaci i w jej karcie („✋ W prawej… w lewej…”), razem z aktualnym zasięgiem wzroku.
- Model językowy dostaje informację, że jest ciemno i na ile kroków postać widzi.

## Budowanie z desek
Postać, która zna deski, może kłaść je pojedynczo. Każda deska to osobny element z własną nazwą, np. „podłoga deska 1”.

- **Rodzaje:** podłoga (płasko), ściana (pionowo, na krawędzi pola) i skos (pod kątem, wznosi się w stronę N, E, S albo W). Poziomy od 0 (ziemia) do 2.
- **Przyciąganie:** deski przyskakują do siatki pól i krawędzi, więc dwie deski nigdy nie zajmą tego samego miejsca.
- **Podpory:** ściana wyżej musi stać na ścianie, a podłoga albo skos nad ziemią muszą opierać się o ścianę pod spodem albo o deskę obok. Deski, na której coś się opiera, nie da się zdjąć.
- **Zmiany:** postać może deskę zdjąć (wraca do plecaka), przenieść w inne miejsce i zmienić jej nazwę.
- **Analiza kształtu:** gra liczy deski każdego rodzaju, największy kawałek podłogi, ile krawędzi jego obwodu ma ściany i ile pól ma deskę nad głową. Model dostaje same liczby, bez ocen w rodzaju „brakuje” albo „luka”, i wolne miejsca w losowej kolejności.
- **Dom wychodzi sam albo wcale:** gra nie ma „przepisu na dom”. Liczy się tylko, czy pole jest przykryte (deska nad głową; niski skos na ziemi daje połowę) i jak bardzo obudowane. Takie miejsce grzeje prawie jak szałas, a postać, która odkryła, że pod dachem cieplej, chętnie w nim śpi. Ściany nie blokują przejścia.
- **Bez poleceń modelu: próba i błąd.** Postać kładzie deskę w losowym wolnym miejscu przy innych deskach i sprawdza, czy przy budowie zrobiło się zaciszniej. Zapamiętuje to dla rodzaju deski i poziomu (np. „ściana na ziemi”, „podłoga na poziomie 1”) i później częściej wybiera to, co pomogło, a co trzecią deskę kładzie zupełnie na próbę. Z tego wychodzą różne budowle: osłony od wiatru przy ognisku, budki ze ścian, daszki; czasem coś podobnego do domu, czasem nic.
- **Podgląd:** najechanie myszą na deskę pokazuje jej nazwę, rodzaj, poziom i to, kto ją położył.

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
| Wiki (receptury, przedmioty, budowle, świat) | K lub przycisk 📖 Wiki, Esc zamyka |
| Pauza | spacja |
| Prędkość 1×, 2×, 4×, 8× | 1–4 |
| Jakość grafiki (cienie) | przycisk 🎨 w górnym pasku |
| Pomiar wydajności | P lub przycisk ⏱️ w górnym pasku |
| Błędy do skopiowania | zakładka „⚠️ Błędy” pod czatem |

## Wiki w grze
Przycisk „📖 Wiki” w górnym pasku (albo klawisz K) otwiera encyklopedię wysp. Jest podzielona na kategorie: crafting, budowle, materiały, jedzenie, narzędzia, świat (drzewa, skały, kopalnia, staw, morze, ryby, ptaki, dziki, mosty, składziki) i doświadczenia (np. że przy ogniu cieplej).

Widać w niej wszystko, z kosztem receptur, miejscem, gdzie da się je odkryć (przy ognisku albo przy stole), wagą i sytością. Rzeczy, które odkryła choć jedna postać, mają zielony znaczek ✓ i zostają odkryte także po jej śmierci. Licznik „Odkryto X z Y” pokazuje postęp. Wiki jest tylko dla gracza: model językowy jej nie dostaje, więc w trybie „Odkrywa sam” postacie dalej uczą się wyłącznie na próbach. Każda nowa gra zaczyna wiki od zera. W trybie „Wie wszystko” znaczek ✓ dostaje tylko to, co postacie naprawdę zrobią, zjedzą albo spotkają, a nie wiedza, z którą startują.

Okienko „Postacie” i kartę postaci przesuwasz, chwytając za nagłówek.

## Pomiar wydajności
Przycisk ⏱️ w górnym pasku (albo klawisz P) otwiera okienko „⏱️ Wydajność”. Od chwili otwarcia mierzy każdą klatkę i pokazuje dla ok. 10 ostatnich sekund, ile milisekund zajęły:

| Część | Co obejmuje |
|---|---|
| 🌍 Świat | przyroda (odrastanie, ptaki, ryby, dziki), ogniska, pogoda, mosty |
| 🧠 AI: decyzje | wybór działania (utility AI), razem ze ścieżkami liczonymi przy wyborze |
| 🧭 AI: szukanie drogi | ścieżki liczone poza wyborem działania |
| 👁️ AI: wzrok i pamięć | stożek widzenia i zapamiętywanie zasobów |
| 🚶 AI: ruch i potrzeby | reszta pętli postaci: chodzenie, zadania, potrzeby, temperatura |
| 💬 Rozmowy i narrator | spotkania postaci, komentarze, przeliczanie brzegów |
| 🎨 Rysowanie: przygotowanie sceny | aktualizacja modeli, etykiet, dymków, mgły i morza (procesor) |
| 🖌️ Rysowanie: wysyłanie do karty | wywołanie rysowania three.js (procesor) |
| 🎮 Karta graficzna | czas pracy karty; dokładny, gdy przeglądarka ma licznik czasu GPU, a bez niego przybliżony co 15. klatkę |
| 🪟 Interfejs | panele, karty postaci, dziennik i czat |
| 🤖 Model w przeglądarce | przerwa między klatkami w chwilach, gdy model liczył (pytanie w toku albo odpowiedź właśnie przyszła); model zajmuje tę samą kartę graficzną, na której rysuje się gra |
| ❓ Poza kodem gry | reszta przerwy między klatkami, której gra nie zajęła: przeglądarka i składanie obrazu, sprzątanie pamięci |

Gra nie ma osobnego silnika fizyki: ruch zwierząt i fale morza liczą się w częściach „Świat” i „Rysowanie”.

Przycięcie to klatka dłuższa niż 50 ms (poniżej 20 FPS). Każde przycięcie trafia do części, która w tej klatce trwała najdłużej, a podsumowanie podaje najczęstszą przyczynę i 5 najgorszych klatek. Podsumowanie podaje też, w ilu procentach klatek liczył model i ile przycięć wypadło w tym czasie. Jeśli przycina model, pomaga mocniejsza karta (np. ustawienie Chrome na kartę NVIDIA w Ustawienia › System › Ekran › Grafika), mniejszy model albo Claude API. Gdy przycięcia są „poza kodem gry”, przełącz grafikę na „🎨 Niska”: jeśli ich ubędzie, wąskim gardłem jest karta graficzna. „📋 Kopiuj raport” kopiuje wyniki razem z nazwą karty graficznej, a „↺ Od nowa” zeruje pomiar. Zamknięte okienko niczego nie mierzy.
