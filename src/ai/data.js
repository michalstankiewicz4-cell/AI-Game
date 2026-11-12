// Dane i stałe agentów: osobowości, jedzenie, receptury, nazwy, parametry.

export const PERSONAS = [
  { name: 'Ada', role: 'Budowniczka', color: 0xe74c3c, w: { build: 1.5, fish: 0.9, gather: 1.0, mine: 0.8, hunt: 0.9 } },
  { name: 'Bruno', role: 'Rybak', color: 0x3498db, w: { build: 0.9, fish: 1.6, gather: 0.9, mine: 0.7, hunt: 0.8 } },
  { name: 'Celina', role: 'Zbieraczka', color: 0x2ecc71, w: { build: 1.0, fish: 0.8, gather: 1.5, mine: 0.7, hunt: 0.9 } },
  { name: 'Dawid', role: 'Górnik', color: 0xf1c40f, w: { build: 1.2, fish: 0.8, gather: 0.9, mine: 1.7, hunt: 0.8 } },
  { name: 'Ewa', role: 'Myśliwa', color: 0x9b59b6, w: { build: 1.0, fish: 0.9, gather: 0.9, mine: 0.8, hunt: 1.7 } },
  { name: 'Filip', role: 'Wszechstronny', color: 0xe67e22, w: { build: 1.1, fish: 1.1, gather: 1.1, mine: 1.1, hunt: 1.1 } },
];

export const FOOD = {
  berries: { val: 12, name: 'jagody' },
  rawFish: { val: 16, name: 'surowa ryba' },
  cookedFish: { val: 38, name: 'pieczona ryba' },
  rawMeat: { val: 20, name: 'surowe mięso' },
  cookedMeat: { val: 45, name: 'pieczone mięso' },
};

// przepisy rzemieślnicze
export const RECIPES = {
  planks: { logs: 1 },                        // toporkiem: 1 kłoda → 2 deski
  rope: { seaweed: 2 },                       // 2 wodorosty → 1 lina
  rod: { sticks: 2, rope: 1 },                // wędka
  spear: { sticks: 2, stone: 1, rope: 1 },    // włócznia
  campfire: { sticks: 3, logs: 1, flint: 1 }, // ognisko: drewno na opał i krzemień, którym krzesze się iskrę
  shelter: { logs: 2, planks: 4, rope: 2 },   // szałas
  ironTool: { iron: 2, sticks: 1 },           // żelazne narzędzie (przy ognisku)
  tent: { sticks: 4, leaves: 6 },             // namiot: lekki dach
  workbench: { logs: 2, planks: 3 },          // stół rzemieślniczy
  grill: { sticks: 3, stone: 2 },             // ruszt (zakłada się na palące się ognisko)
  bed: { planks: 3, sticks: 2, leaves: 4 },   // łóżko (tylko przy stole rzemieślniczym)
  clothes: { leaves: 6, rope: 2 },            // ubranie z liści (tylko przy stole)
  sword: { iron: 2, planks: 1 },              // żelazny miecz (wykuwany przy ogniu)
  shield: { planks: 3, rope: 1 },             // drewniana tarcza (tylko przy stole)
  chest: { planks: 4, sticks: 2 },            // skrzynia na zapasy (trzyma też jedzenie)
  torch: { sticks: 1, leaves: 2, rope: 1 },   // pochodnia (odkrywana przy ogniu, zapala się od ogniska)
  knife: { stone: 2, rope: 1 },               // nóż kamienny: skórowanie, strugane rzeczy
  hoe: { planks: 1, stone: 2, rope: 1 },      // motyka: przygotowanie ziemi pod sadzenie
  bowl: { planks: 1 },                        // drewniana miska (wydrążona nożem), można w niej nosić wodę
  bow: { logs: 1, rope: 1 },                  // łuk (wystrugany nożem z kłody)
  arrows: { sticks: 1, feathers: 1, stone: 1 }, // 4 strzały z lotkami z piór
  leather: { hide: 2, rope: 1 },              // ubranie ze skóry dzika (przy stole), cieplejsze niż z liści
  pot: { clay: 3 },
  shovel: { planks: 1, sticks: 1, stone: 1 }, // łopata: ubija drogi i wyrywa pnie                           // gliniana doniczka wypalona w ognisku: naczynie na wodę i na ziemię z nasionami
};
// receptury, do których trzeba mieć nóż (strugane albo drążone)
export const KNIFE_RECIPES = new Set(['bowl', 'bow']);
// receptury, które da się odkryć i zrobić tylko w określonym miejscu
export const FIRE_RECIPES = new Set(['ironTool', 'grill', 'sword', 'torch', 'pot']);
export const BENCH_RECIPES = new Set(['bed', 'clothes', 'shield', 'leather']);
export const FIRE_FUEL = { max: 150, start: 100, burn: 0.5, logs: 60, sticks: 25, leaves: 8 }; // paliwo ogniska (s palenia)

export const RECIPE_NAMES = {
  planks: 'deski', rope: 'lina', rod: 'wędka', spear: 'włócznia', campfire: 'ognisko', shelter: 'szałas', ironTool: 'żelazne narzędzia',
  tent: 'namiot', workbench: 'stół rzemieślniczy', grill: 'ruszt', bed: 'łóżko', clothes: 'ubranie z liści', sword: 'miecz', shield: 'tarcza', chest: 'skrzynia', torch: 'pochodnia',
  knife: 'nóż kamienny', hoe: 'motyka', bowl: 'drewniana miska', bow: 'łuk', arrows: 'strzały', leather: 'ubranie ze skóry', pot: 'gliniana doniczka', shovel: 'łopata',
};
// miejsca na zapasy: kupka na ziemi i skrzynia
export const STORES = new Set(['stash', 'chest']);
export const MATS = ['logs', 'sticks', 'leaves', 'planks', 'seaweed', 'rope', 'stone', 'iron', 'feathers', 'hide', 'clay', 'flint'];
export const MAT_NAMES = { logs: 'kłody', sticks: 'gałęzie', leaves: 'liście', planks: 'deski', seaweed: 'wodorosty', rope: 'lina', stone: 'kamień', iron: 'ruda', feathers: 'pióra', hide: 'skóra', clay: 'glina', flint: 'krzemień' };
export const comboKey = (types) => [...types].sort().join('+');
// zestawy materiałów, które przy ogniu dają coś innego niż bez ognia
export const FIRE_COMBOS = new Set([...FIRE_RECIPES].map((r) => comboKey(Object.keys(RECIPES[r]))));
export const TORCH = { burn: 70, light: 0.5, night: 0.25 }; // pochodnia: s palenia; zasięg wzroku w nocy z pochodnią i bez (część dziennego)
// tryb „wie wszystko”: fakty, które w trybie odkrywania postać musi sama sprawdzić
export const WORLD_FACTS = 'Znasz ten świat: ogień krzesze się krzemieniem (leży na plażach) i bez niego nie rozpalisz ogniska, przy ognisku i pod dachem (szałas, namiot, deski nad głową i ściany wokół) jest cieplej, w łóżku lepiej się śpi, '
  + 'morska woda nie gasi pragnienia (pij ze stawu), surowe mięso i ryba mogą zaszkodzić (lepiej upiec), dziki atakują (miecz, włócznia, tarcza pomagają), '
  + 'pochodnię zapala się od ogniska, a w nocy z nią widać dalej, nożem skóruje się upolowanego dzika (mięso i skóra), z ptaków są mięso i pióra, '
  + 'w jagodach są nasiona: motyką przygotowuje się ziemię i sadzi je, a po ok. półtorej doby wyrasta krzak z jagodami, miskę można napełnić wodą ze stawu i pić z niej z dala od wody, łuk ze strzałami poluje z daleka, '
  + 'podlana roślina rośnie szybciej (sucha grządka rośnie wolno, a doniczka bez wody wcale), dziko rośnie żyto: jego ziarno to nasiona, '
  + 'z kwiatów są nasiona kwiatów, a zerwane kwiaty cieszą, brzeg stawu jest gliniasty: glina wypalona w ognisku daje doniczkę, '
  + 'do doniczki albo miski nasypuje się ziemi i sadzi nasiona, a doniczką, tak jak miską, można też nosić wodę, '
  + 'łopatą ubija się drogę: po drodze chodzi się o połowę szybciej, a pień ściętego drzewa można wyrwać kilofem albo łopatą (zostaje kawałek drewna, ale drzewo już nie odrośnie).';
export const recipeList = () => Object.entries(RECIPES).map(([r, c]) => `${RECIPE_NAMES[r]} (${Object.entries(c).map(([k, n]) => `${MAT_NAMES[k]} ×${n}`).join(' + ')}${FIRE_RECIPES.has(r) ? ', przy ogniu' : BENCH_RECIPES.has(r) ? ', przy stole' : KNIFE_RECIPES.has(r) ? ', nożem' : ''})`).join('; ');
export const RECIPE_BY_COMBO = new Map(Object.entries(RECIPES).map(([k, r]) => [comboKey(Object.keys(r)), k]));
export const KIND_NAMES = { tree: 'drzewo', palm: 'palmę', rock: 'skałę', bush: 'krzak', seaweed: 'wodorosty', mine: 'kopalnię', rye: 'żyto', flower: 'kwiaty', flint: 'krzemienie' };

export const ITEM_LABELS = {
  logs: '🪵 Kłody', sticks: '🥢 Gałęzie', leaves: '🍃 Liście', planks: '🟫 Deski', seaweed: '🌿 Wodorosty', rope: '🪢 Lina',
  stone: '🪨 Kamień', iron: '⛏️ Ruda żelaza', feathers: '🪶 Pióra', hide: '🟤 Skóra', clay: '🧱 Glina', flint: '🔸 Krzemień',
  seeds: '🌱 Nasiona jagód', grain: '🌾 Ziarno żyta', flowerSeeds: '🌱 Nasiona kwiatów', flowers: '🌼 Kwiaty', arrows: '🏹 Strzały', bowl: '🥣 Miska', waterBowl: '🥣 Miska z wodą', pot: '🏺 Doniczka', waterPot: '🏺 Doniczka z wodą',
  torch: '🔥 Pochodnia', berries: '🫐 Jagody', rawFish: '🐟 Ryba', cookedFish: '🍣 Piecz. ryba', rawMeat: '🍗 Mięso', cookedMeat: '🍖 Piecz. mięso',
};
export const TOOL_LABELS = {
  axe: '🪓 Siekiera', pickaxe: '⛏️ Kilof', rod: '🎣 Wędka', spear: '🔱 Włócznia', ironAxe: '🪓 Żel. siekiera', ironPick: '⛏️ Żel. kilof', clothes: '👕 Ubranie z liści', sword: '🗡️ Miecz', shield: '🛡️ Tarcza',
  knife: '🔪 Nóż kamienny', hoe: '⛏️ Motyka', bow: '🏹 Łuk', leather: '🧥 Ubranie ze skóry', shovel: '🪏 Łopata',
};

export const SPEED = 1.9; // kafelki / s
export const ROAD_SPEED = 1.5; // po drodze o połowę szybciej
// pole widzenia: im dalej, tym węższy stożek
export const VIEW_RANGE = 18;
export const VIEW_NEAR = 2.5; // tuż obok widzi dookoła
export function viewHalfAngle(d) { return d <= VIEW_NEAR ? Math.PI : Math.max(0.12, 1.25 * (1 - d / VIEW_RANGE)); }
export const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const INV_CAP = 30;    // ile rzeczy mieści plecak
export const MAX_WEIGHT = 25; // ile kg da się nieść
// waga jednej sztuki (kg)
export const WEIGHT = {
  logs: 3, sticks: 0.5, leaves: 0.1, planks: 1.5, seaweed: 0.3, rope: 0.4, stone: 2, iron: 3,
  feathers: 0.05, hide: 1.5, seeds: 0.02, arrows: 0.1, bowl: 0.4, waterBowl: 1.2,
  clay: 1.5, flint: 0.3, grain: 0.02, flowerSeeds: 0.02, flowers: 0.05, pot: 0.8, waterPot: 1.6,
  torch: 0.4, berries: 0.1, rawFish: 0.6, cookedFish: 0.5, rawMeat: 0.8, cookedMeat: 0.7,
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// pole uprawne: ile trwa wzrost (s), ile jagód daje i ile nasion wraca
// water: jak długo (s) ziemia trzyma wodę po podlaniu; dry: tempo wzrostu suchej grządki (doniczka bez wody nie rośnie wcale)
export const FARM = { grow: 270, berries: 6, seeds: 2, seedChance: 0.35, water: 220, dry: 0.35 };
// rośliny do sadzenia: czym się sieje i co daje zbiór (z grządki; doniczka daje mniej więcej połowę)
export const CROPS = {
  berry: { seed: 'seeds', name: 'krzak jagód', yield: { berries: 6, seeds: 2 }, pot: { berries: 3, seeds: 1 } },
  rye: { seed: 'grain', name: 'żyto', yield: { grain: 8 }, pot: { grain: 4 } },
  flower: { seed: 'flowerSeeds', name: 'kwiaty', yield: { flowers: 3, flowerSeeds: 2 }, pot: { flowers: 2, flowerSeeds: 1 } },
};
// naczynia na wodę: puste → z wodą
export const VESSELS = [['bowl', 'waterBowl'], ['pot', 'waterPot']];
// ile drobiazgów postać trzyma najwyżej
export const POCKET_CAP = { seeds: 12, grain: 20, flowerSeeds: 12, flowers: 8 };
