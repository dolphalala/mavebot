import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DEFAULT_STORE_PATH = '/shared/pictionary-leaderboard.json';
export const DEFAULT_PICTIONARY_ROUNDS = 5;
export const DEFAULT_PICTIONARY_ROUND_SECONDS = 45;
export const MIN_PICTIONARY_ROUNDS = 3;
export const MAX_PICTIONARY_ROUNDS = 10;
export const MIN_PICTIONARY_ROUND_SECONDS = 15;
export const MAX_PICTIONARY_ROUND_SECONDS = 90;

let storeQueue = Promise.resolve();

function withStoreLock(task) {
  const run = storeQueue.then(task, task);
  storeQueue = run.catch(() => {});
  return run;
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString();
}

function emptyStore() {
  return {
    version: 1,
    guilds: {}
  };
}

function emptyGuild() {
  return {
    players: {},
    games: []
  };
}

function ensureGuild(store, guildId) {
  const guild = {
    ...emptyGuild(),
    ...(store.guilds[guildId] || {})
  };
  guild.players = guild.players && typeof guild.players === 'object' ? guild.players : {};
  guild.games = Array.isArray(guild.games) ? guild.games : [];
  store.guilds[guildId] = guild;
  return guild;
}

function userSnapshot(user) {
  return {
    id: user.id,
    tag: user.tag || user.username || user.id,
    username: user.username || user.globalName || user.tag || user.id,
    displayName: user.displayName || user.globalName || user.username || user.tag || user.id
  };
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clampInteger(value, { min, max, fallback }) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function normalizePictionaryRounds(value) {
  return clampInteger(value, {
    min: MIN_PICTIONARY_ROUNDS,
    max: MAX_PICTIONARY_ROUNDS,
    fallback: DEFAULT_PICTIONARY_ROUNDS
  });
}

export function normalizePictionaryRoundSeconds(value) {
  return clampInteger(value, {
    min: MIN_PICTIONARY_ROUND_SECONDS,
    max: MAX_PICTIONARY_ROUND_SECONDS,
    fallback: DEFAULT_PICTIONARY_ROUND_SECONDS
  });
}

export function pictionaryStorePath() {
  return process.env.PICTIONARY_STORE_PATH || DEFAULT_STORE_PATH;
}

export async function readPictionaryStore(filePath = pictionaryStorePath()) {
  let content = '';
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return emptyStore();
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(content);
    return {
      ...emptyStore(),
      ...parsed,
      guilds: parsed?.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {}
    };
  } catch {
    await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => {});
    return emptyStore();
  }
}

export async function writePictionaryStore(store, filePath = pictionaryStorePath()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await rename(tempPath, filePath);
}

export const PICTIONARY_TOPICS = [
  {
    id: 'barbarian',
    answer: 'Barbarian',
    aliases: ['barb'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#f2b84b',
    clues: ['yellow hair', 'sword swarm', 'first barracks face']
  },
  {
    id: 'archer',
    answer: 'Archer',
    aliases: ['archers'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#f06292',
    clues: ['pink hair', 'long range', 'green hood']
  },
  {
    id: 'giant',
    answer: 'Giant',
    aliases: ['giants'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#d9a066',
    clues: ['huge fists', 'targets defenses', 'slow tank']
  },
  {
    id: 'wall-breaker',
    answer: 'Wall Breaker',
    aliases: ['wallbreaker', 'wb'],
    category: 'Home Village Troops',
    shape: 'trap',
    accent: '#f7f2d4',
    clues: ['bomb runner', 'loves walls', 'tiny skeleton']
  },
  {
    id: 'balloon',
    answer: 'Balloon',
    aliases: ['loons', 'loon'],
    category: 'Home Village Troops',
    shape: 'air',
    accent: '#da5d55',
    clues: ['flies slowly', 'drops bombs', 'defense hunter']
  },
  {
    id: 'wizard',
    answer: 'Wizard',
    aliases: ['wiz'],
    category: 'Home Village Troops',
    shape: 'spell',
    accent: '#4fc3f7',
    clues: ['blue fire', 'glass cannon', 'hooded magic']
  },
  {
    id: 'healer',
    answer: 'Healer',
    aliases: ['healers'],
    category: 'Home Village Troops',
    shape: 'air',
    accent: '#f6d5ff',
    clues: ['white wings', 'keeps heroes alive', 'no damage']
  },
  {
    id: 'dragon',
    answer: 'Dragon',
    aliases: ['drag'],
    category: 'Home Village Troops',
    shape: 'air',
    accent: '#66d17a',
    clues: ['green wings', 'fire breath', 'classic air army']
  },
  {
    id: 'pekka',
    answer: 'P.E.K.K.A',
    aliases: ['pekka', 'p e k k a'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#7e6bff',
    clues: ['purple armor', 'butterfly meme', 'massive sword']
  },
  {
    id: 'hog-rider',
    answer: 'Hog Rider',
    aliases: ['hog', 'hogs'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#8b5a2b',
    clues: ['jumps walls', 'hammer rider', 'defense targeter']
  },
  {
    id: 'miner',
    answer: 'Miner',
    aliases: ['miners'],
    category: 'Home Village Troops',
    shape: 'resource',
    accent: '#f7c948',
    clues: ['underground path', 'shovel', 'dodges splash']
  },
  {
    id: 'electro-dragon',
    answer: 'Electro Dragon',
    aliases: ['edrag', 'e drag', 'electrodrag'],
    category: 'Home Village Troops',
    shape: 'air',
    accent: '#65e4ff',
    clues: ['chain lightning', 'big blue wings', 'slow zap']
  },
  {
    id: 'root-rider',
    answer: 'Root Rider',
    aliases: ['root', 'rr'],
    category: 'Home Village Troops',
    shape: 'troop',
    accent: '#7bd88f',
    clues: ['wall smashing roots', 'rides vines', 'green charge']
  },
  {
    id: 'barbarian-king',
    answer: 'Barbarian King',
    aliases: ['king', 'bk'],
    category: 'Heroes',
    shape: 'hero',
    accent: '#f0b13b',
    clues: ['iron fist', 'ground king', 'altar crown']
  },
  {
    id: 'archer-queen',
    answer: 'Archer Queen',
    aliases: ['queen', 'aq'],
    category: 'Heroes',
    shape: 'hero',
    accent: '#ff7bac',
    clues: ['royal cloak', 'long range hero', 'queen walk']
  },
  {
    id: 'grand-warden',
    answer: 'Grand Warden',
    aliases: ['warden', 'gw'],
    category: 'Heroes',
    shape: 'hero',
    accent: '#9ad7ff',
    clues: ['eternal tome', 'support aura', 'air or ground']
  },
  {
    id: 'royal-champion',
    answer: 'Royal Champion',
    aliases: ['champion', 'rc'],
    category: 'Heroes',
    shape: 'hero',
    accent: '#67d5a5',
    clues: ['seeking shield', 'defense hunter', 'spear hero']
  },
  {
    id: 'rage-spell',
    answer: 'Rage Spell',
    aliases: ['rage'],
    category: 'Spells',
    shape: 'spell',
    accent: '#c56cff',
    clues: ['purple circle', 'speed and damage', 'core push']
  },
  {
    id: 'heal-spell',
    answer: 'Heal Spell',
    aliases: ['heal'],
    category: 'Spells',
    shape: 'spell',
    accent: '#ffd166',
    clues: ['golden ring', 'keeps troops up', 'green plus']
  },
  {
    id: 'freeze-spell',
    answer: 'Freeze Spell',
    aliases: ['freeze'],
    category: 'Spells',
    shape: 'spell',
    accent: '#7ee7ff',
    clues: ['ice burst', 'stops defenses', 'blue bottle']
  },
  {
    id: 'jump-spell',
    answer: 'Jump Spell',
    aliases: ['jump'],
    category: 'Spells',
    shape: 'spell',
    accent: '#54d66d',
    clues: ['green path', 'over walls', 'funnel doorway']
  },
  {
    id: 'invisibility-spell',
    answer: 'Invisibility Spell',
    aliases: ['invis', 'invisibility'],
    category: 'Spells',
    shape: 'spell',
    accent: '#5ce0d8',
    clues: ['vanishing tile', 'sneaky core', 'see-through troops']
  },
  {
    id: 'recall-spell',
    answer: 'Recall Spell',
    aliases: ['recall'],
    category: 'Spells',
    shape: 'spell',
    accent: '#5aa7ff',
    clues: ['pulls army back', 'blue portal', 'second drop']
  },
  {
    id: 'cannon',
    answer: 'Cannon',
    aliases: ['cannons'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#8f9aa8',
    clues: ['ground only', 'first defense', 'metal barrel']
  },
  {
    id: 'archer-tower',
    answer: 'Archer Tower',
    aliases: ['at'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#c78542',
    clues: ['wood platform', 'air and ground', 'single target']
  },
  {
    id: 'mortar',
    answer: 'Mortar',
    aliases: ['mortars'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#6e7480',
    clues: ['dead zone', 'lobbed shells', 'splash pit']
  },
  {
    id: 'x-bow',
    answer: 'X-Bow',
    aliases: ['xbow', 'x bow'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#a06a43',
    clues: ['loaded with elixir', 'ground or air', 'rapid bolts']
  },
  {
    id: 'inferno-tower',
    answer: 'Inferno Tower',
    aliases: ['inferno'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#ff6b35',
    clues: ['single or multi', 'melts tanks', 'hot beam']
  },
  {
    id: 'eagle-artillery',
    answer: 'Eagle Artillery',
    aliases: ['eagle'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#ffd166',
    clues: ['map-wide shots', 'wakes up late', 'giant eagle head']
  },
  {
    id: 'scattershot',
    answer: 'Scattershot',
    aliases: ['scatter'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#b0d565',
    clues: ['throws chunks', 'splash arcs', 'core menace']
  },
  {
    id: 'spell-tower',
    answer: 'Spell Tower',
    aliases: ['spelltower'],
    category: 'Defenses',
    shape: 'defense',
    accent: '#b088ff',
    clues: ['rage poison invis', 'defensive spell', 'tower bottle']
  },
  {
    id: 'town-hall',
    answer: 'Town Hall',
    aliases: ['th'],
    category: 'Buildings',
    shape: 'building',
    accent: '#4fc3f7',
    clues: ['main base heart', 'stars depend on it', 'weapon at high levels']
  },
  {
    id: 'clan-castle',
    answer: 'Clan Castle',
    aliases: ['cc'],
    category: 'Buildings',
    shape: 'building',
    accent: '#e0c97f',
    clues: ['donation home', 'war troops hide here', 'clan banner']
  },
  {
    id: 'army-camp',
    answer: 'Army Camp',
    aliases: ['camp'],
    category: 'Buildings',
    shape: 'building',
    accent: '#7bd88f',
    clues: ['troop housing', 'campfire', 'army capacity']
  },
  {
    id: 'laboratory',
    answer: 'Laboratory',
    aliases: ['lab'],
    category: 'Buildings',
    shape: 'building',
    accent: '#b088ff',
    clues: ['upgrade troops', 'purple roof', 'research timer']
  },
  {
    id: 'blacksmith',
    answer: 'Blacksmith',
    aliases: ['smith'],
    category: 'Buildings',
    shape: 'building',
    accent: '#ff8fab',
    clues: ['hero equipment', 'ores', 'hammer shop']
  },
  {
    id: 'gold-storage',
    answer: 'Gold Storage',
    aliases: ['gold storages'],
    category: 'Resources',
    shape: 'resource',
    accent: '#ffd166',
    clues: ['yellow vault', 'wall upgrades', 'raid loot']
  },
  {
    id: 'elixir-storage',
    answer: 'Elixir Storage',
    aliases: ['elixir storages'],
    category: 'Resources',
    shape: 'resource',
    accent: '#d76dff',
    clues: ['pink tank', 'troop upgrades', 'round reservoir']
  },
  {
    id: 'dark-elixir-storage',
    answer: 'Dark Elixir Storage',
    aliases: ['dark storage', 'de storage'],
    category: 'Resources',
    shape: 'resource',
    accent: '#30233d',
    clues: ['black drill fuel', 'heroes crave it', 'rare loot']
  },
  {
    id: 'builder-hut',
    answer: 'Builder Hut',
    aliases: ['builder', 'builders hut'],
    category: 'Buildings',
    shape: 'building',
    accent: '#f0b13b',
    clues: ['sleeping worker', 'tiny hut', 'repair surprise']
  },
  {
    id: 'seeking-air-mine',
    answer: 'Seeking Air Mine',
    aliases: ['sam', 'black air mine'],
    category: 'Traps',
    shape: 'trap',
    accent: '#2d2d36',
    clues: ['black balloon popper', 'air only', 'one huge hit']
  },
  {
    id: 'spring-trap',
    answer: 'Spring Trap',
    aliases: ['spring'],
    category: 'Traps',
    shape: 'trap',
    accent: '#9ec7a2',
    clues: ['flings troops', 'gap surprise', 'ground only']
  },
  {
    id: 'giant-bomb',
    answer: 'Giant Bomb',
    aliases: ['gb'],
    category: 'Traps',
    shape: 'trap',
    accent: '#e55b3c',
    clues: ['big red boom', 'splash trap', 'hog nightmare']
  },
  {
    id: 'battle-blimp',
    answer: 'Battle Blimp',
    aliases: ['blimp'],
    category: 'Siege Machines',
    shape: 'siege',
    accent: '#c65d4b',
    clues: ['flies to town hall', 'blimp bomb', 'clone bomb delivery']
  },
  {
    id: 'wall-wrecker',
    answer: 'Wall Wrecker',
    aliases: ['ww'],
    category: 'Siege Machines',
    shape: 'siege',
    accent: '#8a5a44',
    clues: ['straight line ram', 'breaks walls', 'ground siege']
  },
  {
    id: 'flame-flinger',
    answer: 'Flame Flinger',
    aliases: ['flinger', 'ff'],
    category: 'Siege Machines',
    shape: 'siege',
    accent: '#ff8a3d',
    clues: ['long range fire', 'stays outside', 'catapult flames']
  },
  {
    id: 'log-launcher',
    answer: 'Log Launcher',
    aliases: ['logs', 'll'],
    category: 'Siege Machines',
    shape: 'siege',
    accent: '#a66a3f',
    clues: ['rolling logs', 'opens compartments', 'straight lane']
  },
  {
    id: 'unicorn',
    answer: 'Unicorn',
    aliases: ['uni'],
    category: 'Hero Pets',
    shape: 'pet',
    accent: '#f6d5ff',
    clues: ['hero healer', 'pink mane', 'queen best friend']
  },
  {
    id: 'phoenix',
    answer: 'Phoenix',
    aliases: ['bird'],
    category: 'Hero Pets',
    shape: 'pet',
    accent: '#ff7043',
    clues: ['revives hero', 'fiery wings', 'last stand']
  },
  {
    id: 'diggy',
    answer: 'Diggy',
    aliases: ['digger'],
    category: 'Hero Pets',
    shape: 'pet',
    accent: '#b88954',
    clues: ['underground pet', 'stuns defenses', 'champion buddy']
  },
  {
    id: 'spirit-fox',
    answer: 'Spirit Fox',
    aliases: ['fox'],
    category: 'Hero Pets',
    shape: 'pet',
    accent: '#9ad7ff',
    clues: ['invisibility pet', 'icy blue spirit', 'sneaky hero']
  },
  {
    id: 'spiky-ball',
    answer: 'Spiky Ball',
    aliases: ['spiky'],
    category: 'Hero Equipment',
    shape: 'equipment',
    accent: '#d9a066',
    clues: ['king throws it', 'bounces buildings', 'round spikes']
  },
  {
    id: 'giant-gauntlet',
    answer: 'Giant Gauntlet',
    aliases: ['gauntlet', 'gg'],
    category: 'Hero Equipment',
    shape: 'equipment',
    accent: '#f0b13b',
    clues: ['king grows huge', 'damage reduction', 'gold fist']
  },
  {
    id: 'frozen-arrow',
    answer: 'Frozen Arrow',
    aliases: ['frozen'],
    category: 'Hero Equipment',
    shape: 'equipment',
    accent: '#7ee7ff',
    clues: ['queen slows targets', 'blue arrow', 'icy shots']
  },
  {
    id: 'eternal-tome',
    answer: 'Eternal Tome',
    aliases: ['tome'],
    category: 'Hero Equipment',
    shape: 'equipment',
    accent: '#f6d365',
    clues: ['warden invincible', 'gold book', 'push button timing']
  },
  {
    id: 'legend-league',
    answer: 'Legend League',
    aliases: ['legends', 'legend'],
    category: 'Leagues',
    shape: 'league',
    accent: '#d45bff',
    clues: ['5000 trophies', 'eight attacks', 'purple shield']
  },
  {
    id: 'builder-base',
    answer: 'Builder Base',
    aliases: ['bb'],
    category: 'Builder Base',
    shape: 'building',
    accent: '#4fc3f7',
    clues: ['night village', 'boat trip', 'two stages']
  },
  {
    id: 'clan-war',
    answer: 'Clan War',
    aliases: ['war', 'cw'],
    category: 'Clan Play',
    shape: 'league',
    accent: '#e74c3c',
    clues: ['two attacks', 'stars decide', 'battle day']
  },
  {
    id: 'raid-weekend',
    answer: 'Raid Weekend',
    aliases: ['capital raid', 'raids'],
    category: 'Clan Capital',
    shape: 'league',
    accent: '#67d5a5',
    clues: ['capital gold', 'districts', 'weekend attacks']
  }
];

export function normalizePictionaryGuess(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isCorrectPictionaryGuess(content, topic) {
  const normalized = normalizePictionaryGuess(content);
  if (!normalized || !topic) {
    return false;
  }

  const answers = [topic.answer, ...(topic.aliases || [])].map(normalizePictionaryGuess);
  return answers.some((answer) => normalized === answer);
}

export function selectPictionaryTopic({
  usedTopicIds = [],
  previousCategory = '',
  random = Math.random
} = {}) {
  const used = new Set(usedTopicIds);
  let pool = PICTIONARY_TOPICS.filter((topic) => !used.has(topic.id));
  if (!pool.length) {
    pool = [...PICTIONARY_TOPICS];
  }

  const varied = pool.filter((topic) => topic.category !== previousCategory);
  if (varied.length) {
    pool = varied;
  }

  const index = Math.floor(random() * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, index))];
}

function shapeSvg(topic) {
  const accent = escapeXml(topic.accent || '#4fc3f7');
  const soft = `${accent}55`;
  if (topic.shape === 'spell') {
    return [
      `<ellipse cx="480" cy="266" rx="118" ry="124" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
      `<path d="M430 178 L530 178 L508 342 Q480 385 452 342 Z" fill="#202636" stroke="#f7f7ff" stroke-width="5"/>`,
      `<path d="M448 228 Q480 202 512 228 L501 318 Q480 342 459 318 Z" fill="${accent}" opacity="0.88"/>`,
      `<circle cx="520" cy="198" r="18" fill="#ffffff" opacity="0.75"/>`
    ].join('');
  }
  if (topic.shape === 'defense') {
    return [
      `<path d="M382 354 H578 L552 216 Q520 178 480 178 Q440 178 408 216 Z" fill="#2f3444" stroke="${accent}" stroke-width="8"/>`,
      `<rect x="424" y="258" width="112" height="72" rx="16" fill="${soft}" stroke="#dfe6f3" stroke-width="4"/>`,
      `<path d="M480 175 L625 115" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`,
      `<circle cx="640" cy="108" r="18" fill="#f4f7fb"/>`,
      `<rect x="386" y="354" width="188" height="34" rx="10" fill="#141923"/>`
    ].join('');
  }
  if (topic.shape === 'building') {
    return [
      `<path d="M360 356 H600 V236 L480 152 L360 236 Z" fill="#31394d" stroke="${accent}" stroke-width="8"/>`,
      `<path d="M338 238 L480 136 L622 238" fill="none" stroke="#f4f7fb" stroke-width="10" stroke-linecap="round"/>`,
      `<rect x="442" y="282" width="76" height="74" rx="10" fill="${soft}" stroke="#e9edf7" stroke-width="4"/>`,
      `<rect x="382" y="250" width="54" height="46" rx="8" fill="#202636"/>`,
      `<rect x="524" y="250" width="54" height="46" rx="8" fill="#202636"/>`
    ].join('');
  }
  if (topic.shape === 'resource') {
    return [
      `<ellipse cx="480" cy="354" rx="150" ry="38" fill="#121722"/>`,
      `<rect x="354" y="196" width="252" height="166" rx="28" fill="#2f3444" stroke="${accent}" stroke-width="8"/>`,
      `<ellipse cx="480" cy="196" rx="126" ry="42" fill="${soft}" stroke="#f4f7fb" stroke-width="5"/>`,
      `<circle cx="480" cy="279" r="50" fill="${accent}" opacity="0.9"/>`,
      `<path d="M452 280 H508 M480 252 V308" stroke="#10141f" stroke-width="10" stroke-linecap="round"/>`
    ].join('');
  }
  if (topic.shape === 'air') {
    return [
      `<path d="M480 166 C548 188 594 238 616 304 C555 292 512 270 480 232 C448 270 405 292 344 304 C366 238 412 188 480 166 Z" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
      `<ellipse cx="480" cy="268" rx="58" ry="86" fill="#30384d" stroke="#f4f7fb" stroke-width="5"/>`,
      `<path d="M452 206 Q480 150 508 206" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>`,
      `<path d="M438 334 Q480 384 522 334" fill="none" stroke="#ffcf5a" stroke-width="8" stroke-linecap="round"/>`
    ].join('');
  }
  if (topic.shape === 'hero') {
    return [
      `<circle cx="480" cy="252" r="92" fill="#30384d" stroke="${accent}" stroke-width="8"/>`,
      `<path d="M396 180 L430 116 L480 172 L530 116 L564 180 Z" fill="${accent}" stroke="#f8f4d8" stroke-width="6"/>`,
      `<rect x="398" y="318" width="164" height="72" rx="26" fill="#1e2533" stroke="#f4f7fb" stroke-width="5"/>`,
      `<circle cx="448" cy="250" r="12" fill="#f4f7fb"/>`,
      `<circle cx="512" cy="250" r="12" fill="#f4f7fb"/>`
    ].join('');
  }
  if (topic.shape === 'siege') {
    return [
      `<rect x="350" y="236" width="260" height="116" rx="28" fill="#30384d" stroke="${accent}" stroke-width="8"/>`,
      `<circle cx="410" cy="366" r="32" fill="#121722" stroke="#f4f7fb" stroke-width="6"/>`,
      `<circle cx="550" cy="366" r="32" fill="#121722" stroke="#f4f7fb" stroke-width="6"/>`,
      `<path d="M386 224 L574 170 L590 222" fill="${soft}" stroke="${accent}" stroke-width="7"/>`,
      `<path d="M610 260 L674 236" stroke="#f4f7fb" stroke-width="14" stroke-linecap="round"/>`
    ].join('');
  }
  if (topic.shape === 'pet') {
    return [
      `<ellipse cx="480" cy="310" rx="116" ry="78" fill="#30384d" stroke="${accent}" stroke-width="8"/>`,
      `<circle cx="430" cy="228" r="56" fill="${soft}" stroke="#f4f7fb" stroke-width="5"/>`,
      `<path d="M392 188 L374 138 L424 166" fill="${accent}"/>`,
      `<path d="M468 188 L492 138 L506 194" fill="${accent}"/>`,
      `<circle cx="414" cy="226" r="8" fill="#f4f7fb"/>`,
      `<circle cx="450" cy="226" r="8" fill="#f4f7fb"/>`
    ].join('');
  }
  if (topic.shape === 'trap') {
    return [
      `<path d="M480 140 L632 384 H328 Z" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
      `<circle cx="480" cy="286" r="70" fill="#1e2533" stroke="#f4f7fb" stroke-width="5"/>`,
      `<path d="M480 212 V290 L530 332" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`,
      `<path d="M398 386 H562" stroke="#10141f" stroke-width="18" stroke-linecap="round"/>`
    ].join('');
  }
  if (topic.shape === 'equipment') {
    return [
      `<circle cx="480" cy="266" r="116" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
      `<path d="M386 332 L556 162" stroke="#f4f7fb" stroke-width="22" stroke-linecap="round"/>`,
      `<path d="M530 136 L596 202" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
      `<path d="M398 294 L452 348" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`,
      `<circle cx="480" cy="266" r="34" fill="#202636" stroke="#f4f7fb" stroke-width="5"/>`
    ].join('');
  }
  if (topic.shape === 'league') {
    return [
      `<path d="M480 132 L610 196 V292 Q610 356 480 404 Q350 356 350 292 V196 Z" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
      `<path d="M480 176 L508 238 L576 244 L526 288 L542 356 L480 322 L418 356 L434 288 L384 244 L452 238 Z" fill="#f6d365" stroke="#fff6b0" stroke-width="4"/>`
    ].join('');
  }
  return [
    `<circle cx="480" cy="260" r="116" fill="${soft}" stroke="${accent}" stroke-width="8"/>`,
    `<rect x="420" y="196" width="120" height="142" rx="38" fill="#30384d" stroke="#f4f7fb" stroke-width="5"/>`,
    `<path d="M392 346 Q480 398 568 346" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>`,
    `<circle cx="450" cy="252" r="12" fill="#f4f7fb"/>`,
    `<circle cx="510" cy="252" r="12" fill="#f4f7fb"/>`
  ].join('');
}

function clueChips(topic) {
  return (topic.clues || []).slice(0, 3).map((clue, index) => {
    const x = 108 + index * 248;
    return [
      `<rect x="${x}" y="438" width="220" height="44" rx="14" fill="#151b27" stroke="${escapeXml(topic.accent)}" stroke-opacity="0.55" stroke-width="2"/>`,
      `<text x="${x + 110}" y="466" text-anchor="middle" fill="#f4f7fb" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800">${escapeXml(clue)}</text>`
    ].join('');
  }).join('');
}

export async function renderPictionaryRoundImage(
  topic,
  { round = 1, totalRounds = DEFAULT_PICTIONARY_ROUNDS, seconds = DEFAULT_PICTIONARY_ROUND_SECONDS } = {}
) {
  const width = 960;
  const height = 540;
  const accent = escapeXml(topic.accent || '#4fc3f7');
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="48%" stop-color="#202636"/>
          <stop offset="100%" stop-color="#151f2e"/>
        </linearGradient>
        <radialGradient id="pulse" cx="50%" cy="48%" r="52%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#pulse)"/>
      <rect x="44" y="38" width="872" height="464" rx="28" fill="#0f1521" opacity="0.68" stroke="#38455f" stroke-width="2"/>
      <text x="82" y="88" fill="#f8fafc" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900">Clash Pictionary</text>
      <text x="82" y="124" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">${escapeXml(topic.category)}</text>
      <text x="878" y="88" text-anchor="end" fill="#dbe7ff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">Round ${round}/${totalRounds}</text>
      <text x="878" y="124" text-anchor="end" fill="#93a4bd" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700">${seconds}s to guess</text>
      ${shapeSvg(topic)}
      ${clueChips(topic)}
      <text x="480" y="416" text-anchor="middle" fill="#93a4bd" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700">Guess the Clash of Clans answer in chat</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function recordPictionaryGame(
  guildId,
  {
    channelId,
    gameId,
    startedAt,
    endedAt = new Date(),
    rounds,
    winnerUser = null,
    players = [],
    storePath = pictionaryStorePath()
  } = {}
) {
  return withStoreLock(async () => {
    const store = await readPictionaryStore(storePath);
    const guild = ensureGuild(store, guildId);

    for (const player of players) {
      const user = userSnapshot(player.user || player);
      const current = {
        user,
        points: 0,
        roundWins: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        lastPlayedAt: null,
        ...(guild.players[user.id] || {})
      };
      current.user = user;
      current.points += Number(player.score || 0);
      current.roundWins += Number(player.score || 0);
      current.gamesPlayed += 1;
      if (winnerUser?.id === user.id) {
        current.gamesWon += 1;
      }
      current.lastPlayedAt = isoDate(endedAt);
      guild.players[user.id] = current;
    }

    guild.games.push({
      id: gameId,
      channelId,
      startedAt: isoDate(startedAt || endedAt),
      endedAt: isoDate(endedAt),
      rounds: Number(rounds || 0),
      winner: winnerUser ? userSnapshot(winnerUser) : null,
      players: players.map((player) => ({
        user: userSnapshot(player.user || player),
        score: Number(player.score || 0)
      }))
    });
    guild.games = guild.games.slice(-50);

    await writePictionaryStore(store, storePath);
    return {
      store,
      leaderboard: buildPictionaryLeaderboard(store, guildId)
    };
  });
}

export function buildPictionaryLeaderboard(store, guildId, { limit = 8 } = {}) {
  const players = Object.values(store?.guilds?.[guildId]?.players || {});
  return players
    .sort(
      (left, right) =>
        Number(right.points || 0) - Number(left.points || 0) ||
        Number(right.gamesWon || 0) - Number(left.gamesWon || 0) ||
        Number(right.roundWins || 0) - Number(left.roundWins || 0) ||
        String(left.user?.displayName || left.user?.username || '').localeCompare(
          String(right.user?.displayName || right.user?.username || '')
        )
    )
    .slice(0, limit);
}

export function formatPictionaryLeaderboard(entries) {
  if (!entries?.length) {
    return 'No wins recorded yet.';
  }

  return entries
    .map((entry, index) => {
      const name = entry.user?.displayName || entry.user?.username || entry.user?.tag || entry.user?.id;
      return `${index + 1}. ${name} - ${entry.points} pts | ${entry.gamesWon} games won | ${entry.roundWins} round wins`;
    })
    .join('\n');
}
