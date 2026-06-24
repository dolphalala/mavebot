const DEFAULT_COC_API_BASE_URL = 'https://api.clashofclans.com/v1';

export class CocApiError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'CocApiError';
    this.status = status;
    this.reason = reason;
  }
}

export function normalizePlayerTag(value) {
  const compact = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  const tag = compact.startsWith('#') ? compact : `#${compact}`;

  if (!/^#[A-Z0-9]{3,20}$/.test(tag)) {
    throw new CocApiError('Please enter a valid Clash of Clans player tag.');
  }

  return tag;
}

export function encodeCocTag(tag) {
  return encodeURIComponent(normalizePlayerTag(tag));
}

function apiBaseUrl() {
  return (process.env.COC_API_BASE_URL || DEFAULT_COC_API_BASE_URL).replace(/\/+$/, '');
}

function apiToken() {
  return process.env.COC_API_TOKEN || '';
}

async function parseCocResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    return body;
  }

  const reason = body?.reason || body?.message || response.statusText || 'unknown';
  if (response.status === 403) {
    throw new CocApiError(
      'The Clash API rejected this server. Check that the API token is valid and allowlisted for 5.78.127.221.',
      { status: response.status, reason }
    );
  }

  if (response.status === 404) {
    throw new CocApiError('I could not find that player tag.', {
      status: response.status,
      reason
    });
  }

  throw new CocApiError(`Clash API request failed: ${reason}`, {
    status: response.status,
    reason
  });
}

export async function fetchPlayer(tag, { fetchImpl = fetch } = {}) {
  const token = apiToken();
  if (!token) {
    throw new CocApiError('The Clash API token is not configured on the server yet.');
  }

  const response = await fetchImpl(`${apiBaseUrl()}/players/${encodeCocTag(tag)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  return parseCocResponse(response);
}

function numberText(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
}

export function buildPlayerEmbedData(player) {
  const clanName = player.clan?.name || 'No clan';
  const role = player.role ? ` (${player.role})` : '';

  return {
    title: `${player.name || 'Unknown player'} ${player.tag || ''}`.trim(),
    description: `${clanName}${role}`,
    fields: [
      {
        name: 'Town Hall',
        value: String(player.townHallLevel || 'Unknown'),
        inline: true
      },
      {
        name: 'Trophies',
        value: numberText(player.trophies),
        inline: true
      },
      {
        name: 'Best',
        value: numberText(player.bestTrophies),
        inline: true
      },
      {
        name: 'War stars',
        value: numberText(player.warStars),
        inline: true
      },
      {
        name: 'Attack wins',
        value: numberText(player.attackWins),
        inline: true
      },
      {
        name: 'Builder Hall',
        value: String(player.builderHallLevel || 'Unknown'),
        inline: true
      }
    ]
  };
}
