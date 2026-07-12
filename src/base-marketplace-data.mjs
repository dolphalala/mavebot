export const marketplaceStats = [
  {
    label: 'Fresh bases',
    value: '184',
    detail: 'Tagged by TH, war format, Legend range, and publish window.'
  },
  {
    label: 'Protected sales',
    value: '14d',
    detail: 'Similarity locks stop reposts while paid packs are still fresh.'
  },
  {
    label: 'Verified builders',
    value: '37',
    detail: 'Reviews, test notes, and trophy evidence travel with each builder.'
  },
  {
    label: 'Avg pack price',
    value: '$3.20',
    detail: 'Single-base and subscription listings can coexist.'
  }
];

export const baseListings = [
  {
    id: 'th18-legend-ring',
    title: 'TH18 Legend Ringbox',
    townHall: 18,
    mode: 'Legend League',
    format: '1 base',
    price: '$4',
    freshness: '2 days old',
    rating: 4.9,
    reviews: 42,
    builder: 'RH Prime',
    builderType: 'Pro Builder',
    trophies: '6,150+ test band',
    defenses: '8 defended hits logged',
    copyState: 'Protected',
    tags: ['Anti-Root Rider', 'Spell trap core', 'Fresh links'],
    layout: [
      'wwwwwwwwwwww',
      'w..d...x..dw',
      'w.twwwwwwt.w',
      'w..w.c..w..w',
      'w.xw.hh.wx.w',
      'w..w....w..w',
      'w.twwwwwwt.w',
      'w..d...x..dw',
      'wwwwwwwwwwww'
    ],
    accent: '#34d399'
  },
  {
    id: 'th17-cwl-box',
    title: 'TH17 CWL Box Core',
    townHall: 17,
    mode: 'CWL',
    format: 'Best of 3',
    price: '$9',
    freshness: '4 days old',
    rating: 4.7,
    reviews: 28,
    builder: 'Blueprint Scout',
    builderType: 'Pack Seller',
    trophies: 'Champion 1 war tests',
    defenses: '12 war attacks reviewed',
    copyState: 'Watermarked',
    tags: ['Anti-triple', 'CWL friendly', 'Replay notes'],
    layout: [
      'wwwwwwwwwwww',
      'w.d..t..d..w',
      'w.wwwxwww..w',
      'w.w..h..w.tw',
      'w.x.c...x..w',
      'wtw..h..w..w',
      'w..wwwxwww.w',
      'w..d..t..d.w',
      'wwwwwwwwwwww'
    ],
    accent: '#60a5fa'
  },
  {
    id: 'th16-budget-war',
    title: 'TH16 Budget War Pack',
    townHall: 16,
    mode: 'War',
    format: '5 bases',
    price: '$12',
    freshness: '7 days old',
    rating: 4.6,
    reviews: 19,
    builder: 'Lana Labs',
    builderType: 'New Seller',
    trophies: 'Casual war sample',
    defenses: 'Community tested',
    copyState: 'Review window',
    tags: ['Clan bundles', 'Easy filters', 'Low price'],
    layout: [
      'wwwwwwwwwwww',
      'w.t.d..d.t.w',
      'w.wwwwwwww.w',
      'w..x.h.x..w',
      'w.d..c..d.w',
      'w..x.h.x..w',
      'w.wwwwwwww.w',
      'w.t.d..d.t.w',
      'wwwwwwwwwwww'
    ],
    accent: '#f59e0b'
  }
];

export const builderProfiles = [
  {
    name: 'RH Prime',
    specialty: 'Legend League and anti-meta war bases',
    score: 98,
    cadence: 'New drops every 2-4 days',
    proof: 'Links sales to replay notes and defense outcomes.'
  },
  {
    name: 'Blueprint Scout',
    specialty: 'CWL packs and pro-builder subscriptions',
    score: 94,
    cadence: 'Weekly packs plus event drops',
    proof: 'Requires reviewable pack history before renewal.'
  },
  {
    name: 'Lana Labs',
    specialty: 'Affordable bundles for clans and new builders',
    score: 88,
    cadence: 'Community-voted releases',
    proof: 'Uses similarity scan and public review response time.'
  }
];

export const researchFindings = [
  {
    title: 'Free layout sites are discovery-heavy',
    body: 'They make browsing and copy links easy, but usually do not solve builder reputation, paid freshness, or repost protection.'
  },
  {
    title: 'Paid builders sell trust as much as layouts',
    body: 'Subscription packs need proof that bases are fresh, tested, and not instantly leaked into free channels.'
  },
  {
    title: 'The differentiator is evidence',
    body: 'MaveBase should connect listings to reviews, Clash API snapshots, defense notes, and duplicate detection instead of only showing screenshots.'
  }
];

export const fingerprintDemo = {
  protectionWindowDays: 14,
  threshold: 0.82,
  signals: [
    'Town Hall level and mode',
    'Compartment graph shape',
    'Town Hall and high-defense coordinates',
    'Wall ring count and junction pattern',
    'Trap-density zones',
    'Core/sweeper/inferno/eagle offsets',
    'Copy-link normalized metadata when available'
  ],
  verdicts: [
    {
      pair: 'TH18 Legend Ringbox vs repost attempt',
      score: 0.91,
      status: 'Blocked as too similar'
    },
    {
      pair: 'TH17 CWL Box vs TH17 trophy farm',
      score: 0.41,
      status: 'Allowed'
    }
  ]
};

export const productRoadmap = [
  'Seller pages with proof, cadence, pack history, and response time.',
  'Single-base checkout and subscription bundles with freshness windows.',
  'Review system that separates buyer feedback from replay/test evidence.',
  'Similarity queue that flags reposts before they can be published.',
  'Clash API enrichment for player, clan, trophy, war, and Legend context.',
  'Discord bot bridge for posting listings, reviewing bases, and watching alerts.'
];

export function marketplaceSummary() {
  return {
    generatedAt: new Date().toISOString(),
    stats: marketplaceStats,
    listings: baseListings,
    builders: builderProfiles,
    findings: researchFindings,
    fingerprint: fingerprintDemo,
    roadmap: productRoadmap
  };
}
