const tileClass = {
  g: 'tile-grass',
  w: 'tile-wall',
  d: 'tile-defense',
  t: 'tile-tower',
  c: 'tile-core',
  h: 'tile-hero',
  x: 'tile-trap',
  i: 'tile-inferno',
  s: 'tile-scatter',
  a: 'tile-air',
  e: 'tile-eagle',
  '.': 'tile-grass'
};

const state = {
  summary: null,
  wallet: 38,
  filter: 'all',
  townHall: 'all',
  query: '',
  sort: 'spotlight',
  activeId: null,
  feed: []
};

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function layoutDimensions(layout) {
  return { rows: layout.length || 1, cols: Math.max(...layout.map((row) => row.length), 1) };
}

function baseMap(listing, className = 'base-map') {
  const { rows, cols } = layoutDimensions(listing.layout);
  const tiles = listing.layout
    .flatMap((row) => row.padEnd(cols, 'g').split(''))
    .map((tile) => `<span class="tile ${tileClass[tile] || 'tile-grass'}"></span>`)
    .join('');
  return `<div class="${className}" style="--rows:${rows};--cols:${cols};--accent:${escapeHtml(listing.accent)}" role="img" aria-label="${escapeHtml(listing.title)} preview">${tiles}</div>`;
}

function stars(value) {
  return `${Number(value).toFixed(1)} stars`;
}

function activeListing() {
  return state.summary.listings.find((listing) => listing.id === state.activeId) || state.summary.listings[0];
}

function filteredListings() {
  const query = state.query.trim().toLowerCase();
  return state.summary.listings
    .filter((listing) => state.filter === 'all' || listing.mode === state.filter)
    .filter((listing) => state.townHall === 'all' || String(listing.townHall) === state.townHall)
    .filter((listing) => {
      if (!query) return true;
      return [listing.title, listing.builder, listing.mode, listing.dropType, ...listing.tags]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (state.sort === 'fresh') return freshnessRank(a.freshness) - freshnessRank(b.freshness);
      if (state.sort === 'rating') return b.rating - a.rating;
      if (state.sort === 'price') return a.costTokens - b.costTokens;
      return Number(b.spotlight) - Number(a.spotlight) || b.sold - a.sold;
    });
}

function freshnessRank(value) {
  if (value.endsWith('h')) return Number(value.replace('h', '')) / 24;
  if (value.endsWith('d')) return Number(value.replace('d', ''));
  return 99;
}

function renderWallet() {
  byId('wallet-balance').textContent = `${state.wallet} tokens`;
}

function renderFilters() {
  const modes = ['all', 'Legend League', 'War', 'CWL', 'Builder Base', 'Capital Hall'];
  byId('category-filters').innerHTML = modes
    .map((mode) => `<button class="filter-button ${state.filter === mode ? 'active' : ''}" data-filter="${escapeHtml(mode)}">${mode === 'all' ? 'All bases' : escapeHtml(mode)}</button>`)
    .join('');

  const townHalls = ['all', ...new Set(state.summary.listings.map((listing) => String(listing.townHall)))].sort((a, b) => {
    if (a === 'all') return -1;
    if (b === 'all') return 1;
    return Number(b) - Number(a);
  });
  byId('townhall-filters').innerHTML = townHalls
    .map((th) => `<button class="mini-pill ${state.townHall === th ? 'active' : ''}" data-townhall="${escapeHtml(th)}">${th === 'all' ? 'All' : `TH${escapeHtml(th)}`}</button>`)
    .join('');
}

function renderStats() {
  byId('market-stats').innerHTML = state.summary.stats
    .map(
      (stat) => `
        <article>
          <strong>${escapeHtml(stat.value)}</strong>
          <span>${escapeHtml(stat.label)}</span>
        </article>
      `
    )
    .join('');
}

function listingCard(listing) {
  return `
    <article class="listing-card ${listing.id === state.activeId ? 'active' : ''}" style="--accent:${escapeHtml(listing.accent)}">
      <button class="listing-select" data-listing-id="${escapeHtml(listing.id)}" aria-label="View ${escapeHtml(listing.title)}">
        ${baseMap(listing, 'mini-map')}
        <span class="drop-badge">${escapeHtml(listing.dropType)}</span>
      </button>
      <div class="listing-body">
        <div class="card-topline">
          <span>TH${escapeHtml(listing.townHall)} ${escapeHtml(listing.mode)}</span>
          <strong>${escapeHtml(listing.costTokens)}t</strong>
        </div>
        <h3>${escapeHtml(listing.title)}</h3>
        <p>${escapeHtml(listing.builder)} &middot; ${escapeHtml(stars(listing.rating))} &middot; ${escapeHtml(listing.reviews)} reviews</p>
        <div class="listing-tags">
          ${listing.tags.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="card-actions">
          <button class="gold-button buy-button" data-buy-id="${escapeHtml(listing.id)}">Buy for ${escapeHtml(listing.costTokens)}t</button>
          <button class="stone-button preview-button" data-listing-id="${escapeHtml(listing.id)}">Preview</button>
        </div>
      </div>
    </article>
  `;
}

function renderListings() {
  const listings = filteredListings();
  if (!listings.some((listing) => listing.id === state.activeId)) {
    state.activeId = listings[0]?.id || state.summary.listings[0].id;
  }
  byId('result-count').textContent = `${listings.length} bases`;
  byId('market-subtitle').textContent = listings.length ? 'Pick a base, buy with tokens, then review after using it.' : 'No bases match this search.';
  byId('listing-grid').innerHTML = listings.map(listingCard).join('');
  renderSelected();
  renderSpotlight();
  renderReviews();
}

function renderSpotlight() {
  const listing = state.summary.listings.find((item) => item.spotlight) || activeListing();
  byId('spotlight-card').innerHTML = `
    <div class="spotlight-copy">
      <span class="kicker">Spotlight slot</span>
      <h2>${escapeHtml(listing.title)}</h2>
      <p>${escapeHtml(listing.proofLine)}</p>
      <div class="spotlight-actions">
        <button class="gold-button buy-button" data-buy-id="${escapeHtml(listing.id)}">Buy ${escapeHtml(listing.costTokens)}t</button>
        <button class="stone-button" data-boost-id="${escapeHtml(listing.id)}">Boost 12t</button>
      </div>
    </div>
    ${baseMap(listing, 'spotlight-map')}
  `;
}

function renderSelected() {
  const listing = activeListing();
  byId('selected-listing').innerHTML = `
    <div class="selected-head">
      <span class="kicker">Selected base</span>
      <strong>${escapeHtml(listing.costTokens)} tokens</strong>
    </div>
    <h2>${escapeHtml(listing.title)}</h2>
    ${baseMap(listing, 'detail-map')}
    <div class="proof-grid">
      ${listing.proof.map((proof) => `<article><span>${escapeHtml(proof.label)}</span><strong>${escapeHtml(proof.value)}</strong></article>`).join('')}
    </div>
    <p class="selected-note">${escapeHtml(listing.buyerNote)}</p>
    <dl class="detail-list">
      <div><dt>Seller</dt><dd>${escapeHtml(listing.builder)}</dd></div>
      <div><dt>Freshness</dt><dd>${escapeHtml(listing.freshness)} &middot; ${escapeHtml(listing.shield)}</dd></div>
      <div><dt>Protection</dt><dd>${escapeHtml(listing.copyState)} &middot; ${escapeHtml(listing.copyRisk)}</dd></div>
      <div><dt>Sold</dt><dd>${escapeHtml(listing.sold)} copies</dd></div>
    </dl>
    <div class="panel-actions">
      <button class="gold-button full buy-button" data-buy-id="${escapeHtml(listing.id)}">Buy private link</button>
      <button class="stone-button full" data-boost-id="${escapeHtml(listing.id)}">Spotlight this base</button>
    </div>
  `;
}

function renderTokenPacks() {
  byId('token-packs').innerHTML = state.summary.tokenPacks
    .map(
      (pack) => `
        <button class="token-pack" data-token-pack="${escapeHtml(pack.id)}">
          <span>${escapeHtml(pack.name)}</span>
          <strong>${escapeHtml(pack.tokens)} tokens</strong>
          <small>${escapeHtml(pack.price)} &middot; ${escapeHtml(pack.bonus)}</small>
        </button>
      `
    )
    .join('');
}

function renderBuilders() {
  byId('builder-list').innerHTML = state.summary.builders
    .map(
      (builder) => `
        <button class="seller-row" data-builder="${escapeHtml(builder.name)}" style="--accent:${escapeHtml(builder.accent)}">
          <span>
            <strong>${escapeHtml(builder.name)}</strong>
            <small>${escapeHtml(builder.specialty)} &middot; ${escapeHtml(builder.nextDrop)}</small>
          </span>
          <b>${escapeHtml(builder.score)}</b>
        </button>
      `
    )
    .join('');
}

function renderActivity() {
  byId('activity-feed').innerHTML = state.feed
    .slice(0, 7)
    .map((item) => `<article><span>${escapeHtml(item.type)}</span><p>${escapeHtml(item.text)}</p></article>`)
    .join('');
}

function renderReviews() {
  const listing = activeListing();
  byId('review-title').textContent = listing.title;
  byId('review-list').innerHTML = listing.reviewsFeed
    .map(
      (review) => `
        <article class="review-card">
          <div><strong>${escapeHtml(review.user)}</strong><span>${escapeHtml(review.rating)} stars</span></div>
          <p>${escapeHtml(review.text)}</p>
        </article>
      `
    )
    .join('');
}

function renderShield() {
  const fingerprint = state.summary.fingerprint;
  byId('shield-threshold').textContent = `${Math.round(fingerprint.threshold * 100)}% block`;
  byId('shield-feed').innerHTML = fingerprint.verdicts
    .map((verdict) => {
      const tone = verdict.status.toLowerCase().includes('blocked') ? 'danger' : verdict.status.toLowerCase().includes('queued') ? 'warn' : 'ok';
      return `
        <article class="shield-card ${tone}">
          <div><strong>${escapeHtml(verdict.status)}</strong><span>${Math.round(verdict.score * 100)}%</span></div>
          <p>${escapeHtml(verdict.pair)}</p>
          <small>${escapeHtml(verdict.detail)}</small>
        </article>
      `;
    })
    .join('');
}

function buyListing(id) {
  const listing = state.summary.listings.find((item) => item.id === id);
  if (!listing) return;
  if (state.wallet < listing.costTokens) {
    state.feed.unshift({ type: 'top up', text: `Need ${listing.costTokens - state.wallet} more tokens for ${listing.title}.` });
    renderActivity();
    byId('token-shop').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  state.wallet -= listing.costTokens;
  state.feed.unshift({ type: 'purchase', text: `Bought ${listing.title} for ${listing.costTokens} tokens. Private link unlocked.` });
  renderWallet();
  renderActivity();
}

function boostListing(id) {
  const listing = state.summary.listings.find((item) => item.id === id);
  if (!listing) return;
  const cost = 12;
  if (state.wallet < cost) {
    state.feed.unshift({ type: 'top up', text: `Need ${cost - state.wallet} more tokens to spotlight ${listing.title}.` });
    renderActivity();
    byId('token-shop').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  state.wallet -= cost;
  state.feed.unshift({ type: 'boost', text: `${listing.title} is queued for a 24h spotlight slot.` });
  renderWallet();
  renderActivity();
}

function wireEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.filter) {
      state.filter = target.dataset.filter;
      renderFilters();
      renderListings();
    }
    if (target.dataset.townhall) {
      state.townHall = target.dataset.townhall;
      renderFilters();
      renderListings();
    }
    if (target.dataset.listingId) {
      state.activeId = target.dataset.listingId;
      renderListings();
      byId('selected-listing').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (target.dataset.buyId) buyListing(target.dataset.buyId);
    if (target.dataset.boostId) boostListing(target.dataset.boostId);
    if (target.dataset.tokenPack) {
      const pack = state.summary.tokenPacks.find((item) => item.id === target.dataset.tokenPack);
      state.wallet += pack.tokens;
      state.feed.unshift({ type: 'top up', text: `Added ${pack.tokens} tokens with ${pack.name}.` });
      renderWallet();
      renderActivity();
    }
    if (target.dataset.scrollTarget) {
      byId(target.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (target.dataset.builder) {
      state.query = target.dataset.builder;
      byId('market-search').value = state.query;
      renderListings();
    }
  });

  byId('market-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderListings();
  });

  byId('sort-select').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderListings();
  });

  byId('submit-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = data.get('title');
    const mode = data.get('mode');
    const cost = data.get('cost');
    byId('submission-result').textContent = `${title} is queued for ${mode} review at ${cost} tokens.`;
    state.feed.unshift({ type: 'submit', text: `${title} submitted for similarity review.` });
    renderActivity();
    event.currentTarget.reset();
  });

  byId('review-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = String(data.get('review') || '').trim();
    if (!text) return;
    const listing = activeListing();
    listing.reviewsFeed.unshift({ user: 'You', rating: Number(data.get('rating')), text });
    listing.reviews += 1;
    state.feed.unshift({ type: 'review', text: `Posted a review on ${listing.title}.` });
    renderReviews();
    renderListings();
    renderActivity();
    event.currentTarget.reset();
  });
}

async function boot() {
  const response = await fetch('/api/marketplace/summary', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Summary request failed: ${response.status}`);
  state.summary = await response.json();
  state.activeId = state.summary.listings[0].id;
  state.feed = [...state.summary.activityFeed];
  renderWallet();
  renderFilters();
  renderStats();
  renderBuilders();
  renderTokenPacks();
  renderListings();
  renderActivity();
  renderShield();
  wireEvents();
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="load-error">Marketplace failed to load: ${escapeHtml(error.message)}</div>`);
});
