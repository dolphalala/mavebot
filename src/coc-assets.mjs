const COC_WIKI_API_URL = 'https://clashofclans.fandom.com/api.php';
const USER_AGENT = 'mavebot/0.1 Discord bot Clash asset lookup';
const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const DEFAULT_BATCH_SIZE = 20;

const ASSET_FILE_OVERRIDES = new Map(
  [
    ['l.a.s.s.i', 'L.A.S.S.I_info.png'],
    ['m.e.c.h.a', 'M.E.C.H.A_info.png'],
    ['p.e.k.k.a', 'P.E.K.K.A_info.png'],
    ['super p.e.k.k.a', 'Super_P.E.K.K.A_info.png']
  ].map(([name, fileName]) => [name, fileName])
);

const imageUrlCache = new Map();

function normalizeAssetName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function cacheKeyForName(name) {
  return normalizeAssetName(name).toLowerCase();
}

function fileTitleForName(name) {
  return `File:${cocWikiFileName(name)}`;
}

function titleKey(title) {
  return String(title || '').replaceAll('_', ' ').toLowerCase();
}

function fileTitleCandidatesForName(name) {
  const normalized = normalizeAssetName(name);
  const baseFileName = `${normalized.replaceAll(' ', '_')}.png`;
  const titles = [fileTitleForName(normalized), `File:${baseFileName}`];
  return [...new Set(titles)];
}

async function fetchJsonWithTimeout(url, { fetchImpl = fetch, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function imageInfoUrlForTitles(titles) {
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
    origin: '*'
  });
  return `${COC_WIKI_API_URL}?${params.toString()}`;
}

function imageUrlsFromApiBody(body) {
  const result = new Map();
  for (const page of Object.values(body?.query?.pages || {})) {
    if (!page?.title) {
      continue;
    }
    const url = page.imageinfo?.[0]?.url || null;
    result.set(page.title, url);
    result.set(titleKey(page.title), url);
  }
  return result;
}

export function cocWikiFileName(name) {
  const normalized = normalizeAssetName(name);
  const key = normalized.toLowerCase();
  if (ASSET_FILE_OVERRIDES.has(key)) {
    return ASSET_FILE_OVERRIDES.get(key);
  }
  return `${normalized.replaceAll(' ', '_')}_info.png`;
}

export function cocWikiFilePageUrl(name) {
  return `https://clashofclans.fandom.com/wiki/File:${encodeURIComponent(cocWikiFileName(name))}`;
}

export function cocWikiImageInfoUrl(name) {
  return imageInfoUrlForTitles(fileTitleCandidatesForName(name));
}

export async function fetchCocWikiImageUrl(
  name,
  { fetchImpl = fetch, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}
) {
  const normalized = normalizeAssetName(name);
  if (!normalized) {
    return null;
  }
  const cacheKey = cacheKeyForName(normalized);
  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey);
  }

  const candidates = fileTitleCandidatesForName(normalized);
  const body = await fetchJsonWithTimeout(cocWikiImageInfoUrl(normalized), {
    fetchImpl,
    timeoutMs
  });
  const urlsByTitle = imageUrlsFromApiBody(body);
  const url =
    candidates
      .map((title) => urlsByTitle.get(title) || urlsByTitle.get(titleKey(title)))
      .find(Boolean) || null;
  imageUrlCache.set(cacheKey, url);
  return url;
}

export async function fetchCocWikiImageMap(
  names,
  {
    fetchImpl = fetch,
    limit = 80,
    batchSize = DEFAULT_BATCH_SIZE,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
  } = {}
) {
  const uniqueNames = [
    ...new Set(
      (names || [])
        .map(normalizeAssetName)
        .filter(Boolean)
    )
  ].slice(0, limit);

  const result = new Map();
  const missing = [];

  for (const name of uniqueNames) {
    const cacheKey = cacheKeyForName(name);
    if (imageUrlCache.has(cacheKey)) {
      const cached = imageUrlCache.get(cacheKey);
      if (cached) {
        result.set(name, cached);
        result.set(cacheKey, cached);
      }
      continue;
    }
    missing.push(name);
  }

  for (let index = 0; index < missing.length; index += batchSize) {
    const batch = missing.slice(index, index + batchSize);
    const titleToName = new Map(
      batch.flatMap((name) => fileTitleCandidatesForName(name).map((title) => [title, name]))
    );
    const body = await fetchJsonWithTimeout(
      imageInfoUrlForTitles([...titleToName.keys()]),
      { fetchImpl, timeoutMs }
    );
    const urlsByTitle = imageUrlsFromApiBody(body);

    for (const name of batch) {
      const url =
        fileTitleCandidatesForName(name)
          .map((title) => urlsByTitle.get(title) || urlsByTitle.get(titleKey(title)))
          .find(Boolean) || null;
      const cacheKey = cacheKeyForName(name);
      imageUrlCache.set(cacheKey, url);
      if (url) {
        result.set(name, url);
        result.set(cacheKey, url);
      }
    }
  }

  return result;
}

export function itemAssetUrl(item, assetUrls = new Map()) {
  const name = normalizeAssetName(item?.name || item);
  return assetUrls.get(name) || assetUrls.get(name.toLowerCase()) || null;
}
