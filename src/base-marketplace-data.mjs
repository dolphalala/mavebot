export const marketplaceStats = [
  { label: 'Live bases', value: '184', detail: 'Fresh layouts for TH, Builder Base, and Capital.' },
  { label: 'Today sold', value: '47', detail: 'Private links unlocked by buyers today.' },
  { label: 'Seller payout', value: '82%', detail: 'Demo seller share after marketplace fee.' },
  { label: 'Fresh shield', value: '14d', detail: 'Similarity checks protect new paid releases.' }
];

export const tokenPacks = [
  { id: 'starter', name: 'Scout Pack', tokens: 25, price: '$5', unit: '$0.20/token', bonus: 'Good for 5-8 singles', tag: 'Starter' },
  { id: 'war', name: 'War Chest', tokens: 70, price: '$12', unit: '$0.17/token', bonus: 'Best value for clan buyers', tag: 'Popular' },
  { id: 'builder', name: 'Builder Vault', tokens: 160, price: '$25', unit: '$0.16/token', bonus: 'For boosts and subscriptions', tag: 'Best value' }
];

export const baseListings = [
  {
    id: 'th18-legend-diamond',
    title: 'TH18 Legend Diamond Trapbox',
    townHall: 18,
    mode: 'Legend League',
    format: '1 fresh link',
    dropType: 'Single',
    costTokens: 4,
    cashPrice: '$4',
    subscription: '24 tokens/mo',
    freshness: '18h',
    shield: '13d left',
    rating: 4.9,
    reviews: 64,
    sold: 138,
    builder: 'RH Prime',
    builderType: 'Pro builder',
    builderScore: 98,
    proofLine: '11 defenses in 6,250+ Legend range',
    copyState: 'Fresh shield',
    copyRisk: 'Low',
    testBand: 'Top 2k Legend',
    accent: '#ffc83d',
    spotlight: true,
    tags: ['Anti-Root Rider', 'Legend push', 'Replay notes'],
    buyerNote: 'Held two root rider spam hits below 80%.',
    proof: [
      { label: 'Best hold', value: '-23' },
      { label: 'Avg loss', value: '-32' },
      { label: 'Shield', value: '13d' }
    ],
    reviewsFeed: [
      { user: 'Dolph', rating: 5, text: 'Cleanest day-two push base I tested.' },
      { user: 'Auri', rating: 5, text: 'Worth the tokens. Trap notes helped.' }
    ],
    layout: [
      'ggggggggggggg',
      'ggwwwwwwwwwgg',
      'gw.d.sx.d.wg',
      'gwtwwaaww.tw',
      'gw.xwhhwx.wg',
      'gwaiwccwiae',
      'gw.xwhhwx.wg',
      'gwtwwaaww.tw',
      'gw.d.sx.d.wg',
      'ggwwwwwwwwwgg',
      'ggggggggggggg'
    ]
  },
  {
    id: 'th18-war-hardmode',
    title: 'TH18 Hard Mode War Maze',
    townHall: 18,
    mode: 'War',
    format: 'Best of 3',
    dropType: 'Pack',
    costTokens: 11,
    cashPrice: '$11',
    subscription: '28 tokens/mo',
    freshness: '3d',
    shield: '11d left',
    rating: 4.8,
    reviews: 39,
    sold: 82,
    builder: 'Blueprint Scout',
    builderType: 'War pack seller',
    builderScore: 95,
    proofLine: '13/17 hard-mode hits did not triple',
    copyState: 'Watermarked',
    copyRisk: 'Watch',
    testBand: 'Champion 1 scrims',
    accent: '#3dd7ff',
    spotlight: true,
    tags: ['Hard mode', 'Anti-triple', 'CWL swaps'],
    buyerNote: 'Builder notes explain CC and trap swaps.',
    proof: [
      { label: 'Non-triples', value: '13/17' },
      { label: 'Pack', value: '3' },
      { label: 'Shield', value: '11d' }
    ],
    reviewsFeed: [
      { user: 'Arsh', rating: 5, text: 'Feels like a real war-room base, not filler.' },
      { user: 'Mave', rating: 4, text: 'Good, but needs the notes to run properly.' }
    ],
    layout: [
      'ggggggggggggg',
      'gwwwwwwwwwwwg',
      'gwdiwxxwidwg',
      'gw.wwaaww.wg',
      'gwt.xhhx.twg',
      'gwaswccwsag',
      'gwt.xhhx.twg',
      'gw.wwaaww.wg',
      'gwdiwxxwidwg',
      'gwwwwwwwwwwwg',
      'ggggggggggggg'
    ]
  },
  {
    id: 'th17-cwl-split',
    title: 'TH17 CWL Split Inferno Box',
    townHall: 17,
    mode: 'CWL',
    format: '5-base week pack',
    dropType: 'Subscription',
    costTokens: 16,
    cashPrice: '$16',
    subscription: '30 tokens/mo',
    freshness: '5d',
    shield: '9d left',
    rating: 4.7,
    reviews: 52,
    sold: 104,
    builder: 'CWL Forge',
    builderType: 'League specialist',
    builderScore: 93,
    proofLine: '31 CWL attacks tagged',
    copyState: 'Review window',
    copyRisk: 'Medium',
    testBand: 'Masters 1 to Champ 2',
    accent: '#9b7cff',
    spotlight: false,
    tags: ['CWL week', 'Anti-2 star', 'Limited slots'],
    buyerNote: 'Every base in the pack has a clear job.',
    proof: [
      { label: 'Stars held', value: '2.18' },
      { label: 'Pack', value: '5' },
      { label: 'Slots', value: '9' }
    ],
    reviewsFeed: [
      { user: 'Rocco', rating: 5, text: 'Good mirror assignments. Not random links.' }
    ],
    layout: [
      'ggggggggggggg',
      'ggwwwwwwwwwgg',
      'gw.tdxxdt.wg',
      'gwawwiiwwag',
      'gw.xhsshx.wg',
      'gwd.wccw.dwg',
      'gw.xhsshx.wg',
      'gwawwiiwwag',
      'gw.tdxxdt.wg',
      'ggwwwwwwwwwgg',
      'ggggggggggggg'
    ]
  },
  {
    id: 'th16-clan-budget',
    title: 'TH16 Clan War Bundle',
    townHall: 16,
    mode: 'War',
    format: '10 clan links',
    dropType: 'Bundle',
    costTokens: 18,
    cashPrice: '$18',
    subscription: '12 tokens/mo',
    freshness: '7d',
    shield: '7d left',
    rating: 4.6,
    reviews: 27,
    sold: 61,
    builder: 'Lana Labs',
    builderType: 'New seller',
    builderScore: 88,
    proofLine: '$1.80 per base for casual clans',
    copyState: 'Similarity review',
    copyRisk: 'Audit',
    testBand: 'Mid-weight wars',
    accent: '#ff7a3d',
    spotlight: false,
    tags: ['Budget', 'Clan pack', 'Buyer comments'],
    buyerNote: 'Useful regular-war filler at a low price.',
    proof: [
      { label: 'Value', value: '1.8t/base' },
      { label: 'Pack', value: '10' },
      { label: 'Shield', value: '7d' }
    ],
    reviewsFeed: [
      { user: 'Lana', rating: 5, text: 'Easy for normal clans to use.' }
    ],
    layout: [
      'ggggggggggggg',
      'gwwwwwwwwwwwg',
      'gw.t.d.d.t.wg',
      'gwawwwwwawg',
      'gw.xh..hx.wg',
      'gwd..cc..dwg',
      'gw.xh..hx.wg',
      'gwawwwwwawg',
      'gw.t.d.d.t.wg',
      'gwwwwwwwwwwwg',
      'ggggggggggggg'
    ]
  },
  {
    id: 'bh10-night-cache',
    title: 'BH10 Night Cache Anti-Air',
    townHall: 10,
    mode: 'Builder Base',
    format: '2 stages',
    dropType: 'Single',
    costTokens: 2,
    cashPrice: '$2',
    subscription: '8 tokens/mo',
    freshness: '2d',
    shield: '12d left',
    rating: 4.5,
    reviews: 18,
    sold: 44,
    builder: 'Night Forge',
    builderType: 'Builder Base seller',
    builderScore: 84,
    proofLine: '5,000+ Builder Base test band',
    copyState: 'Fresh shield',
    copyRisk: 'Low',
    testBand: 'Builder trophy push',
    accent: '#46d68c',
    spotlight: false,
    tags: ['Builder Base', 'Anti-air', 'Cheap single'],
    buyerNote: 'Stage-two notes make the base easy to run.',
    proof: [
      { label: 'Stage 2 avg', value: '72%' },
      { label: 'Cost', value: '2t' },
      { label: 'Shield', value: '12d' }
    ],
    reviewsFeed: [
      { user: 'Noob Jinj', rating: 4, text: 'Simple and cheap. Good BH option.' }
    ],
    layout: [
      'ggggggggggggg',
      'ggwwwwwwwggg',
      'gwt..x..twgg',
      'gw.wwwww.wgg',
      'gw.xhchx.wgg',
      'gwdw.s.wdwg',
      'gw.xhchx.wgg',
      'gw.wwwww.wgg',
      'gwt..x..twgg',
      'ggwwwwwwwggg',
      'ggggggggggggg'
    ]
  },
  {
    id: 'capital-peak-ring',
    title: 'Capital Peak Raid Ring',
    townHall: 10,
    mode: 'Capital Hall',
    format: 'District set',
    dropType: 'Pack',
    costTokens: 7,
    cashPrice: '$7',
    subscription: '15 tokens/mo',
    freshness: '6d',
    shield: 'Manual',
    rating: 4.4,
    reviews: 15,
    sold: 26,
    builder: 'Capital Cartel',
    builderType: 'Capital Hall mapper',
    builderScore: 82,
    proofLine: 'Raid weekend pathing review',
    copyState: 'Manual review',
    copyRisk: 'Medium',
    testBand: 'Capital 10 clans',
    accent: '#dc5cff',
    spotlight: false,
    tags: ['Capital Hall', 'Raid weekend', 'District set'],
    buyerNote: 'Better than random screenshots from Discord.',
    proof: [
      { label: 'Districts', value: '4' },
      { label: 'Attacks', value: '-1.3' },
      { label: 'Review', value: 'Manual' }
    ],
    reviewsFeed: [
      { user: 'Pekkaboo', rating: 4, text: 'District set was easy to apply.' }
    ],
    layout: [
      'ggggggggggggg',
      'gwwwwwwwwwwwg',
      'gw.d.t.t.d.wg',
      'gw.wwwww.wg',
      'gw.xhchx.wg',
      'gwdw.s.wdwg',
      'gw.xhchx.wg',
      'gw.wwwww.wg',
      'gw.d.t.t.d.wg',
      'gwwwwwwwwwwwg',
      'ggggggggggggg'
    ]
  }
];

export const builderProfiles = [
  {
    name: 'RH Prime',
    specialty: 'Legend anti-meta',
    score: 98,
    followers: '2.8k',
    sales: '1.4k',
    nextDrop: 'Tonight',
    subscription: '24 tokens/mo',
    accent: '#ffc83d'
  },
  {
    name: 'Blueprint Scout',
    specialty: 'War and CWL packs',
    score: 95,
    followers: '1.9k',
    sales: '940',
    nextDrop: '2 days',
    subscription: '28 tokens/mo',
    accent: '#3dd7ff'
  },
  {
    name: 'Lana Labs',
    specialty: 'Budget clan bundles',
    score: 88,
    followers: '420',
    sales: '216',
    nextDrop: 'Friday',
    subscription: '12 tokens/mo',
    accent: '#ff7a3d'
  },
  {
    name: 'Night Forge',
    specialty: 'Builder Base',
    score: 84,
    followers: '315',
    sales: '144',
    nextDrop: 'Next week',
    subscription: '8 tokens/mo',
    accent: '#46d68c'
  }
];

export const researchFindings = [
  {
    title: 'Fresh paid bases need a market, not a brochure',
    body: 'Users should see fresh listings, token cost, reviews, proof, and buy buttons immediately.'
  },
  {
    title: 'Builders need monetization controls',
    body: 'A useful marketplace lets sellers submit links, sell singles or subscriptions, and spend tokens to spotlight fresh drops.'
  },
  {
    title: 'Similarity protection is still the trust layer',
    body: 'Fresh paid layouts are only valuable if reposts and remix leaks are flagged before buyers waste tokens.'
  }
];

export const fingerprintDemo = {
  protectionWindowDays: 14,
  threshold: 0.82,
  signals: [
    { title: 'Exact link scan', body: 'Normalize copied base links and block repeat submissions.' },
    { title: 'Layout shape', body: 'Compare walls, compartments, core shape, and high-value defenses.' },
    { title: 'Fresh window', body: 'Hold similar uploads while a paid base is still fresh.' }
  ],
  verdicts: [
    {
      pair: 'TH18 Legend Diamond vs repost attempt',
      score: 0.91,
      status: 'Blocked as too similar',
      detail: 'Same core, trap ring, and inferno offsets.',
      matchSignals: ['Core', 'Traps', 'Walls']
    },
    {
      pair: 'TH18 War Maze vs teaser remix',
      score: 0.78,
      status: 'Queued for review',
      detail: 'Enough overlap to make a moderator check it.',
      matchSignals: ['Town Hall', 'Scatter']
    },
    {
      pair: 'BH10 Night Cache vs trophy farm',
      score: 0.39,
      status: 'Allowed',
      detail: 'Different compartments and defense anchors.',
      matchSignals: ['Mode only']
    }
  ]
};

export const activityFeed = [
  { type: 'sale', text: 'RH Prime sold TH18 Legend Diamond for 4 tokens.' },
  { type: 'review', text: 'Dolph left a 5-star review on a Legend base.' },
  { type: 'submit', text: 'Lana Labs submitted a TH16 clan bundle for review.' },
  { type: 'boost', text: 'Blueprint Scout bought a 24h spotlight slot.' }
];

export const marketPipeline = [
  { label: 'Submit', value: 'Copy link', detail: 'Seller adds title, mode, token price, and Clash layout link.' },
  { label: 'Scan', value: 'Fresh shield', detail: 'Similarity and duplicate checks run before a base can sell.' },
  { label: 'List', value: 'Shop cards', detail: 'Buyers filter by TH, mode, price, proof, seller, and reviews.' },
  { label: 'Unlock', value: 'Private link', detail: 'Tokens unlock the copy link and add it to the buyer library.' }
];

export const buyerLibrary = [
  {
    id: 'owned-th18-legend',
    listingId: 'th18-war-hardmode',
    title: 'TH18 Hard Mode War Maze',
    status: 'Unlocked',
    action: 'Copy link',
    expires: 'Forever',
    reviewDue: 'Today',
    paid: '11 tokens'
  },
  {
    id: 'owned-bh10-night',
    listingId: 'bh10-night-cache',
    title: 'BH10 Night Cache Anti-Air',
    status: 'Notes ready',
    action: 'Open notes',
    expires: 'Forever',
    reviewDue: '2 days',
    paid: '2 tokens'
  }
];

export const walletActivity = [
  { type: 'Top up', amount: '+70', detail: 'War Chest checkout', when: '10m ago' },
  { type: 'Purchase', amount: '-4', detail: 'TH18 Legend Diamond', when: '7m ago' },
  { type: 'Boost', amount: '-12', detail: 'Spotlight queue', when: '3m ago' }
];

export const sellerQueue = [
  {
    id: 'queue-lana-th17',
    title: 'TH17 Anti-Queen Charge Box',
    seller: 'Lana Labs',
    status: 'Similarity scan',
    eta: '6 min',
    ask: '5 tokens',
    result: 'No exact link match'
  },
  {
    id: 'queue-blueprint-cwl',
    title: 'CWL Week Two Rotation Pack',
    seller: 'Blueprint Scout',
    status: 'Moderator review',
    eta: '24 min',
    ask: '18 tokens',
    result: '78% overlap needs human check'
  },
  {
    id: 'queue-night-bh',
    title: 'BH10 Anti-Air Funnel',
    seller: 'Night Forge',
    status: 'Ready to list',
    eta: 'Now',
    ask: '2 tokens',
    result: 'Fresh shield cleared'
  }
];

export const spotlightQueue = [
  { title: 'TH18 Legend Diamond Trapbox', seller: 'RH Prime', slot: 'Now', spend: '12 tokens', lift: '+38% views' },
  { title: 'TH17 CWL Split Inferno Box', seller: 'CWL Forge', slot: 'Next', spend: '12 tokens', lift: 'Queued' },
  { title: 'BH10 Night Cache Anti-Air', seller: 'Night Forge', slot: 'Tonight', spend: '8 tokens', lift: 'Discount slot' }
];

export const productRoadmap = [
  'Persist listings, token balances, purchases, submissions, reviews, and boosts in Postgres.',
  'Add payment checkout for token top-ups and seller payout accounting.',
  'Add similarity checks before submitted base links can go live.',
  'Add buyer library pages for purchased private links and review reminders.',
  'Add seller dashboards for subscriptions, spotlight slots, disputes, and revenue.',
  'Add Clash API proof badges for player, clan, war, CWL, Legend, Builder Base, and Capital evidence.'
];

export function marketplaceSummary() {
  return {
    generatedAt: new Date().toISOString(),
    stats: marketplaceStats,
    listings: baseListings,
    builders: builderProfiles,
    findings: researchFindings,
    fingerprint: fingerprintDemo,
    tokenPacks,
    activityFeed,
    marketPipeline,
    buyerLibrary,
    walletActivity,
    sellerQueue,
    spotlightQueue,
    roadmap: productRoadmap
  };
}
