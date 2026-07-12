export const marketplaceStats = [
  {
    label: 'Fresh base drops',
    value: '184',
    detail: 'Singles, bundles, and subscription releases tagged by Town Hall, mode, and live season.'
  },
  {
    label: 'Freshness shield',
    value: '14d',
    detail: 'Similarity locks protect paid releases while they are still useful and hard to find.'
  },
  {
    label: 'Builder subscriptions',
    value: '$12-30',
    detail: 'Monthly packs sit beside $1-5 single-base buys so players are not forced into blind renewals.'
  },
  {
    label: 'Verified reviews',
    value: '2.7k',
    detail: 'Ratings attach to the exact layout, replay notes, trophy band, and buyer outcome.'
  },
  {
    label: 'API proof points',
    value: '41k',
    detail: 'Player, clan, war, Legend, and trophy snapshots become seller evidence instead of marketing copy.'
  },
  {
    label: 'Leak disputes',
    value: '6.1%',
    detail: 'Flagged reposts route to a moderation queue with the similarity signals shown.'
  }
];

export const baseListings = [
  {
    id: 'th18-legend-diamond',
    title: 'TH18 Legend Diamond Trapbox',
    townHall: 18,
    mode: 'Legend League',
    format: '1 fresh link',
    dropType: 'Single base',
    price: '$4',
    subscription: '$24/mo builder vault',
    freshness: '18 hours old',
    releaseWindow: 'Day 2 Legend push',
    rating: 4.9,
    reviews: 64,
    builder: 'RH Prime',
    builderType: 'Pro builder',
    builderScore: 98,
    trophies: '6,250+ test band',
    defenses: '11 defended hits logged',
    copyState: 'Freshness shield active',
    copyRisk: 'Low leak risk',
    testBand: 'Top 2k Legend samples',
    accent: '#ffc83d',
    tags: ['Anti-Root Rider', 'Spell trap core', 'Legend day 2', 'Replay notes'],
    proof: [
      { label: 'Best hold', value: '-23', note: 'Root Rider + clone failed at 83%' },
      { label: 'Avg loss', value: '-32', note: '11 defenses in 6,250+ range' },
      { label: 'Buyer fit', value: 'Push', note: 'Needs max traps and active CC swaps' }
    ],
    metrics: [
      ['TH', '18'],
      ['Mode', 'Legend'],
      ['Price', '$4'],
      ['Age', '18h'],
      ['Shield', '13d left'],
      ['Reviews', '64']
    ],
    reviewQuote: 'Best day-two base I tried this month. Held two root rider spam hits below 80.',
    apiHook: 'Pulls player trophies, league icon, defensive count, and prior Legend finish.',
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
    price: '$11',
    subscription: '$28/mo war room',
    freshness: '3 days old',
    releaseWindow: 'CWL prep week',
    rating: 4.8,
    reviews: 39,
    builder: 'Blueprint Scout',
    builderType: 'Pack seller',
    builderScore: 95,
    trophies: 'Champion 1 scrims',
    defenses: '17 hard-mode attacks reviewed',
    copyState: 'Watermarked links',
    copyRisk: 'Medium leak watch',
    testBand: 'Champion 1 / esports trials',
    accent: '#3dd7ff',
    tags: ['Anti-triple', 'Hard mode', 'Builder comments', 'CWL swaps'],
    proof: [
      { label: 'War result', value: '13/17', note: 'Non-triples in hard-mode testing' },
      { label: 'Trap note', value: 'Clone bait', note: 'Core pathing punishes blimp clone' },
      { label: 'Buyer fit', value: 'Serious clans', note: 'Requires scouting notes before war day' }
    ],
    metrics: [
      ['TH', '18'],
      ['Mode', 'War'],
      ['Pack', '3'],
      ['Age', '3d'],
      ['Shield', '11d left'],
      ['Reviews', '39']
    ],
    reviewQuote: 'The builder notes mattered. Our attackers understood exactly which CC and trap swaps to use.',
    apiHook: 'Connects clan war league, current war attacks, and clan history once enabled.',
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
    dropType: 'Subscription drop',
    price: '$16',
    subscription: '$30/mo limited slots',
    freshness: '5 days old',
    releaseWindow: 'Season reset',
    rating: 4.7,
    reviews: 52,
    builder: 'CWL Forge',
    builderType: 'League specialist',
    builderScore: 93,
    trophies: 'Masters 1 to Champ 2',
    defenses: '31 CWL attacks tagged',
    copyState: 'Review window',
    copyRisk: 'Moderate remix risk',
    testBand: 'CWL roster proof',
    accent: '#9b7cff',
    tags: ['CWL week', 'Anti-2 star', 'Hero dive punish', 'Limited slots'],
    proof: [
      { label: 'Stars held', value: '2.18 avg', note: '31 tagged CWL attacks' },
      { label: 'Refund flag', value: 'None', note: 'No stale-link complaints this season' },
      { label: 'Buyer fit', value: 'Roster packs', note: 'Best when assigned by mirror weight' }
    ],
    metrics: [
      ['TH', '17'],
      ['Mode', 'CWL'],
      ['Pack', '5'],
      ['Age', '5d'],
      ['Slots', '9 left'],
      ['Reviews', '52']
    ],
    reviewQuote: 'Finally a CWL pack where every base had a job instead of two good links and filler.',
    apiHook: 'Maps review outcomes to clan, war league, and attack result evidence.',
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
    title: 'TH16 Budget Clan War Bundle',
    townHall: 16,
    mode: 'War',
    format: '10 clan links',
    dropType: 'Clan bundle',
    price: '$18',
    subscription: '$12/mo small clans',
    freshness: '7 days old',
    releaseWindow: 'Weekly clan pack',
    rating: 4.6,
    reviews: 27,
    builder: 'Lana Labs',
    builderType: 'New seller',
    builderScore: 88,
    trophies: 'Casual war sample',
    defenses: 'Community-tested war log',
    copyState: 'Similarity review',
    copyRisk: 'Low price, higher audit',
    testBand: 'Mid-weight clan wars',
    accent: '#ff7a3d',
    tags: ['Clan bundles', 'Low price', 'Easy filters', 'Buyer comments'],
    proof: [
      { label: 'Pack value', value: '$1.80/base', note: 'Affordable clan filler without blind Patreon buy' },
      { label: 'Review mix', value: '4.6', note: 'Weighted by actual war use' },
      { label: 'Buyer fit', value: 'Casual wars', note: 'Not marketed as esports/pro proof' }
    ],
    metrics: [
      ['TH', '16'],
      ['Mode', 'War'],
      ['Pack', '10'],
      ['Age', '7d'],
      ['Shield', '7d left'],
      ['Reviews', '27']
    ],
    reviewQuote: 'Good budget pack. Not all pro-grade, but every link was useful for regular war spins.',
    apiHook: 'Can connect buyer review to clan war attack result after account linking.',
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
    dropType: 'Single base',
    price: '$2',
    subscription: '$8/mo Builder Base feed',
    freshness: '2 days old',
    releaseWindow: 'Builder trophy week',
    rating: 4.5,
    reviews: 18,
    builder: 'Night Forge',
    builderType: 'Builder Base seller',
    builderScore: 84,
    trophies: '5,000+ builder band',
    defenses: 'Stage-2 pathing notes',
    copyState: 'Protected',
    copyRisk: 'Low',
    testBand: 'Builder trophy push',
    accent: '#46d68c',
    tags: ['Builder Base', 'Anti-air', 'Stage notes', 'Cheap single'],
    proof: [
      { label: 'Stage two', value: '72%', note: 'Avg attacker completion from sample' },
      { label: 'Freshness', value: '2d', note: 'Still inside early release window' },
      { label: 'Buyer fit', value: 'BH10', note: 'Good for trophy push, not clan war' }
    ],
    metrics: [
      ['BH', '10'],
      ['Mode', 'Builder'],
      ['Price', '$2'],
      ['Age', '2d'],
      ['Shield', '12d left'],
      ['Reviews', '18']
    ],
    reviewQuote: 'The second-stage notes made it much easier to understand why the base works.',
    apiHook: 'Uses Builder Base trophy and best trophy proof when available from the API.',
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
    title: 'Capital Peak Raid Weekend Ring',
    townHall: 10,
    mode: 'Capital Hall',
    format: 'District set',
    dropType: 'Pack',
    price: '$7',
    subscription: '$15/mo capital library',
    freshness: '6 days old',
    releaseWindow: 'Raid weekend',
    rating: 4.4,
    reviews: 15,
    builder: 'Capital Cartel',
    builderType: 'Capital Hall mapper',
    builderScore: 82,
    trophies: 'Capital 10 clans',
    defenses: 'Raid pathing review',
    copyState: 'Manual review',
    copyRisk: 'District remix watch',
    testBand: 'Raid weekend samples',
    accent: '#dc5cff',
    tags: ['Capital Hall', 'Raid weekend', 'District set', 'Pathing proof'],
    proof: [
      { label: 'Districts', value: '4', note: 'Capital Peak plus core districts' },
      { label: 'Avg attacks', value: '-1.3', note: 'Fewer attacks versus prior weekend' },
      { label: 'Buyer fit', value: 'Capital clans', note: 'Needs district-level browsing and comments' }
    ],
    metrics: [
      ['CH', '10'],
      ['Mode', 'Capital'],
      ['Pack', '4'],
      ['Age', '6d'],
      ['Review', 'Manual'],
      ['Reviews', '15']
    ],
    reviewQuote: 'The district set was easier to apply than random screenshots from Discord.',
    apiHook: 'Future API enrichment can attach clan capital raid weekend evidence.',
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
    specialty: 'Legend League anti-meta bases',
    score: 98,
    cadence: 'New drops every 2-4 days during push weeks',
    subscription: '$24/mo',
    proof: 'Requires replay notes, trophy band, and defensive sample before a listing is marked verified.',
    strengths: ['Fast freshness', 'Strong review response', 'Legend proof'],
    risk: 'High resale target, so leak scanning must be strict.',
    accent: '#ffc83d'
  },
  {
    name: 'Blueprint Scout',
    specialty: 'CWL, hard-mode, and custom war packs',
    score: 95,
    cadence: 'Weekly pack drops plus limited CWL windows',
    subscription: '$28-30/mo',
    proof: 'Builder comments explain trap swaps, CC plans, and which attacks the base is meant to punish.',
    strengths: ['War notes', 'Limited slots', 'Pack history'],
    risk: 'More expensive subscriptions need transparent pack quality.',
    accent: '#3dd7ff'
  },
  {
    name: 'Lana Labs',
    specialty: 'Affordable clan bundles and new-builder discovery',
    score: 88,
    cadence: 'Community-voted releases every week',
    subscription: '$12/mo',
    proof: 'Base-level reviews distinguish bargain value from pro-level proof.',
    strengths: ['Low entry price', 'Clan bundles', 'Friendly support'],
    risk: 'Needs strict duplicate review because newer sellers have less history.',
    accent: '#ff7a3d'
  },
  {
    name: 'Night Forge',
    specialty: 'Builder Base trophy layouts',
    score: 84,
    cadence: 'Small drops around Builder Base meta changes',
    subscription: '$8/mo',
    proof: 'Stage-two pathing and Builder trophy deltas are required for premium labels.',
    strengths: ['Niche coverage', 'Cheap singles', 'Stage notes'],
    risk: 'Smaller market needs search filters that expose it clearly.',
    accent: '#46d68c'
  }
];

export const researchFindings = [
  {
    title: 'Large free sites optimize discovery',
    body: 'They prove players want filters, copy links, ratings, and fresh uploads, but they do not solve paid freshness, builder trust, or leak protection.'
  },
  {
    title: 'Paid builders sell cadence and confidence',
    body: 'Subscription buyers care whether bases are fresh, tested, and released on a predictable schedule, not just whether a screenshot looks cool.'
  },
  {
    title: 'The buyer problem is blind renewal',
    body: 'A player may pay around $30 for a private feed and only use a few bases, so MaveBase has to expose individual base proof and reviews before purchase.'
  },
  {
    title: 'The moat is evidence',
    body: 'Reviews, Clash API snapshots, replay notes, freshness windows, and duplicate checks create the trust layer that Discord leaks and generic layout catalogs lack.'
  }
];

export const marketIntel = [
  {
    label: 'Subscription fatigue',
    value: '$30 blind packs',
    detail: 'Monthly feeds work for loyal fans, but buyers need per-base ratings and renewal proof.'
  },
  {
    label: 'Leak rings',
    value: 'pooled buys',
    detail: 'Groups buy once, repost everywhere, and destroy a builder release window unless the market detects duplicates.'
  },
  {
    label: 'Base usefulness',
    value: 'not every link',
    detail: 'A pack can include filler. Ratings must attach to each layout, not only the builder.'
  },
  {
    label: 'Mode coverage',
    value: 'TH/BH/CH',
    detail: 'Town Hall, Builder Base, Capital, Legend, CWL, trophy, farm, hybrid, and fun bases need separate filters.'
  }
];

export const apiProofCards = [
  {
    title: 'Legend proof',
    value: 'rank, trophies, defense losses',
    detail: 'Player tags can prove trophy range, league badge, prior finish, and whether the base was tested in a real push band.'
  },
  {
    title: 'War proof',
    value: 'stars, percent, attack style',
    detail: 'Clan war and CWL context should turn a review into evidence: who attacked, what hit failed, and where the base was used.'
  },
  {
    title: 'Builder reputation',
    value: 'cadence, disputes, renewals',
    detail: 'A seller profile should show how often they release, how fast they respond, and whether buyers keep renewing.'
  }
];

export const buyerChecklist = [
  'Can I buy this exact base without subscribing?',
  'How old is the release and how many days remain in the freshness shield?',
  'Which trophy band, war league, or player profile proves the base worked?',
  'Are reviews about this base, this pack, or just the builder?',
  'Was this layout blocked, approved, or queued by the similarity scan?',
  'Does the seller explain trap swaps, CC, and intended attack counters?'
];

export const fingerprintDemo = {
  protectionWindowDays: 14,
  threshold: 0.82,
  signals: [
    {
      title: 'Layout normalization',
      body: 'Strip cosmetic naming, normalize grid orientation, and record Town Hall/mode before comparing.'
    },
    {
      title: 'Compartment graph',
      body: 'Compare wall rings, junctions, core shape, and pathing lanes to catch small visual remixes.'
    },
    {
      title: 'Defense anchors',
      body: 'Track Town Hall, Inferno, Scatter, Eagle, sweeper, air, hero, trap, and spell-tower coordinates.'
    },
    {
      title: 'Freshness window',
      body: 'Block obvious reposts above threshold while the paid base is still inside its release window.'
    },
    {
      title: 'Review queue',
      body: 'Borderline matches go to a seller/moderator review with the exact similarity signals shown.'
    },
    {
      title: 'Audit trail',
      body: 'Persist allow/block/dispute outcomes so future buyers know whether a listing was original.'
    }
  ],
  verdicts: [
    {
      pair: 'TH18 Legend Diamond vs repost attempt',
      score: 0.91,
      status: 'Blocked as too similar',
      detail: 'Same core, same inferno/scatter offsets, same trap-density ring, and only two exterior swaps.',
      matchSignals: ['Core', 'Infernos', 'Traps', 'Walls']
    },
    {
      pair: 'TH18 War Maze vs teaser remix',
      score: 0.78,
      status: 'Queued for review',
      detail: 'Compartments changed, but high-value defense anchors still line up with the paid pack.',
      matchSignals: ['Town Hall', 'Scatter', 'Wall ring']
    },
    {
      pair: 'BH10 Night Cache vs trophy farm',
      score: 0.39,
      status: 'Allowed',
      detail: 'Mode and stage are similar, but the compartment graph and defensive anchors are different.',
      matchSignals: ['Mode only']
    }
  ]
};

export const productRoadmap = [
  'Replace demo listings with Postgres-backed builders, bases, reviews, comments, subscriptions, and purchases.',
  'Add upload review with normalized layout fingerprints and similarity events before a base can be published.',
  'Add Clash API enrichment for player tags, clan tags, war/CWL evidence, Legend stats, and Builder Base proof.',
  'Build seller pages with cadence, pack history, freshness reliability, dispute rate, and renewal quality.',
  'Add buyer pages for saved bases, private purchased links, review prompts, and renewal decisions.',
  'Add Discord alerts for new drops, price changes, leak disputes, and base review requests.',
  'Add mode-specific storefronts for Legend, CWL, war, Builder Base, Capital Hall, farming, trophy, and fun bases.',
  'Add moderation tools for duplicate appeals, takedowns, refund notes, and seller trust adjustments.'
];

export function marketplaceSummary() {
  return {
    generatedAt: new Date().toISOString(),
    stats: marketplaceStats,
    listings: baseListings,
    builders: builderProfiles,
    findings: researchFindings,
    marketIntel,
    apiProofCards,
    buyerChecklist,
    fingerprint: fingerprintDemo,
    roadmap: productRoadmap
  };
}
