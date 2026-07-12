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
  p: 'tile-pet',
  b: 'tile-builder',
  '.': 'tile-grass'
};

let summary = null;
let activeFilter = 'all';
let activeListingId = null;

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
  const rows = layout.length || 1;
  const cols = Math.max(...layout.map((row) => row.length), 1);
  return { rows, cols };
}

function tileMarkup(layout) {
  return layout
    .flatMap((row) => row.padEnd(layoutDimensions(layout).cols, 'g').split(''))
    .map((tile) => `<span class="tile ${tileClass[tile] || 'tile-grass'}" aria-hidden="true"></span>`)
    .join('');
}

function baseMapMarkup(listing, className = 'base-map') {
  const { rows, cols } = layoutDimensions(listing.layout);
  return `
    <div
      class="${className}"
      role="img"
      aria-label="${escapeHtml(listing.title)} map preview"
      style="--rows: ${rows}; --cols: ${cols}; --card-accent: ${escapeHtml(listing.accent)}"
    >
      ${tileMarkup(listing.layout)}
    </div>
  `;
}

function metricMarkup(metrics) {
  return metrics
    .map(
      ([label, value]) => `
        <div class="metric">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join('');
}

function tagMarkup(tags, limit = tags.length) {
  return tags
    .slice(0, limit)
    .map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
    .join('');
}

function renderStats(stats) {
  byId('stats').innerHTML = stats
    .map(
      (stat) => `
        <article class="stat-card">
          <strong>${escapeHtml(stat.value)}</strong>
          <span>${escapeHtml(stat.label)}</span>
          <p>${escapeHtml(stat.detail)}</p>
        </article>
      `
    )
    .join('');
}

function listingHeader(listing) {
  return `
    <div class="listing-head">
      <div>
        <span class="mode-badge">TH${escapeHtml(listing.townHall)} ${escapeHtml(listing.mode)}</span>
        <h3 class="mt-2">${escapeHtml(listing.title)}</h3>
      </div>
      <span class="price-stamp">${escapeHtml(listing.price)}</span>
    </div>
  `;
}

function renderFeatured(listing) {
  byId('active-price').textContent = listing.price;
  byId('featured-base').innerHTML = `
    <div class="featured-shell">
      <div class="featured-title">
        ${listingHeader(listing)}
        <p class="mt-3">${escapeHtml(listing.reviewQuote)}</p>
      </div>
      <div class="base-stage">
        ${baseMapMarkup(listing)}
      </div>
      <div class="metric-grid">
        ${metricMarkup(listing.metrics)}
      </div>
      <div class="tag-row">
        ${tagMarkup(listing.tags)}
      </div>
      <div class="selected-proof-grid">
        ${listing.proof
          .map(
            (proof) => `
              <article class="selected-proof-card">
                <h3>${escapeHtml(proof.label)}</h3>
                <strong class="mt-2 block text-[1.45rem] text-[#ffc83d]">${escapeHtml(proof.value)}</strong>
                <p class="mt-1">${escapeHtml(proof.note)}</p>
              </article>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function filteredListings() {
  if (!summary) return [];
  return summary.listings.filter((listing) => activeFilter === 'all' || listing.mode === activeFilter);
}

function activeListing() {
  return summary.listings.find((listing) => listing.id === activeListingId) || summary.listings[0];
}

function renderSelectedListing(listing) {
  byId('selected-listing').innerHTML = `
    <div class="selected-layout">
      <div class="selected-head">
        <div>
          <h2 class="mt-0">${escapeHtml(listing.title)}</h2>
          <p class="muted-text mt-2">${escapeHtml(listing.builder)} - ${escapeHtml(listing.builderType)} - ${escapeHtml(listing.dropType)}</p>
        </div>
        <span class="price-stamp">${escapeHtml(listing.price)}</span>
      </div>
      <div class="base-stage">
        ${baseMapMarkup(listing)}
      </div>
      <div class="metric-grid">
        ${metricMarkup([
          ['Format', listing.format],
          ['Freshness', listing.freshness],
          ['Release', listing.releaseWindow],
          ['Proof band', listing.testBand],
          ['Copy state', listing.copyState],
          ['Risk', listing.copyRisk]
        ])}
      </div>
      <div class="quote-box">${escapeHtml(listing.reviewQuote)}</div>
      <div class="selected-proof-grid">
        ${listing.proof
          .map(
            (proof) => `
              <article class="selected-proof-card">
                <h3>${escapeHtml(proof.label)}</h3>
                <strong class="mt-2 block text-[1.35rem] text-[#ffc83d]">${escapeHtml(proof.value)}</strong>
                <p class="mt-1">${escapeHtml(proof.note)}</p>
              </article>
            `
          )
          .join('')}
      </div>
      <p class="muted-text">${escapeHtml(listing.apiHook)}</p>
    </div>
  `;
}

function renderListings() {
  const listings = filteredListings();
  if (!listings.some((listing) => listing.id === activeListingId)) {
    activeListingId = listings[0]?.id || summary.listings[0]?.id;
  }

  const active = activeListing();
  renderFeatured(active);
  renderSelectedListing(active);

  byId('listing-grid').innerHTML = listings
    .map(
      (listing) => `
        <button
          class="listing-card ${listing.id === active.id ? 'is-active' : ''}"
          data-listing-id="${escapeHtml(listing.id)}"
          style="--card-accent: ${escapeHtml(listing.accent)}"
        >
          <div class="space-y-3">
            ${listingHeader(listing)}
            ${baseMapMarkup(listing, 'mini-map')}
            <div class="metric-grid">
              ${metricMarkup([
                ['Drop', listing.dropType],
                ['Age', listing.freshness],
                ['Rating', `${listing.rating} / ${listing.reviews}`],
                ['Proof', listing.testBand],
                ['Shield', listing.copyState],
                ['Sub', listing.subscription]
              ])}
            </div>
            <p class="listing-meta">${escapeHtml(listing.reviewQuote)}</p>
          </div>
          <div class="tag-row mt-3">${tagMarkup(listing.tags, 4)}</div>
        </button>
      `
    )
    .join('');

  document.querySelectorAll('[data-listing-id]').forEach((button) => {
    button.addEventListener('click', () => {
      activeListingId = button.dataset.listingId;
      renderListings();
    });
  });
}

function renderMarketIntel(items) {
  byId('market-intel').innerHTML = items
    .map(
      (item) => `
        <article class="intel-card">
          <h3>${escapeHtml(item.label)}</h3>
          <strong class="mt-2">${escapeHtml(item.value)}</strong>
          <p class="mt-2">${escapeHtml(item.detail)}</p>
        </article>
      `
    )
    .join('');
}

function renderFindings(findings) {
  byId('findings').innerHTML = findings
    .map(
      (finding) => `
        <article class="finding-card">
          <h3>${escapeHtml(finding.title)}</h3>
          <p class="mt-2">${escapeHtml(finding.body)}</p>
        </article>
      `
    )
    .join('');
}

function renderBuilders(builders) {
  byId('builders-grid').innerHTML = builders
    .map(
      (builder) => `
        <article class="builder-card" style="--card-accent: ${escapeHtml(builder.accent)}">
          <div class="builder-head">
            <div>
              <h3>${escapeHtml(builder.name)}</h3>
              <p class="mt-2">${escapeHtml(builder.specialty)}</p>
            </div>
            <span class="stone-badge">${escapeHtml(builder.score)}</span>
          </div>
          <div class="builder-score mt-4" aria-label="Trust score ${escapeHtml(builder.score)}">
            <span style="width: ${escapeHtml(builder.score)}%"></span>
          </div>
          <div class="metric-grid mt-3">
            ${metricMarkup([
              ['Sub', builder.subscription],
              ['Drops', builder.cadence],
              ['Risk', builder.risk]
            ])}
          </div>
          <p class="mt-3">${escapeHtml(builder.proof)}</p>
          <div class="tag-row mt-3">${tagMarkup(builder.strengths)}</div>
        </article>
      `
    )
    .join('');
}

function renderFingerprint(fingerprint) {
  byId('fingerprint-threshold').textContent = `${Math.round(fingerprint.threshold * 100)}% block`;
  byId('fingerprint-signals').innerHTML = fingerprint.signals
    .map(
      (signal) => `
        <article class="signal-card">
          <h3>${escapeHtml(signal.title)}</h3>
          <p class="mt-2">${escapeHtml(signal.body)}</p>
        </article>
      `
    )
    .join('');

  byId('fingerprint-results').innerHTML = fingerprint.verdicts
    .map((verdict) => {
      const status = verdict.status.toLowerCase();
      const stateClass = status.includes('blocked') ? 'is-blocked' : status.includes('queued') ? 'is-queued' : 'is-allowed';
      return `
        <article class="verdict-card ${stateClass}">
          <div class="card-split">
            <h3>${escapeHtml(verdict.pair)}</h3>
            <span class="stone-badge">${Math.round(verdict.score * 100)}%</span>
          </div>
          <strong class="mt-3">${escapeHtml(verdict.status)}</strong>
          <p class="mt-2">${escapeHtml(verdict.detail)}</p>
          <div class="tag-row mt-3">${tagMarkup(verdict.matchSignals)}</div>
        </article>
      `;
    })
    .join('');
}

function renderApiProof(cards) {
  byId('api-proof').innerHTML = cards
    .map(
      (card) => `
        <article class="proof-card">
          <h3>${escapeHtml(card.title)}</h3>
          <strong class="mt-2 block text-[#ffc83d]">${escapeHtml(card.value)}</strong>
          <p class="mt-2">${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join('');
}

function renderChecklist(items) {
  byId('buyer-checklist').innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderRoadmap(roadmap) {
  byId('roadmap').innerHTML = roadmap
    .map((item) => `<article class="roadmap-card"><p>${escapeHtml(item)}</p></article>`)
    .join('');
}

function wireControls() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      renderListings();
    });
  });

  document.querySelectorAll('[data-section-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = byId(button.dataset.sectionLink);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.nav-pill').forEach((item) => item.classList.remove('is-active'));
      if (button.classList.contains('nav-pill')) button.classList.add('is-active');
    });
  });
}

async function loadSummary() {
  const response = await fetch('/api/marketplace/summary', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`summary request failed: ${response.status}`);
  return response.json();
}

async function boot() {
  summary = await loadSummary();
  activeListingId = summary.listings[0]?.id;
  renderStats(summary.stats);
  renderMarketIntel(summary.marketIntel);
  renderFindings(summary.findings);
  renderListings();
  renderChecklist(summary.buyerChecklist);
  renderBuilders(summary.builders);
  renderFingerprint(summary.fingerprint);
  renderApiProof(summary.apiProofCards);
  renderRoadmap(summary.roadmap);
  wireControls();
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div class="war-card m-4 border-red-400 text-red-100">Marketplace preview failed to load: ${escapeHtml(error.message)}</div>`
  );
});
