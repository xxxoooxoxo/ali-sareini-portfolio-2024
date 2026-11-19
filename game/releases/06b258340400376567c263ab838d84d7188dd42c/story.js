// Edit this file to make the game yours: the chapters, the captions, and how you look.

// Colours are [red, green, blue], each 0 to 255.
export const you = {
  portrait: 'ali',        // your own painted face, glasses and stubble, made from the photo you gave. Remove this line for a plain face.
  skin: [169, 129, 99],
  hair: [28, 25, 22],
  hairStyle: 'curly',      // the Blender player keeps its authored middle-part curls
  build: 'm',             // 'm' or 'f'
  physique: 'regular',    // 'regular' or 'stocky'
  height: 1.8,            // metres
  top: [46, 47, 45],
  topStyle: 'leather',    // the Blender player keeps its authored black leather outfit
  bottom: [60, 66, 77],
  bottomStyle: 'pants',   // 'pants' or 'shorts'
  shoes: [188, 184, 172],
};

// What you wear in a chapter, where it differs from the look above.
export const wardrobe = {
  dartmouth: { topStyle: 'coat', top: [52, 58, 74], hairStyle: 'beanie', scarf: true },   // a long winter coat: the judge saw a thin sweater in the snow
};

// The phone doubles as the personal site's profile and navigation.
export const profile = {
  name: 'Ali Sareini',
  role: 'Cofounder, Nautilus',
  bio: 'I went to UVA for undergrad and Dartmouth for my master’s. Now I’m in San Francisco, building software for car wash operators with my cofounder, Amayr Babar.',
  work: 'https://nautilus.co/',
  linkedin: 'https://www.linkedin.com/in/alisareini/',
};

// Chapters play in this order. A chapter is playable once it has a builder in src/main.js.
export const chapters = [
  { id: 'uva', title: 'The Lawn', name: 'UVA', sub: 'Undergrad · Charlottesville, VA', ink: '#ffd288' },
  { id: 'dartmouth', title: 'Winter Carnival', name: 'Dartmouth', sub: "Master’s · Hanover, NH", ink: '#c5def0' },
  { id: 'yc', title: 'Tuesday Dinner', name: 'Y Combinator', sub: 'The batch', ink: '#ffc08a' },
  { id: 'sf', title: 'Fort Point', name: 'San Francisco', sub: 'Nautilus', ink: '#b6e5cf' },
];

export const souvenirs = [
  { id: 'lawn-flyer', chapter: 'uva', name: 'Lawn concert flyer', description: 'Friday night on the Lawn. Someone drew a little Rotunda under the set times.' },
  { id: 'carnival-pin', chapter: 'dartmouth', name: 'Winter Carnival pin', description: 'A white snowflake on green enamel, picked up at the cocoa stand.' },
  { id: 'yc-marker', chapter: 'yc', name: 'Whiteboard marker', description: 'Orange ink. Use it on either whiteboard along the east wall of the YC hall.' },
  { id: 'sea-glass', chapter: 'sf', name: 'Sea glass', description: 'A green chip of bottle glass worn smooth by the bay.' },
];

// Captions that appear when you walk up to a spot. `at` is [x, z] in metres and `within` is how close you must be.
// These only name the places. Replace them with your own memories.
export const memories = {
  uva: [
    { at: [0, 30], within: 9, text: 'The Lawn' },
    { at: [24, 8], within: 6, text: 'East Pavilions' },
    { at: [-24, 34], within: 6, text: 'West Pavilions' },
    { at: [0, -50], within: 9, text: 'The Rotunda' },
  ],
  dartmouth: [
    { at: [0, 14], within: 9, text: 'The Green' },
    { at: [-15, -13], within: 8, text: 'The Snow Castle' },
    { at: [50, 0], within: 9, text: 'Dartmouth Hall' },
    { at: [0, -72], within: 9, text: 'Baker Library' },
  ],
  yc: [
    { at: [0, 5], within: 6, text: 'The Dinner Hall' },
    { at: [0, -12.5], within: 4, text: 'Demo Day' },
  ],
  sf: [
    { at: [-192, 74], within: 5, text: 'The Golden Gate' },
  ],
};
