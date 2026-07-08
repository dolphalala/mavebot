import { deflateSync } from 'node:zlib';

export const loveLetters = [
  {
    title: 'For Lana, From Allen',
    body:
      'Lana, if love had a map, Allen would trace it from Korea to Croatia and still say the best place on it is wherever you are.',
    note:
      'A Korean heart and a Croatian heart, somehow speaking the same language.'
  },
  {
    title: 'A Small Forever',
    body:
      'Allen loves Lana in the quiet ways that last: in every check-in, every smile, every ordinary day that feels better because she is in it.',
    note:
      'Some love stories do not need noise. They just keep choosing each other.'
  },
  {
    title: 'Across Every Distance',
    body:
      'From Korean roots to Croatian grace, Lana and Allen are proof that the right person can make the world feel smaller and warmer at the same time.',
    note:
      'Different places, same home.'
  },
  {
    title: 'Dear Lana',
    body:
      'Allen would like the record to show that Lana is lovely, brilliant, and dangerously easy to adore. This bot has reviewed the evidence and agrees.',
    note:
      'Case closed.'
  },
  {
    title: 'The Best Translation',
    body:
      'Some things do not need perfect translation: the way Allen looks at Lana, the way she makes a room softer, the way love becomes obvious.',
    note:
      'Korean, Croatian, and completely understood.'
  }
];

export const loveuPoems = {
  titles: [
    'A Heart Appears',
    'Tiny Firework',
    'Soft Landing',
    'Ridiculous Amounts',
    'Little Legend',
    'Sweet Proof',
    'Fresh Dispatch',
    'Tiny Celebration'
  ],
  openers: [
    'For {name}, a little spark arrives,',
    '{name}, you get the kind of glow',
    'If the day has been heavy, {name},',
    '{name}, please accept this official decree:',
    'Some hearts whisper, some hearts sing,',
    '{name}, here is proof in rosy hue:',
    'A small bright message found {name},',
    'The sky made room today for {name},'
  ],
  secondLines: [
    'soft as a sunrise, bright as new skies.',
    'that makes ordinary minutes slow.',
    'let this heart land gently by your name.',
    'you are loved quite dramatically.',
    'some hearts show up with a sparkling thing.',
    'someone thought a sweet thought of you.',
    'wrapped up in blush-colored light.',
    'then handed mavebot a tiny moon.'
  ],
  thirdLines: [
    'May this heart find you right where you are,',
    'A sweet little thunder, a bright little tune,',
    'No grand speech, no perfect art,',
    'The evidence is glowing, pink, and true,',
    'This one is clear and bright,',
    'So take this heart, uneven and warm,',
    'It carries a cheer, a wink, and a start,',
    'It drew a warm circle around your name,'
  ],
  closers: [
    'and make the whole room feel less far.',
    'a heart-shaped comet crossing the moon.',
    'just a happy bot with a handmade heart.',
    'and mavebot drew this heart for you.',
    'a pocket-sized love poem wrapped in light.',
    'a tiny shelter from any storm.',
    'then turned all that sweetness into art.',
    'and left every corner a little more tame.'
  ],
  notes: [
    'Freshly drawn, loudly adored.',
    'A small poem with big feelings.',
    'Certified gentle.',
    'Filed under extremely important.',
    'One of one, just for them.',
    'Made with sincere pixels.',
    'Freshly shuffled by mavebot.',
    'New heart, new poem, same affection.'
  ]
};

const palettes = [
  {
    backgroundTop: [255, 240, 247],
    backgroundBottom: [255, 215, 228],
    glow: [255, 143, 177],
    heart: [226, 65, 112],
    heartDark: [168, 30, 76],
    heartLight: [255, 143, 175],
    sparkle: [255, 255, 255]
  },
  {
    backgroundTop: [246, 242, 255],
    backgroundBottom: [255, 223, 239],
    glow: [238, 148, 255],
    heart: [211, 71, 151],
    heartDark: [138, 42, 108],
    heartLight: [255, 166, 211],
    sparkle: [255, 250, 196]
  },
  {
    backgroundTop: [255, 245, 235],
    backgroundBottom: [255, 218, 225],
    glow: [255, 160, 130],
    heart: [235, 77, 93],
    heartDark: [162, 37, 58],
    heartLight: [255, 169, 159],
    sparkle: [255, 255, 240]
  }
];

export function randomLoveLetter() {
  return loveLetters[Math.floor(Math.random() * loveLetters.length)];
}

let previousLoveuPoemKey = '';

function choice(list, random) {
  return Math.floor(random() * list.length) % list.length;
}

function buildLoveuPoemFromIndexes(indexes, safeName) {
  const lines = [
    loveuPoems.openers[indexes.opener],
    loveuPoems.secondLines[indexes.secondLine],
    loveuPoems.thirdLines[indexes.thirdLine],
    loveuPoems.closers[indexes.closer]
  ];

  return {
    title: loveuPoems.titles[indexes.title],
    body: lines.map((line) => line.replaceAll('{name}', safeName)).join('\n'),
    note: loveuPoems.notes[indexes.note]
  };
}

function loveuPoemKey(indexes) {
  return [
    indexes.title,
    indexes.opener,
    indexes.secondLine,
    indexes.thirdLine,
    indexes.closer,
    indexes.note
  ].join(':');
}

function randomLoveuPoemIndexes(random) {
  return {
    title: choice(loveuPoems.titles, random),
    opener: choice(loveuPoems.openers, random),
    secondLine: choice(loveuPoems.secondLines, random),
    thirdLine: choice(loveuPoems.thirdLines, random),
    closer: choice(loveuPoems.closers, random),
    note: choice(loveuPoems.notes, random)
  };
}

export function randomLoveuPoem(targetName, { random = Math.random } = {}) {
  const safeName = String(targetName || 'you').trim() || 'you';
  const randomSource = typeof random === 'function' ? random : Math.random;
  let indexes = randomLoveuPoemIndexes(randomSource);
  let key = loveuPoemKey(indexes);

  if (key === previousLoveuPoemKey) {
    indexes = {
      ...indexes,
      closer: (indexes.closer + 1) % loveuPoems.closers.length,
      note: (indexes.note + 1) % loveuPoems.notes.length
    };
    key = loveuPoemKey(indexes);
  }

  previousLoveuPoemKey = key;
  return buildLoveuPoemFromIndexes(indexes, safeName);
}

function seededRandom(seed) {
  let value = Math.abs(Number.isFinite(seed) ? Math.trunc(seed) : 0) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixRgb(a, b, t) {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t)
  ];
}

function heartValue(x, y) {
  const x2 = x * x;
  const y2 = y * y;
  return (x2 + y2 - 1) ** 3 - x2 * y ** 3;
}

function sparkleValue(x, y, cx, cy, radius) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const ray = Math.min(dx, dy) <= 1 && Math.max(dx, dy) <= radius;
  const center = dx + dy <= radius * 0.45;
  return ray || center;
}

export function createLanaHeartPng({ width = 512, height = 512, variant = 0 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64) {
    throw new Error('PNG dimensions must be integers >= 64.');
  }

  const variantSeed = Number.isFinite(variant) ? Math.trunc(variant) : 0;
  const palette = palettes[Math.abs(variantSeed) % palettes.length];
  const random = seededRandom(variantSeed);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const cx = width / 2 + (random() - 0.5) * width * 0.035;
  const cy = height / 2 + height * (0.015 + random() * 0.035);
  const scale = Math.min(width, height) * (0.25 + random() * 0.04);
  const stretchX = 0.94 + random() * 0.13;
  const stretchY = 0.94 + random() * 0.12;
  const sparkles = [
    [
      width * (0.12 + random() * 0.16),
      height * (0.12 + random() * 0.18),
      7 + Math.floor(random() * 8)
    ],
    [
      width * (0.68 + random() * 0.2),
      height * (0.12 + random() * 0.2),
      7 + Math.floor(random() * 7)
    ],
    [
      width * (0.68 + random() * 0.18),
      height * (0.66 + random() * 0.2),
      8 + Math.floor(random() * 8)
    ],
    [
      width * (0.12 + random() * 0.18),
      height * (0.66 + random() * 0.2),
      6 + Math.floor(random() * 7)
    ]
  ];

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pos = row + 1 + x * 3;
      const bgT = y / Math.max(1, height - 1);
      let [r, g, b] = mixRgb(palette.backgroundTop, palette.backgroundBottom, bgT);

      const nx = ((x - cx) / scale) * stretchX;
      const ny = (-(y - cy) / scale) * stretchY;
      const v = heartValue(nx, ny);
      const distance = Math.sqrt(nx * nx + ny * ny);
      const glow = Math.max(0, 1 - Math.abs(v) * 2.2 - distance * 0.08);

      if (glow > 0) {
        [r, g, b] = mixRgb([r, g, b], palette.glow, Math.min(0.42, glow * 0.26));
      }

      const shadowValue = heartValue(nx - 0.08, ny + 0.08);
      if (shadowValue <= 0 && v > 0) {
        [r, g, b] = mixRgb([r, g, b], [126, 36, 78], 0.22);
      }

      if (v <= 0) {
        const shade = Math.min(1, Math.max(0, (ny + 1.15) / 2.2));
        [r, g, b] = mixRgb(palette.heartDark, palette.heart, shade);
        const highlight = Math.max(0, 1 - ((nx + 0.38) ** 2 + (ny - 0.33) ** 2) * 5.5);
        if (highlight > 0) {
          [r, g, b] = mixRgb([r, g, b], palette.heartLight, Math.min(0.8, highlight));
        }
      }

      for (const [sx, sy, sr] of sparkles) {
        if (sparkleValue(x, y, sx, sy, sr)) {
          [r, g, b] = mixRgb([r, g, b], palette.sparkle, 0.95);
        }
      }

      raw[pos] = r;
      raw[pos + 1] = g;
      raw[pos + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND')
  ]);
}
