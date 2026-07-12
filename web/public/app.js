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
  feed: [],
  purchases: [],
  walletLedger: [],
  sellerQueue: [],
  spotlightQueue: []
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
          <small>${escapeHtml(stat.detail)}</small>
        </article>
      `
    )
    .join('');
}

function renderPipeline() {
  byId('market-pipeline').innerHTML = state.summary.marketPipeline
    .map(
      (step) => `
        <article>
          <span>${escapeHtml(step.label)}</span>
          <strong>${escapeHtml(step.value)}</strong>
          <p>${escapeHtml(step.detail)}</p>
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
        <div class="listing-facts">
          <span>${escapeHtml(listing.freshness)} fresh</span>
          <span>${escapeHtml(listing.shield)}</span>
          <span>${escapeHtml(listing.sold)} sold</span>
        </div>
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
  const owned = isOwned(listing.id);
  byId('selected-listing').innerHTML = `
    <div class="selected-head">
      <span class="kicker">Selected base</span>
      <strong>${owned ? 'Owned' : `${escapeHtml(listing.costTokens)} tokens`}</strong>
    </div>
    <h2>${escapeHtml(listing.title)}</h2>
    ${baseMap(listing, 'detail-map')}
    <div class="status-strip">
      <span>${escapeHtml(listing.dropType)}</span>
      <span>${escapeHtml(listing.cashPrice)} demo cash</span>
      <span>${escapeHtml(listing.copyRisk)} leak risk</span>
    </div>
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
      <button class="gold-button full buy-button" data-buy-id="${escapeHtml(listing.id)}">${owned ? 'Open private link' : 'Buy private link'}</button>
      <button class="stone-button full" data-boost-id="${escapeHtml(listing.id)}">Spotlight this base</button>
    </div>
  `;
}

function renderTokenPacks() {
  byId('token-packs').innerHTML = state.summary.tokenPacks
    .map(
      (pack) => `
        <button class="token-pack" data-token-pack="${escapeHtml(pack.id)}">
          <span>${escapeHtml(pack.tag)}</span>
          <strong>${escapeHtml(pack.price)} for ${escapeHtml(pack.tokens)} tokens</strong>
          <small>${escapeHtml(pack.unit)} &middot; ${escapeHtml(pack.bonus)}</small>
        </button>
      `
    )
    .join('');
}

function ownedItems() {
  return [...state.purchases, ...state.summary.buyerLibrary];
}

function isOwned(listingId) {
  return ownedItems().some((item) => item.listingId === listingId);
}

function renderBuyerLibrary() {
  const items = ownedItems();
  byId('library-count').textContent = `${items.length} links`;
  byId('buyer-library-list').innerHTML = items
    .map(
      (item) => `
        <article class="library-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.status)} &middot; ${escapeHtml(item.paid)}</span>
          </div>
          <button class="stone-button" data-copy-library="${escapeHtml(item.id)}">${escapeHtml(item.action)}</button>
          <small>Review due: ${escapeHtml(item.reviewDue)} &middot; Access: ${escapeHtml(item.expires)}</small>
        </article>
      `
    )
    .join('');
}

function renderWalletLedger() {
  byId('wallet-ledger').innerHTML = `
    <h3>Wallet history</h3>
    ${state.walletLedger
      .slice(0, 5)
      .map(
        (item) => `
          <article>
            <span>${escapeHtml(item.type)}</span>
            <strong>${escapeHtml(item.amount)}t</strong>
            <small>${escapeHtml(item.detail)} &middot; ${escapeHtml(item.when)}</small>
          </article>
        `
      )
      .join('')}
  `;
}

function renderSellerQueue() {
  byId('seller-queue').innerHTML = state.sellerQueue
    .map(
      (item) => `
        <article class="queue-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.seller)} &middot; ${escapeHtml(item.ask)}</span>
          </div>
          <b>${escapeHtml(item.status)}</b>
          <small>${escapeHtml(item.result)} &middot; ${escapeHtml(item.eta)}</small>
        </article>
      `
    )
    .join('');
}

function renderSpotlightQueue() {
  byId('spotlight-queue').innerHTML = state.spotlightQueue
    .map(
      (item) => `
        <article class="queue-card spotlight-queue-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.seller)} &middot; ${escapeHtml(item.spend)}</span>
          </div>
          <b>${escapeHtml(item.slot)}</b>
          <small>${escapeHtml(item.lift)}</small>
        </article>
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
  if (isOwned(id)) {
    state.feed.unshift({ type: 'library', text: `${listing.title} is already in your library.` });
    renderActivity();
    byId('buyer-library').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (state.wallet < listing.costTokens) {
    state.feed.unshift({ type: 'top up', text: `Need ${listing.costTokens - state.wallet} more tokens for ${listing.title}.` });
    renderActivity();
    byId('token-shop').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  state.wallet -= listing.costTokens;
  listing.sold += 1;
  state.purchases.unshift({
    id: `owned-${listing.id}-${Date.now()}`,
    listingId: listing.id,
    title: listing.title,
    status: 'Unlocked',
    action: 'Copy link',
    expires: 'Forever',
    reviewDue: 'After first defense',
    paid: `${listing.costTokens} tokens`
  });
  state.walletLedger.unshift({ type: 'Purchase', amount: `-${listing.costTokens}`, detail: listing.title, when: 'Just now' });
  state.feed.unshift({ type: 'purchase', text: `Bought ${listing.title} for ${listing.costTokens} tokens. Private link unlocked.` });
  renderWallet();
  renderActivity();
  renderBuyerLibrary();
  renderWalletLedger();
  renderListings();
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
  state.walletLedger.unshift({ type: 'Boost', amount: `-${cost}`, detail: listing.title, when: 'Just now' });
  state.spotlightQueue.unshift({ title: listing.title, seller: listing.builder, slot: 'Queued', spend: `${cost} tokens`, lift: 'Awaiting slot' });
  state.feed.unshift({ type: 'boost', text: `${listing.title} is queued for a 24h spotlight slot.` });
  renderWallet();
  renderActivity();
  renderWalletLedger();
  renderSpotlightQueue();
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
      state.walletLedger.unshift({ type: 'Top up', amount: `+${pack.tokens}`, detail: `${pack.name} checkout`, when: 'Just now' });
      state.feed.unshift({ type: 'top up', text: `Added ${pack.tokens} tokens with ${pack.name}.` });
      renderWallet();
      renderActivity();
      renderWalletLedger();
    }
    if (target.dataset.scrollTarget) {
      byId(target.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (target.dataset.builder) {
      state.query = target.dataset.builder;
      byId('market-search').value = state.query;
      renderListings();
    }
    if (target.dataset.copyLibrary) {
      const item = ownedItems().find((owned) => owned.id === target.dataset.copyLibrary);
      if (item) {
        state.feed.unshift({ type: 'library', text: `${item.title} private link is ready to copy.` });
        renderActivity();
      }
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
    state.sellerQueue.unshift({
      id: `queue-${Date.now()}`,
      title,
      seller: 'You',
      status: 'Similarity scan',
      eta: '5 min',
      ask: `${cost} tokens`,
      result: `${mode} link received`
    });
    state.feed.unshift({ type: 'submit', text: `${title} submitted for similarity review.` });
    renderActivity();
    renderSellerQueue();
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
  state.walletLedger = [...state.summary.walletActivity];
  state.sellerQueue = [...state.summary.sellerQueue];
  state.spotlightQueue = [...state.summary.spotlightQueue];
  renderWallet();
  renderFilters();
  renderStats();
  renderPipeline();
  renderBuilders();
  renderTokenPacks();
  renderListings();
  renderActivity();
  renderShield();
  renderBuyerLibrary();
  renderWalletLedger();
  renderSellerQueue();
  renderSpotlightQueue();
  wireEvents();
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="load-error">Marketplace failed to load: ${escapeHtml(error.message)}</div>`);
});
