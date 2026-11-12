// Tryb „pełna swoboda”: model dostaje tylko to, co postać widzi i czuje,
// sam wymyśla zamiar, a gra tłumaczy go na jedno z dostępnych teraz działań.
import { FOOD, ITEM_LABELS, TOOL_LABELS, RECIPE_NAMES } from './data.js';
import { idx } from '../world/world.js';

// słowa kluczowe (bez polskich znaków) dla każdego działania; wygrywa działanie z największą liczbą trafień
const KEYWORDS = [
  ['Pić wodę', ['pic', 'pij', 'napi', 'wod', 'pragn', 'staw', 'zrodl']],
  ['Napić się z morza', ['morz', 'morsk', 'slon']],
  ['Zjeść', ['jesc', 'zjes', 'zjem', 'glod', 'posil', 'najes', 'jedzen']],
  ['Zbierać jagody', ['jagod', 'krzak', 'owoc', 'zbier']],
  ['Łowić ryby', ['ryb', 'lowi', 'zlow', 'wedk', 'polow ryb']],
  ['Polować na ptaka', ['polow', 'ptak', 'ptas', 'wloczn', 'mies']],
  ['Spać', ['spac', 'span', 'spie', 'sen', 'drzem', 'zasn', 'nocleg', 'polozyc']],
  ['Odpocząć', ['odpocz', 'odsap', 'relaks', 'usiad', 'zmecz']],
  ['Upiec jedzenie', ['piec', 'upiec', 'gotow', 'smaz', 'ugotow']],
  ['Rozpalić ognisko', ['ognisk', 'ogien', 'ognia', 'rozpal']],
  ['Ścinać drzewo', ['scin', 'scia', 'drzew', 'drewn', 'rab', 'klod', 'siekier']],
  ['Ciosać deski', ['desk', 'cios']],
  ['Skręcić linę', ['lin', 'skrec', 'sznur']],
  ['Zbierać kamienie', ['kamien', 'kamyk', 'skal']],
  ['Zbierać wodorosty', ['wodorost', 'glon']],
  ['Kopać w kopalni', ['kopa', 'kopal', 'rud', 'zelaz', 'kilof']],
  ['Wykuć żelazny kilof', ['kilof', 'wyku', 'zelazn']],
  ['Wykuć żelazną siekierę', ['siekier', 'wyku', 'zelazn']],
  ['Budować most', ['most', 'przepraw', 'druga wysp', 'inna wysp', 'sasiedn']],
  ['Pomóc przy moście', ['most', 'pomoc', 'przepraw']],
  ['Zrobić wędkę', ['wedk', 'zrob', 'zbud', 'wykon', 'stworz']],
  ['Zrobić włócznię', ['wloczn', 'zrob', 'wykon', 'stworz', 'bron']],
  ['Zbudować szałas', ['szalas', 'schron', 'chat', 'dach', 'zbud', 'dom']],
  ['Eksperymentować', ['eksperym', 'polacz', 'sprob', 'wynalaz', 'majstr', 'kombin']],
  ['Zbadać okolicę', ['zbada', 'eksplor', 'okolic', 'szuka', 'poszuk', 'odkry', 'zwiedz', 'rozpozn']],
  ['Rozejrzeć się', ['rozejrz', 'rozgl', 'obejrz', 'popatrz']],
  ['Porozmawiać', ['rozmaw', 'pogad', 'powiedz', 'zapyt', 'spotk', 'podejs do']],
  ['Pospacerować', ['spacer', 'przejs', 'przejd']],
  ['Zbadać', ['zbada', 'sprawdz', 'obejrz', 'drzew', 'skal', 'krzak', 'palm', 'wodorost', 'kopal']],
];

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

// zwraca etykietę działania z listy dostępnych albo null, gdy zamiaru nie da się teraz wykonać
export function mapIntent(intent, labels) {
  const t = ' ' + norm(intent) + ' ';
  let best = null;
  labels.forEach((label, rank) => {
    const plain = label.replace(/^[^\p{L}]+/u, ''); // bez emoji
    const entry = KEYWORDS.find(([name]) => plain === name || (name === 'Zbadać' && plain.startsWith('Zbadać ') && plain !== 'Zbadać okolicę'));
    if (!entry) return;
    let score = 0;
    for (const k of entry[1]) if (t.includes(k)) score++;
    if (score > 0 && (!best || score > best.score || (score === best.score && rank < best.rank))) best = { label, score, rank };
  });
  return best ? best.label : null;
}

const feel = (v, words) => (v < 15 ? words[0] : v < 35 ? words[1] : v < 60 ? words[2] : null);
const DIR = ['na północy', 'na północnym wschodzie', 'na wschodzie', 'na południowym wschodzie', 'na południu', 'na południowym zachodzie', 'na zachodzie', 'na północnym zachodzie'];
const KIND = { tree: 'drzewa', palm: 'palmy', rock: 'skały', bush: 'krzaki', seaweed: 'wodorosty', mine: 'wejście do jakiejś kopalni' };

export const FREE_SYSTEM = 'Jesteś rozbitkiem na bezludnej wyspie i chcesz przeżyć. Nikt nie mówi ci, co robić: sam(a) decydujesz na podstawie tego, co czujesz i widzisz. '
  + 'Odpowiadasz wyłącznie jednym obiektem JSON, bez innego tekstu: {"mysl": "<co mówisz na głos>", "zamiar": "<co chcesz teraz zrobić, 2-6 słów>"}. '
  + 'Wypowiedź to jedno zdanie po polsku (do 14 słów), w pierwszej osobie, zgodnie z twoim charakterem, wymyślone przez ciebie, za każdym razem inne. '
  + 'Zamiar to jedna konkretna czynność, np. „napić się ze stawu”, „ściąć drzewo”, „zbudować szałas”, „poszukać jedzenia”.';

// opis świata z perspektywy postaci: tylko zmysły, pamięć i to, co ma przy sobie
export function describeFree(a) {
  const w = a.world;
  const lines = [`Jesteś ${a.name} (${a.role.toLowerCase()}). ${w.isNight() ? 'Jest noc' : 'Jest dzień'}, mija ${w.day()}. dzień na wyspie.`];
  const feels = [
    feel(a.hunger, ['umierasz z głodu', 'jesteś bardzo głodny(a)', 'trochę burczy ci w brzuchu']),
    feel(a.thirst, ['zasycha ci w gardle, musisz natychmiast się napić', 'bardzo chce ci się pić', 'chce ci się pić']),
    feel(a.energy, ['padasz z nóg', 'jesteś bardzo zmęczony(a)', 'czujesz zmęczenie']),
    feel(a.health, ['czujesz, że umierasz', 'jest ci bardzo źle', 'nie czujesz się najlepiej']),
  ].filter(Boolean);
  lines.push(feels.length ? 'Czujesz: ' + feels.join(', ') + '.' : 'Czujesz się dobrze.');
  // co pamięta w pobliżu
  const near = new Map();
  for (const m of a.mem.values()) {
    const d = Math.hypot(m.i - a.i, m.j - a.j);
    if (d > 16) continue;
    const ang = Math.atan2(m.i - a.i, -(m.j - a.j)) * 180 / Math.PI;
    const dir = d < 4 ? 'tuż obok' : DIR[Math.round(((ang + 360) % 360) / 45) % 8];
    const k = KIND[m.kind]; if (!k) continue;
    if (!near.has(k) || near.get(k).d > d) near.set(k, { d, dir });
  }
  const sees = [...near.entries()].sort((x, y) => x[1].d - y[1].d).slice(0, 6).map(([k, v]) => `${k} ${v.dir}`);
  const pond = w.pondShore.find((p) => a.seen[idx(p.i, p.j)] && Math.hypot(p.i - a.i, p.j - a.j) < 18);
  if (pond) sees.push('słodkowodny staw niedaleko');
  if (a.saltKnown) sees.push('morze (wiesz, że woda jest słona)'); else sees.push('morze dookoła');
  lines.push('Widzisz i pamiętasz w pobliżu: ' + sees.join(', ') + '.');
  const people = w.agents.filter((o) => o !== a && o.alive && Math.hypot(o.i - a.i, o.j - a.j) < 12).map((o) => o.name);
  if (people.length) lines.push(`Niedaleko jest: ${people.join(', ')}.`);
  const inv = Object.entries(a.inv).filter(([, v]) => v > 0).map(([k, v]) => `${ITEM_LABELS[k].replace(/^[^\p{L}]+/u, '').toLowerCase()} ×${v}`);
  lines.push(`Masz przy sobie: ${[...Object.entries(a.tools).filter(([, v]) => v).map(([k]) => TOOL_LABELS[k].replace(/^[^\p{L}]+/u, '').toLowerCase()), ...inv].join(', ') || 'nic'}.`);
  const recipes = [...a.known].filter((r) => RECIPE_NAMES[r]).map((r) => RECIPE_NAMES[r]);
  if (recipes.length) lines.push(`Umiesz zrobić: ${recipes.join(', ')}.`);
  const edible = [...a.edible].filter(([, v]) => v).map(([k]) => FOOD[k].name);
  if (edible.length) lines.push(`Wiesz, że da się jeść: ${edible.join(', ')}.`);
  if (a.task) lines.push(`Teraz: ${a.task.label.replace(/^[^\p{L}]+/u, '').toLowerCase()}.`);
  if (a.llmIntent && a.llmIntent.text) lines.push(`Twój poprzedni zamiar: ${a.llmIntent.text}${a.llmIntent.label ? '' : ' (nie dało się go wtedy zrobić)'}.`);
  if (a.lastSaid) lines.push(`Ostatnio powiedziałeś(aś): ${a.lastSaid} (nie powtarzaj).`);
  lines.push('Co myślisz i co chcesz teraz zrobić?');
  return lines.join('\n');
}
