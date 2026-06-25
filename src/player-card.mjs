import sharp from 'sharp';
import { itemAssetUrl } from './coc-assets.mjs';

const CARD_WIDTH = 920;
const CARD_PADDING = 32;
const TILE_WIDTH = 92;
const TILE_HEIGHT = 104;
const TILE_GAP = 12;
const ICON_SIZE = 58;
const ICON_FETCH_TIMEOUT_MS = 3000;
const ICON_FETCH_CONCURRENCY = 12;

const SIEGE_MACHINE_NAMES = new Set(
  [
    'Wall Wrecker',
    'Battle Blimp',
    'Stone Slammer',
    'Siege Barracks',
    'Log Launcher',
    'Flame Flinger',
    'Battle Drill',
    'Troop Launcher'
  ].map((name) => name.toLowerCase())
);

const PET_NAMES = new Set(
  [
    'L.A.S.S.I',
    'Electro Owl',
    'Mighty Yak',
    'Unicorn',
    'Frosty',
    'Diggy',
    'Poison Lizard',
    'Phoenix',
    'Spirit Fox',
    'Angry Jelly',
    'Sneezy',
    'M.E.C.H.A'
  ].map((name) => name.toLowerCase())
);

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function svgBuffer(content, width = CARD_WIDTH, height = 120) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`
  );
}

function textSvg({ x, y, text, size = 24, weight = 700, color = '#f4f7fb', width = CARD_WIDTH, height = 80 }) {
  return svgBuffer(
    `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(text)}</text>`,
    width,
    height
  );
}

function wrappedName(name, max = 11) {
  const text = String(name || 'Unknown').trim();
  return text.length > max ? `${text.slice(0, max - 1)}.` : text;
}

function levelText(item) {
  const level = Number.isFinite(item?.level) ? item.level : null;
  const maxLevel = Number.isFinite(item?.maxLevel) ? item.maxLevel : null;
  if (level === null) {
    return '?';
  }
  return maxLevel ? `${level}/${maxLevel}` : String(level);
}

function tileSvg(item, { x, y, sectionColor }) {
  return svgBuffer(
    [
      `<rect x="${x}" y="${y}" width="${TILE_WIDTH}" height="${TILE_HEIGHT}" rx="10" fill="#303443" stroke="#485066" stroke-width="2"/>`,
      `<rect x="${x + 7}" y="${y + 7}" width="${ICON_SIZE + 8}" height="${ICON_SIZE + 8}" rx="8" fill="#202330" stroke="${sectionColor}" stroke-opacity="0.7" stroke-width="2"/>`,
      `<rect x="${x + 8}" y="${y + 62}" width="${TILE_WIDTH - 16}" height="22" rx="7" fill="#11141d" opacity="0.92"/>`,
      `<text x="${x + 12}" y="${y + 79}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="800">${escapeXml(levelText(item))}</text>`,
      `<text x="${x + 8}" y="${y + 99}" fill="#d7ddea" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700">${escapeXml(wrappedName(item?.name))}</text>`
    ].join(''),
    CARD_WIDTH,
    TILE_HEIGHT + y + 12
  );
}

function placeholderIconSvg(item, { x, y, sectionColor }) {
  const initials = String(item?.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return svgBuffer(
    [
      `<circle cx="${x + 40}" cy="${y + 40}" r="28" fill="${sectionColor}" opacity="0.35"/>`,
      `<text x="${x + 40}" y="${y + 48}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900">${escapeXml(initials || '?')}</text>`
    ].join(''),
    CARD_WIDTH,
    y + 80
  );
}

async function fetchIconBuffer(url, { fetchImpl }) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': 'mavebot/0.1 Discord bot Clash asset renderer'
      },
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) {
      throw new Error(`asset fetch failed ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function iconComposite(item, { assetUrls, x, y, sectionColor, fetchImpl }) {
  const url = itemAssetUrl(item, assetUrls);
  if (!url) {
    return {
      input: placeholderIconSvg(item, { x, y, sectionColor }),
      left: 0,
      top: 0
    };
  }

  try {
    const source = await fetchIconBuffer(url, { fetchImpl });
    const input = await sharp(source)
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return {
      input,
      left: x + 12,
      top: y + 11
    };
  } catch {
    return {
      input: placeholderIconSvg(item, { x, y, sectionColor }),
      left: 0,
      top: 0
    };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function sectionItems(player, sectionId) {
  if (sectionId === 'heroes') {
    return player.heroes || [];
  }
  if (sectionId === 'pets') {
    return (player.troops || []).filter((item) => PET_NAMES.has(String(item.name || '').toLowerCase()));
  }
  if (sectionId === 'troops') {
    return (player.troops || []).filter(
      (item) =>
        item.village === 'home' &&
        !SIEGE_MACHINE_NAMES.has(String(item.name || '').toLowerCase()) &&
        !PET_NAMES.has(String(item.name || '').toLowerCase())
    );
  }
  if (sectionId === 'spells') {
    return player.spells || [];
  }
  if (sectionId === 'equipment') {
    return player.heroEquipment || [];
  }
  if (sectionId === 'siege') {
    return (player.troops || []).filter((item) => SIEGE_MACHINE_NAMES.has(String(item.name || '').toLowerCase()));
  }
  return [];
}

function sectionPlan(player) {
  return [
    { id: 'heroes', label: 'Heroes', color: '#39d5ff', limit: 6 },
    { id: 'pets', label: 'Pets', color: '#ffd166', limit: 8 },
    { id: 'troops', label: 'Troops', color: '#7bd88f', limit: 24 },
    { id: 'spells', label: 'Spells', color: '#b088ff', limit: 16 },
    { id: 'equipment', label: 'Equipment', color: '#ff8fab', limit: 16 },
    { id: 'siege', label: 'Siege Machines', color: '#ff9f1c', limit: 8 }
  ]
    .map((section) => ({
      ...section,
      items: sectionItems(player, section.id).slice(0, section.limit)
    }))
    .filter((section) => section.items.length > 0);
}

export function playerArmyAssetNames(player) {
  return sectionPlan(player)
    .flatMap((section) => section.items)
    .map((item) => item.name)
    .filter(Boolean);
}

export async function renderPlayerArmyCard(player, { assetUrls = new Map(), fetchImpl = fetch } = {}) {
  const sections = sectionPlan(player);
  const columns = 8;
  const contentWidth = CARD_WIDTH - CARD_PADDING * 2;
  const composites = [];
  const iconJobs = [];
  let y = CARD_PADDING;

  composites.push({
    input: svgBuffer(
      [
        `<rect width="${CARD_WIDTH}" height="1200" fill="#242733"/>`,
        `<rect x="${CARD_PADDING}" y="${CARD_PADDING}" width="${contentWidth}" height="76" rx="14" fill="#30384d"/>`,
        `<text x="${CARD_PADDING + 22}" y="${CARD_PADDING + 32}" fill="#81d4ff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900">${escapeXml(player.name || 'Player')} Army</text>`,
        `<text x="${CARD_PADDING + 22}" y="${CARD_PADDING + 61}" fill="#dfe6f3" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700">${escapeXml(player.tag || '')} - TH ${escapeXml(player.townHallLevel || '?')}</text>`
      ].join(''),
      CARD_WIDTH,
      1200
    ),
    left: 0,
    top: 0
  });
  y += 104;

  for (const section of sections) {
    composites.push({
      input: textSvg({
        x: CARD_PADDING,
        y: 30,
        text: section.label,
        size: 24,
        color: section.color,
        height: 44
      }),
      left: 0,
      top: y
    });
    y += 48;

    for (const [index, item] of section.items.entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = CARD_PADDING + col * (TILE_WIDTH + TILE_GAP);
      const tileY = y + row * (TILE_HEIGHT + TILE_GAP);
      composites.push({
        input: tileSvg(item, { x, y: tileY, sectionColor: section.color }),
        left: 0,
        top: 0
      });
      iconJobs.push({ item, x, y: tileY, sectionColor: section.color });
    }

    y += Math.ceil(section.items.length / columns) * (TILE_HEIGHT + TILE_GAP) + 22;
  }

  composites.push(
    ...(await mapWithConcurrency(iconJobs, ICON_FETCH_CONCURRENCY, (job) =>
      iconComposite(job.item, {
        assetUrls,
        x: job.x,
        y: job.y,
        sectionColor: job.sectionColor,
        fetchImpl
      })
    ))
  );

  const height = Math.max(360, y + CARD_PADDING);
  composites.push({
    input: svgBuffer(
      `<text x="${CARD_PADDING}" y="${height - 18}" fill="#8994aa" font-family="Arial, Helvetica, sans-serif" font-size="15">Data from the official Clash API. Icons resolve from Clash of Clans Wiki/Fandom when available.</text>`,
      CARD_WIDTH,
      height
    ),
    left: 0,
    top: 0
  });

  return sharp({
    create: {
      width: CARD_WIDTH,
      height,
      channels: 4,
      background: '#242733'
    }
  })
    .composite(composites)
    .png()
    .toBuffer();
}
