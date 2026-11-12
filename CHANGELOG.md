# Lista zmian

Wszystkie istotne zmiany w grze. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), numeracja: [SemVer](https://semver.org/lang/pl/).
Każda zmiana na `main` podnosi wersję (zasady w [docs/rozwoj.md](docs/rozwoj.md#wersjonowanie)).

## [0.22.1] - 2026-11-12
### Zmienione
- Pomiar wydajności sprawdza, czy model w przeglądarce liczył w danej klatce. Czas i przycięcia z tych chwil trafiają do osobnej pozycji „🤖 Model w przeglądarce”, a podsumowanie i raport podają, w ilu procentach klatek model liczył i ile przycięć wtedy wypadło. Gdy to model przycina grę, okienko podpowiada, co pomaga.

## [0.22.0] - 2026-11-12
### Dodane
- Dwa tryby wiedzy w menu („Wiedza postaci”): **🧪 Odkrywa sam** (jak dotąd: postacie zaczynają bez wiedzy i uczą się metodą prób) oraz **📚 Wie wszystko**. W drugim trybie postacie od startu znają wszystkie receptury, jedzenie, mapę świata z zasobami i to, co grzeje, chroni i szkodzi, więc nie eksperymentują, tylko od razu zbierają i budują.
- W trybie „Wie wszystko” model językowy dostaje fakty o świecie (ciepło przy ogniu i pod dachem, łóżko, słona woda, surowe jedzenie, dziki, pochodnia), a w pełnej swobodzie także receptury ze składnikami. W trybie odkrywania nadal nic mu się nie podpowiada.
- Pomiar wydajności (przycisk ⏱️ albo klawisz P): okienko pokazuje, ile średnio i najwyżej zajmuje w klatce świat, AI (decyzje, szukanie drogi, wzrok, ruch), rysowanie po stronie procesora, karta graficzna, interfejs i to, co dzieje się poza kodem gry. Liczy przycięcia (klatki dłuższe niż 50 ms) i przypisuje każde najdłużej trwającej części. „📋 Kopiuj raport” kopiuje wyniki z nazwą karty graficznej.
### Poprawione
- Postacie nie wpadają w pętlę „weź z zapasów, odłóż zapasy”: ze składziku biorą najwyżej po 4 deski i kamienie, zostawiają w plecaku wolne miejsce, a przy pełnym plecaku odkładają zbędne rzeczy, żeby zebrać to, czego brakuje. Przy limicie sztuk odkładają to, czego mają najwięcej, a przy limicie wagi to, co najcięższe.
- Bez ogniska zbieranie kamieni ma pierwszeństwo. Łóżko, ubranie i tarczę postać robi tylko przy stole rzemieślniczym, a materiały na nie (i na pochodnię) zbiera dopiero, gdy stół albo ogień już stoją. Stół i łóżko mają wyższy priorytet.
- Postać z obozem (ogień i dach) chętniej majsterkuje z desek.

## [0.21.0] - 2026-11-12
### Dodane
- Noc ogranicza wzrok: postać widzi na ok. 1/4 dziennego zasięgu, a z płonącą pochodnią w ręku albo przy ognisku na połowę. Stożek w widoku „Oczami AI” kurczy się razem z zasięgiem.
- Pochodnia (gałąź + 2 liście + lina): receptura odkrywana tylko przy ognisku, zapas 2 sztuk, zapalana od palącego się ogniska, pali się ok. 70 s w ręku. Światło pochodni widać w świecie.
- Przedmiot w ręku: po zmroku pochodnia, w walce miecz albo włócznia, przy pracy siekiera, kilof albo wędka. Widać go na modelu postaci i w jej karcie, razem z zasięgiem wzroku.
- Model językowy wie, że jest ciemno i na ile kroków postać widzi. Wpisy w wiki.

## [0.20.0] - 2026-11-12
### Zmienione
- Budowanie z desek bez z góry zaplanowanego domku. Bez poleceń modelu postać kładzie deskę w losowym miejscu przy innych deskach i zapamiętuje, czy przy budowie zrobiło się zaciszniej (osobno dla podłogi, ściany i skosu na każdym poziomie). Później częściej wybiera to, co pomogło, a co trzecią deskę kładzie na próbę.
- Opis budowy dla modelu to same liczby (deski każdego rodzaju, podłoga, ściany na obwodzie, pola z deską nad głową), bez list „luk” i „odkrytych pól”. Wolne miejsca są w losowej kolejności.
- Niski skos na ziemi przykrywa pole tylko w połowie. Postać śpi w najlepiej osłoniętym miejscu przy deskach, nie tylko na podłodze.

## [0.19.0] - 2026-11-12
### Dodane
- Budowanie z pojedynczych desek (`src/world/pieces.js`, `src/ai/building.js`): podłoga, ściana i skos, poziomy 0–2, przyciąganie do siatki pól i krawędzi, zasady podpór.
- Każda deska ma nazwę (domyślnie „podłoga 1”, „ściana 3”…). Postać może deskę zdjąć, przenieść i przemianować.
- Analiza kształtu budowy: podłoga, ściany na obwodzie z lukami, pola przykryte i odkryte. Trafia do opisu dla modelu językowego razem z listą desek i ponumerowanymi wolnymi miejscami.
- Model może odpowiedzieć polem `"deska"` z poleceniami (połóż, podnieś, przenieś, nazwij). Bez nich postać majsterkuje sama: zwarta podłoga, ściany z wejściem, dach ze skosów.
- Przykryte i obudowane pole grzeje (do +7°C odczuwalnej) i liczy się jako dach. Postać, która odkryła, że pod dachem cieplej, śpi w takim domu.
- Model 3D desek, podpis po najechaniu myszą, wpisy w wiki.

## [0.18.0] - 2026-11-12
### Dodane
- Skrzynia (4 deski + 2 gałęzie): nowa receptura do odkrycia. Postać zbija ją przy ognisku albo pod dachem i chowa w niej nadmiar materiałów oraz jedzenia (przy sobie zostawia po 2 sztuki).
- Głodna postać bez jedzenia w plecaku bierze je ze skrzyni („🍱 Wziąć jedzenie ze skrzyni”). Jedzenie w skrzyni liczy się do zapasu, więc postacie nie zbierają ponad miarę.
- Model 3D skrzyni, wpis w wiki, rozmowy o skrzyni i skrzynia w opisie dla modelu językowego.
### Zmienione
- Odkładając zapasy, postać wybiera skrzynię przed kupką na ziemi.

## [0.17.0] - 2026-11-12
### Dodane
- Na liście modeli w przeglądarce pobrane modele mają znaczek ✅ i dopisek „pobrany” zamiast rozmiaru pobrania. Gra sprawdza pamięć podręczną WebLLM i zalicza tylko model, którego wszystkie pliki wag są na dysku. Znaczek pojawia się też od razu po załadowaniu modelu.

## [0.16.0] - 2026-11-12
### Dodane
- Wiki w grze (przycisk „📖 Wiki” albo klawisz K, `src/ui/wiki.js`): crafting, budowle, materiały, jedzenie, narzędzia, obiekty świata i doświadczenia w kategoriach. Widać wszystko, z kosztem, miejscem odkrycia, wagą i sytością.
- Rzeczy odkryte przez którąkolwiek postać mają znaczek ✓ i licznik „Odkryto X z Y”. Odkrycia zostają po śmierci postaci. Model językowy wiki nie dostaje.

## [0.15.0] - 2026-11-12
### Dodane
- Dziki (`src/world/boars.js`): chodzą po swojej wyspie, przez pierwszą dobę są spokojne, potem czasem szarżują na postać, która podejdzie za blisko. Po ciosie często odpuszczają, ranne uciekają, a pokonane dają 3 mięsa i odradzają się po 300 s.
- Walka i ucieczka: postać z włócznią albo mieczem staje do walki, a bez broni ucieka. Z bronią poluje na dziki, gdy potrzebuje jedzenia.
- Nowe receptury: miecz (2 rudy + deska, wykuwany przy ogniu) i tarcza (3 deski + lina, odkrywana przy stole), która osłabia ciosy o 60%.
- Postać dopiero po pierwszym ataku wie, że dziki są groźne, i wtedy chętniej robi broń.
- Model 3D dzika, statystyka „Dziki” w karcie postaci, dzik w opisie dla modelu językowego.

## [0.14.0] - 2026-11-12
### Dodane
- Plecak z limitem 30 rzeczy i 25 kg (wagi w `WEIGHT`). Powyżej 70% udźwigu postać chodzi wolniej.
- Składziki: nadmiar trafia na kupkę na ziemi, a postacie odnoszą zbędne rzeczy do składziku przy ognisku albo pod dachem i biorą z niego to, czego brakuje. Mówią sobie o nich w rozmowach.
- Samopoczucie (nowy pasek 😊): zależy od potrzeb, ciepła, dachu, łóżka, towarzystwa, odkryć, ciepłych posiłków i budowy, a samo wpływa na tempo pracy. Model językowy dostaje je opisane słowami.
- Ubranie z liści i liny: odkrywane tylko przy stole rzemieślniczym, dodaje +4°C odczuwalnej temperatury.
- W karcie postaci jest pasek wagi plecaka.
### Zmienione
- Kopanie rudy uwzględnia zapasy w składzikach, żeby postacie nie kopały bez końca.

## [0.13.0] - 2026-11-12
### Dodane
- Liście z drzew (z drzewa 3, z palmy 2).
- Nowe receptury do odkrycia:
  - namiot (gałęzie + liście): lekki dach, cieplej i lepszy sen,
  - stół rzemieślniczy (kłody + deski),
  - ruszt (gałęzie + kamienie): zakłada się na ognisko i smaży na nim 2× szybciej, po dwie sztuki,
  - łóżko (deski + gałęzie + liście): odkrywane tylko przy stole rzemieślniczym, dużo szybszy sen.
- Ognisko się wypala: postacie podsycają je kłodami, gałęziami albo liśćmi, a wygasłe rozpalają na nowo. Wygasłe ognisko nie grzeje i nie piecze, nie widać też płomieni.
- Postać sama odkrywa, że w łóżku lepiej się wysypia: z ciekawości kładzie się w nim raz, a potem je wybiera.
- Modele 3D: namiot, stół, łóżko, ruszt nad ogniskiem.
- Model językowy w trybie pełnej swobody widzi pobliskie budowle (także wygasłe ognisko i ruszt), a gra rozumie nowe zamiary („podsycić ogień”, „zrobić łóżko”, „rozbić namiot”…).

## [0.12.0] - 2026-11-12
### Dodane
- Klimat umiarkowany: temperatura powietrza zmienia się w ciągu doby (najzimniej ok. 4:00, najcieplej ok. 15:00) i z dnia na dzień, a na wzgórzach jest chłodniej. O świcie narrator podaje prognozę, a temperatura jest w górnym pasku.
- Temperatura ciała postaci: wychłodzenie i przegrzanie odbierają zdrowie, zimno przyspiesza głód, a gorąco pragnienie. Temperatura jest w okienku „Postacie” i w karcie postaci.
- Postacie same odkrywają, że przy ognisku i pod dachem jest cieplej. Dopiero wtedy ogrzewają się przy ogniu i chętniej budują ognisko lub szałas. Model językowy nie dostaje tej wiedzy wprost.
### Zmienione
- Domyślnie 1 wyspa i 1 AI.
- Karta postaci odświeża się raz na sekundę zamiast czterech razy, bo pełne przebudowanie HTML było najcięższą częścią interfejsu.
### Naprawione
- Przełączniki „Imiona” i „Dymki” działają niezależnie: po wyłączeniu imion dymki nadal są widoczne.
- Łowienie bez wędki jest zablokowane także w samym zadaniu, nie tylko w decyzjach.

## [0.11.0] - 2026-11-12
### Dodane
- Loadery: przycisk Start pokazuje „Ładowanie gry…”, dopóki moduły się nie wczytają; po kliknięciu Start widać „Budowanie świata…” do pierwszej narysowanej klatki; w grze, na dole ekranu, pasek ładowania modelu w przeglądarce z procentem i nazwą pliku.
### Naprawione
- Pasek postępu pobierania modelu w menu nie miał stylu i był niewidoczny.

## [0.10.0] - 2026-11-12
### Dodane
- Większe modele w przeglądarce na mocniejszą kartę: Qwen3.5 2B, Llama 3.2 3B, Gemma 4 E2B i Qwen3.5 4B.
- Przełącznik „Tryb myślenia” dla Qwen3.5 (domyślnie wyłączony): model najpierw rozważa sytuację, a tok myślenia nie trafia do dymka.
- Wyszarzony przycisk „LM Studio (wkrótce)” w wyborze mózgu postaci.

## [0.9.0] - 2026-11-12
### Zmienione
- Model w przeglądarce działa w osobnym wątku (Web Worker, `src/ai/llmWorker.js`), więc obsługa modelu nie przycina gry. Gdy wątek się nie uruchomi, model startuje jak dotąd w głównym wątku. W menu i w podpowiedzi licznika tokenów widać „osobny wątek”.

## [0.8.1] - 2026-11-12
### Zmienione
- Dokumentacja (README, `docs/`) zaktualizowana do stanu gry: mowa skryptu 📜 i dymek 💭, pełna swoboda, jakość grafiki i FPS, zakładka błędów, nowe pliki (`intent.js`, `instances.js`, `errors.js`, `llmPanel.js`), workflowy i wskazówki do testów.

## [0.8.0] - 2026-11-12
### Dodane
- Zakładka „⚠️ Błędy” obok dziennika: zbiera błędy modelu, strony i konsoli (także ostrzeżenia WebLLM). Przycisk „📋 Kopiuj wszystko” kopiuje je razem z wersją gry, przeglądarką i nazwą karty graficznej (WebGL i WebGPU).
### Naprawione
- Model w przeglądarce: „Failed to initialize the grammar matcher for response format json_object”. Schemat JSON jest teraz przekazywany jako tekst, a gdy wymuszony JSON mimo to nie działa, gra przechodzi na zwykły tekst zamiast zgłaszać błąd przy każdym zapytaniu.

## [0.7.1] - 2026-11-12
### Naprawione
- Brak dymków, gdy model się ładuje albo nie działa: wtedy za postacie mówi skrypt (dymek kursywą, w czacie 📜). Gdy model liczy odpowiedź, nad postacią jest „💭 …”.
- Łagodniejsze czytanie odpowiedzi małego modelu: inne klucze albo zwykły tekst zamiast JSON-a nie kończą się błędem, tylko wypowiedzią.

## [0.7.0] - 2026-11-12
### Zmienione
- Wydajność grafiki: drzewa, skały, krzaki i wodorosty rysowane przez instancjonowanie. Wywołań rysowania jest ok. 110 zamiast ok. 1500, a czas przygotowania klatki spadł z ok. 10–21 ms do ok. 2–3 ms (pomiar w przeglądarce testowej).
- Ogniska świecą trzema stałymi światłami, więc zbudowanie ogniska nie powoduje przycięcia na kompilację shaderów.
- Fale morza liczone co drugą klatkę, na lżejszej siatce. Rozdzielczość ograniczona do 1,5×.
- Model w przeglądarce pyta rzadziej (co najmniej 4 s przerwy między zapytaniami, postać co 20 s), żeby zostawić kartę graficzną grafice.
### Dodane
- Przełącznik jakości grafiki (🎨 Wysoka / Niska: bez cieni, mniejsza rozdzielczość) i licznik FPS w górnym pasku.

## [0.6.0] - 2026-11-12
### Dodane
- Przełącznik „Pełna swoboda” w menu: model dostaje tylko to, co postać czuje (głód, pragnienie, zmęczenie opisane słowami), widzi i pamięta w pobliżu oraz co ma przy sobie. Sam wymyśla zamiar, a gra tłumaczy go na dostępne działanie (`src/ai/intent.js`). Zamiar i jego wykonanie widać w karcie postaci, a niewykonalny zamiar jest oznaczony.

## [0.5.2] - 2026-11-12
### Zmienione
- Karta postaci: nagłówek z imieniem stoi w miejscu, przewijają się tylko statystyki (pozycja przewinięcia nie skacze przy odświeżaniu).
- Paski przewijania w stylu gry (cienkie, niebieskie, przezroczyste tło).
- Zdarzenia gry w czacie (odkrycia, śmierć, nowa wyspa) mają znak 📜, żeby nie myliły się z wypowiedziami modelu (🤖).

## [0.5.1] - 2026-11-12
### Dodane
- Automatyczne tagi `vX.Y.Z` i wydania na GitHub po każdej nowej wersji na `main` (workflow `release.yml`).

## [0.5.0] - 2026-11-12
### Dodane
- Wersjonowanie: `src/version.js` jako jedno źródło wersji, numer wersji w menu i w górnym pasku, ten plik ze zmianami, tagi `vX.Y.Z`.
- Skrypt `tools/version.py` (podbijanie wersji, sprawdzanie spójności) i kontrola wersji w GitHub Actions dla każdego PR.
- Cache-busting: importmapa w `index.html` dokleja `?v=WERSJA` do każdego modułu, więc po wydaniu przeglądarka nie używa starych plików.
- Dokumentacja w `docs/`: rozgrywka, AI, modele językowe, architektura, rozwój.
- Numer wersji przy tytule gry.
### Zmienione
- Postacie mówią wyłącznie przez model językowy. Szablonowe teksty nie trafiają do dymków, tylko jako notatki do modelu, który opisuje je po swojemu i nie powtarza poprzedniej wypowiedzi.
- Wskazówka, jak przełączyć Chrome na mocniejszą kartę graficzną w laptopie z dwiema kartami.

## [0.4.1] - 2026-11-12
### Zmienione
- Mózgiem postaci jest zawsze model językowy (w przeglądarce albo Claude API), który decyduje i mówi; usunięty wybór lokalnego skryptu i trybu „tylko mowa”.
- Domyślny model w przeglądarce to najlżejszy Qwen2.5 0.5B, z mniejszym oknem kontekstu.
### Naprawione
- Utrata karty graficznej (np. `DXGI_ERROR_DEVICE_HUNG`): gra schodzi na lżejszy model i prosi o odświeżenie strony zamiast pokazywać „brak GPU”.
- Pole klucza API w formularzu (ostrzeżenie Chrome) i ikona strony (404 na `favicon.ico`).

## [0.4.0] - 2026-11-12
### Dodane
- Darmowy model z Hugging Face uruchamiany w przeglądarce (WebLLM na WebGPU), z paskiem postępu pobierania i licznikiem tokenów.

## [0.3.0] - 2026-11-12
### Dodane
- Opcjonalny mózg postaci przez Claude API; klucz tylko w localStorage przeglądarki, limit kosztu.
- Licznik tokenów i szacunkowego kosztu w górnym pasku.
- Okienko „Postacie”: kliknięcie przenosi kamerę do postaci, Tab przełącza postacie.
- Karta postaci i okienko „Postacie” przesuwane za nagłówek.

## [0.2.0] - 2026-11-12
### Dodane
- Postacie startują bez wiedzy: ciekawość, eksperymenty z materiałami, odkrywanie receptur i jadalności.
- Projekt podzielony na foldery (`src/world`, `src/ai`, `src/render`, `src/ui`).

## 0.1.0 - 2026-11-12 (wersja robocza, wydana razem z 0.2.0)
### Dodane
- Pierwsza wersja: 3D low-poly (Three.js), 1–4 AI × 1–4 wysp, rzemiosło, mosty, łowienie, odrastające drzewa, pole widzenia z pamięcią, widok „Oczami AI”, rozmowy i wymiana między postaciami, komentarze na żywo.

[0.22.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.22.1
[0.22.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.22.0
[0.21.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.21.0
[0.20.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.20.0
[0.19.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.19.0
[0.18.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.18.0
[0.17.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.17.0
[0.16.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.16.0
[0.15.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.15.0
[0.14.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.14.0
[0.13.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.13.0
[0.12.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.12.0
[0.11.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.11.0
[0.10.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.10.0
[0.9.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.9.0
[0.8.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.8.1
[0.8.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.8.0
[0.7.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.7.1
[0.7.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.7.0
[0.6.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.6.0
[0.5.2]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.2
[0.5.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.5.0
[0.4.1]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.1
[0.4.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/AI-Game/releases/tag/v0.2.0
