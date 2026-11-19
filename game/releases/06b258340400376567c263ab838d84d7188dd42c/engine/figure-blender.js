// Every person in the game: the player and the bystanders share one Blender-authored body, skeleton and set of clips.
// The player keeps the authored leather outfit (assets/ali). Bystanders are dressed from the people kit
// (assets/people): the same body with its clothes coloured per person, another face on the same head, and hair or a hat
// fitted to that head. Poses that the clips do not cover (sitting, holding, reaching) are set on the bones.
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import { aliModelBase64 } from './ali-asset.js';
import { peopleKitBase64 } from './people-asset.js';
import { PORTRAIT_TEXTURE, NPC_FACES } from './portrait-assets.js';
import { drawTex } from './look.js';
import { jumpProgress } from './movement.js';

const unpack = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)).buffer;
const [hero, kit] = await Promise.all([new GLTFLoader().parseAsync(unpack(aliModelBase64), ''), new GLTFLoader().parseAsync(unpack(peopleKitBase64), '')]);
const wrap = (n, d) => ((n % d) + d) % d;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scalec = (c, k) => c.map((v) => clamp(v * k, 0, 255));
const luminance = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const HEIGHT = 1.8;   // the kit's standing height in metres

// ---------------------------------------------------------------- clips
// The clips are read directly, without an animation mixer: a pose here is often a clip pose with bones then turned by
// hand (a reach, a nod), and each new pose must start again from the clip. Only the hips move in a clip; every other
// bone only turns, and no bone changes size, so a figure's own bone scales (a child's larger head) survive.
// start: when the clip's first key falls. A clip is read from there, or a loop would hold its first pose for a moment
// on every pass.
const CLIPS = Object.fromEntries(hero.animations.map((clip) => [clip.name.replace('Ali_', ''), {
  start: Math.min(...clip.tracks.map((track) => track.times[0])),
  duration: clip.duration - Math.min(...clip.tracks.map((track) => track.times[0])),
  tracks: clip.tracks.map((track) => { const [node, property] = track.name.split('.'); return { node, property, read: track.createInterpolant() }; })
    .filter((t) => t.property === 'quaternion' || (t.property === 'position' && t.node === 'mixamorigHips')),
}]));
// stride: metres travelled in one cycle of the clip. speed: the pace the clip was authored for, in metres a second.
const GAITS = [
  { clip: 'Walk', stride: 1.6, speed: 1.714 },
  { clip: 'Jog', stride: 3.0, speed: 4.091, stance: 0.30 },
  { clip: 'Sprint', stride: 4.2, speed: 7.875, stance: 0.21 },
];

function runToeOff(jogWeight, sprintWeight) {
  const [, jog, sprint] = GAITS;
  const jogDistance = jog.stride * jogWeight, sprintDistance = sprint.stride * sprintWeight;
  return (jogDistance * jog.stance + sprintDistance * sprint.stance) / (jogDistance + sprintDistance);
}

// The sprint lifts each foot sooner than the jog. When mixing them, sample both at the
// same point between touchdown and toe-off, or the planted foot starts floating mid-step.
function runSamples(cycle, jogWeight, sprintWeight) {
  let jogCycle = cycle, sprintCycle = cycle;
  if (jogWeight > 0 && sprintWeight > 0) {
    const [, jog, sprint] = GAITS;
    const toeOff = runToeOff(jogWeight, sprintWeight);
    const step = cycle % 0.5, start = cycle - step;
    const phaseAt = (stance) => start + (step < toeOff
      ? stance * step / toeOff
      : mix(stance, 0.5, (step - toeOff) / (0.5 - toeOff)));
    jogCycle = phaseAt(jog.stance);
    sprintCycle = phaseAt(sprint.stance);
  }
  return { Jog: [jogWeight, jogCycle * CLIPS.Jog.duration], Sprint: [sprintWeight, sprintCycle * CLIPS.Sprint.duration] };
}

const START_SECONDS = 0.22, STOP_SECONDS = 0.3;   // the least time to go from standing to a full stride, and back
const GAIT_SECONDS = 0.25;                         // the least time to go from one gait to another, or from full steps to none
const START_CYCLE = { walk: 0.8, run: 0.625 };      // where in the cycle the walk, and the jog, are closest to standing
const JUMP_TAKEOFF = 12 / 72, JUMP_TOUCHDOWN = 54 / 72;  // markers in Ali_Jump

// Which clips to play at a speed, how far one cycle travels, and what share of the clip's step length to keep.
// Advancing the cycle by distance / stride keeps the planted foot still on the ground.
// Between the clips' own speeds the steps are shortened (see Figure.shortenSteps) and not mixed with another pose:
// a mix of two gaits, or of a gait and standing, has a foot near the ground where it should be planted, and it slides.
// A walk and a jog are never mixed. Up to SWITCH[1] metres a second a walker keeps walking, and down to SWITCH[0] a
// jogger keeps jogging, so someone at a steady speed between the two does not go back and forth (see Figure.gait).
// MEET is the speed at which both take steps of the same length. It decides for a caller that has no gait yet.
const SWITCH = [2.0, 2.4], MEET = GAITS[0].stride * GAITS[1].speed / GAITS[1].stride;
export function gaitAt(speed, running = speed > MEET) {
  const s = Math.max(0, speed), weights = { Idle: 0, Walk: 0, Jog: 0, Sprint: 0 }, [walk, jog, sprint] = GAITS;
  if (s <= walk.speed) {
    // Slower than the walk clip: shorter steps, as the square root of speed. Only the last of a stop fades into standing.
    const short = Math.max(0.3125, Math.sqrt(s / walk.speed)), moving = smooth(0.02, 0.25, s);
    weights.Walk = moving; weights.Idle = 1 - moving;
    return { weights, stride: walk.stride * short, short };
  }
  if (s <= jog.speed) {
    // A fast walk is the walk clip stepping faster. A slow jog is the jog clip at its own step rate, with shorter steps.
    if (!running) { weights.Walk = 1; return { weights, stride: walk.stride, short: 1 }; }
    weights.Jog = 1;
    return { weights, stride: jog.stride * s / jog.speed, short: s / jog.speed };
  }
  if (s <= sprint.speed) { const k = (s - jog.speed) / (sprint.speed - jog.speed); weights.Jog = 1 - k; weights.Sprint = k; return { weights, stride: mix(jog.stride, sprint.stride, k), short: 1 }; }
  // Above the authored pace, the same full-length steps turn over faster.
  weights.Sprint = 1;
  return { weights, stride: sprint.stride, short: 1 };
}

// ---------------------------------------------------------------- the kit
const KIT = {};
kit.scene.traverse((o) => { if (o.isSkinnedMesh) KIT[o.name] = o; });
const REGION = { TORSO: 1, SLEEVE: 2, TRIM: 3, ZIP: 4, INNER: 5, BELT: 6, BUCKLE: 7, LEGS: 8, HANDS: 9, SHOE: 10, SOLE: 11, HEM: 12, COAT: 13, SKIRT: 14 };
const bodySource = KIT.People_Body.geometry;
// The body has two UV sets. The shading sheet says which one it is drawn with; the other names each vertex's garment
// region (u) and its band along a sleeve, leg or coat (v, flipped by the file format).
const shade = KIT.People_Body.material.map;
const sheetUv = bodySource.attributes[shade.channel === 1 ? 'uv1' : 'uv'], regionUv = bodySource.attributes[shade.channel === 1 ? 'uv' : 'uv1'];
shade.channel = 0; shade.colorSpace = THREE.NoColorSpace; shade.needsUpdate = true;
const bodyRegion = new Uint8Array(bodySource.attributes.position.count), bodyBand = new Uint8Array(bodyRegion.length);
for (let i = 0; i < bodyRegion.length; i++) {
  bodyRegion[i] = Math.round(regionUv.getX(i) * 16 - 0.5);
  bodyBand[i] = clamp(Math.floor((1 - regionUv.getY(i)) * 4), 0, 3);
}

const loadImage = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
const pixels = (image) => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const g = c.getContext('2d'); g.drawImage(image, 0, 0); return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
const facePixels = (await Promise.all([PORTRAIT_TEXTURE, ...NPC_FACES].map(loadImage))).map(pixels);
const FACE_SKIN = [[169, 129, 99], [174, 112, 73], [195, 132, 91], [195, 133, 93], [188, 128, 88]];   // the skin tone each face image was painted in

// A figure's own colours also light it a little where a chapter asks for it (world.peopleFill), so people do not go
// black at night. The fill is the material's colour, not a flat tint.
function ownColourFill(material) {
  material.userData.characterMaterial = true;
  if (material.userData.ownColourFill) return material;
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  const fill = material.userData.skinOnly ? 'vec3(dot(emissive,vec3(.299,.587,.114)))' : 'emissive';
  material.onBeforeCompile = (shader) => { before.call(material, shader); shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance=' + fill + '*diffuseColor.rgb;'); };
  material.customProgramCacheKey = () => key + '-own-colour-fill-' + (material.userData.skinOnly ? 'skin' : 'cloth');
  material.userData.ownColourFill = true;
  return material;
}

// One material for every bystander's body: the grey shading sheet, coloured by each person's vertex colours. The sheet
// stores shading at half strength so painted highlights can be brighter than the cloth colour.
const bodyMaterial = new THREE.MeshLambertMaterial({ map: shade, vertexColors: true });
bodyMaterial.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=2.0;'); };
bodyMaterial.customProgramCacheKey = () => 'people-body-r1';
ownColourFill(bodyMaterial);

const SHORT_TOPS = ['jacket', 'leather'];                                 // end at the waist, so the belt and the shirt under them show
const ZIPPED = ['jacket', 'leather', 'hoodie', 'puffer'];
const POCKETED = ['jacket', 'leather', 'coat', 'puffer', 'blazer', 'hoodie'];
const SHORT_SLEEVED = ['tee', 'stripe', 'dress'];
const bodyGeometries = new Map();
function bodyGeometry(l) {
  const top = l.topStyle, coat = top === 'coat', dress = top === 'dress', skirt = (l.bottomStyle === 'skirt' || dress) && !coat, short = SHORT_TOPS.includes(top);
  const bare = l.bottomStyle === 'shorts' || l.bottomStyle === 'skirt' || dress;
  const sleeves = top === 'tank' ? 0 : l.sleeveLength === 'long' ? 3 : l.sleeveLength === 'short' || SHORT_SLEEVED.includes(top) ? 1 : 3;
  const key = JSON.stringify([top, l.bottomStyle, l.sleeveLength, l.coatLength, l.skin, l.top, l.bottom, l.shoes, l.inner]);
  if (bodyGeometries.has(key)) return bodyGeometries.get(key);
  const inner = l.inner || [205, 200, 186], sole = mixc(l.shoes, [236, 232, 220], luminance(l.shoes) > 120 ? 0.35 : 0.7);
  const colour = (region, band) => {
    switch (region) {
      case REGION.TORSO: case REGION.HEM: case REGION.COAT: return l.top;
      case REGION.SLEEVE: return band < sleeves ? l.top : l.skin;
      case REGION.TRIM: return scalec(l.top, 0.74);
      case REGION.ZIP: return coat ? scalec(l.top, 0.8) : [150, 151, 146];
      case REGION.INNER: return inner;
      case REGION.BELT: return [40, 36, 33];
      case REGION.BUCKLE: return [160, 158, 150];
      case REGION.LEGS: return bare && band > 0 ? l.skin : l.bottom;
      case REGION.HANDS: return l.skin;
      case REGION.SHOE: return l.shoes;
      case REGION.SOLE: return sole;
      case REGION.SKIRT: return dress ? l.top : l.bottom;
      default: return [128, 128, 128];
    }
  };
  const shown = (region, band) => {
    if (region === REGION.HEM) return !short && !coat && !dress;
    if (region === REGION.COAT) return coat && !(l.coatLength === 'short' && band > 0);
    if (region === REGION.SKIRT) return skirt;
    if (region === REGION.BELT || region === REGION.BUCKLE || region === REGION.INNER) return short;
    if (region === REGION.ZIP) return ZIPPED.includes(top) || coat;
    if (region === REGION.TRIM) return POCKETED.includes(top);
    return true;
  };
  const count = bodyRegion.length, colours = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) colours.set(colour(bodyRegion[i], bodyBand[i]).map((v) => clamp(Math.round(v), 0, 255)), i * 3);
  const source = bodySource.index.array, index = [];
  for (let t = 0; t < source.length; t += 3) if (shown(bodyRegion[source[t]], bodyBand[source[t]])) index.push(source[t], source[t + 1], source[t + 2]);
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) geometry.setAttribute(name, bodySource.attributes[name]);
  geometry.setAttribute('uv', sheetUv);
  geometry.morphAttributes = bodySource.morphAttributes; geometry.morphTargetsRelative = bodySource.morphTargetsRelative;
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3, true));
  geometry.setIndex(index);
  bodyGeometries.set(key, geometry);
  return geometry;
}

// The head keeps one mesh for everyone. Its first UV set is a front portrait, so a face is an image; the mesh also
// stores how far each vertex is from the face (to fade the portrait into plain skin) and whether it is scalp.
const headGeometry = KIT.People_Head.geometry;
headGeometry.setAttribute('faceMix', headGeometry.attributes.uv1); headGeometry.setAttribute('scalpMix', headGeometry.attributes.uv2);
headGeometry.deleteAttribute('uv1'); headGeometry.deleteAttribute('uv2');
const faceTextures = new Map(), headMaterials = new Map();
function faceTexture(id, skin) {
  const key = id + ':' + skin.join(',');
  if (faceTextures.has(key)) return faceTextures.get(key);
  const im = facePixels[id], base = FACE_SKIN[id], baseLum = luminance(base);
  const canvas = document.createElement('canvas'); canvas.width = im.w; canvas.height = im.h;
  const g = canvas.getContext('2d'), image = g.createImageData(im.w, im.h);
  for (let i = 0; i < im.data.length; i += 4) {
    // Repaint the face in this person's skin tone: keep its light and shade, and a little of its own colour (lips, brows).
    const raw = [im.data[i], im.data[i + 1], im.data[i + 2]], ratio = clamp(luminance(raw) / baseLum, 0.12, 1.2);
    for (let c = 0; c < 3; c++) image.data[i + c] = skin[c] * ratio + (raw[c] - base[c] * ratio) * 0.3;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.colorSpace = THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  faceTextures.set(key, texture);
  return texture;
}
function headMaterial(id, skin, hair) {
  const key = id + ':' + skin.join(',') + ':' + (hair ? hair.join(',') : '');
  if (headMaterials.has(key)) return headMaterials.get(key);
  const material = new THREE.MeshLambertMaterial({ map: faceTexture(id, skin) });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sideSkin = { value: new THREE.Color(...skin.map((v) => v / 255)) };
    // Under hair the scalp takes some of the hair's colour, so a thin or parted style does not show bright skin.
    shader.uniforms.scalpTint = { value: new THREE.Vector4(...(hair || skin).map((v) => v / 255), hair ? 0.6 : 0) };
    shader.vertexShader = 'attribute vec2 faceMix;attribute vec2 scalpMix;varying vec3 vHead;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHead=vec3(faceMix.x,(1.0-faceMix.y)*2.0,scalpMix.x);');
    shader.fragmentShader = 'varying vec3 vHead;uniform vec3 sideSkin;uniform vec4 scalpTint;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 sideColour=mix(sideSkin*vHead.y,scalpTint.rgb,vHead.z*scalpTint.a);
      diffuseColor.rgb=mix(sideColour,diffuseColor.rgb,vHead.x);`);
  };
  material.customProgramCacheKey = () => 'people-head-r1';
  material.userData.skinOnly = true;
  headMaterials.set(key, ownColourFill(material));
  return material;
}

// Hair is a grey sheet of strands, tinted by the material's colour.
const strands = drawTex(64, 64, (g) => {
  g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x++) { const v = 150 + ((x * 97 + (x * x) % 31) % 90); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 64); }
  const lowlight = g.createLinearGradient(0, 0, 0, 64);
  lowlight.addColorStop(0, 'rgba(255,255,255,.16)'); lowlight.addColorStop(0.45, 'rgba(255,255,255,0)'); lowlight.addColorStop(1, 'rgba(0,0,0,.30)');
  g.fillStyle = lowlight; g.fillRect(0, 0, 64, 64);
});
strands.colorSpace = THREE.NoColorSpace; strands.flipY = false;
const knit = drawTex(64, 64, (g) => {
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 4) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, 0, 1, 64); }
  g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 0, 64, 14);
});
knit.colorSpace = THREE.NoColorSpace; knit.flipY = false;
// The curls carry the player's painted texture. Take its light and shade only, so any hair colour can tint it.
const curls = (() => {
  const painted = KIT.People_Hair_curly.material, image = (painted.map || painted.emissiveMap).image, canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const g = canvas.getContext('2d'); g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  for (let i = 0; i < data.data.length; i += 4) total += luminance([data.data[i], data.data[i + 1], data.data[i + 2]]);
  const mean = total / (data.data.length / 4) || 1;
  for (let i = 0; i < data.data.length; i += 4) { const v = clamp(luminance([data.data[i], data.data[i + 1], data.data[i + 2]]) / mean * 0.72, 0.25, 1) * 255; data.data[i] = data.data[i + 1] = data.data[i + 2] = v; }
  g.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.colorSpace = THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
})();
const tinted = new Map();
function tintedMaterial(map, colour, k = 1) {
  const key = (map?.uuid || '') + ':' + colour.join(',') + ':' + k;
  if (!tinted.has(key)) {
    const material = new THREE.MeshLambertMaterial({ map, color: new THREE.Color(...colour.map((v) => clamp(v * k / 255))), side: THREE.DoubleSide });
    tinted.set(key, ownColourFill(material));
  }
  return tinted.get(key);
}
const HAIR_MESH = { short: 'People_Hair_short', crop: 'People_Hair_crop', fade: 'People_Hair_crop', parted: 'People_Hair_parted', swept: 'People_Hair_swept', quiff: 'People_Hair_quiff',
  wavy: 'People_Hair_wavy', curly: 'People_Hair_curly', long: 'People_Hair_long', bob: 'People_Hair_bob', tied: 'People_Hair_tied', bun: 'People_Hair_bun', receding: 'People_Hair_receding',
  cap: 'People_Hat_cap', beanie: 'People_Hat_beanie' };

const propWhite = drawTex(2, 2, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2); });
const soleSamples = new WeakMap();   // per source geometry: the vertices that touch the ground when standing
const footMarks = new WeakMap();     // per source geometry: the points of each sole, as [place in the foot bone's own space, metres ahead of the heel]
const point = new THREE.Vector3(), quat = new THREE.Quaternion();

export class Figure {
  constructor(look = {}) {
    this.look = { skin: [195, 151, 117], hair: [40, 30, 24], top: [65, 85, 104], bottom: [57, 62, 73], shoes: [62, 57, 51], height: 1.8, build: 'm', physique: 'regular', face: 0, hairStyle: 'short', topStyle: 'tee', bottomStyle: 'pants', scarf: false, portrait: null, glasses: false, ...look };
    const l = this.look;
    if (l.hairStyle === 'bob') l.hairLength = 'bob';
    if (l.hairStyle === 'long' && l.hairLength === 'bob') l.hairStyle = 'bob';
    if (l.hairStyle !== 'bald' && !HAIR_MESH[l.hairStyle]) l.hairStyle = 'short';
    l.face = Number.isFinite(l.face) ? Math.trunc(l.face) : 0;
    if (l.topStyle === 'floral') { l.topStyle = 'shirt'; l.sleeveLength = l.sleeveLength || 'short'; }
    if (['heavy', 'stocky', 'slight', 'slim', 'tall', 'child'].includes(l.build)) { if (l.build === 'child') l.age = 'child'; else l.physique = l.build; l.build = 'm'; }
    if (l.physique === 'slight') l.physique = 'slim';
    if (!Object.hasOwn(look, 'height') && l.physique === 'tall') l.height = 1.98;
    if (!Object.hasOwn(look, 'height') && l.physique === 'stocky') l.height = 1.72;
    if (l.age === 'child' && !Object.hasOwn(look, 'height')) l.height = 1.25;
    if (l.height < 1.45) l.age = 'child';
    this.hero = l.portrait === 'ali';
    if (this.hero) l.model = 'ali-leather';
    this.root = new THREE.Group();
    this.root.userData.lookKey = JSON.stringify(l);
    this.root.name = this.hero ? 'Ali' : 'Pedestrian';
    this.root.userData.modelSource = this.hero ? 'Ali_Animated.blend' : 'People_Kit.blend';
    // For the game, which finds people by walking the scene. Not enumerable, so copying userData leaves it out.
    Object.defineProperty(this.root.userData, 'figure', { value: this, enumerable: false });
    this.root.scale.setScalar(l.height / (this.hero ? 1.806 : HEIGHT));
    this.rig = clone(this.hero ? hero.scene : kit.scene);
    this.root.add(this.rig);
    this.meshes = []; this.bones = {}; this.triangleCount = 0; this.held = {};
    this.rig.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });
    if (this.hero) this.dressHero(); else this.dressPerson();
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; this.triangleCount += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; }
    this.mesh = this.meshes[0]; this.head = this.bones.Head; this.pelvis = this.bones.Hips; this.spine = this.bones.Spine;
    this.arms = ['Left', 'Right'].map((side) => ({ shoulder: this.bones[side + 'Arm'], elbow: this.bones[side + 'ForeArm'], hand: this.bones[side + 'Hand'] }));
    this.legs = ['Left', 'Right'].map((side) => ({ hip: this.bones[side + 'UpLeg'], knee: this.bones[side + 'Leg'], foot: this.bones[side + 'Foot'] }));
    if (l.age === 'child') this.head.scale.multiplyScalar(1.34);
    this.joints = {}; this.rig.traverse((o) => { if (o.isBone) this.joints[o.name] = o; });
    this.turned = new Map(); this.moved = new Map();
    this.idleShift = (Math.abs(Math.trunc(l.variant ?? l.face ?? 0)) % 7) * 0.57;
    this.cycle = 0; this.speed = 0;
    this.sample({ Idle: [1, 0] });
    this.root.updateMatrixWorld(true);
    this.restWorld = new Map(Object.values(this.bones).map((b) => [b, b.getWorldQuaternion(new THREE.Quaternion())]));
    this.restPose = Object.values(this.bones).map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    this.armRest = this.restPose.filter(([bone]) => /(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)$/.test(bone.name));
    this.findSoles();
    this.ankleHeight = this.root.worldToLocal(this.bones.LeftFoot.getWorldPosition(new THREE.Vector3())).y;
    if (!this.hero) this.addExtras();
    this.idle(0);
  }

  // ------------------------------------------------------------ dressing
  dressHero() {
    this.rig.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshLambertMaterial({ map: o.material.map, color: 0xffffff });
      if (o.material.map) o.material.map.colorSpace = THREE.NoColorSpace;
      o.material.userData.characterMaterial = true;
      this.meshes.push(o);
    });
  }

  dressPerson() {
    const l = this.look, parts = {};
    this.rig.traverse((o) => { if (o.isSkinnedMesh) parts[o.name] = o; });
    const female = l.build === 'f', child = l.age === 'child';
    const body = parts.People_Body, head = parts.People_Head;
    body.geometry = bodyGeometry(l); body.material = bodyMaterial;
    const set = (mesh, name, value) => { mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = value; };
    const bare = l.bottomStyle === 'shorts' || l.bottomStyle === 'skirt' || l.topStyle === 'dress';
    set(body, 'Female', female ? 1 : 0);
    set(body, 'Heavy', l.physique === 'heavy' ? 1 : l.physique === 'stocky' ? 0.5 : 0);
    set(body, 'Slim', l.physique === 'slim' ? 1 : l.physique === 'tall' ? 0.45 : child ? 0.5 : 0);
    set(body, 'BareLegs', bare ? 1 : 0);
    set(body, 'Puffer', l.topStyle === 'puffer' ? 1 : l.topStyle === 'coat' ? 0.3 : 0);
    const shape = l.headShape || ['oval', 'square', 'round', 'long'][Math.abs(l.face || 0) % 4];
    set(head, 'FemaleHead', female ? 1 : child ? 0.6 : 0);
    set(head, 'RoundHead', shape === 'round' ? 1 : l.physique === 'heavy' ? 0.7 : 0);
    set(head, 'LongHead', shape === 'long' ? 1 : 0);
    const hat = l.hairStyle === 'cap' || l.hairStyle === 'beanie', bald = l.hairStyle === 'bald';
    head.material = headMaterial(1 + (female ? 2 : 0) + (Math.abs(l.face || 0) % 2), l.skin, bald ? null : l.hair);
    const keep = new Set([body, head]);
    if (!bald) {
      const piece = parts[HAIR_MESH[l.hairStyle]];
      piece.material = hat ? tintedMaterial(knit, l.hat || l.top, 0.92) : tintedMaterial(piece.name === 'People_Hair_curly' ? curls : strands, l.hair, 1.25);
      keep.add(piece);
      if (hat) { const under = parts.People_Hair_crop; under.material = tintedMaterial(strands, l.hair, 1.25); keep.add(under); }   // hair shows below a hat
    }
    if (l.glasses) { parts.People_Glasses.material = tintedMaterial(null, [40, 37, 38]); keep.add(parts.People_Glasses); }
    for (const mesh of Object.values(parts)) if (keep.has(mesh)) this.meshes.push(mesh); else mesh.removeFromParent();
    // Width and depth follow the build. Height stays with the skeleton.
    const wide = l.physique === 'heavy' ? 1.05 : l.physique === 'stocky' ? 1.06 : l.physique === 'slim' ? 0.96 : 1, deep = l.physique === 'heavy' ? 1.06 : l.physique === 'stocky' ? 1.05 : l.physique === 'slim' ? 0.96 : 1;
    this.rig.scale.set(wide * (female ? 0.97 : 1), 1, deep);
  }

  // A scarf, a hood and bags. Each is shaped in the standing pose and then pinned to the bone that carries it.
  addExtras() {
    const l = this.look;
    const pin = (mesh, bone) => { this.root.add(mesh); this.root.updateMatrixWorld(true); this.bones[bone].attach(mesh); mesh.userData.characterExtra = true; this.triangleCount += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; return mesh; };
    const plain = (c) => tintedMaterial(propWhite, c);
    const box = (w, h, d, x, y, z, c, bone, turn = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateZ(turn); g.translate(x, y, z); return pin(new THREE.Mesh(g, plain(c)), bone); };
    const tube = (points, r, c, bone) => pin(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 10, r, 5, false), plain(c)), bone);
    const chest = this.localJoint('Spine2'), neck = this.localJoint('Neck'), hips = this.localJoint('Hips');
    const depth = l.topStyle === 'puffer' ? 0.035 : l.topStyle === 'coat' ? 0.02 : 0;
    if (l.scarf) {
      const colour = l.scarfColor || [107, 79, 64];
      const loop = new THREE.TorusGeometry(0.078, 0.03, 6, 14); loop.rotateX(Math.PI / 2); loop.scale(1, 1.25, 0.95); loop.translate(0, neck.y + 0.012, neck.z + 0.012);
      pin(new THREE.Mesh(loop, plain(colour)), 'Neck');
      box(0.075, 0.25, 0.02, -0.045, chest.y + 0.01, chest.z + 0.135 + depth, colour, 'Spine2');
    }
    if (l.hood || l.topStyle === 'hoodie') {
      const hood = new THREE.SphereGeometry(0.105, 8, 6); hood.scale(1, 0.62, 0.55); hood.translate(0, neck.y - 0.035, neck.z - 0.085 - depth);
      pin(new THREE.Mesh(hood, tintedMaterial(propWhite, l.top, 0.93)), 'Spine2');
    }
    if (l.bag) {
      const colour = l.bagColor || [58, 63, 68], strap = scalec(colour, 0.8), back = chest.z - 0.115 - depth, front = chest.z + 0.125 + depth;
      if (l.bag === 'backpack') {
        box(0.30, 0.40, 0.14, 0, chest.y - 0.07, back - 0.07, colour, 'Spine2');
        box(0.24, 0.12, 0.05, 0, chest.y - 0.16, back - 0.155, scalec(colour, 1.2), 'Spine2');
        for (const s of [-1, 1]) tube([[s * 0.11, chest.y - 0.2, back], [s * 0.135, chest.y + 0.12, back + 0.03], [s * 0.125, chest.y + 0.165, chest.z + 0.02], [s * 0.13, chest.y + 0.06, front], [s * 0.15, chest.y - 0.16, front - 0.03]], 0.014, strap, 'Spine2');
      } else {
        const tote = l.bag === 'tote', x = 0.235 + (l.physique === 'heavy' ? 0.03 : 0);
        box(tote ? 0.07 : 0.085, tote ? 0.30 : 0.21, tote ? 0.30 : 0.27, x, hips.y + (tote ? 0.02 : -0.02), hips.z + 0.01, colour, 'Spine');
        if (tote) tube([[x, hips.y + 0.16, hips.z - 0.09], [x - 0.03, chest.y + 0.10, chest.z - 0.04], [x - 0.045, chest.y + 0.165, chest.z], [x - 0.03, chest.y + 0.10, chest.z + 0.05], [x, hips.y + 0.16, hips.z + 0.11]], 0.011, strap, 'Spine2');
        else tube([[x, hips.y + 0.08, hips.z - 0.02], [0.17, chest.y - 0.12, back], [0, chest.y + 0.04, back - 0.005], [-0.13, chest.y + 0.165, chest.z], [-0.07, chest.y + 0.05, front], [0.10, chest.y - 0.15, front], [x, hips.y + 0.08, hips.z + 0.04]], 0.012, strap, 'Spine2');
      }
    }
  }

  // ------------------------------------------------------------ clips and grounding
  // Set the skeleton from the clips. weights: { clip: [weight, seconds into the clip] }; weights should add up to one.
  sample(weights) {
    if (this.restPose) for (const [bone, p, q] of this.restPose) { bone.position.copy(p); bone.quaternion.copy(q); }
    this.turned.clear(); this.moved.clear();
    for (const [name, [weight, time]] of Object.entries(weights)) {
      if (!(weight > 0)) continue;
      const clip = CLIPS[name], seconds = clip.start + clamp(time, 0, clip.duration);
      for (const track of clip.tracks) {
        const bone = this.joints[track.node]; if (!bone) continue;
        const value = track.read.evaluate(seconds), turn = track.property === 'quaternion', done = turn ? this.turned : this.moved, before = done.get(bone) || 0;
        // The first clip sets the bone; each later one is mixed in by its share of the weight so far.
        if (turn) { if (before) bone.quaternion.slerp(quat.fromArray(value), weight / (before + weight)); else bone.quaternion.fromArray(value); }
        else if (before) bone.position.lerp(point.fromArray(value), weight / (before + weight)); else bone.position.fromArray(value);
        done.set(bone, before + weight);
      }
    }
    this.rig.position.set(0, 0, 0); this.seated = false;
    this.root.updateMatrixWorld(true);
  }
  at(name, turns) { return wrap(turns, 1) * CLIPS[name].duration; }
  idleTime(time) { return wrap(time + this.idleShift, CLIPS.Idle.duration); }

  // The vertices that touch the ground when standing. They are the same for everyone who shares a body mesh.
  findSoles() {
    this.root.updateMatrixWorld(true);
    const bodies = this.meshes.filter((m) => this.hero || m.name === 'People_Body');
    if (bodies.some((m) => !soleSamples.has(m.geometry.attributes.position))) {
      const heights = bodies.map((mesh) => {
        mesh.skeleton.update();
        const count = mesh.geometry.attributes.position.count, out = new Float32Array(count);
        for (let i = 0; i < count; i++) out[i] = this.root.worldToLocal(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld)).y;
        return out;
      });
      const low = Math.min(...heights.map((h) => h.reduce((a, v) => Math.min(a, v), Infinity)));
      bodies.forEach((mesh, k) => soleSamples.set(mesh.geometry.attributes.position, [...heights[k].keys()].filter((i) => heights[k][i] < low + 0.012)));
    }
    this.soles = bodies.map((mesh) => [mesh, soleSamples.get(mesh.geometry.attributes.position)]).filter(([, indices]) => indices.length);
    // The points of each sole, for shortenSteps. Everyone who shares a body mesh shares them too.
    const key = bodies[0]?.geometry.attributes.position;
    if (key && !footMarks.has(key)) {
      const marks = {};
      for (const side of ['Left', 'Right']) {
        const foot = this.bones[side + 'Foot'], here = foot.getWorldPosition(new THREE.Vector3()), there = this.bones[(side === 'Left' ? 'Right' : 'Left') + 'Foot'].getWorldPosition(new THREE.Vector3());
        const sole = [];
        for (const [mesh, indices] of this.soles) for (const i of indices) {
          const p = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
          if (p.distanceToSquared(here) < p.distanceToSquared(there)) sole.push(p);
        }
        const heel = sole.reduce((z, p) => Math.min(z, this.root.worldToLocal(p.clone()).z), Infinity);
        marks[side] = sole.map((p) => [foot.worldToLocal(p.clone()), this.root.worldToLocal(p.clone()).z - heel]);
      }
      footMarks.set(key, marks.Left.length && marks.Right.length ? marks : null);
    }
    this.footMarks = key ? footMarks.get(key) : null;
  }
  lowestSole() {
    this.root.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    let low = Infinity;
    for (const [mesh, indices] of this.soles) {
      mesh.skeleton.update();
      for (const i of indices) low = Math.min(low, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse).y);
    }
    return low;
  }
  // Put the lowest sole on the ground. With onlyUp, a foot that has left the ground on purpose stays in the air.
  groundFeet(onlyUp = false) {
    const low = this.lowestSole();
    if (Number.isFinite(low) && (!onlyUp || low < 0)) this.rig.position.y -= low;
    this.root.updateMatrixWorld(true);
  }
  resetPose() {
    for (const [bone, p, q, s] of this.restPose) { bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(s); }
    this.rig.position.set(0, 0, 0); this.seated = false; this.root.updateMatrixWorld(true);
    return this;
  }

  // ------------------------------------------------------------ moving
  // How far the walk cycle (in radians) advances for each metre travelled at a speed.
  phasePerMetre(speed) { const size = this.root.scale.y; return Math.PI * 2 / (this.gait(speed).stride * size); }
  // The gait for a speed in metres a second. Between SWITCH[0] and SWITCH[1] it is the gait the figure is already in.
  gait(speed) {
    const s = speed / this.root.scale.y;
    if (s < SWITCH[0]) this.running = false; else if (s > SWITCH[1]) this.running = true; else if (this.running === undefined) this.running = s > MEET;
    return gaitAt(s, this.running);
  }

  // The gait for a speed: this.standing is the standing share of the pose, this.stepping the share of each clip in
  // the rest, and this.short the share of the clips' step length. In play they change only so fast, so starting,
  // stopping and going from a walk to a jog take a moment and do not snap.
  pace(speed) {
    const { weights, short } = this.gait(speed), moving = 1 - weights.Idle;
    const gait = moving > 0.001 ? { Walk: weights.Walk / moving, Jog: weights.Jog / moving, Sprint: weights.Sprint / moving } : this.stepping || { Walk: 1, Jog: 0, Sprint: 0 };
    if (this.dt > 0 && this.stepping !== undefined) {
      const most = this.dt / GAIT_SECONDS;
      this.standing += clamp(weights.Idle - this.standing, -this.dt / START_SECONDS, this.dt / STOP_SECONDS);
      for (const clip in gait) this.stepping[clip] += clamp(gait[clip] - this.stepping[clip], -most, most);
      const total = this.stepping.Walk + this.stepping.Jog + this.stepping.Sprint;
      for (const clip in gait) this.stepping[clip] /= total;
      this.short += clamp(short - this.short, -most, most);
    } else { this.standing = weights.Idle; this.stepping = { ...gait }; this.short = short; }
    return this;
  }

  // Walking, jogging or sprinting at a speed in metres a second. phase is the cycle in radians.
  locomote(phase = 0, speed = 0, time = performance.now() / 1000, turnLean = 0) {
    if (this.airborne) this.carryOver(0.14);
    this.airborne = false; this.cycle = wrap(phase / (Math.PI * 2), 1); this.speed = speed;
    const { standing, stepping } = this.pace(speed), share = 1 - standing;
    this.sample({ Idle: [standing, this.idleTime(time)], Walk: [share * stepping.Walk, this.at('Walk', this.cycle)],
      ...runSamples(this.cycle, share * stepping.Jog, share * stepping.Sprint) });
    this.shortenSteps(this.short);
    this.bankTorso(turnLean);
    this.fade();
    this.groundFeet(true);
    return this.carryGrips();
  }
  // Tip the upper body into a turn. Rotating above the pelvis keeps the contact foot anchored.
  bankTorso(angle) {
    if (Math.abs(angle) < 0.001) return;
    const axis = point.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(quat));
    axis.applyQuaternion(this.spine.parent.getWorldQuaternion(quat).invert());
    this.spine.quaternion.premultiply(quat.setFromAxisAngle(axis, -angle));
  }
  // Steps shorter than the clip's, by `share` of their length. Each foot moves toward the body line and the leg bends to
  // follow. A planted foot then moves back under the body exactly as much slower as the body moves forward, and
  // stays where it is planted.
  // Call it straight after sample(), which leaves every bone's place in the world up to date.
  shortenSteps(share) {
    if (!(share < 0.995)) return;
    // A shorter step needs less backswing. Keep the idle breathing pose at a standstill.
    const relax = (1 - share) * (1 - this.standing);
    for (const [bone, , rest] of this.armRest) bone.quaternion.slerp(rest, relax);
    if (!this.footMarks) return;
    const origin = new THREE.Vector3().setFromMatrixPosition(this.root.matrixWorld), turn = this.root.getWorldQuaternion(new THREE.Quaternion());
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(turn), size = this.root.scale.y, soft = 0.004 * size, p = new THREE.Vector3();
    for (const side of ['Left', 'Right']) {
      const foot = this.bones[side + 'Foot'], ankle = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
      // How far ahead of the body the foot stands. It is read at the part of the sole that is on the ground (the lowest
      // points, each counted less the higher it is), and given as where the heel would be with the sole flat there.
      // A foot that lands on its heel, lies flat and leaves from its toe then has one place for the whole step.
      let lowest = Infinity, stands = 0, total = 0;
      for (const [mark] of this.footMarks[side]) lowest = Math.min(lowest, p.copy(mark).applyMatrix4(foot.matrixWorld).y);
      for (const [mark, fromHeel] of this.footMarks[side]) {
        p.copy(mark).applyMatrix4(foot.matrixWorld);
        const weight = Math.exp((lowest - p.y) / soft);
        stands += (p.sub(origin).dot(ahead) - fromHeel * size) * weight; total += weight;
      }
      this.moveAnkle(side, ankle.addScaledVector(ahead, -(stands / total) * (1 - share)), ahead);
    }
  }
  // Bend a leg so its ankle comes to a place in the world. The shoe keeps the angle it had. `ahead` is the way the
  // figure faces. The bones' places in the world must be up to date, and are not brought up to date afterwards.
  moveAnkle(side, goal, ahead, kneePole = null) {
    const up = this.bones[side + 'UpLeg'], low = this.bones[side + 'Leg'], foot = this.bones[side + 'Foot'];
    const at = (bone) => new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld), facing = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
    const hip = at(up), knee = at(low), ankle = at(foot);
    const thigh = hip.distanceTo(knee), shin = knee.distanceTo(ankle), dir = goal.clone().sub(hip), far = Math.min(dir.length(), (thigh + shin) * 0.999); dir.normalize();
    const along = (thigh * thigh - shin * shin + far * far) / (2 * far), out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
    // Cycling supplies a forward knee pole. A gait preserves the sampled bend
    // and adds a little forward bias when the leg is almost straight.
    const bend = kneePole ? kneePole.clone() : knee.clone().sub(hip);
    if (!kneePole) {
      const line = ankle.clone().sub(hip).normalize();
      bend.addScaledVector(line, -bend.dot(line)).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(line, dir)).addScaledVector(ahead, 0.05 * thigh);
    }
    bend.addScaledVector(dir, -bend.dot(dir)).normalize();
    const newKnee = hip.clone().addScaledVector(dir, along).addScaledVector(bend, out), newAnkle = hip.clone().addScaledVector(dir, far);
    const above = facing(up.parent), upTurn = facing(up), lowTurn = facing(low), footTurn = facing(foot);
    upTurn.premultiply(new THREE.Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(), newKnee.clone().sub(hip).normalize()));
    lowTurn.premultiply(new THREE.Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(), newAnkle.sub(newKnee).normalize()));
    up.quaternion.copy(above.invert().multiply(upTurn));
    low.quaternion.copy(upTurn.clone().invert().multiply(lowTurn));
    foot.quaternion.copy(lowTurn.invert().multiply(footTurn));
  }
  // Someone sitting on a step or a slope: each foot comes down, or up, to the ground under it, and the knee bends to
  // suit. ground(x, z) gives the height of the ground. A foot that cannot reach hangs as low as the leg allows.
  settleFeet(ground) {
    if (!this.seated || !this.footMarks) return;
    this.root.updateMatrixWorld(true);
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())), p = new THREE.Vector3();
    for (const side of ['Left', 'Right']) {
      const foot = this.bones[side + 'Foot'], ankle = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
      let lowest = Infinity, x = ankle.x, z = ankle.z;
      for (const [mark] of this.footMarks[side]) if (p.copy(mark).applyMatrix4(foot.matrixWorld).y < lowest) { lowest = p.y; x = p.x; z = p.z; }
      const rise = ground(x, z) - lowest;
      if (Math.abs(rise) < 0.03 * this.root.scale.y) continue;
      ankle.y += rise; this.moveAnkle(side, ankle, ahead);
      this.root.updateMatrixWorld(true);
    }
  }
  // The walk cycle (radians) to start a first step on: one foot flat under the body, the other just lifting.
  startPhase(walking = false) { return START_CYCLE[walking ? 'walk' : 'run'] * Math.PI * 2; }

  // A sudden change of pose, such as leaving the ground, does not snap: the difference from the pose last shown fades out
  // over `seconds`. Only in play, where the player sets dt each frame.
  carryOver(seconds) { if (this.dt > 0 && this.shown) this.carried = { seconds, left: seconds, turns: null, hips: null }; }
  fade() {
    if (!(this.dt > 0)) { this.carried = null; this.shown = null; return; }   // placed for a still, not played
    const bones = this.restPose, hips = this.pelvis, c = this.carried;
    if (c) {
      if (!c.turns) { c.turns = bones.map(([b], i) => b.quaternion.clone().invert().multiply(this.shown[i])); c.hips = this.shownHips.clone().sub(hips.position); }
      c.left -= this.dt;
      if (c.left <= 0) this.carried = null;
      else {
        const u = c.left / c.seconds, w = u * u * (3 - 2 * u);
        bones.forEach(([b], i) => b.quaternion.multiply(quat.identity().slerp(c.turns[i], w)));
        hips.position.addScaledVector(c.hips, w);
      }
    }
    if (!this.shown) { this.shown = bones.map(() => new THREE.Quaternion()); this.shownHips = new THREE.Vector3(); }
    bones.forEach(([b], i) => this.shown[i].copy(b.quaternion)); this.shownHips.copy(hips.position);
  }

  // A pose from the walk: amount 0 stands, 1 walks, 1.4 jogs. Scenes use it to place someone mid-stride.
  walk(phase = 0, amount = 0) {
    const a = clamp(amount, 0, 1.4), moving = clamp(a), run = clamp((a - 1) / 0.4), turns = wrap(phase / (Math.PI * 2), 1);
    this.airborne = false; this.cycle = turns;
    this.sample({ Idle: [1 - moving, this.idleTime(0)], Walk: [moving * (1 - run), this.at('Walk', turns)], Jog: [moving * run, this.at('Jog', turns)] });
    if (moving < 0.025) this.relaxStand(phase);
    this.groundFeet(moving > 0.5);
    return this.carryGrips();
  }
  jog(phase = 0) { this.walk(phase, 1.4); return this.grips(); }

  // Standing with the weight on one leg. Each person leans their own way.
  relaxStand(time = 0) {
    const phase = (this.look.variant ?? this.look.face ?? 0) * 1.31, sign = Math.sin(phase + 0.7) >= 0 ? 1 : -1;
    const free = sign > 0 ? 'Left' : 'Right', support = sign > 0 ? 'Right' : 'Left';
    this.aim(this.bones[free + 'UpLeg'], [sign * 0.09, -0.998, 0.06]); this.aim(this.bones[free + 'Leg'], [-sign * 0.03, -0.998, -0.06]);
    this.aim(this.bones[support + 'UpLeg'], [-sign * 0.015, -1, -0.025]); this.aim(this.bones[support + 'Leg'], [sign * 0.008, -1, 0.025]);
    for (const side of ['Left', 'Right']) { this.restOrientation(this.bones[side + 'Foot']); this.restOrientation(this.bones[side + 'ToeBase']); }
    this.spine.rotateZ(sign * 0.025 + 0.006 * Math.sin(time * 0.7 + phase));
    this.head.rotateY(0.045 * Math.sin(phase));
  }

  // The portable clip moves the armature up. sample() reads the bones only, so the motor owns the arc.
  jump(verticalSpeed = 0, speed = this.speed, clearance = Infinity, tookOff = false) {
    if (!this.airborne || tookOff) {
      const support = this.cycle < 0.5 ? 0 : 0.5;
      this.leapStart = this.airborne && !this.falling ? wrap(this.leapStart + 0.5, 1) : support;
      this.falling = !tookOff && verticalSpeed <= 0;
      this.carryOver(0.10);
    }
    this.airborne = true;
    this.pace(speed);
    const progress = Math.max(this.falling ? 0.75 : 0, jumpProgress(verticalSpeed, clearance));
    const pace = speed / this.root.scale.y;
    const run = 0.82 * smooth(1.5, 4.5, pace);
    const { weights } = gaitAt(clamp(pace, GAITS[1].speed, GAITS[2].speed));
    const toeOff = runToeOff(weights.Jog, weights.Sprint);
    const turns = wrap(this.leapStart + mix(toeOff, 0.5, progress), 1);
    this.sample({ Jump: [1 - run, mix(JUMP_TAKEOFF, JUMP_TOUCHDOWN, progress) * CLIPS.Jump.duration],
      ...runSamples(turns, run * weights.Jog, run * weights.Sprint) });
    this.fade();
    this.groundFeet(true);
    return this.carryGrips();
  }
  landingPhase() { return wrap(this.leapStart + 0.5, 1) * Math.PI * 2; }

  land(phase = 0, amount = 0, remaining = 1, metresPerSecond = this.speed, turnLean = 0) {
    if (this.airborne) this.carryOver(0.065);
    this.airborne = false; this.speed = metresPerSecond;
    const run = smooth(0.8, 3, metresPerSecond / this.root.scale.y);
    // A runner absorbs the impact on one foot and leaves it again within a step.
    const recovery = clamp((1 - remaining) * (1 + 0.7 * run));
    const press = (1 - smooth(0.35, 1, recovery)) * (1 - 0.48 * run);
    if (press <= 0.002) return this.locomote(phase, metresPerSecond, undefined, turnLean);
    const { standing, stepping } = this.pace(metresPerSecond), rest = (1 - press) * (1 - standing);
    this.cycle = wrap(phase / (Math.PI * 2), 1);
    this.sample({ Jump: [press, mix(JUMP_TOUCHDOWN, 1, recovery) * CLIPS.Jump.duration], Idle: [standing * (1 - press), this.idleTime(0)],
      Walk: [stepping.Walk * rest, this.at('Walk', this.cycle)], ...runSamples(this.cycle, rest * stepping.Jog, rest * stepping.Sprint) });
    this.shortenSteps(this.short);
    this.bankTorso(turnLean * (1 - press));
    this.fade();
    const running = (1 - standing) * (stepping.Jog + stepping.Sprint) > 0.5;
    this.groundFeet(running && this.cycle % 0.5 > runToeOff(stepping.Jog, stepping.Sprint));
    return this.carryGrips();
  }

  // ------------------------------------------------------------ bone helpers
  localJoint(name) { this.root.updateMatrixWorld(true); return this.root.worldToLocal(this.bones[name].getWorldPosition(new THREE.Vector3())); }
  // Point a bone along a direction given in the figure's own space (x left, y up, z ahead).
  aim(bone, direction) {
    this.root.updateMatrixWorld(true);
    const inverse = bone.parent.matrixWorld.clone().invert();
    const desired = new THREE.Vector3(...direction).normalize().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())).transformDirection(inverse);
    const current = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.quaternion).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(current, desired)); this.root.updateMatrixWorld(true);
  }
  restOrientation(bone) {
    this.root.updateMatrixWorld(true);
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).multiply(this.restWorld.get(bone));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); this.root.updateMatrixWorld(true);
  }
  footYaw(side, angle) {
    const foot = this.bones[side + 'Foot']; this.restOrientation(foot); this.restOrientation(this.bones[side + 'ToeBase']);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); this.root.updateMatrixWorld(true);
  }
  setHipHeight(y) { this.root.updateMatrixWorld(true); const v = this.root.worldToLocal(this.pelvis.getWorldPosition(new THREE.Vector3())); this.rig.position.y += y - v.y; this.root.updateMatrixWorld(true); }
  // Bend an arm so the wrist reaches a point in the figure's own space.
  reach(side, target) {
    const arm = this.bones[side + 'Arm'], fore = this.bones[side + 'ForeArm'], goal = new THREE.Vector3(...target);
    for (let pass = 0; pass < 4; pass++) {
      const shoulder = this.localJoint(side + 'Arm'), elbow = this.localJoint(side + 'ForeArm'), wrist = this.localJoint(side + 'Hand');
      if (wrist.distanceTo(goal) < 0.0008) break;
      const l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(wrist), dir = goal.clone().sub(shoulder), distance = clamp(dir.length(), 0.03, l1 + l2 - 0.002); dir.normalize();
      const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance), height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
      const bend = new THREE.Vector3(side === 'Left' ? 0.4 : -0.4, -1, -0.1); bend.addScaledVector(dir, -bend.dot(dir)).normalize();
      const mid = shoulder.clone().addScaledVector(dir, along).addScaledVector(bend, height), end = shoulder.clone().addScaledVector(dir, distance);
      this.aim(arm, mid.clone().sub(shoulder).toArray()); this.aim(fore, end.sub(mid).toArray());
    }
    return this;
  }

  // ------------------------------------------------------------ standing and sitting poses
  // Layer a jab over the gait sampled this frame. The height is measured from
  // the player's feet so the hand can angle down toward a seated person.
  punchPose(lift, extension, height, distance = 1) {
    if (!lift) return this;
    const scale = this.root.scale.y;
    const drive = lift * extension;
    const step = clamp(distance / scale - .61, .08, .29);
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    const ankles = this.legs.map(({ foot }) => foot.getWorldPosition(new THREE.Vector3()));
    // Step with the lead shoe while the back shoe stays planted. The hips move
    // over that stance as the fist extends, then return to the sampled gait.
    ankles[0].addScaledVector(ahead, step * scale * lift);
    ankles[0].y += .045 * scale * Math.sin(Math.PI * lift);
    this.rig.position.y -= .055 * lift + .055 * drive;
    this.rig.position.z += step * (.25 * lift + .60 * drive);
    this.root.updateMatrixWorld(true);
    this.moveAnkle('Left', ankles[0], ahead);
    this.moveAnkle('Right', ankles[1], ahead);
    this.spine.rotateX(.12 * lift + .22 * drive);
    this.spine.rotateY((-.16 + .58 * extension) * lift);
    const guard = this.localJoint('LeftArm').add(new THREE.Vector3(-.05, -.12, .20));
    this.reach('Left', this.localJoint('LeftHand').lerp(guard, lift).toArray());
    const shoulder = this.localJoint('RightArm');
    const wrist = this.localJoint('RightHand');
    const aimY = clamp(height / this.root.scale.y, shoulder.y - .46, shoulder.y + .10);
    const contactZ = clamp(distance / scale - .20, shoulder.z + .14, shoulder.z + .72);
    const fist = new THREE.Vector3(
      shoulder.x + extension * .09,
      (shoulder.y - .16) * (1 - extension) + aimY * extension,
      (shoulder.z + .14) * (1 - extension) + contactZ * extension
    );
    this.reach('Right', wrist.lerp(fist, lift).toArray());
    for (const joint of ['RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3']) this.bones[joint].rotateX(.86 * lift);
    this.bones.RightHandThumb2.rotateX(.48 * lift);
    return this.grips();
  }
  idle(time = 0) {
    this.airborne = false;
    this.sample({ Idle: [1, this.idleTime(time)] });
    this.relaxStand(time);
    this.groundFeet();
    const sway = 0.9 + (this.look.face || 0) * 1.7; this.head.rotateY(0.05 * Math.sin(time * 0.43 + sway)); this.spine.rotateZ(0.015 * Math.sin(time * 0.7 + sway));
    const seed = Math.abs(Math.trunc(this.look.variant ?? ((this.look.face || 0) * 13 + this.look.top[0] + Math.round(this.look.height * 100))));
    const style = this.look.idleStyle || (this.hero ? 'relaxed' : this.look.bag && seed % 4 === 0 ? 'strap' : ['relaxed', 'pocket', 'clasped', 'hip'][seed % 4]);
    const c = this.localJoint('Spine2'), h = this.localJoint('Hips');
    if (style === 'pocket') this.reach('Right', [-0.19, h.y + 0.035, h.z + 0.10]);
    if (style === 'clasped') { this.reach('Left', [0.025, c.y - 0.25, c.z + 0.20]); this.reach('Right', [-0.025, c.y - 0.26, c.z + 0.21]); }
    if (style === 'hip') { this.reach('Left', [0.21, h.y + 0.10, h.z - 0.02]); this.bones.LeftHand.rotateZ(-0.35); }
    if (style === 'strap') this.reach('Left', [0.13, c.y + 0.03, c.z + 0.13]);
    this.root.updateMatrixWorld(true);
    return this.carryGrips();
  }
  talk(time = 0) {
    this.idle(time);
    const c = this.localJoint('Spine2'), variant = (Math.abs(Math.trunc(this.look.variant ?? this.look.face ?? 0)) + Math.floor(Math.abs(time) * 0.5)) % 4;
    if (variant === 0) this.reach('Right', [-0.18, c.y - 0.20, c.z + 0.19 + 0.025 * Math.sin(time * 1.4)]);
    if (variant === 1) this.reach('Left', [0.20, c.y - 0.16, c.z + 0.20]);
    if (variant === 2) this.head.rotateY(0.16);
    if (variant === 3) { this.reach('Right', [-0.09, c.y - 0.24, c.z + 0.21]); this.head.rotateY(-0.10); }
    return this.carryGrips();
  }
  think() { this.idle(); const h = this.localJoint('Head'), c = this.localJoint('Spine2'); this.reach('Right', [-0.055, h.y - 0.10, h.z + 0.13]); this.reach('Left', [-0.13, c.y - 0.15, c.z + 0.18]); this.head.rotateY(-0.09); return this.grips(); }
  checkWatch() { this.idle(); const c = this.localJoint('Spine2'); this.reach('Left', [-0.04, c.y - 0.13, c.z + 0.26]); this.reach('Right', [-0.10, c.y - 0.15, c.z + 0.27]); this.head.rotateX(0.28); return this.grips(); }
  greet(time = 0) { this.idle(time); const h = this.localJoint('Head'); this.reach('Right', [-0.30, h.y + 0.10, h.z + 0.13]); this.bones.RightHand.rotateZ(0.16 * Math.sin(time * 3)); return this.grips(); }
  carry(thing = 'bag', phase = null) { if (phase === null) this.idle(); else this.walk(phase, 1); return this.hold(thing); }
  phone() { this.idle(); this.hold('phone'); this.head.rotateX(0.14); return this.grips(); }
  armsCrossed() { this.idle(); const c = this.localJoint('Spine2'); this.reach('Left', [-0.03, c.y - 0.085, c.z + 0.165]); this.reach('Right', [0.02, c.y - 0.125, c.z + 0.20]); return this.grips(); }   // wrists near the middle, so each hand lies on the other arm
  lean(side = 1) { this.armsCrossed(); this.spine.rotateZ(0.10 * (side < 0 ? -1 : 1)); this.root.updateMatrixWorld(true); return this.grips(); }
  read(thing = 'book') { this.idle(); this.hold(thing === 'newspaper' ? 'newspaper' : 'book'); this.head.rotateX(0.32); return this.grips(); }
  photograph() { this.idle(); return this.hold('camera'); }
  drink() { this.idle(); this.hold('cup'); const h = this.localJoint('Head'); this.reach('Right', [-0.065, h.y - 0.04, h.z + 0.16]); this.held[1].userData.tiltX = -0.18; return this.grips(); }

  stand() { this.airborne = false; this.sample({ Idle: [1, 0] }); return this; }
  // On a seat of a given height, at a table or not.
  sitOn(seat = 0.48, atTable = true) {
    seat = Number.isFinite(seat) && seat > 0 ? clamp(seat, 0.25, 0.95) : 0.48;
    this.stand();
    this.rig.position.z = 0.045;
    this.setHipHeight(seat / this.root.scale.y + 0.09); this.seated = true;
    for (const [i, side] of ['Left', 'Right'].entries()) {
      const sign = i === 0 ? 1 : -1, hip = this.bones[side + 'UpLeg'], knee = this.bones[side + 'Leg'];
      const hp = this.localJoint(side + 'UpLeg'), kp = this.localJoint(side + 'Leg'), fp = this.localJoint(side + 'Foot');
      const thigh = hp.distanceTo(kp), shin = kp.distanceTo(fp), forward = 0.16, vertical = Math.sqrt(1 - forward * forward), dy = clamp((this.ankleHeight + shin * vertical - hp.y) / thigh, -0.975, 0.9);
      this.aim(hip, [sign * 0.17, dy, Math.sqrt(Math.max(0.01, 1 - dy * dy - 0.17 * 0.17))]); this.aim(knee, [0, -vertical, forward]);
      this.footYaw(side, sign * 0.18);
      this.aim(this.bones[side + 'Arm'], [sign * 0.05, -1, atTable ? 0.32 : 0.10]);
      this.aim(this.bones[side + 'ForeArm'], [sign * 0.015, atTable ? -0.12 : -0.7, 1]);
    }
    for (const side of ['Left', 'Right']) { const k = this.localJoint(side + 'Leg'); this.reach(side, atTable ? [side === 'Left' ? 0.14 : -0.14, (seat + 0.28) / this.root.scale.y, 0.32] : [k.x, k.y + 0.1, k.z - 0.12]); }
    if (atTable === 'cup') this.hold('cup');
    if (atTable === 'typing') this.head.rotateX(0.12);
    this.root.updateMatrixWorld(true);
    return this.carryGrips();
  }
  // On the ground: legs out, cross-legged (2 or 'cross-legged') or leaning back (1, 3 or 'recline').
  sit(variant = 0) {
    this.stand(); this.setHipHeight(0.11);
    const crossed = variant === 'cross-legged' || variant === 2, reclined = variant === 'recline' || variant === 3 || variant === 1;
    for (const [i, side] of ['Left', 'Right'].entries()) {
      const s = i === 0 ? 1 : -1, hip = this.localJoint(side + 'UpLeg'), knee = this.localJoint(side + 'Leg'), foot = this.localJoint(side + 'Foot');
      const thigh = hip.distanceTo(knee), shin = knee.distanceTo(foot), rise = crossed ? 0.17 : reclined && i === 1 ? 0.23 : 0.30;
      const dy = clamp(rise / thigh, 0.2, 0.80), dx = crossed ? 0.64 : 0.48;
      this.aim(this.bones[side + 'UpLeg'], [s * dx, dy, Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy))]);
      const k = this.localJoint(side + 'Leg'), down = clamp((this.ankleHeight - k.y) / shin, -0.97, -0.12);
      const across = crossed ? -s * Math.min(0.83, Math.sqrt(Math.max(0.01, 1 - down * down)) * 0.96) : 0;
      this.aim(this.bones[side + 'Leg'], [across, down, Math.sqrt(Math.max(0.01, 1 - down * down - across * across))]);
      this.footYaw(side, crossed ? -s * 0.95 : s * 0.12);
    }
    this.groundFeet(); if (reclined) { this.spine.rotateX(-0.12); this.root.updateMatrixWorld(true); }
    this.seated = true; const hip = this.localJoint('Hips');
    for (const side of ['Left', 'Right']) { const k = this.localJoint(side + 'Leg'); this.reach(side, reclined && side === 'Left' ? [hip.x + 0.27, 0.08, hip.z - 0.15] : [k.x, k.y + 0.045, k.z - 0.055]); }
    return this.carryGrips();
  }

  // ------------------------------------------------------------ things in the hands
  _grips() { return this.grips(); }            // the names scenes written for the earlier model call
  _carryGrips() { return this.carryGrips(); }
  carryGrips() {
    for (const [index, prop] of Object.entries(this.held)) {
      const thing = prop.userData.thing;
      prop.userData.tiltX = ['book', 'newspaper'].includes(thing) ? 0.55 : thing === 'phone' ? 0.15 : 0;
      this.gripPose(Number(index), thing);
    }
    return this.grips();
  }
  grips() {
    this.root.updateMatrixWorld(true);
    const held = Object.entries(this.held); if (!held.length) return this;
    const inverse = this.root.matrixWorld.clone().invert();
    for (const [index, prop] of held) {
      // Props sit under the figure's root, not under a hand bone, so a hand's scale and turn cannot stretch them.
      prop.quaternion.identity();
      if (prop.userData.tiltX) prop.rotateX(prop.userData.tiltX); if (prop.userData.turnY) prop.rotateY(prop.userData.turnY);
      if (['book', 'newspaper', 'camera'].includes(prop.userData.thing)) {
        const mid = this.bones.LeftHand.getWorldPosition(new THREE.Vector3()).add(this.bones.RightHand.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        if (prop.userData.thing === 'camera') mid.add(new THREE.Vector3(0, 0.06, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())));
        prop.position.copy(mid.applyMatrix4(inverse));
      } else {
        const hand = this.arms[Number(index)].hand, wrist = hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
        const palm = new THREE.Vector3(0, 1, 0).transformDirection(hand.matrixWorld).transformDirection(inverse);
        prop.position.copy(wrist).addScaledVector(palm, prop.userData.thing === 'laptop' ? 0.07 : 0.06);
        if (prop.userData.thing === 'tray') prop.position.y += 0.018;
      }
    }
    this.root.updateMatrixWorld(true);
    return this;
  }
  gripPose(index, thing) {
    if (!thing) return;
    const side = index === 0 ? 'Left' : 'Right', sign = index === 0 ? 1 : -1, c = this.localJoint('Spine2'), h = this.localJoint('Head');
    for (const name of (['camera', 'book', 'newspaper'].includes(thing) ? ['Left', 'Right'] : [side])) {
      const bone = this.bones[name + 'Hand'], rest = this.restPose.find(([b]) => b === bone); bone.quaternion.copy(rest[2]);
    }
    if (thing === 'camera') { this.reach('Right', [-0.10, h.y + 0.025, h.z + 0.25]); this.reach('Left', [0.10, h.y + 0.025, h.z + 0.25]); }
    else if (thing === 'book' || thing === 'newspaper') {
      this.head.rotation.x = Math.max(this.head.rotation.x, 0.18);
      this.reach('Right', [-0.12, c.y - 0.10, c.z + 0.31]); this.reach('Left', [0.12, c.y - 0.10, c.z + 0.31]);
    } else if (thing === 'bag') { const hip = this.localJoint('Hips'); this.reach(side, [sign * 0.26, hip.y - 0.16, hip.z + 0.04]); }
    else if (thing === 'laptop') this.reach(side, [sign * 0.22, c.y - 0.33, c.z + 0.10]);
    else this.reach(side, [sign * 0.16, c.y + (thing === 'phone' ? 0.02 : -0.09), c.z + 0.29]);
    if (thing === 'tray') {
      const hand = this.bones[side + 'Hand']; this.root.updateMatrixWorld(true);
      const forward = new THREE.Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
      const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(this.restWorld.get(hand).clone().invert()).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
      palm.addScaledVector(forward, -palm.dot(forward)).normalize(); up.addScaledVector(forward, -up.dot(forward)).normalize();
      const roll = Math.atan2(forward.dot(palm.clone().cross(up)), palm.dot(up));
      hand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll)); this.root.updateMatrixWorld(true);
    }
  }
  hold(thing, hand = 'right') {
    const i = hand === 'left' || hand === 0 ? 0 : 1;
    const tilt = ['book', 'newspaper'].includes(thing) ? 0.55 : thing === 'phone' ? 0.15 : 0;
    if (this.held[i]?.userData.thing === thing) { this.held[i].userData.tiltX = tilt; this.gripPose(i, thing); return this.grips(); }
    const old = this.held[i]; if (old) { this.triangleCount -= old.userData.triangles; old.removeFromParent(); old.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); delete this.held[i]; }
    if (!thing) return this.grips();
    if (!['cup', 'phone', 'laptop', 'book', 'camera', 'newspaper', 'tray', 'bag'].includes(thing)) return this.grips();
    const g = new THREE.Group(); g.userData.thing = thing; g.userData.triangles = 0; g.userData.tiltX = tilt; g.userData.turnY = ['book', 'newspaper', 'phone'].includes(thing) ? Math.PI : 0;
    const mesh = (geo, color, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, map: propWhite })); m.position.set(x, y, z); g.add(m); g.userData.triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; return m; };
    const box = (w, h, d, c, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z);
    if (thing === 'cup') { mesh(new THREE.CylinderGeometry(0.036, 0.026, 0.095, 8), 0xc6b69a, 0, 0, 0.035); mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.012, 8), 0x39362f, 0, 0.051, 0.035); }
    if (thing === 'phone') {
      box(0.067, 0.13, 0.012, 0x262b30, 0, -0.01, 0.035);
      const screen = drawTex(64, 128, (c) => { c.fillStyle = '#c5d9de'; c.fillRect(0, 0, 64, 128); c.fillStyle = '#527888'; c.fillRect(5, 8, 54, 12); c.fillStyle = '#e8e7d5'; for (let j = 0; j < 4; j++) c.fillRect(7, 28 + j * 22, 44 - j % 2 * 9, 15); c.fillStyle = '#46616b'; c.fillRect(22, 118, 20, 3); });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.108), new THREE.MeshBasicMaterial({ map: screen })); panel.position.set(0, -0.01, 0.042); g.add(panel); g.userData.triangles += 2;
    }
    if (thing === 'book' || thing === 'newspaper') {
      const paper = thing === 'newspaper', h = paper ? 0.25 : 0.20;
      const print = drawTex(128, 128, (c) => { c.fillStyle = '#ddd2b8'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#5b574e'; if (paper) { c.font = 'bold 11px serif'; c.fillText('THE DAILY', 17, 15); c.fillRect(9, 21, 110, 1); } for (let col = 0; col < 2; col++) for (let row = 0; row < 14; row++) c.fillRect(10 + col * 58, (paper ? 29 : 12) + row * 6, 38 + (row * 13 + col * 9) % 13, 1); c.fillStyle = '#ad9f82'; c.fillRect(63, 0, 2, 128); });
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group(); leaf.rotation.y = side * 0.48; leaf.position.set(0, -0.02, 0.04); g.add(leaf);
        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.146, h + 0.012, 0.014), new THREE.MeshLambertMaterial({ color: paper ? 0xbab6a1 : 0x5c5847, map: propWhite })); cover.position.x = side * 0.073; leaf.add(cover); g.userData.triangles += 12;
        const page = new THREE.Mesh(new THREE.PlaneGeometry(0.139, h), new THREE.MeshLambertMaterial({ map: print, side: THREE.DoubleSide })); page.position.set(side * 0.073, 0, 0.008); leaf.add(page); g.userData.triangles += 2;
        if (side === 1 && !paper) { const coverTex = drawTex(64, 128, (c) => { c.fillStyle = '#625c49'; c.fillRect(0, 0, 64, 128); c.strokeStyle = '#b6aa87'; c.strokeRect(5, 7, 54, 114); c.fillStyle = '#d9cba4'; c.font = 'bold 12px serif'; c.fillText('NOTES', 10, 34); c.fillRect(17, 101, 30, 1); }); const label = new THREE.Mesh(new THREE.PlaneGeometry(0.139, h), new THREE.MeshLambertMaterial({ map: coverTex })); label.rotation.y = Math.PI; label.position.set(side * 0.073, 0, -0.008); leaf.add(label); g.userData.triangles += 2; }
      }
      box(0.007, h, 0.019, 0xa8997f, 0, -0.02, 0.04);
    }
    if (thing === 'laptop') { box(0.028, 0.30, 0.22, 0x727b7b, 0, 0.09, -0.035); box(0.003, 0.045, 0.045, 0xb0b5af, 0.016, 0.09, -0.035); }
    if (thing === 'camera') { box(0.12, 0.075, 0.045, 0x30302d, 0, 0, 0.035); const lens = mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.04, 8), 0x161f23, 0, 0, 0.075); lens.rotation.x = Math.PI / 2; box(0.045, 0.018, 0.025, 0x484741, 0, 0.045, 0.035); }
    if (thing === 'tray') { box(0.30, 0.012, 0.20, 0x8c8c7d, 0, 0, 0.035); mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.07, 8), 0xd6c9af, 0, 0.042, 0.04); }
    if (thing === 'bag') {
      box(0.22, 0.25, 0.09, 0x716851, 0, -0.20, 0.01); box(0.19, 0.018, 0.095, 0x514c3e, 0, -0.08, 0.01);
      for (const z of [-0.025, 0.045]) { const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.075, -0.08, z), new THREE.Vector3(-0.055, -0.015, z), new THREE.Vector3(0.055, -0.015, z), new THREE.Vector3(0.075, -0.08, z)]); mesh(new THREE.TubeGeometry(path, 8, 0.007, 4, false), 0x4c473c); }
    }
    g.name = 'Held ' + thing; this.root.add(g); this.held[i] = g; this.triangleCount += g.userData.triangles; this.gripPose(i, thing);
    return this.grips();
  }

  // A bystander made from a number, dressed for the place: 'campus-fall', 'campus-winter', 'shore' or 'startup'.
  static random(seed = 1, setting = 'campus-fall') {
    const key = typeof seed === 'number' ? Math.trunc(seed) : [...String(seed)].reduce((a, c) => Math.imul(a, 31) + c.charCodeAt(0), 0);
    let state = Math.imul(key ^ (key >>> 16), 0x45d9f3b); state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; }, pick = (a) => a[Math.floor(rand() * a.length)];
    const winter = setting === 'campus-winter', shore = setting === 'shore', startup = setting === 'startup', female = rand() < 0.48;
    const styles = winter ? ['coat', 'puffer', 'jacket'] : shore ? ['tee', 'tank', 'shirt', 'hoodie', 'jacket', 'stripe'] : startup ? ['shirt', 'blazer', 'tee', 'cardigan', 'hoodie', 'jacket'] : ['tee', 'hoodie', 'shirt', 'sweater', 'jacket', 'cardigan', 'blazer'];
    let topStyle = styles[((key % styles.length) + styles.length) % styles.length];
    let bottomStyle = shore && rand() < 0.55 ? 'shorts' : pick(['jeans', 'chinos', 'pants']);
    if (female && !winter && key % 5 === 0) { topStyle = 'dress'; bottomStyle = 'skirt'; } else if (female && !winter && key % 4 === 0 && topStyle !== 'blazer') bottomStyle = 'skirt';
    return new Figure({ variant: key, skin: pick([[195, 151, 117], [128, 88, 64], [220, 178, 139], [168, 117, 83]]), hair: pick([[30, 25, 22], [87, 58, 37], [160, 126, 75], [54, 43, 35]]),
      hairStyle: pick(winter ? ['beanie', 'crop', 'parted', 'long', 'curly'] : ['crop', 'parted', 'quiff', 'curly', 'long', 'tied', 'bun', 'receding', 'bald', 'cap']), face: Math.floor(rand() * 4), build: female ? 'f' : 'm',
      physique: pick(['regular', 'slim', 'stocky', 'heavy', 'tall']), height: 1.60 + rand() * 0.28, topStyle, sleeveLength: topStyle === 'shirt' && key % 3 === 2 ? 'short' : undefined,
      top: pick([[65, 78, 89], [151, 65, 47], [61, 96, 67], [190, 176, 144], [57, 52, 53], [189, 190, 179], [104, 84, 131]]), inner: pick([[214, 207, 187], [78, 85, 91], [174, 184, 195]]),
      bottom: pick([[52, 62, 78], [116, 108, 88], [43, 46, 49]]), bottomStyle, bag: rand() < 0.35 ? pick(['backpack', 'shoulder', 'tote']) : null, scarf: winter && rand() < 0.65, hood: topStyle === 'hoodie' });
  }

  place(x, y, z, heading = 0) { this.root.position.set(x, y, z); this.root.rotation.y = heading; return this; }

  dispose() {
    if (this.hero) for (const mesh of this.meshes) mesh.material.dispose();
    this.root.removeFromParent();
  }
}
