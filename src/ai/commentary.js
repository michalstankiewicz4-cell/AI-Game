// Komentarze na żywo: myśli agentów (dymki) i narrator - generowane lokalnie z szablonów.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fill = (s, ctx) => s.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] !== undefined ? ctx[k] : ''));

// myśli przy wyborze nowego zadania (klucz = etykieta decyzji)
const THOUGHTS = {
  '💧 Pić wodę': ['Zaschło mi w gardle, idę do stawu.', 'Woda, potrzebuję wody...', 'Łyk słodkiej wody i wracam do roboty.', 'Morskiej nie wypiję, idę do źródła.'],
  '🍽️ Zjeść': ['Czas coś przekąsić.', 'Burczy mi w brzuchu, jem zapasy.', 'Mam coś w plecaku, zjem teraz.'],
  '🫐 Zbierać jagody': ['Widzę krzak z jagodami, biorę!', 'Jagody to nie stek, ale zawsze coś.', 'Pozbieram trochę jagód na zapas.'],
  '🎣 Łowić ryby': ['Czas na ryby. Przy brzegu coś pływa!', 'Zarzucam wędkę, cierpliwość to klucz.', 'Ryba na kolację? Brzmi dobrze.'],
  '🔱 Polować na ptaka': ['Ptak wylądował... cicho, cichutko...', 'Mam włócznię i mam plan.', 'Ten ptak będzie moim obiadem.'],
  '😴 Spać': ['Padam z nóg, muszę się przespać.', 'Noc. Kładę się, jutro dalej.', 'Kilka godzin snu i będę jak nowy.'],
  '🔥 Upiec jedzenie': ['Upiekę to przy ognisku, surowe nie smakuje.', 'Pieczone daje dwa razy więcej sił!'],
  '🎣 Zrobić wędkę': ['Mam drewno, zrobię wędkę.', 'Z kijem i sznurkiem z łyka będzie wędka.'],
  '🔱 Zrobić włócznię': ['Drewno plus ostry kamień to włócznia.', 'Czas na broń do polowania.'],
  '🔥 Rozpalić ognisko': ['Potrzebujemy ognia. Rozpalam ognisko!', 'Bez ognia nocą będzie ciężko.'],
  '🛖 Zbudować szałas': ['Czas na dach nad głową.', 'Szałas da lepszy sen. Buduję!'],
  '⛏️ Wykuć żelazny kilof': ['Mam rudę, wykuję żelazny kilof!', 'Epoka kamienia dobiega końca.'],
  '🪓 Wykuć żelazną siekierę': ['Żelazna siekiera przyspieszy robotę.'],
  '🪓 Ścinać drzewo': ['Potrzebuję drewna, idę na drzewo.', 'Drzewo, wybacz... potrzebuję cię.', 'Drewno nigdy się nie zmarnuje.'],
  '🪚 Ciosać deski': ['Toporkiem z kłody zrobię deski.', 'Ciosam deski, przydadzą się na most.'],
  '🪢 Skręcić linę': ['Z wodorostów skręcę linę.', 'Lina z wodorostów, prymitywnie, ale trzyma.'],
  '🌿 Zbierać wodorosty': ['Przy brzegu rosną wodorosty, zrobię z nich linę.', 'Wodorosty! Idealne na linę.'],
  '👀 Rozejrzeć się': ['Rozejrzę się dookoła.', 'Hmm, co tu mamy w okolicy?', 'Muszę sprawdzić, co się zmieniło.'],
  '🧭 Zbadać okolicę': ['Nie wiem, co jest dalej. Idę zbadać teren.', 'Pora na zwiad.', 'Gdzieś tu musi być woda...'],
  '🪨 Zbierać kamienie': ['Przyda się kilka kamieni.', 'Kamień na narzędzia, idę do skały.'],
  '🌉 Budować most': ['Zanoszę deski i linę na most. Tamta wyspa czeka!', 'Most sam się nie zbuduje.', 'Jeszcze kilka desek i przejdziemy na drugą stronę.'],
  '🌉 Pomóc przy moście': ['Przy moście leżą deski, pomogę.', 'Idę przybijać deski.'],
  '⛏️ Kopać w kopalni': ['Do kopalni! Może trafię na żelazo.', 'Głębiej i głębiej...', 'Kilof w dłoń, idę kopać.'],
  '🚶 Pospacerować': ['Przejdę się trochę.', 'Hmm, co by tu zrobić...'],
  '💬 Porozmawiać': ['Pogadam z kimś, może wie coś, czego ja nie wiem.', 'Idę się dowiedzieć, co nowego.'],
  '🧪 Eksperymentować': ['Spróbuję połączyć to, co mam...', 'Ciekawe, co z tego wyjdzie.', 'Czas na eksperyment!'],
  '🌊 Napić się z morza': ['Tyle wody dookoła... może da się ją pić?', 'Nie znam żadnego źródła, spróbuję morskiej.'],
  '🪑 Odpocząć': ['Chwila odpoczynku.', 'Usiądę na moment.'],
};

const URGENT = {
  thirst: ['Umieram z pragnienia!', 'Woda... natychmiast!'],
  hunger: ['Jeśli zaraz czegoś nie zjem, to po mnie...', 'Głód mnie wykańcza!'],
  energy: ['Nie dam rady dłużej... muszę spać.'],
};

const EVENTS = {
  fish: ['Mam ją! 🐟', 'Złowione! Kolacja zapewniona.', 'Ale sztuka!'],
  firstFish: ['Moja pierwsza ryba! 🐟', 'Jest! Pierwsza ryba złowiona!'],
  bird: ['Trafiony! 🐦', 'Mam go! Będzie pieczeń.'],
  birdMiss: ['Uciekł mi! Następnym razem...', 'Ehh, spłoszyłem go.', 'Za wolno...'],
  noFish: ['Nic nie bierze... spróbuję później.', 'Ryby dziś nie współpracują.'],
  craft: ['Gotowe: {item}!', 'Zrobione! Mam {item}.'],
  campfire: ['Ogień płonie! 🔥', 'Jest ognisko, będzie ciepło.'],
  shelter: ['Szałas stoi! 🛖'],
  bridge: ['Kolejna deska na miejscu!', 'Most rośnie! {built}/{total}', 'Jeszcze trochę...'],
  bridgeDone: ['Most gotowy! Idziemy na drugą wyspę! 🌉', 'Udało się! Mamy most!'],
  iron: ['Żelazo! Trafiłem na rudę! ⛏️', 'Błysk w skale... to ruda żelaza!'],
  newIsland: ['Nowa wyspa! Ciekawe co tu jest.', 'Stąpam po nowym lądzie!', 'Tu jest więcej jagód niż u nas!'],
  death: ['Nie... {name} nie przeżył(a).', '{name}... odpoczywaj w pokoju.', 'Straciliśmy {name}. Musimy uważać.'],
  night: ['Robi się ciemno...', 'Noc nadchodzi, trzeba się zbierać.'],
  morning: ['Dzień dobry, wyspo!', 'Nowy dzień, nowe szanse.'],
  forge: ['Żelazne narzędzie w ręku! ⚒️'],
  discover: ['Eureka! Wiem, jak zrobić: {what}!', 'Udało się! Tak powstaje {what}!', 'Hej, z tego wychodzi {what}! 💡'],
  expFail: ['{what}... nic z tego nie wyszło.', 'Hmm, {what} to chyba ślepa uliczka.', 'Nie, {what} to nie to.'],
  tasteGood: ['Mmm, {food} jest jadalne!', 'Smakuje! {food} nadaje się do jedzenia.'],
  stomach: ['Auć, brzuch mnie boli... trzeba było to upiec.', 'Ugh, surowe mi zaszkodziło.'],
  saltWater: ['Bleh! Słone! Morskiej wody nie da się pić.', 'Fuj, od tej wody tylko bardziej chce się pić.'],
  bridgeIdea: ['A gdyby tak z desek i liny zbudować most?', 'Mam pomysł! Most na drugą wyspę!'],
};

export function thought(label) { return THOUGHTS[label] ? pick(THOUGHTS[label]) : null; }
export function urgent(kind) { return pick(URGENT[kind]); }
export function eventLine(key, ctx = {}) { return EVENTS[key] ? fill(pick(EVENTS[key]), ctx) : null; }

// ---------- narrator ----------
export class Narrator {
  constructor(world) {
    this.world = world;
    this.timer = 12;
    this.lastNight = world.isNight();
  }
  update(dt, emit) {
    const w = this.world;
    const alive = w.agents.filter((a) => a.alive);
    if (!alive.length) return;
    // zmiana pory dnia
    const night = w.isNight();
    if (night !== this.lastNight) {
      this.lastNight = night;
      emit(night ? `🌙 Zapada noc ${w.day()}. dnia. ${alive.length} ${alive.length === 1 ? 'ocalały szuka' : 'ocalałych szuka'} schronienia.` :
        `☀️ Świt ${w.day()}. dnia! Wyspa budzi się do życia.`);
      const a = pick(alive);
      a.speak(eventLine(night ? 'night' : 'morning'));
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 22 + Math.random() * 14;
    const lines = [];
    // dramaturgia: ktoś w złym stanie
    const weak = alive.filter((a) => a.health < 45).sort((a, b) => a.health - b.health)[0];
    if (weak) lines.push(pick([`⚠️ ${weak.name} jest w poważnych tarapatach, zdrowie ${Math.round(weak.health)}%!`, `⚠️ Zrobiło się nerwowo: ${weak.name} ledwo się trzyma!`]));
    const { built, total } = w.bridgeTotals();
    if (total > 0 && built > 0 && built < total) lines.push(pick([`🌉 Mosty: ${built}/${total} segmentów. Do brzegu coraz bliżej!`, `🌉 Budowa idzie: ${Math.round(built / total * 100)}% gotowe.`]));
    const fisher = [...alive].sort((a, b) => b.stats.fish - a.stats.fish)[0];
    if (fisher && fisher.stats.fish >= 2) lines.push(`🎣 ${fisher.name} jest królem łowiska: ${fisher.stats.fish} ryb.`);
    const builder = [...alive].sort((a, b) => b.stats.bridge - a.stats.bridge)[0];
    if (builder && builder.stats.bridge >= 6) lines.push(`🔨 ${builder.name} wniósł(a) już ${builder.stats.bridge} drewna do budowy mostów.`);
    const busy = pick(alive);
    if (busy.task) lines.push(`👀 Tymczasem ${busy.name}: ${busy.task.label.toLowerCase()}.`);
    const days = w.day();
    if (days >= 2) lines.push(pick([`⏱️ Dzień ${days}. Na wyspie ${alive.length}/${w.agents.length} żywych.`, `⏱️ Mija ${days}. dzień przetrwania.`]));
    if (lines.length) emit(pick(lines));
  }
}
