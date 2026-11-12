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
- **Pole widzenia:** stożek o zasięgu 18 kafelków. Im dalej, tym węższy (`viewHalfAngle`), a tuż obok postać widzi dookoła.
- **Pamięć:** postać zapamiętuje widziane miejsca, zasoby (z wiekiem wspomnienia), budowle, ptaki i ryby.
- **Nieaktualna wiedza:** pamięć odświeża się tylko wtedy, gdy postać znów spojrzy, więc może iść do drzewa, które ktoś już ściął. Zadanie „Rozejrzeć się” odświeża okolicę.
- **Ścieżki:** BFS działa tylko po kafelkach, które postać już widziała.

Widok „👁️ Oczami AI” pokazuje stożek, a to, czego postać nie zna, przykrywa mgłą.

## Uczenie się od zera (`src/ai/knowledge.js`)
Na starcie postać nie zna mapy, receptur ani jadalności.
- **Ciekawość:** nowe rodzaje zasobów warto zbadać, co daje opcję „🔎 Zbadać…”.
- **Eksperymenty:** postać łączy posiadane materiały. Trafiona kombinacja (`RECIPE_BY_COMBO`) oznacza odkrycie receptury, a każda próba jest zapamiętywana.
- **Jedzenie:** pierwsze zjedzenie czegoś to próba. Surowe mięso może zaszkodzić, wtedy postać zapamiętuje, że to niejadalne.
- **Woda:** spróbowanie wody morskiej uczy, że jest słona.
- **Umiejętności:** łowienie, polowanie, ścinanie i górnictwo rosną z praktyką.

## Rozmowy (`src/ai/social.js`)
Postacie, które spotkają się bliżej niż 2,6 kafelka, mogą porozmawiać. Ta sama para rozmawia najwyżej raz na 70 s. W rozmowie:
- przekazują najciekawszą nowinę, np. gdzie jest kopalnia, staw albo krzaki,
- dzielą się wiedzą: pamięcią mapy, recepturami, jadalnością i tym, że woda morska jest słona,
- uczą się nawzajem umiejętności,
- oddają sobie przedmioty, np. jedzenie głodnemu.

## Komentarze (`src/ai/commentary.js`)
- **Dymki:** myśli przy zmianie zajęcia, okrzyki przy krytycznych potrzebach, reakcje na zdarzenia.
- **Narrator:** co ok. 30 s podsumowuje sytuację, np. kto jest w tarapatach albo jak idzie budowa mostu.

Gdy model działa, postacie mówią jego słowami, a ich wypowiedzi są w czacie oznaczone 🤖. Szablony z `commentary.js` służą wtedy modelowi tylko jako notatki o tym, co się stało. Gdy model się ładuje, ma błąd albo brakuje klucza, szablony trafiają wprost do dymków (kursywą, w czacie 📜). Kiedy model liczy odpowiedź, nad postacią widać „💭 …”. Narrator zawsze korzysta z szablonów.
