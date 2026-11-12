# Sztuczna inteligencja postaci

Zachowanie postaci ma dwie warstwy:

1. **Kod gry (utility AI)**: liczy, które działania mają teraz sens, i je wykonuje. Obejmuje chodzenie, zbieranie, budowę i odruchy przy krytycznych potrzebach.
2. **Model językowy**: co kilkanaście sekund wybiera jedno z tych działań i mówi, co postać myśli. W trybie „Pełna swoboda” nie dostaje listy działań, tylko sam wymyśla zamiar, a gra (`src/ai/intent.js`) dopasowuje go do możliwego działania. Szczegóły w [modele-jezykowe.md](modele-jezykowe.md).

Dzięki takiemu podziałowi postacie żyją także wtedy, gdy model się ładuje albo nie działa.

## Decyzje (`src/ai/decide.js`)
Gdy postać nie ma zadania, `decide()` buduje listę opcji. Każda opcja ma wynik użyteczności:
- **potrzeby:** krzywa `(1 - wartość/100)^1.6` plus premia, gdy potrzeba jest krytyczna,
- **charakter postaci:** wagi `w` z `PERSONAS` w `data.js`, np. Bruno lubi łowić, a Ada budować,
- **odległość:** dalsze cele dostają karę,
- **sytuacja:** stan zapasów, pora dnia, potrzeba mostu, ciekawość.

Sześć najlepszych opcji widać w karcie postaci, w sekcji „Rozważane decyzje”. Postać bierze najlepszą opcję, którą da się wykonać. Wyjątek: jeśli model wybrał inną, ona idzie pierwsza, chyba że coś jest krytyczne (wynik najlepszej opcji powyżej 1,1).

Zadania (`src/ai/tasks.js`) to małe automaty: dojdź ścieżką, wykonaj czynność przez określony czas, odbierz efekt. Zadanie zostaje przerwane, gdy pragnienie, głód albo energia spadną do poziomu krytycznego.

## Percepcja i pamięć (`src/ai/perception.js`)
- **Pole widzenia:** stożek o zasięgu 18 kafelków w dzień. Im dalej, tym węższy (`viewHalfAngle`), a tuż obok postać widzi dookoła. W nocy zasięg spada do 1/4, a z płonącą pochodnią albo przy ognisku do 1/2 (`viewMul`, `TORCH` w `data.js`).
- **Pamięć:** postać zapamiętuje widziane miejsca, zasoby (z wiekiem wspomnienia), budowle, ptaki i ryby.
- **Nieaktualna wiedza:** pamięć odświeża się tylko wtedy, gdy postać znów spojrzy, więc może iść do drzewa, które ktoś już ściął. Zadanie „Rozejrzeć się” odświeża okolicę.
- **Ścieżki:** BFS działa tylko po kafelkach, które postać już widziała.

Widok „👁️ Oczami AI” pokazuje stożek, a to, czego postać nie zna, przykrywa mgłą.

## Uczenie się od zera (`src/ai/knowledge.js`)
Ta sekcja opisuje tryb „🧪 Odkrywa sam”. Tryb „📚 Wie wszystko” opisuje następna sekcja.

Na starcie postać nie zna mapy, receptur ani jadalności.
- **Ciekawość:** nowe rodzaje zasobów warto zbadać, co daje opcję „🔎 Zbadać…”.
- **Eksperymenty:** postać łączy posiadane materiały. Trafiona kombinacja (`RECIPE_BY_COMBO`) oznacza odkrycie receptury, a każda próba jest zapamiętywana.
- **Jedzenie:** pierwsze zjedzenie czegoś to próba. Surowe mięso może zaszkodzić, wtedy postać zapamiętuje, że to niejadalne.
- **Woda:** spróbowanie wody morskiej uczy, że jest słona.
- **Umiejętności:** łowienie, polowanie, ścinanie i górnictwo rosną z praktyką.

## Tryb „Wie wszystko”
Gdy w menu wybrano „📚 Wie wszystko”, `createGame` wywołuje dla każdej postaci `knowAll()` (`src/ai/knowledge.js`):
- `known` dostaje wszystkie receptury oraz doświadczenia `cook`, `bridge`, `warmFire`, `warmRoof`, `bedRest` i `boarDanger`,
- `edible` oznacza całe jedzenie jako jadalne, `triedKinds` wszystkie rodzaje zasobów, a `saltKnown` i `drankPond` są ustawione,
- `seen`, `mem` i `knownStructs` obejmują całą mapę z zasobami i budowlami ze startu,
- `buildPref` zaczyna z wiedzą, że ściany wokół i przykrycie nad głową chronią przed wiatrem,
- `omniscient = true` wyłącza eksperymenty w `decide()`.

Model językowy dostaje wtedy `WORLD_FACTS` z `data.js`, a w pełnej swobodzie także `recipeList()` (receptury ze składnikami i miejscem). W trybie odkrywania żadne z nich do modelu nie trafia.

## Plecak i zapasy
- `want` w `decide()` to lista materiałów potrzebnych do najbliższych celów. Materiały na rzeczy ze stołu albo z ognia (łóżko, ubranie, tarcza, pochodnia) trafiają na nią dopiero, gdy stół albo ogień już stoją.
- Ze składziku postać bierze najwyżej po 4 deski i kamienie (`keep`) i zostawia co najmniej jedno wolne miejsce w plecaku, żeby po zebraniu nie musieć od razu czegoś odkładać.
- Gdy plecak jest pełny, a czegoś do celów brakuje, postać odkłada zbędne rzeczy (zapas desek i kamieni ponad 4 też).
- `dropSurplus()`: przy limicie sztuk odkłada połowę tego, czego ma najwięcej, przy limicie wagi połowę tego, co najcięższe.

## Uprawa, naczynia i łowy (`decide.js`, `tasks.js`)
- `taskTill` stawia strukturę `field` (pole w `world.structures` ze `stage`: `tilled`, `planted`, `ripe`). `world.update` (`nature.js`) podnosi `growth` zasianej grządki i po `FARM.grow` sekundach daje jagody.
- Opcje: „🌾 Przygotować grządkę” i „🌱 Zasiać nasiona” (motyka i nasiona; premia po odkryciu `farm`), „🧺 Zebrać plony” (także bez głodu), „🥣 Nabrać wody do miski”, „🥣 Napić się z miski” (z dala od stawu), „🔪 Oskórować dzika” (`agent.carcass` po zabiciu dzika nożem), „🏹 Polować z łuku”.
- `KNIFE_RECIPES` (miska, łuk) wymagają noża przy odkryciu i przy robieniu.
- Doświadczenia `seeds` (pestki w jagodach) i `farm` (z nasion rośnie krzak) trafiają do `known`.
- Rośliny opisuje `CROPS` w `data.js` (`berry`, `rye`, `flower`: czym się sieje i co daje zbiór z grządki i z doniczki). Grządka i doniczka (`planter`, z polem `vessel`: `pot` albo `bowl`) mają `crop`, `stage`, `growth` i `water` (0..1, wysycha w `FARM.water` s). Sucha grządka rośnie w tempie `FARM.dry`, sucha doniczka wcale.
- `pickCrop()` wybiera nasiona rośliny, której najmniej rośnie. Opcje: „💧 Podlać rośliny” (doniczki najpierw), „🥣 Nabrać wody do miski” (także gdy rośliny są suche), „🪴 Posadzić w doniczce / w misce” (gdy ma co najmniej 2 naczynia), „🧱 Nabrać gliny”, „🏺 Wypalić doniczkę”, „🌾 Zebrać żyto”, „🌼 Zerwać kwiaty”.
- `VESSELS` łączy puste i pełne naczynia (`bowl`/`waterBowl`, `pot`/`waterPot`). Doświadczenia `watering` (przy zbiorze z podlewanej rośliny) i `clay` (przy piciu ze stawu, 15%) trafiają do `known`. Ziarno, nasiona kwiatów i kwiaty to drobiazgi spoza plecaka (limity w `POCKET_CAP`).

## Kolizje (`world.js`, `agent.js`)
- `world.solid(k)`: zasób (drzewo od `growth` 0,5, skała, krzak) albo budowla z `solidStruct` (ognisko, stół, skrzynia). `bfs` nadaje takim polom odległość, ale z nich nie rusza dalej, więc `nearestRes` działa jak dawniej, a `pathTo` zdejmuje ostatni krok (postać staje obok).
- Ściany parteru to bity krawędzi z `wallBits()` (przeliczane, gdy zmieni się `pieceVer`); `edgeOpen` sprawdza krok, a po przekątnej oba narożniki. Gdy z miejsca postaci da się dojść do mniej niż 25 pól, `bfs` liczy trasę bez przeszkód (`loose`) i ta trasa może przejść przez ścianę.
- Postacie: `decide` przekazuje do `bfs` zbiór `avoid` z polami stojących w pobliżu postaci. W `runTask` postać czeka przed polem zajętym przez stojącą postać (albo idącą z niższym numerem), a po 1,2 s przelicza trasę. `taskSleep` wybiera łóżko, którego nie zajmuje inna postać (`task.bedId`).

## Drogi i pnie (`tasks.js`, `world.js`)
- `world.traffic` liczy przejścia przez pola, a `world.road` trzyma drogi (`addRoad`). W `runTask` krok na drodze jest dłuższy o `ROAD_SPEED` (1,5).
- `roadSpot(home)` szuka w promieniu 22 pól od obozu pola z co najmniej 6 przejściami, bez zasobu (albo z pniem) i bez budowli. Opcje: „🛤️ Budować drogę” (łopata, za dnia), „🪵 Wyrwać pień” (pień na drodze, w obozie albo brak drzew przy potrzebie kłód), „🪏 Zrobić łopatę”.
- `taskUproot` usuwa zasób drzewa (`removeResource`), więc nie odrośnie. Doświadczenie `road` postać zdobywa przy pierwszym kroku po drodze.

## Rozmowy (`src/ai/social.js`)
Postacie, które spotkają się bliżej niż 2,6 kafelka, mogą porozmawiać. Ta sama para rozmawia najwyżej raz na 70 s. W rozmowie:
- przekazują najciekawszą nowinę, np. gdzie jest kopalnia, staw albo krzaki,
- dzielą się wiedzą: pamięcią mapy, recepturami, jadalnością i tym, że woda morska jest słona,
- uczą się nawzajem umiejętności,
- oddają sobie przedmioty, np. jedzenie głodnemu.

To, co postać mówi w trakcie rozmowy (`talkWith`, `talkUntil`), trafia do czatu jako dialog „Ada → Bruno” z własnym kolorem (klasa `dialog`), a dymek nad głową jest jasnozielony.

## Odkrywanie przez doświadczenie
- **Łóżko:** postać, która je zrobi, z ciekawości kładzie się w nim spać. Po pierwszym śnie wie, że lepiej się w nim wysypia, i od tej pory wybiera je do spania.
- **Stół rzemieślniczy:** przy stole postacie próbują jeszcze raz połączeń z co najmniej dwóch materiałów, bo niektóre receptury (np. łóżko) wychodzą tylko tam. Ma to osobną opcję „🧪 Eksperymentować przy stole”.
- **Ogień:** próby z kamieniem albo rudą przy palącym się ogniu liczą się jako nowe, bo ruszt i żelazo powstają tylko nad ogniem.
- **Dziki:** dopiero po pierwszym ataku postać wie, że dziki są groźne. Wtedy chętniej robi miecz i tarczę, a model dostaje w opisie „wiesz, że atakuje”. Walka i ucieczka to odruchy w `agent.update` i `hitByBoar`.
- **Wygasłe ognisko:** postać, która zna ognisko w pobliżu, podsyca je, gdy paliwa zostaje mało, a gdy wygaśnie, rozpala je na nowo.

## Ciepło z doświadczenia
Postacie nie wiedzą z góry, że ogień i dach grzeją. Gdy zmarznięta postać (poniżej 36,4°C) spędzi kilka sekund przy ognisku albo pod dachem szałasu, sama to zauważa: w dzienniku pojawia się wpis „czuje, że przy ognisku robi się cieplej”, a model dostaje to jako jej własną notatkę. Dopiero wtedy:
- **ogrzewanie się:** pojawia się opcja „🔥 Ogrzać się przy ognisku”, która przy wychłodzeniu staje się pilna,
- **budowa:** zimno podnosi ocenę budowy ogniska albo szałasu.

Do modelu trafia tylko temperatura powietrza i ciała. Tego, co grzeje, model nie dostaje wprost. Postacie przekazują sobie tę wiedzę w rozmowach, tak jak receptury.

## Komentarze (`src/ai/commentary.js`)
- **Dymki:** myśli przy zmianie zajęcia, okrzyki przy krytycznych potrzebach, reakcje na zdarzenia.
- **Narrator:** co ok. 30 s podsumowuje sytuację, np. kto jest w tarapatach albo jak idzie budowa mostu.

Gdy model działa, postacie mówią jego słowami, a ich wypowiedzi są w czacie oznaczone 🤖. Szablony z `commentary.js` służą wtedy modelowi tylko jako notatki o tym, co się stało. Gdy model się ładuje, ma błąd albo brakuje klucza, szablony trafiają wprost do dymków (kursywą, w czacie 📜). Kiedy model liczy odpowiedź, nad postacią widać „💭 …”. Narrator zawsze korzysta z szablonów.
