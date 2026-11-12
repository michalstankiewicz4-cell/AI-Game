# Modele językowe

Mózg postaci wybierasz w menu, w sekcji „Mózg postaci”. Kod jest w `src/ai/llm.js` (logika), a ustawienia i licznik tokenów w `src/ui/llmPanel.js`.

## Jak model steruje postacią
Postać pyta model najwyżej co 20 s czasu gry przy modelu w przeglądarce i co 25 s przy Claude, a także przy nowej decyzji. Model w przeglądarce dostaje najwyżej jedno zapytanie naraz i co najmniej 4 s przerwy między zapytaniami, bo dzieli kartę graficzną z grafiką gry. Claude dostaje najwyżej 2 zapytania naraz i 2,5 s przerwy.

Model dostaje:
- imię i rolę postaci, porę dnia, numer wyspy,
- stan potrzeb, ekwipunek, narzędzia i znane receptury,
- to, co robią inni,
- listę do sześciu działań przygotowanych przez kod gry.

Model odpowiada obiektem JSON:
```json
{"wybor": 2, "mysl": "Nazbieram jagód, zanim zrobi się ciemno."}
```

Mówi tylko model. Teksty z szablonów (myśli, reakcje na zdarzenia, rozmowy) nie trafiają do dymków. Postać zbiera je jako notatki, które model dostaje w następnym zapytaniu i opisuje własnymi słowami. Ważne zdarzenie przyspiesza zapytanie, a rozmowy z szablonów widać w dzienniku.

Wtedy:
- `mysl` trafia do dymka i do czatu z oznaczeniem 🤖,
- `wybor` przerywa bieżące zadanie (o ile nie jest pilne) i przy następnej decyzji wygrywa, chyba że kod gry widzi krytyczną potrzebę.

## Pełna swoboda (przełącznik w menu)
Model nie dostaje listy działań ani notatek ze skryptu, tylko to, co postać:
- **czuje:** potrzeby opisane słowami, np. „bardzo chce ci się pić”,
- **widzi i pamięta w pobliżu:** drzewa, krzaki, skały, staw, morze i ludzi, z kierunkami,
- **ma i umie:** przedmioty, narzędzia, znane receptury i jadalne rzeczy.

Model odpowiada `{"mysl": "...", "zamiar": "ściąć drzewo"}`. Gra (`src/ai/intent.js`, `mapIntent`) dopasowuje zamiar po słowach kluczowych do działań, które są teraz możliwe:
- wygrywa działanie z największą liczbą trafień,
- przy remisie wygrywa to, które wyżej ocenia skrypt,
- zamiaru, którego nie da się wykonać (np. „zatańczyć” albo wędka bez liny), gra nie wykonuje, tylko pokazuje w karcie postaci jako „(nie da się teraz)” i przypomina modelowi przy następnym pytaniu.

Krytyczne potrzeby nadal mają pierwszeństwo. Mały model częściej wymyśla rzeczy niewykonalne, więc lepiej sprawdza się Qwen2.5 1.5B albo Claude.

## Model w przeglądarce (za darmo)
Działa przez [WebLLM](https://github.com/mlc-ai/web-llm) 0.2.86 ładowane z CDN jsDelivr. Model liczy na karcie graficznej przez WebGPU, a pliki pobiera z Hugging Face. Po pierwszym pobraniu zostają w pamięci przeglądarki.

| Model | Pobranie | VRAM |
|---|---|---|
| Qwen2.5 0.5B (domyślny) | ~0,4 GB | ~0,9 GB |
| Llama 3.2 1B | ~0,7 GB | ~0,9 GB |
| Qwen2.5 1.5B | ~1 GB | ~1,6 GB |

- **Laptop z dwiema kartami:** Chrome bywa przypięty do słabszej karty zintegrowanej, a WebLLM nie może tego zmienić na Windows. Wejdź w Ustawienia › System › Ekran › Grafika i ustaw Chrome na „Wysoka wydajność” (np. NVIDIA RTX).
- **Wymagania:** Chrome lub Edge na komputerze z WebGPU. Bez WebGPU gra pokazuje komunikat, a postacie działają na samym kodzie gry.
- **Odpowiedź:** wymuszony JSON (`response_format: json_object`), okno kontekstu 1536 tokenów.
- **Utrata karty graficznej** (np. `DXGI_ERROR_DEVICE_HUNG` na Windows): gra przełącza się na lżejszy model i zapamiętuje go. Chrome po takim resecie blokuje WebGPU, dopóki strona się nie odświeży, więc gra prosi o F5.

## Claude API (płatne)
- **Klucz:** wpisujesz go w menu. Zostaje tylko w `localStorage` tej przeglądarki (`wyspyai.apiKey`), nigdy w repozytorium, i jest wysyłany wyłącznie do `api.anthropic.com`.
- **Modele i ceny** za 1M tokenów (wejście/wyjście): Claude Opus 5.5 ($4/$20), Sonnet 5.5 ($2/$10), Haiku 5.5 ($0,10/$0,50).
- **Limit kosztu:** domyślnie $1. Po jego przekroczeniu model się wstrzymuje.
- **Parametry zapytania:** `output_config.effort: low`, bez `temperature` i bez prefill. Odpowiedź z `stop_reason: refusal` traktowana jest jako błąd.
- **Błędny klucz** (401/403) wstrzymuje model.

## Licznik tokenów
Licznik jest w górnym pasku i ma postać `🤖 wejście↑ wyjście↓ · koszt`. Dla Claude koszt liczony jest z `usage` i cennika, a dla modelu w przeglądarce widnieje „za darmo”.
- **Po najechaniu:** liczba zapytań, błędy i ostatni błąd.
- **Kliknięcie:** zeruje licznik i wznawia wstrzymany model.
