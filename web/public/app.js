const tileClass = {
  w: 'tile-wall',
  d: 'tile-defense',
  t: 'tile-tower',
  c: 'tile-core',
  h: 'tile-hero',
  x: 'tile-trap',
  '.': 'tile-empty'
};

let summary = null;
let activeFilter = 'all';
let activeListingId = null;

function byId(id) {
  return document.getElementById(id);
}

function moneyToNumber(price) {
  return Number(String(price).replace(/[^0-9.]/g, '')) || 0;
}

function tileMarkup(layout, { mini = false } = {}) {
  return layout
    .join('')
    .split('')
    .map((tile) => `<span class="tile ${tileClass[tile] || 'tile-empty'}" aria-hidden="true"></span>`)
    .join('');
}

function renderStats(stats) {
  byId('stats').innerHTML = stats
    .map(
      (stat) => `
        <article class="stat-card">
          <strong>${stat.value}</strong>
          <span>${stat.label}</span>
          <p class="mt-2">${stat.detail}</p>
        </article>
      `
    )
    .join('');
}

function listingHeader(listing) {
  return `
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase text-slate-400">TH${listing.townHall} ${listing.mode}</p>
        <h3 class="mt-1 text-base font-semibold text-white">${listing.title}</h3>
      </div>
      <span class="subtle-badge">${listing.price}</span>
    </div>
  `;
}

function listingFacts(listing) {
  return `
    <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
      <span><strong class="text-white">${listing.rating}</strong> rating</span>
      <span><strong class="text-white">${listing.reviews}</strong> reviews</span>
      <span>${listing.freshness}</span>
      <span>${listing.copyState}</span>
    </div>
  `;
}

function renderFeatured(listing) {
  byId('active-price').textContent = listing.price;
  byId('featured-base').innerHTML = `
    <div class="space-y-4">
      ${listingHeader(listing)}
      <div class="base-map" role="img" aria-label="${listing.title} map preview">
        ${tileMarkup(listing.layout)}
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="finding-card">
          <p class="text-xs uppercase text-slate-400">Builder</p>
          <p class="mt-1 font-semibold text-white">${listing.builder}</p>
          <p class="text-xs text-slate-300">${listing.builderType}</p>
        </div>
        <div class="finding-card">
          <p class="text-xs uppercase text-slate-400">Proof band</p>
          <p class="mt-1 font-semibold text-white">${listing.trophies}</p>
          <p class="text-xs text-slate-300">${listing.defenses}</p>
        </div>
        <div class="finding-card">
          <p class="text-xs uppercase text-slate-400">Freshness</p>
          <p class="mt-1 font-semibold text-white">${listing.freshness}</p>
          <p class="text-xs text-slate-300">${listing.format}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        ${listing.tags.map((tag) => `<span class="tag-pill">${tag}</span>`).join('')}
      </div>
    </div>
  `;
}

function filteredListings() {
  if (!summary) return [];
  return summary.listings.filter((listing) => activeFilter === 'all' || listing.mode === activeFilter);
}

function renderListings() {
  const listings = filteredListings();
  if (!listings.some((listing) => listing.id === activeListingId)) {
    activeListingId = listings[0]?.id || summary.listings[0]?.id;
  }
  const activeListing = summary.listings.find((listing) => listing.id === activeListingId) || summary.listings[0];
  renderFeatured(activeListing);

  byId('listing-grid').innerHTML = listings
    .map(
      (listing) => `
        <button
          class="listing-card text-left ${listing.id === activeListing.id ? 'is-active' : ''}"
          data-listing-id="${listing.id}"
          style="--card-accent: ${listing.accent}"
        >
          <div>
            ${listingHeader(listing)}
            <div class="mini-map mt-3" aria-hidden="true">${tileMarkup(listing.layout, { mini: true })}</div>
            ${listingFacts(listing)}
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            ${listing.tags.slice(0, 2).map((tag) => `<span class="tag-pill">${tag}</span>`).join('')}
          </div>
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

function renderFindings(findings) {
  byId('findings').innerHTML = findings
    .map(
      (finding) => `
        <article class="finding-card">
          <h3 class="font-semibold text-white">${finding.title}</h3>
          <p class="mt-1 text-sm leading-6 text-slate-300">${finding.body}</p>
        </article>
      `
    )
    .join('');
}

function renderBuilders(builders) {
  byId('builders-grid').innerHTML = builders
    .map(
      (builder) => `
        <article class="builder-card">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-semibold text-white">${builder.name}</h3>
              <p class="mt-1 text-sm text-slate-300">${builder.specialty}</p>
            </div>
            <span class="subtle-badge">${builder.score}</span>
          </div>
          <div class="builder-score mt-4" aria-label="Trust score ${builder.score}">
            <span style="width: ${builder.score}%"></span>
          </div>
          <p class="mt-3 text-sm text-slate-300">${builder.cadence}</p>
          <p class="mt-2 text-xs text-slate-400">${builder.proof}</p>
        </article>
      `
    )
    .join('');
}

function renderFingerprint(fingerprint) {
  byId('fingerprint-threshold').textContent = `${fingerprint.threshold} block threshold`;
  byId('fingerprint-signals').innerHTML = fingerprint.signals
    .map((signal) => `<div class="signal-card text-sm text-slate-300">${signal}</div>`)
    .join('');

  byId('fingerprint-results').innerHTML = fingerprint.verdicts
    .map((verdict) => {
      const blocked = verdict.status.toLowerCase().includes('blocked');
      return `
        <article class="result-card ${blocked ? 'is-blocked' : 'is-allowed'}">
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-semibold text-white">${verdict.pair}</h3>
            <span class="subtle-badge">${verdict.score}</span>
          </div>
          <p class="mt-2 text-sm text-slate-300">${verdict.status}</p>
        </article>
      `;
    })
    .join('');
}

function renderRoadmap(roadmap) {
  byId('roadmap').innerHTML = roadmap
    .map((item, index) => `<article class="roadmap-card text-sm text-slate-300"><strong class="text-white">${index + 1}.</strong> ${item}</article>`)
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
      document.querySelectorAll('[data-section-link]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
    });
  });

  byId('compare-action').addEventListener('click', () => {
    byId('protect').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  renderFindings(summary.findings);
  renderListings();
  renderBuilders(summary.builders);
  renderFingerprint(summary.fingerprint);
  renderRoadmap(summary.roadmap);
  wireControls();
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<div class="m-4 rounded-lg border border-rose-400/40 bg-rose-950/70 p-3 text-sm text-rose-100">Marketplace preview failed to load: ${error.message}</div>`
  );
});
