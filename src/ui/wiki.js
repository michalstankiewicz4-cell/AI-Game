// Wiki w grze: encyklopedia dla gracza (model językowy jej nie dostaje).
// Widać wszystko, a to, co odkryła choć jedna postać, ma znaczek ✓.
import { RECIPES, RECIPE_NAMES, MAT_NAMES, FOOD, WEIGHT, FIRE_RECIPES, BENCH_RECIPES } from '../ai/data.js';
import { $, esc } from './dom.js';

const ICON = {
  planks: '🟫', rope: '🪢', rod: '🎣', spear: '🔱', campfire: '🔥', shelter: '🛖', ironTool: '⚒️', tent: '⛺', workbench: '🛠️',
  grill: '♨️', bed: '🛏️', chest: '📦', torch: '🔥', clothes: '👕', sword: '🗡️', shield: '🛡️',
  logs: '🪵', sticks: '🥢', leaves: '🍃', seaweed: '🌿', stone: '🪨', iron: '⛏️',
  knife: '🔪', hoe: '🌾', bowl: '🥣', bow: '🏹', arrows: '🏹', leather: '🧥', feathers: '🪶', hide: '🟤', seeds: '🌱', clay: '🧱', pot: '🏺', grain: '🌾', flowers: '🌼', flowerSeeds: '🌱',
  berries: '🫐', rawFish: '🐟', cookedFish: '🍣', rawMeat: '🍗', cookedMeat: '🍖',
};

const RECIPE_DESC = {
  planks: 'Kłoda ciosana siekierą daje 2 deski. Potrzebne do mostów, szałasu, stołu, łóżka i tarczy.',
  rope: 'Skręcona z wodorostów. Wiąże wędkę, włócznię, szałas, mosty i ubranie.',
  rod: 'Bez wędki nie da się łowić ryb.',
  spear: 'Pozwala polować na ptaki i lepiej walczyć z dzikiem.',
  campfire: 'Grzeje, piecze jedzenie i pozwala wykuwać żelazo. Pali się, póki ma paliwo: kłoda, gałęzie albo liście podtrzymują ogień. Wygasłe trzeba rozpalić na nowo (2 gałęzie).',
  shelter: 'Solidny dach nad głową: najcieplejsze miejsce do spania.',
  ironTool: 'Wykuwany w ogniu. Żelazna siekiera i kilof pracują szybciej.',
  tent: 'Lekki dach z gałęzi i liści. Trochę cieplej niż pod gołym niebem i lepiej się śpi.',
  workbench: 'Przy stole można odkryć rzeczy, których nie da się zrobić „na kolanach”.',
  grill: 'Zakładany na palące się ognisko. Piecze dwa razy szybciej, po dwie sztuki naraz.',
  bed: 'Na łóżku sen szybciej oddaje siły.',
  clothes: 'Ubranie z liści chroni przed zimnem.',
  sword: 'Żelazny miecz wykuty w ogniu. Najlepsza broń na dziki.',
  shield: 'Drewniana tarcza mocno zmniejsza obrażenia od szarży dzika.',
  torch: 'Gałąź z liśćmi obwiązanymi liną, zapalana od palącego się ogniska. W nocy postać widzi z nią o połowę słabiej niż w dzień (bez niej dużo gorzej). Pali się ok. 70 s w ręku.',
  knife: 'Ostry kamień obwiązany liną. Nożem skóruje się upolowanego dzika (3 mięsa i skóra zamiast jednego kawałka), struga łuk i drąży miskę.',
  hoe: 'Motyką spulchnia się ziemię na grządkę, na której można zasiać nasiona z jagód.',
  bowl: 'Deska wydrążona nożem. Napełniona wodą ze stawu pozwala napić się z dala od wody.',
  bow: 'Kłoda wystrugana nożem i lina jako cięciwa. Ze strzałami poluje się celniej na ptaki i walczy z dzikiem z daleka.',
  arrows: 'Gałąź, kamienny grot i lotka z piór: 4 strzały. Czasem się gubią albo łamią.',
  leather: 'Ubranie uszyte ze skóry dzika przy stole rzemieślniczym. Grzeje mocniej niż ubranie z liści.',
  pot: 'Glina z brzegu stawu wypalona w ognisku. Można w niej nosić wodę jak w misce, a po nasypaniu ziemi posadzić nasiona. W doniczce roślina rośnie tylko podlewana.',
  chest: 'Porządne miejsce na zapasy przy obozie. W odróżnieniu od kupki na ziemi trzyma też jedzenie, po które postać wraca, gdy jest głodna.',
};
const BUILDINGS = new Set(['campfire', 'shelter', 'tent', 'workbench', 'grill', 'bed', 'chest']);

const MAT_DESC = {
  logs: 'Z drzew i palm. Na deski, ognisko, szałas i stół.',
  sticks: 'Gałęzie z drzew. Na narzędzia, namiot i jako paliwo do ogniska.',
  leaves: 'Liście z drzew. Na namiot, łóżko, ubranie i jako lekkie paliwo.',
  planks: 'Deski z kłód. Na mosty i budowle.',
  seaweed: 'Wodorosty z płycizn. Skręca się z nich linę.',
  rope: 'Lina z wodorostów.',
  stone: 'Kamień ze skał i kopalni. Na ognisko, włócznię i ruszt.',
  iron: 'Ruda żelaza z kopalni. Z niej narzędzia i miecz.',
  feathers: 'Pióra z upolowanych ptaków. Lotki do strzał.',
  hide: 'Skóra z dzika oskórowanego nożem. Na ubranie ze skóry.',
  clay: 'Glina z gliniastego brzegu stawu. Wypalona w ognisku daje doniczkę.',
};
const FOOD_DESC = {
  berries: 'Rosną na krzakach i odrastają. Mało sycące.',
  rawFish: 'Złowiona na wędkę. Surowa syci słabo i może zaszkodzić.',
  cookedFish: 'Ryba upieczona przy ognisku: dużo bardziej sycąca.',
  rawMeat: 'Z ptaków i dzików. Lepiej upiec.',
  cookedMeat: 'Pieczone mięso: najbardziej sycące jedzenie.',
};
const START_TOOLS = [
  ['axe', '🪓', 'Siekiera', 'Na start. Rąbie drzewa i ciosa deski.'],
  ['pickaxe', '⛏️', 'Kilof', 'Na start. Kruszy skały i kopie w kopalni.'],
  ['ironAxe', '🪓', 'Żelazna siekiera', 'Wykuta w ogniu (receptura „żelazne narzędzia”). Szybsze rąbanie.'],
  ['ironPick', '⛏️', 'Żelazny kilof', 'Wykuty w ogniu (receptura „żelazne narzędzia”). Szybsze kopanie.'],
];
const WORLD = [
  ['tree', '🌳', 'Drzewo', 'Daje kłody, gałęzie i liście. Ścięte odrasta po czasie.'],
  ['palm', '🌴', 'Palma', 'Rośnie przy plażach. Daje kłodę i gałąź.'],
  ['rock', '🪨', 'Skała', 'Kilofem można z niej wybić kamień.'],
  ['bush', '🫐', 'Krzak', 'Rosną na nim jagody, które odrastają.'],
  ['seaweed', '🌿', 'Wodorosty', 'Na płyciznach przy brzegu.'],
  ['mine', '⛰️', 'Kopalnia', 'Kamień i czasem ruda żelaza.'],
  ['pond', '💧', 'Staw', 'Słodka woda do picia.'],
  ['sea', '🌊', 'Morze', 'Słona woda nie gasi pragnienia, a szkodzi.'],
  ['fish', '🐟', 'Ryby', 'Pływają przy brzegu. Łowi się je wędką.'],
  ['bird', '🐦', 'Ptaki', 'Siadają na ziemi. Włócznią można je upolować.'],
  ['boar', '🐗', 'Dzik', 'Zwykle spokojny, ale potrafi zaszarżować. Bez broni lepiej uciekać. Daje dużo mięsa.'],
  ['bridge', '🌉', 'Most', 'Budowany z desek i liny między wyspami.'],
  ['piece_floor', '🟫', 'Podłoga z desek', 'Pojedyncza deska położona płasko na ziemi albo wyżej, oparta o ściany. Ma własną nazwę.'],
  ['piece_wall', '🧱', 'Ściana z desek', 'Deska postawiona pionowo na krawędzi pola. Wyżej da się ją postawić tylko na innej ścianie.'],
  ['piece_slope', '📐', 'Skos z desek', 'Deska położona pod skosem, np. na ścianach. Postacie mogą ją zdjąć, przenieść i przemianować.'],
  ['field', '🌾', 'Grządka', 'Ziemia spulchniona motyką. Rośnie na niej krzak jagód (6 jagód i 2 nasiona), żyto (8 ziaren) albo kwiaty (3 kwiaty i 2 nasiona). Podlewana dojrzewa po ok. półtorej doby, sucha prawie trzy razy wolniej.'],
  ['planter', '🪴', 'Doniczka z rośliną', 'Doniczka albo miska z ziemią i nasionami, stawiana przy obozie. Rośnie tylko podlewana i daje mniej więcej połowę plonu grządki. Po zbiorze można w niej znów coś posadzić.'],
  ['rye', '🌾', 'Dzikie żyto', 'Kępy żyta rosną tu i ówdzie na łąkach. Z kłosów wyłuskuje się ziarno do siewu, a kłosy odrastają.'],
  ['flower', '🌼', 'Kwiaty', 'Rosną na łąkach w trzech kolorach. Zerwane cieszą, a co drugi daje nasiona.'],
  ['stash', '📦', 'Składzik', 'Kupka rzeczy odłożonych, gdy plecak jest za ciężki. Można po nie wrócić.'],
];
const EXPERIENCE = [
  ['warmFire', '🔥', 'Przy ogniu cieplej', 'Zmarznięta postać sama odkrywa, że ognisko grzeje.'],
  ['warmRoof', '🛖', 'Pod dachem cieplej', 'Szałas albo namiot chronią przed chłodem.'],
  ['bedRest', '🛏️', 'Łóżko daje lepszy sen', 'Po nocy w łóżku postać czuje, że wypoczęła szybciej.'],
  ['cook', '🍖', 'Pieczenie', 'Pieczone jedzenie syci dużo bardziej niż surowe.'],
  ['saltWater', '🧂', 'Morska woda szkodzi', 'Słonej wody nie da się pić.'],
  ['seeds', '🌱', 'Nasiona w jagodach', 'Postać, która je jagody, znajduje w nich pestki.'],
  ['farm', '🌾', 'Uprawa', 'Po pierwszym zbiorze postać wie, że z posadzonych nasion coś wyrasta.'],
  ['watering', '💧', 'Podlewanie', 'Gdy zbiera plon z podlewanej rośliny, postać wie, że woda przyspiesza wzrost.'],
  ['clay', '🧱', 'Glina', 'Pijąc ze stawu, postać czasem zauważa, że brzeg jest gliniasty.'],
  ['boarDanger', '🐗', 'Dziki są groźne', 'Po pierwszym zderzeniu z dzikiem postać wie, że trzeba uważać.'],
];

const cost = (r) => Object.entries(RECIPES[r]).map(([k, n]) => `${n}× ${MAT_NAMES[k] || k}`).join(' + ');
const where = (r) => FIRE_RECIPES.has(r) ? 'przy ognisku' : BENCH_RECIPES.has(r) ? 'przy stole rzemieślniczym' : '';

// kategorie: { id, name, items: [{ key, icon, name, desc, meta }] }
function catalog() {
  const recipe = (r) => ({ key: 'recipe:' + r, icon: ICON[r], name: RECIPE_NAMES[r], desc: RECIPE_DESC[r], meta: [cost(r), where(r)].filter(Boolean).join(' · ') });
  const rs = Object.keys(RECIPES);
  return [
    { id: 'craft', name: '🔨 Crafting', items: rs.filter((r) => !BUILDINGS.has(r)).map(recipe) },
    { id: 'build', name: '🏠 Budowle', items: rs.filter((r) => BUILDINGS.has(r)).map(recipe) },
    { id: 'items', name: '🎒 Materiały', items: Object.keys(MAT_NAMES).map((m) => ({ key: 'item:' + m, icon: ICON[m], name: MAT_NAMES[m], desc: MAT_DESC[m], meta: `${WEIGHT[m]} kg / szt.` })) },
    { id: 'food', name: '🍽️ Jedzenie', items: Object.keys(FOOD).map((f) => ({ key: 'food:' + f, icon: ICON[f], name: FOOD[f].name, desc: FOOD_DESC[f], meta: `syci: ${FOOD[f].val} · ${WEIGHT[f]} kg` })) },
    {
      id: 'tools', name: '🧰 Narzędzia', items: [
        ...START_TOOLS.map(([k, icon, name, desc]) => ({ key: 'tool:' + k, icon, name, desc })),
        ...['rod', 'spear', 'clothes', 'sword', 'shield', 'knife', 'hoe', 'bow', 'leather'].map((t) => ({ key: 'tool:' + t, icon: ICON[t], name: RECIPE_NAMES[t], desc: RECIPE_DESC[t], meta: `receptura: ${cost(t)}` })),
        { key: 'item:seeds', icon: ICON.seeds, name: 'nasiona jagód', desc: 'Pestki znalezione w zjedzonych jagodach (mniej więcej co trzecia garść) i zebrane z grządki. Sadzi się je na grządce przygotowanej motyką albo w doniczce.', meta: '0.02 kg / szt.' },
        { key: 'item:grain', icon: ICON.grain, name: 'ziarno żyta', desc: 'Wyłuskane z kłosów dzikiego żyta (2 ziarna z kłosa). To nasiona: z grządki zbiera się 8 ziaren, z doniczki 4.', meta: '0.02 kg / szt.' },
        { key: 'item:flowerSeeds', icon: ICON.flowerSeeds, name: 'nasiona kwiatów', desc: 'Zostają z co drugiego zerwanego kwiatu. Wysiane dają nowe kwiaty i kolejne nasiona.', meta: '0.02 kg / szt.' },
        { key: 'item:flowers', icon: ICON.flowers, name: 'kwiaty', desc: 'Zerwane kwiaty cieszą postać, zwłaszcza w złym nastroju. Kwiaty z własnej uprawy cieszą jeszcze bardziej.', meta: '0.05 kg / szt.' },
        { key: 'item:waterBowl', icon: '💧', name: 'naczynie z wodą', desc: 'Miska albo doniczka napełniona przy stawie. Z wody można się napić z dala od stawu albo podlać nią rośliny.', meta: 'miska 1.2 kg · doniczka 1.6 kg' },
        { key: 'item:torch', icon: ICON.torch, name: 'pochodnia (w ręku)', desc: RECIPE_DESC.torch, meta: `receptura: ${cost('torch')} · przy ognisku · 0.4 kg` },
      ],
    },
    { id: 'world', name: '🌍 Świat', items: WORLD.map(([k, icon, name, desc]) => ({ key: 'world:' + k, icon, name, desc })) },
    { id: 'exp', name: '🧠 Doświadczenia', items: EXPERIENCE.map(([k, icon, name, desc]) => ({ key: 'exp:' + k, icon, name, desc })) },
  ];
}
const CATS = catalog();

// co już odkryto (zostaje odkryte, nawet gdy postać zginie albo zużyje rzecz)
export function scanDiscoveries(world) {
  const f = world.wikiFound || (world.wikiFound = new Set());
  const add = (k) => f.add(k);
  for (const a of world.agents) {
    // w trybie „Wie wszystko” postać zna wszystko od startu: w wiki liczy się dopiero to, co naprawdę zrobi albo spotka
    if (!a.omniscient) for (const r of a.known) { add('recipe:' + r); if (EXPERIENCE.some((e) => e[0] === r)) add('exp:' + r); }
    if (a.known.has('bridge')) add('world:bridge');
    for (const k in a.inv) if (a.inv[k] > 0) add((FOOD[k] ? 'food:' : 'item:') + k);
    if (!a.omniscient) for (const [k, v] of a.edible) if (v) add('food:' + k);
    for (const k in a.tools) if (a.tools[k]) add('tool:' + k);
    if (!a.omniscient) for (const k of a.triedKinds) add('world:' + k);
    if (a.drankPond) add('world:pond');
    if (a.saltKnown) { add('world:sea'); add('exp:saltWater'); }
    if (a.stats.fish > 0) add('world:fish');
    if (a.stats.birds > 0) add('world:bird');
    if (a.inv.waterBowl > 0) { add('recipe:bowl'); add('item:waterBowl'); }
    if (a.inv.waterPot > 0) { add('recipe:pot'); add('item:waterBowl'); }
    if (a.stats.boars > 0 || a.memBoars.size || a.known.has('boarDanger')) add('world:boar');
  }
  for (const s of world.structures) {
    if (s.kind === 'stash') add('world:stash');
    else if (s.kind === 'field' || s.kind === 'planter') add('world:' + s.kind);
    else add('recipe:' + s.kind);
    if (s.grill) add('recipe:grill');
    if (s.items) for (const k in s.items) if (s.items[k] > 0) add((FOOD[k] ? 'food:' : 'item:') + k);
  }
  if (world.bridges && world.bridges.some((b) => b.planks > 0)) add('world:bridge');
  for (const p of world.pieces || []) add('world:piece_' + p.type);
  return f;
}

let tab = 'craft', open = false, getWorld = () => null, shown = '', lastWorld = null, worldN = 0;
function render(force) {
  const w = getWorld();
  const found = w ? scanDiscoveries(w) : new Set();
  // przerysuj tylko, gdy coś się zmieniło (inaczej klik w zakładkę trafia w znikający przycisk)
  if (w !== lastWorld) { lastWorld = w; worldN++; } // nowa gra: wiki zaczyna od zera
  const sig = `${tab}|${found.size}|${worldN}`;
  if (!force && sig === shown) return;
  shown = sig;
  const all = CATS.flatMap((c) => c.items), got = all.filter((e) => found.has(e.key)).length;
  $('wikiTabs').innerHTML = CATS.map((c) => {
    const n = c.items.filter((e) => found.has(e.key)).length;
    return `<button data-cat="${c.id}" class="${c.id === tab ? 'on' : ''}">${c.name} <small>${n}/${c.items.length}</small></button>`;
  }).join('');
  $('wikiSum').textContent = `Odkryto ${got} z ${all.length}`;
  const cat = CATS.find((c) => c.id === tab);
  $('wikiList').innerHTML = cat.items.map((e) => {
    const ok = found.has(e.key);
    return `<div class="wentry${ok ? ' ok' : ''}"><div class="wicon">${e.icon || '❔'}</div><div class="wtext"><b>${esc(e.name[0].toUpperCase() + e.name.slice(1))}</b>${ok ? ' <span class="wcheck" title="Odkryte przez AI">✓</span>' : ''}`
      + `<div class="wdesc">${esc(e.desc || '')}</div>${e.meta ? `<div class="wmeta">${esc(e.meta)}</div>` : ''}</div></div>`;
  }).join('');
}

export function initWiki(worldGetter) {
  getWorld = worldGetter;
  $('wikiTabs').onclick = (e) => { const b = e.target.closest('button[data-cat]'); if (b) { tab = b.dataset.cat; render(true); } };
  $('wikiClose').onclick = () => toggleWiki(false);
  $('wikiBtn').onclick = () => toggleWiki();
  $('wiki').onclick = (e) => { if (e.target.id === 'wiki') toggleWiki(false); };
  setInterval(() => { if (open) render(); }, 1000);
}
export function toggleWiki(on = !open) {
  open = on;
  $('wiki').classList.toggle('hidden', !open);
  $('wikiBtn').classList.toggle('on', open);
  if (open) render(true);
}
export const wikiOpen = () => open;
