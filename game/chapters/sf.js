// Chapter 4: San Francisco. The Golden Gate from the water's edge, fitted shot for shot to the reference clip.
// The bridge, water, fog and rocks were built first as a standalone scene and moved here unchanged.
// What is new is the shore behind the old camera spot, so there is ground to walk on.
import * as THREE from 'three';
import { rgb, clamp, smooth, mix3, hash, fbm, interp, pixelTex, drawTex, reuse } from 'life/engine/look.js';
import { World } from 'life/engine/world.js';
import { Trees } from 'life/engine/trees.js';
import { shoreConcrete, surface, coastalDetail } from 'life/chapters/sf-textures.js';
import { Bake } from 'life/engine/bake.js';
import { Figure } from 'life/engine/figure.js';
import { Animals } from 'life/engine/animals.js';
import { Props } from 'life/engine/props.js';
import { Cars } from 'life/engine/cars.js';
import { makeBridgeDrive } from 'life/chapters/bridge-drive.js';
import { memories } from 'life/story.js';
import { placeRadio } from 'life/engine/portable-radio.js';
import { addBayFerry } from 'life/chapters/bay-ferry.js';
import { kitTexture } from 'life/engine/kit-textures.js';

// Warm vehicle sources during module loading, before the asynchronous figure
// loader finishes and the synchronous chapter/atlas constructors run.
for(const kind of ['sedan','suv','hatch','pickup','van','bus','glass','metal','rubber'])kitTexture(kind);

// World is in metres. X runs along the bridge, Y is up, the near tower stands at the origin.
// Proportions are fitted to the reference frame, not to the real bridge: the towers are stockier
// and the main span is much shorter.
const LEG_Z = 18.9, SPAN = 487, DECK_Y = 62.5, PIER_TOP = 6.5;
// The deck sits off-centre between the legs and reaches past the far one, as it does in the reference.
const DECK_NEAR = 16, DECK_FAR = -22, CABLE_NEAR = 16.5, CABLE_FAR = -20;
const CABLE_TOP = 226, CABLE_LOW = DECK_Y + 5.5;
const CAM = { x: -190.6, y: 1.2, z: 72.6, yaw: 0.4155, pitch: 0.3427, fov: 66 };

const FOG = rgb(158, 185, 190);

// ---------- fog -------------------------------------------------------------------------------
// The reference fog is not a plain distance fade. A low bank starts right behind the near tower
// and swallows the deck, while the tower tops stay clear until much further out. These chunk
// overrides replace three's built-in fog in every chapter. A scene opts into the bank by using
// FogExp2, as this chapter does. Scenes with the ordinary Fog keep the ordinary distance fade.
THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogY = ( modelMatrix * fogWorld ).y;
#endif`;
// A sprite's vertex shader has no `transformed`, so the chunk above does not compile there and
// the sprite is not drawn. A sprite takes its fog height from its centre.
THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace('#include <fog_vertex>', `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = modelMatrix[3].y;
#endif`);
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
  varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifndef FOG_EXP2
    // Every other chapter: three's plain distance fog.
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, smoothstep( fogNear, fogFar, vFogDepth ) );
  #elif defined( BACKDROP )
    // The headland and its trees are painted in their hazy colours. Up close they turn into plain ground and leaves.
    vec3 fogGround = BACKDROP == 2 ? vec3( 0.17, 0.28, 0.19 )
      : mix( vec3( 0.36, 0.38, 0.27 ), vec3( 0.52, 0.5, 0.36 ), clamp( vFogY / 150.0, 0.0, 1.0 ) );
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + (BACKDROP == 2 ? vec3(.0,.06,.10) : vec3(.12,.06,.115)), .72 * smoothstep(160.0,700.0,vFogDepth));
  #else
    float fogBank = 0.98 * smoothstep( 245.0, 510.0, vFogDepth ) * ( 1.0 - smoothstep( 72.0, 155.0, vFogY ) );
    float fogHaze = 0.985 * pow( clamp( ( vFogDepth - 200.0 ) / 420.0, 0.0, 1.0 ), 0.8 );
    // Water lightens a little toward the horizon well before the bank starts.
    float fogSheen = 0.16 * smoothstep( 12.0, 90.0, vFogDepth ) * ( 1.0 - smoothstep( 0.0, 0.5, vFogY ) );
    float shoreHaze = .48 * smoothstep(55.0,300.0,vFogDepth) * (1.0 - smoothstep(18.0,65.0,vFogY));
    float fogFactor = 1.0 - (1.0-shoreHaze) * ( 1.0 - fogBank ) * ( 1.0 - fogHaze ) * ( 1.0 - fogSheen );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;

function skippingStone(world, beach, splashes, onStoneImpact) {
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ map: surface(2), color: rgb(144, 139, 125), flatShading: true }));
  stone.name = 'Skipping stone';
  stone.scale.set(.18, .075, .14);
  stone.position.copy(beach);
  world.scene.add(stone);

  const ring = new THREE.RingGeometry(.77, 1, 18);
  const impacts = [.85, 1.45, 1.9];
  // The camera skims the surface. A short upright spray reads against the dark water
  // even when its spreading ring is almost edge-on.
  const sprayMaterial = new THREE.SpriteMaterial({ depthWrite: false, map: drawTex(32, 24, g => {
    g.fillStyle = '#e3eeea';
    g.beginPath(); g.moveTo(11,23); g.quadraticCurveTo(12,18,4,10); g.quadraticCurveTo(11,12,16,19);
    g.quadraticCurveTo(17,11,25,6); g.quadraticCurveTo(20,15,20,20); g.lineTo(26,16); g.lineTo(21,23); g.fill();
    for (const [x,y] of [[5,6],[21,4],[28,9]]) { g.beginPath(); g.ellipse(x,y,1,1.6,.5,0,Math.PI*2); g.fill(); }
  }) });
  const ripples = splashes.map(point => {
    const ripple = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: rgb(220,233,222), transparent: true, depthWrite: false }));
    ripple.name = 'Stone ripple';
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.copy(point);
    ripple.renderOrder = 3;
    ripple.visible = false;
    world.scene.add(ripple);
    const spray = new THREE.Sprite(sprayMaterial);
    spray.center.set(.5, 0);
    spray.position.copy(point);
    spray.visible = false;
    world.scene.add(spray);
    return { ripple, spray };
  });
  const release = new THREE.Vector3();
  let elapsed = null;
  world.interactions.push({
    x: beach.x, y: beach.y + .55, z: beach.z, r: 3.6,
    get label() { return elapsed === null ? 'Skip a stone' : null; },
    act(player) {
      player.figure.arms[1].hand.getWorldPosition(release);
      stone.position.copy(release);
      elapsed = 0;
    },
  });
  world.ticks.push((t, dt) => {
    if (elapsed === null) return;
    const previous = elapsed;
    elapsed += dt;
    const hop = impacts.findIndex(time => elapsed < time);
    stone.visible = hop >= 0;
    if (stone.visible) {
      const since = hop === 0 ? 0 : impacts[hop - 1];
      const u = (elapsed - since) / (impacts[hop] - since);
      stone.position.lerpVectors(hop === 0 ? release : splashes[hop - 1], splashes[hop], u);
      stone.position.y += (1.05 - hop * .35) * 4 * u * (1 - u);
      stone.rotation.y = elapsed * 14;
    }
    ripples.forEach(({ ripple, spray }, i) => {
      const age = elapsed - impacts[i];
      if (previous < impacts[i] && age >= 0) onStoneImpact?.(i);
      spray.visible = age >= 0 && age < .55;
      if (spray.visible) {
        const size = (1.15 - i * .14) * Math.sin(Math.PI * age / .55);
        spray.scale.set(size, size * .8, 1);
      }
      ripple.visible = age >= 0 && age < 1;
      if (!ripple.visible) return;
      ripple.scale.setScalar(.18 + age * (1.8 - i * .22));
      ripple.material.opacity = .9 * (1 - age);
    });
    if (elapsed >= impacts.at(-1) + 1) {
      elapsed = null;
      stone.position.copy(beach);
      stone.visible = true;
    }
  });
}

/** @param {{onStoneImpact?: (index: number) => void, onDrive?: () => void}} [events] */
export function buildSf({ onStoneImpact, onDrive } = {}) {
  const world = new World(), { scene } = world;
  let parkedMustang;
  scene.fog = new THREE.FogExp2(FOG, 1); // only supplies the colour and switches the fog bank on
  // The colour filter. At the water's edge it is the haze the reference frame measures: blacks lifted to about (52, 50, 44).
  // Inland the haze thins, so that people and things near the camera keep their darks, as the daylight references do.
  const HAZE = { multiply: [236, 240, 240], add: [52, 50, 44] }, CLEAR = { multiply: [255, 255, 245], add: [9, 9, 3] };
  world.grade = (pos) => {
    const k = smooth(7, 14, Math.hypot(pos.x - world.start.x, pos.z - world.start.z));   // the haze sits on the rocks at the water's edge
    return { multiply: mix3(HAZE.multiply, CLEAR.multiply, k), add: mix3(HAZE.add, CLEAR.add, k) };
  };
  world.gradeNow = { multiply: new THREE.Vector3(...HAZE.multiply).divideScalar(255), add: new THREE.Vector3(...HAZE.add).divideScalar(255) };
  world.peopleFill = [22, 22, 20];
  world.fov = CAM.fov; world.far = 9000;

  // Flat, mostly ambient light. The two tower faces the camera sees end up almost equally bright.
  scene.add(new THREE.AmbientLight(0xc3d9ee, 0.44 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffefd5, 0.70 * Math.PI);
  sun.position.set(0.72, 1.05, 0.42);
  world.shadow = { range: 65, size: 4096 };
  world.contact = 0.5;   // on pale paving the shade under each person has to be firm, or they look afloat
  scene.add(sun);

  // Axes on the ground measured from where the reference camera stood: ahead of it, and to its right.
  const AHEAD = new THREE.Vector3(Math.cos(CAM.yaw), 0, -Math.sin(CAM.yaw));
  const RIGHT = new THREE.Vector3(Math.sin(CAM.yaw), 0, Math.cos(CAM.yaw));
  const nearCam = (ahead, right, y) => new THREE.Vector3(CAM.x, y, CAM.z).addScaledVector(AHEAD, ahead).addScaledVector(RIGHT, right);

  // Painted steel: vertical flutes, a panel seam, rust streaks.
  const steelTex = pixelTex(64, 64, (x, y, u, v) => {
    const f = x % 16;
    let s = f < 2 ? 0.84 : f < 4 ? 1.05 : f > 13 ? 0.95 : 1;
    if (y % 32 === 0) s *= 0.9;
    s *= 0.9 + 0.2 * fbm(u, v, 8, 2, 11);
    return [212 * s, 108 * s, 87 * s];
  });
  const grainTex = pixelTex(64, 64, (x, y, u, v) => { const s = 215 + 40 * fbm(u, v, 6, 6, 23); return [s, s, s]; });
  const pierTex = pixelTex(256, 128, (x, y, u, v) => {
    const streak=fbm(u,0,65,1,81,3), grain=hash(x,y,721)-.5;
    let c=mix3([165,161,145],[207,202,183],streak);
    const runoff=smooth(.48,.72,streak)*smooth(.05,.85,v);
    c=mix3(c,[114,116,103],runoff*.45);
    const tide=.57+.012*Math.sin(u*53)+.009*Math.sin(u*117);
    c=mix3(c,[61,70,55],smooth(tide-.025,tide+.025,v)*.86);
    return c.map(n=>n+grain*9);
  });
  const rockTex = pixelTex(128, 128, (x, y, u, v) => {
    const a = fbm(u, v, 6, 6, 41, 4), b = fbm(u, v, 6, 9, 47, 3), grain = fbm(u, v, 18, 18, 53, 2);
    let c = mix3([52, 41, 35], [120, 96, 80], smooth(0.34, 0.66, a * 0.6 + b * 0.4));
    c = mix3(c, [166, 144, 122], smooth(0.58, 0.78, b) * 0.5);
    const k = 0.78 + 0.44 * grain;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  // The water of the reference frame: dull teal with a net of thin paler lines, the way light breaks on a swell.
  // The colours are what the frame measures at the water's edge, (57, 75, 64) with lines up to (98, 115, 101),
  // taken back through this scene's colour filter.
  function waterTex(seed, cells) {
    // Distance from the nearest cell edge of a scattered grid that wraps at the tile's edge: small along the net's lines.
    const edge = (u, v) => {
      // Cells are longer one way than the other, like the light net on a swell seen from the shore.
      const rows = Math.round(cells * 0.6), px = u * cells, py = v * rows, ix = Math.floor(px), iy = Math.floor(py);
      let first = 9, second = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, wx = ((cx % cells) + cells) % cells, wy = ((cy % rows) + rows) % rows;
        const d = Math.hypot(cx + hash(wx, wy, seed) - px, cy + hash(wx, wy, seed + 5) - py);
        if (d < first) { second = first; first = d; } else if (d < second) second = d;
      }
      return second - first;
    };
    const tex = pixelTex(256, 256, (x, y, u, v) => {
      const swell = smooth(0.25, 0.75, fbm(u, v, 4, 4, seed, 3));                 // darker and lighter water
      const broken = smooth(0.3, 0.62, fbm(u, v, 7, 7, seed + 3, 2));            // the net comes and goes
      // Bend the grid so its lines wander like light on water and do not read as tiles.
      const bu = u + 0.14 * (fbm(u, v, 6, 6, seed + 11, 2) - 0.5), bv = v + 0.14 * (fbm(u, v, 6, 6, seed + 13, 2) - 0.5);
      const net = smooth(0.17, 0.02, edge(bu, bv)) * (0.12 + 0.88 * broken);
      // Wave backs: long and narrow, about a metre and a half from crest to crest, stronger where the swell is up.
      const crest = smooth(0.34, 0.68, fbm(bu, bv, 4, 15, seed + 21, 2)) * (0.55 + 0.45 * swell);
      const body = mix3(mix3([0, 14, 10], [6, 30, 24], swell), [34, 66, 54], crest);
      return mix3(body, [138, 172, 156], net);   // bright lines on dark water, as the frame has them
    });
    // Far from the camera the net blurs into flat teal, as in the frame. The game's sharpening pass leaves soft textures alone.
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4; tex.userData.soft = true; tex.needsUpdate = true;
    return tex;
  }
  const undersideTex = pixelTex(32, 32, (x, y) => {
    if (x % 16 < 2) return [71, 44, 32];
    if (y % 16 < 2) return [94, 52, 37];
    return [79, 48, 34];
  });
  const trussAlpha = drawTex(128, 64, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = g.strokeStyle = '#fff';
    g.fillRect(0, 0, 128, 12);
    g.fillRect(0, 55, 128, 9);
    for (const x of [0, 64, 128]) g.fillRect(x - 4, 0, 8, 64);
    g.lineWidth = 8; g.beginPath(); g.moveTo(0, 58); g.lineTo(64, 8); g.lineTo(128, 58); g.stroke();
  });
  const treeAlpha = drawTex(32, 48, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 32, 48);
    g.fillStyle = '#fff'; g.fillRect(14, 28, 4, 20);
    for (const [x, y, r] of [[16, 15, 11], [9, 22, 8], [23, 22, 8], [16, 8, 7]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  });
  // The far truss, seen from below: heavy bottom chord, crossed braces and two thin rails in every panel.
  const latticeAlpha = drawTex(128, 64, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = g.strokeStyle = '#fff';
    g.fillRect(0, 0, 128, 5);
    g.fillRect(0, 51, 128, 13);
    for (const x of [0, 128]) g.fillRect(x - 4, 0, 8, 64);
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, 4); g.lineTo(128, 54); g.moveTo(0, 54); g.lineTo(128, 4); g.stroke();
    g.fillRect(0, 18, 128, 4); g.fillRect(0, 34, 128, 4);
    g.beginPath(); g.arc(64, 29, 7, 0, 7); g.fill();
  });
  const foamAlpha = pixelTex(64, 64, (x, y, u, v) => {
    const a = 255 * clamp(smooth(1, 0.15, Math.hypot(u - 0.5, v - 0.5) * 2) * smooth(0.25, 0.8, fbm(u, v, 6, 9, 61, 3)));
    return [a, a, a];
  });
  // Road surface. Canvas rows run across the deck from the far edge to the near edge.
  const roadTex = pixelTex(64, 64, (x, y, u, v) => {
    const z = DECK_FAR + (DECK_NEAR - DECK_FAR) * v, n = 0.9 + 0.2 * fbm(u, v, 8, 8, 71);
    if (Math.abs(z) > 12.4) return [112 * n, 108 * n, 102 * n];
    if (Math.abs(z) < 0.45) return [176, 150, 52];
    if (Math.abs(Math.abs(z) - 6.2) < 0.35 && x % 32 < 14) return [170, 170, 164];
    return [62 * n, 62 * n, 65 * n];
  });

  // ---------- materials -------------------------------------------------------------------------
  const steelMat = new THREE.MeshLambertMaterial({ map: steelTex });
  const strutMat = new THREE.MeshLambertMaterial({ map: reuse(steelTex, 3, 1), color: new THREE.Color(1, 1, 1) });
  // The far leg below the deck sits in shade in the reference.
  const shadeMat = new THREE.MeshLambertMaterial({ map: steelTex, color: new THREE.Color(0.476, 0.307, 0.309) });
  // Keep the approved orange steel shading while the shore receives stronger sunlight.
  for (const material of [steelMat, strutMat, shadeMat]) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 fittedSun = normalize((viewMatrix * vec4(-0.563,0.512,0.648,0.0)).xyz); vec3 outgoingLight = diffuseColor.rgb * (0.45 + 0.586 * max(dot(normal, fittedSun), 0.0)); outgoingLight = max(vec3(0.0), (outgoingLight - vec3(52.0,50.0,44.0)/255.0) / (vec3(236.0,240.0,240.0)/255.0));');
    };
    material.customProgramCacheKey = () => 'sf-fitted-steel-r5';
  }
  const pierMat = new THREE.MeshLambertMaterial({ map: pierTex });
  const cableMat = new THREE.MeshBasicMaterial({ color: rgb(186, 92, 70), map: grainTex });
  const rodMat = new THREE.MeshBasicMaterial({ color: rgb(178, 90, 70) });
  const lineMat = new THREE.LineBasicMaterial({ color: rgb(170, 95, 78) });
  const fasciaMat = new THREE.MeshBasicMaterial({ color: rgb(134, 58, 37), map: grainTex });
  const lampMat = new THREE.MeshBasicMaterial({ color: rgb(120, 126, 128) });
  // Keeps a material at its own colours under the colour filter, by taking the filter out again before it is applied.
  const preserveBridge = material => {
    material.onBeforeCompile = shader => {
      shader.uniforms.gradeAdd = { value: world.gradeNow.add }; shader.uniforms.gradeMultiply = { value: world.gradeNow.multiply };
      shader.fragmentShader = 'uniform vec3 gradeAdd;\nuniform vec3 gradeMultiply;\n' + shader.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = max(vec3(0.0), (gl_FragColor.rgb - gradeAdd) / gradeMultiply);\n#include <fog_fragment>');
    };
    material.customProgramCacheKey = () => 'sf-bridge-grade-r7'; return material;
  };
  for(const m of [cableMat,rodMat,lineMat,fasciaMat])preserveBridge(m);


  const box = (sx, sy, sz, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  };

  const instancedBoxes = (items, mat) => { // each item: size x, y, z, then position x, y, z
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    items.forEach(([sx, sy, sz, x, y, z], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))));
    mesh.frustumCulled = false; scene.add(mesh); return mesh;
  };

  // ---------- sky -------------------------------------------------------------------------------
  // Continuous sky texture: no vertex colour bands or separate fog cards.
  const skyMap = pixelTex(1024,512,(x,y,u,v)=>{
    const altitude=Math.abs(v-.5)*180;
    const base=mix3([164,199,214],[103,191,221],smooth(0,28,altitude));
    const streak=fbm(u,v,14,48,930,4);
    const cloud=smooth(.54,.73,streak)*smooth(6,16,altitude)*(1-smooth(42,66,altitude));
    const az=2*Math.PI*u, dx=-Math.cos(az), dz=Math.sin(az);
    const openingDot=dx*Math.cos(CAM.yaw)-dz*Math.sin(CAM.yaw);
    const elsewhere=1-smooth(.35,.65,openingDot);
    return mix3(base,mix3([177,207,212],[65,141,181],smooth(0,60,altitude)),elsewhere);
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(7000,48,32),new THREE.MeshBasicMaterial({map:skyMap,side:THREE.BackSide,fog:false,depthWrite:false}));
  sky.renderOrder=-1;scene.add(sky);
  // The sky keeps the colour it has in the haze at the water's edge wherever you stand: it is put through the haze
  // filter here and the filter of the moment is taken out again, so the frame's filter brings it back to the same cyan.
  sky.material.onBeforeCompile = shader => {
    shader.uniforms.gradeAdd = { value: world.gradeNow.add }; shader.uniforms.gradeMultiply = { value: world.gradeNow.multiply };
    shader.fragmentShader = 'uniform vec3 gradeAdd;\nuniform vec3 gradeMultiply;\n' + shader.fragmentShader.replace('#include <fog_fragment>',
      `gl_FragColor.rgb = max(vec3(0.0), (gl_FragColor.rgb * mix(vec3(1.0),vec3(.48,.76,1.0),clamp((52.0/255.0-gradeAdd.r)/(43.0/255.0),0.0,1.0)) * vec3(${HAZE.multiply.map((v) => (v / 255).toFixed(4)).join(',')}) + vec3(${HAZE.add.map((v) => (v / 255).toFixed(4)).join(',')}) - gradeAdd) / gradeMultiply);\n#include <fog_fragment>`);
  };
  sky.material.customProgramCacheKey = () => 'sf-sky-keeps-haze';


  // ---------- water -----------------------------------------------------------------------------
  // Two copies of a tiling ripple texture sliding over each other.
  const waterA = waterTex(3, 30), waterB = waterTex(8, 21);
  const WATER_SIZE = 12000;
  waterA.repeat.set(WATER_SIZE / 22, WATER_SIZE / 22);
  waterB.repeat.set(WATER_SIZE / 37, WATER_SIZE / 37); waterB.rotation = 0.6;
  for (const [tex, y, opacity] of [[waterA, 0, 1], [waterB, 0.02, 0.16]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE),
      new THREE.MeshBasicMaterial({ map: tex, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
    if(opacity===1)m.material.userData.shotSurface='water';
    m.rotation.x = -Math.PI / 2; m.position.set(CAM.x, y, CAM.z); scene.add(m);
  }

  // ---------- towers ----------------------------------------------------------------------------
  function tower(x0) {
    const g = new THREE.Group(); g.position.x = x0; scene.add(g);
    box(44, 10, 58, pierMat, 0, PIER_TOP - 5, 0, g);
    box(7, 7, LEG_Z * 2, shadeMat, 0, PIER_TOP + 3.5, 0, g);
    // y0, y1, size along the bridge, size across it. The legs step in as they rise.
    const sections = [[PIER_TOP, 17, 20, 13], [17, DECK_Y, 15, 10], [DECK_Y, 78, 15, 10], [78, 111, 13.5, 9], [111, 152.5, 12, 8],
      [152.5, 188, 10.5, 7.2], [188, 224, 9.5, 6.6], [224, 229.5, 7.5, 5]];
    for (const side of [-1, 1]) for (const [y0, y1, dx, dz] of sections) {
      box(dx, y1 - y0, dz, side < 0 && y1 <= DECK_Y ? shadeMat : steelMat, 0, (y0 + y1) / 2, side * LEG_Z, g);
    }
    // Struts are thin slabs, so very little of their dark underside shows from below.
    for (const [y0, y1] of [[208, 224], [172, 188], [138, 152.5], [98, 111]]) {
      box(3.4, y1 - y0, LEG_Z * 2, strutMat, -1.5, (y0 + y1) / 2, 0, g);
      for (const side of [-1, 1]) {
        const profile=new THREE.Shape();
        profile.moveTo(0,0);profile.lineTo(7,0);profile.lineTo(7,-6);profile.quadraticCurveTo(5,-1,0,0);
        const bracket=new THREE.Mesh(new THREE.ExtrudeGeometry(profile,{depth:3.4,bevelEnabled:false,curveSegments:6}),strutMat);
        bracket.rotation.y=-side*Math.PI/2;bracket.position.set(side>0?.2:-3.2,y0,side*(LEG_Z-9));g.add(bracket);
      }
    }
  }
  for (let i = -2; i <= 3; i++) tower(i * SPAN);

  // ---------- deck ------------------------------------------------------------------------------
  // The bridge runs on for two more spans each way, so its ends stay out of sight when you move.
  const X0 = -SPAN * 2, X1 = SPAN * 3, LEN = X1 - X0, XC = (X0 + X1) / 2;
  const fromTower = (x) => { const d = ((x % SPAN) + SPAN) % SPAN; return Math.min(d, SPAN - d); };
  {
    const flat = (tex, y, turn, side) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LEN, DECK_NEAR - DECK_FAR), preserveBridge(new THREE.MeshBasicMaterial({ map: tex, side })));
      m.rotation.x = turn; m.position.set(XC, y, (DECK_NEAR + DECK_FAR) / 2); scene.add(m);
    };
    flat(reuse(undersideTex, LEN / 18, 2), DECK_Y - 1, Math.PI / 2, THREE.DoubleSide);
    flat(reuse(roadTex, LEN / 16, 1), DECK_Y - 0.02, -Math.PI / 2, THREE.FrontSide);

    // Side trusses are flat cut-out cards: a lit W truss on the near side, a dark dense lattice on the far side.
    // Far from the camera the cut-outs close up, so the pattern does not break into dashes in the fog.
    for (const [z, depth, color, alpha, panel] of [[DECK_NEAR, 9.5, rgb(123, 52, 34), trussAlpha, 2.7], [DECK_FAR, 11, rgb(88, 52, 42), latticeAlpha, 1.5]]) {
      const tiles = LEN / (depth * panel);
      const mat = new THREE.MeshBasicMaterial({ color, map: reuse(grainTex, tiles, 1), alphaMap: reuse(alpha, tiles, 1), alphaTest: 0.4, side: THREE.DoubleSide });
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = max(vec3(0.0), (gl_FragColor.rgb - vec3(52.0,50.0,44.0)/255.0)/(vec3(236.0,240.0,240.0)/255.0));\n#include <fog_fragment>');
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>',
          'diffuseColor.a *= mix( texture2D( alphaMap, vAlphaMapUv ).g, 1.0, smoothstep( 200.0, 290.0, vFogDepth ) );');
      };
      const card = new THREE.Mesh(new THREE.PlaneGeometry(LEN, depth), mat);
      card.position.set(XC, DECK_Y - depth / 2, z); scene.add(card);
      box(LEN, 1.7, 0.9, fasciaMat, XC, DECK_Y + 0.55, z + Math.sign(z) * 0.2);
    }
    const lamps = [];
    for (let x = -170 - 42 * 19; x < X1; x += 42) {
      if (fromTower(x) < 10) continue;
      for (const [z, inward] of [[DECK_NEAR, -1], [DECK_FAR, 1]]) {
        lamps.push([0.35, 9, 0.35, x, DECK_Y + 5.6, z + inward * 0.5], [0.3, 0.3, 3, x, DECK_Y + 10, z + inward * 1.9],
          [0.7, 0.35, 1.3, x, DECK_Y + 9.8, z + inward * 3.6]);
      }
    }
    instancedBoxes(lamps, lampMat);
  }

  // ---------- cables and suspenders -------------------------------------------------------------
  // The same parabola repeats in every span. The reference shows the cable behind the camera
  // sagging like a main span, not running straight down to an anchorage.
  const cableY = (x) => {
    const k = ((((x % SPAN) + SPAN) % SPAN) - SPAN / 2) / (SPAN / 2);
    return CABLE_LOW + (CABLE_TOP - CABLE_LOW) * k * k;
  };
  {
    for (const z of [CABLE_FAR, CABLE_NEAR]) for (let a = X0; a < X1; a += SPAN) {
      const n = 40, pts = [];
      for (let i = 0; i <= n; i++) { const x = a + SPAN * i / n; pts.push(new THREE.Vector3(x, i === 0 || i === n ? CABLE_TOP : cableY(x), z)); }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.95, 5, false), cableMat));
    }
    // Each suspender is a thin box, plus a one-pixel line so it does not vanish in the distance.
    const rods = [], lines = [];
    for (let x = -252 - 14 * 51; x < X1; x += 14) {
      const top = cableY(x);
      if (fromTower(x) < 9 || top - DECK_Y < 1.5) continue;
      for (const z of [CABLE_FAR, CABLE_NEAR]) {
        rods.push([0.34, top - DECK_Y, 0.34, x, (top + DECK_Y) / 2, z]);
        lines.push(x, top, z, x, DECK_Y, z);
      }
    }
    instancedBoxes(rods, rodMat);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    scene.add(new THREE.LineSegments(lg, lineMat));
  }

  // ---------- traffic ---------------------------------------------------------------------------
  const PAINT = [[52, 46, 44], [70, 52, 42], [150, 142, 124], [44, 40, 40], [96, 40, 34], [60, 62, 70], [120, 124, 126], [34, 52, 74]];
  const bridgeCars = new Cars(world);
  const vehicle = (l,h,w,paint,x,z) => { const car=bridgeCars.add(h>2?'van':'sedan',x,z,Math.PI/2,paint,{solid:false});car.position.y=DECK_Y+.2;car.scale.multiplyScalar(1.65);return car; };
  // Three vehicles stand on the near walkway. From below they are the dark lumps on the deck edge.
  vehicle(4.8, 1.9, 2, PAINT[0], -120, DECK_NEAR - .5).scale.setScalar(2);
  vehicle(6.5, 3.3, 2.3, PAINT[1], -95, DECK_NEAR - .5).scale.setScalar(2);
  vehicle(4.6, 1.8, 2, PAINT[2], -45, DECK_NEAR - 1.5);
  const cars = [];
  for (let i = 0; i < 20; i++) {
    const lane = i % 4, big = hash(i, 3, 5) > 0.7;
    const m = vehicle(big ? 7 : 4.7, big ? 3.2 : 1.7, big ? 2.4 : 2, PAINT[i % PAINT.length], 0, [-9, -3.4, 3.4, 9][lane]);
    m.userData = { start: hash(i, 4, 5) * LEN, speed: (lane < 2 ? -1 : 1) * (12 + hash(i, 6, 1) * 6) };
    cars.push(m);
  }

  // ---------- distant headland ------------------------------------------------------------------
  // A backdrop painted in its hazy colours, laid out as an arc around the opening camera position.
  // It skips the normal fog. The BACKDROP switch in the fog code swaps in ground colours up close.
  {
    const ridge = [[9, 0], [13, 20], [17.4, 48], [23.5, 67], [27.6, 92], [30.7, 114], [37, 150], [44, 143], [52, 152], [64, 120], [74, 60], [82, 24], [90, 0]];
    const rows = [[-400, 0], [-270, 0.3], [-140, 0.7], [-40, 0.95], [0, 1], [110, 0.4], [230, 0.15], [340, 0]]; // distance offset, share of ridge height
    const RADIUS = 780, pos = [], col = [], idx = [];
    const place = (deg, r, y) => [CAM.x + r * Math.cos(deg * Math.PI / 180), y, CAM.z - r * Math.sin(deg * Math.PI / 180)];
    const columns = 41;
    for (let i = 0; i < columns; i++) {
      const deg = -8 + i * 2.5;
      rows.forEach(([dr, share], j) => {
        const jitter = hash(i, j, 3) - 0.5;
        const h = share === 0 ? -3 : Math.max(0, interp(ridge, deg) * share + jitter * 17);
        pos.push(...place(deg, RADIUS + dr + jitter * 30, h));
        const c = mix3([132, 158, 149], [164, 192, 191], clamp(h / 150)), n = .72 + .48 * fbm(i/columns,j/rows.length,7,4,109,3);
        col.push(c[0] * n / 255, c[1] * n / 255, c[2] * n / 255);
      });
    }
    for (let i = 0; i < columns - 1; i++) for (let j = 0; j < rows.length - 1; j++) {
      const a = i * rows.length + j, b = a + rows.length;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(pos.flatMap((v,i)=>i%3===0?[v/24,pos[i+2]/24]:[]),2));
    geo.setIndex(idx);
    const hillMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: coastalDetail('scrub'), side: THREE.DoubleSide });
    hillMat.defines = { BACKDROP: 1 };
    scene.add(new THREE.Mesh(geo, hillMat));

    const distantTrees=new Trees(world);
    const originalGround=world.ground;
    for(let i=0;i<18;i++){
      const deg=18+hash(i,1,92)*55, dr=-200+hash(i,2,92)*220;
      const [x,y,z]=place(deg,RADIUS+dr,interp(ridge,deg)*(dr< -140?.3+(dr+270)/130*.4:dr< -40?.7+(dr+140)/100*.25:.95+(dr+40)/40*.05));
      world.ground=()=>y;
      distantTrees.broadleaf(x,z,16+hash(i,3,92)*14,[55,78,65],{spread:1.65,detail:.35});
    }
    world.ground=originalGround;
    const farRocks=[];
    for(let i=0;i<28;i++){
      const deg=28+hash(i,1,919)*50,dr=-100+hash(i,2,919)*90;
      const [x,y,z]=place(deg,RADIUS+dr,interp(ridge,deg)*(.9+dr/600));
      farRocks.push([8+hash(i,3,919)*10,3+hash(i,4,919)*5,7,x,y,z]);
    }
    const crag=new THREE.MeshBasicMaterial({color:0x929b8f,map:coastalDetail('cliff')});crag.defines={BACKDROP:1};
    world.instances(new THREE.IcosahedronGeometry(1,0),crag,farRocks);
    const before=new Set(scene.children);distantTrees.build({shadow:0});
    for(const child of scene.children)if(!before.has(child)&&child.material){child.material.fog=true;child.material.defines={...child.material.defines,BACKDROP:2};child.material.color.setRGB(.48,.57,.48);}

  }

  // ---------- foreground rocks and foam ---------------------------------------------------------
  const foam = [];
  {
    const lerp = (a, b, t) => a + (b - a) * t;
    const noise3 = (x, y, z, seed) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
      const h = (i, j, k) => hash(xi + i + (zi + k) * 57, yi + j + (zi + k) * 113, seed);
      return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
        lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w);
    };
    // The foreground rocks wear the generated rock tile, at a scale that stays sharp from the water's edge.
    const rockMat = preserveBridge(new THREE.MeshLambertMaterial({ map: surface(2), color: rgb(46, 52, 56), emissive: rgb(124, 131, 133), emissiveMap: surface(2), flatShading: true }));
    // ahead, right, centre height | radii ahead, up, right | boxiness, flare at the base, turn, seed.
    // The slab, the mound and the front rock are fitted to their outlines in the reference frame.
    const rocks = [
      [2.79, -2.21, 0.03, 1.57, 1.62, 1.5, 2.25, 0.12, 0, 1],
      [3.3,-3.1,.08,.86,.94,.82,2.1,.1,.4,21],    // big slab on the left (fitted to the reference frame)
      [9.9, -0.98, -0.05, 0.9, 0.8, 0.98, 2.8, 0.05, 0, 2],      // mound out in the water
      [1.4, -0.59, 0.1, 0.47, 0.85, 0.8, 2.35, 0.18, 0, 3],       // low rock in front (fitted to the reference frame)
      [5.9, -3.9, -0.1, 1.4, 0.9, 1.4, 2.6, 0.2, 0.7, 5],        // behind the slab
      [-3.0,-1.7,.15,1.5,.85,1.4,3.5,.2,.2,17],     // left of the start, clear of the player's feet when the camera sits behind them
      [-1.6,.9,-.25,1.3,.6,1.2,4,.1,.2,18],          // the flat slab the player starts on

      [1.9, 6.5, 0.1, 1.2, 0.8, 1.1, 3, 0.2, 0.5, 6], [2.2, -9, 0, 1.5, 1.0, 1.3, 3.5, 0.2, 1.1, 7], [1.6, 15, 0, 1.0, 0.7, 1.2, 2.6, 0.2, 2.0, 8],
      [2.6, 24, 0, 1.6, 1.1, 1.4, 4, 0.2, 0.3, 9], [2.0, -18, 0, 1.3, 0.9, 1.5, 3, 0.2, 1.7, 10], [2.4, 38, 0, 1.4, 0.9, 1.2, 3, 0.2, 2.6, 11], // along the shore
    ];
    for (const [ahead, right, y, ra, ry, rb, boxy, flare, turn, seed] of rocks) {
      const geo = new THREE.IcosahedronGeometry(1, seed === 2 ? 1 : 2);
      const p = geo.attributes.position, count = p.count;
      const wet = new Float32Array(count * 3), uv = new Float32Array(count * 2), round = new Float32Array(count * 3), v = new THREE.Vector3(), flat = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(p, i);
        // Pull the sphere toward a block, widen it toward the base, then add lumps. All three depend only
        // on the corner's direction, so faces that share a corner stay joined.
        const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
        const blocky = Math.pow(ax ** boxy + ay ** boxy + az ** boxy, -1 / boxy);
        round.set([Math.sign(v.x) * ax ** (boxy - 1), Math.sign(v.y) * ay ** (boxy - 1), Math.sign(v.z) * az ** (boxy - 1)], i * 3);
        const lump = 0.94 + 0.12 * noise3(v.x * 1.9 + seed * 9.1, v.y * 1.9, v.z * 1.9, seed);
        v.multiplyScalar(blocky);
        const wide = 1 + flare * (1 - v.y);
        v.set(v.x * wide, seed===2 ? Math.min(v.y,.72-v.x*.22) : v.y, v.z * wide).multiplyScalar(lump);
        p.setXYZ(i, v.x, v.y, v.z);
        const damp=.56+.44*smooth(.02,.38,v.y*ry+y);wet.set([damp,damp,damp],i*3);
        uv.set([(v.x * ra + v.y * ry * 0.6) * 0.62 + seed * 0.37, (v.z * rb + v.y * ry * 0.6) * 0.62], i * 2);
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color',new THREE.BufferAttribute(wet,3));rockMat.vertexColors=true;
      geo.computeVertexNormals();
      // Blend each face's own direction with the rounded one: hard outline, soft shading.
      const n = geo.attributes.normal;
      for (let i = 0; i < count; i++) {
        v.set(round[i * 3], round[i * 3 + 1], round[i * 3 + 2]).normalize().multiplyScalar(.8).add(flat.fromBufferAttribute(n, i).multiplyScalar(.2)).normalize();
        n.setXYZ(i, v.x, v.y, v.z);
      }
      const material=seed===2?rockMat.clone():rockMat;
      if(seed===2)preserveBridge(material);
      const m = new THREE.Mesh(geo, material);
      m.position.copy(nearCam(ahead, right, y)); m.scale.set(ra, ry, rb); m.rotation.y = CAM.yaw + turn; scene.add(m);
    }
    // White water breaks all round the base of each rock that stands in the sea: a ragged ring, densest at the stone.
    const ringAlpha = pixelTex(128, 128, (x, y, u, v) => {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.atan2(v - 0.5, u - 0.5);
      const edge = 0.5 + 0.07 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 7 + 0.4);   // the ring is not a perfect circle
      const band = smooth(edge - 0.1, edge, r) * Math.pow(1 - smooth(edge, edge + 0.42, r), 2);
      const k = 255 * clamp(band * (0.3 + 0.9 * smooth(0.3, 0.7, fbm(u, v, 9, 9, 67, 3))));
      return [k, k, k];
    });
    for (const [ahead, right, y, ra, ry, rb, , flare, turn, seed] of rocks) {
      if (ahead < -3.2 || Math.abs(right) > 5.4 || y > 0.12) continue;   // only rocks whose base is under water
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ra * (1 + flare) * 3.5, rb * (1 + flare) * 3.5),
        new THREE.MeshBasicMaterial({ color: rgb(222, 232, 220), alphaMap: ringAlpha, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, CAM.yaw + turn); m.position.copy(nearCam(ahead, right, 0.035 + seed * 0.0004));
      m.renderOrder = 2; m.userData.opacity = seed === 2 ? 0.95 : 0.8; scene.add(m); foam.push(m);
    }
    // Pale foam where the swell meets the rocks: ahead, right, length, width, direction of the long side, strength.
    for (const [ahead, right, len, wid, angle, opacity] of [[9.0,-.85,3.0,.8,CAM.yaw+1.57,.8], [9.9,-1.88,1.9,.6,CAM.yaw,.7], [10.3,.1,2.0,.6,CAM.yaw,.7], [5.4,.1,2.8,.8,CAM.yaw+1.1,.65], [4.2,-1.3,2.4,.7,CAM.yaw+.5,.6]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid),
        new THREE.MeshBasicMaterial({ color: rgb(213, 224, 210), alphaMap: foamAlpha, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, angle); m.position.copy(nearCam(ahead, right, 0.04));
      m.renderOrder = 2; m.userData.opacity = opacity; scene.add(m); foam.push(m);
    }
  }

  // ---------- the shore you walk on ----------
  // The reference camera stood at the water's edge. Behind that line there is a shelf of sand and rock,
  // then a grass bank with a path along it.
  const SHORE = 1.2;   // metres ahead of the old camera spot where the water starts
  const landY = (s) => (s > SHORE ? 0 : s > -3 ? 0.35 : s > -7 ? 0.35 + ((-3 - s) / 4) * 0.9 : 1.25);
  const along = (x, z) => [(x - CAM.x) * AHEAD.x + (z - CAM.z) * AHEAD.z, (x - CAM.x) * RIGHT.x + (z - CAM.z) * RIGHT.z]; // [ahead, right]
  world.ground = (x, z) => landY(along(x, z)[0]);
  {const p=nearCam(-3,-1.7,0);world.post(p.x,p.z,1.2,1.1);}
  world.fence = (x, z) => { const [s, t] = along(x, z); return s > 0.7 || s < -60 || Math.abs(t) > 110; }; // the water, and the edges of what is built
  {
    const sandTex = surface(1);
    const grassTex = surface(0);
    const pathTex = surface(4);
    // A band of ground between two distances ahead, 520 m wide, following the slope of the shore.
    const band = (from, to, tex, tile, lift = 0) => {
      const rows = [from, ...[SHORE, -3, -7].filter((b) => b < from && b > to), to], pos = [], uv = [], idx = [];
      rows.forEach((s,i)=>{
        for(let j=0;j<=260;j++){
          const t=-260+j*2, edge=s>=SHORE ? .7*Math.sin(t*.7)+.3*Math.sin(t*1.9):s===-7?.45*Math.sin(t*.8)+.24*Math.sin(t*2.1):0;
          const cove = Math.abs(t)<5.5 && s>-3.1;
          const p=nearCam(s+edge,t,(s>SHORE||cove?-.3:landY(s))+lift);pos.push(p.x,p.y,p.z);uv.push(t/tile,(s+edge)/tile);
          if(i&&j){const a=i*261+j;idx.push(a-262,a-1,a-261,a-261,a-1,a);}
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const groundMat=new THREE.MeshLambertMaterial({map:tex});
      groundMat.onBeforeCompile=shader=>{
        shader.uniforms.shoreGrade={value:world.gradeNow.add};
        shader.fragmentShader='uniform vec3 shoreGrade;\n'+shader.fragmentShader.replace('#include <fog_fragment>',`float inland=clamp((52.0/255.0-shoreGrade.r)/(43.0/255.0),0.0,1.0);
          gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(gl_FragColor.rgb*vec3(1.08,1.10,.96),vec3(.30,.32,.23),.33),inland);
          #include <fog_fragment>`);
      };
      scene.add(new THREE.Mesh(geo,groundMat));
    };
    band(SHORE + 0.8, -7, sandTex, 3); band(-7, -340, grassTex, 4); band(-10, -13, pathTex, 3, 0.03);

    const SKIN = [[214, 170, 132], [150, 104, 72], [232, 190, 150], [112, 78, 56]], HAIR = [[34, 26, 22], [120, 84, 44], [70, 44, 28], [83, 55, 35]];
    const TOPS = [[[60, 62, 70], 'hoodie'], [[236, 232, 224], 'tee'], [[150, 60, 40], 'tee'], [[58, 84, 120], 'hoodie'], [[70, 110, 80], 'shirt'], [[120, 40, 44], 'stripe']];
    const person = (i) => {
      const woman = i % 2 === 1, [top, topStyle] = TOPS[i % 6];
      return new Figure({ physique: i % 5 === 3 ? 'stocky' : 'regular', face: i % 3, skin: SKIN[i % 4], hair: HAIR[(i * 3) % 4], hairStyle: woman ? 'long' : 'short', build: woman ? 'f' : 'm', height: (woman ? 1.66 : 1.78) + ((i * 7) % 5) * 0.02,
        top, topStyle, bottomStyle:i%3?'jeans':'shorts', bottom: i % 2 ? [52, 56, 70] : [70, 72, 84], shoes: [220, 216, 208] });
    };
    const facing = Math.atan2(AHEAD.x, AHEAD.z);   // looking out at the bridge
    // ahead, right, turn away from the view, sitting
    [[-8.6, 6, 0.1, 1], [-8.4, 7.3, -0.2, 1], [-8.8, -14, 0.3, 1], [-1.2, -7, 0.15, 0], [-0.9, 12, -0.3, 0], [-1.4, 13.1, 0.4, 0]].forEach(([s, t, turn, sitting], i) => {
      const p = nearCam(s, t, landY(s)), f = person(i).place(p.x, p.y, p.z, facing + turn);
      if (sitting) {f.sitOn(.58,'cup');} else if(i===3){f.hold('camera');}else{f.talk(.5);f.hold('cup');}
      scene.add(f.root); world.post(p.x, p.z, 0.35, 1.9);
    });
    for (const [from, to, speed, i] of [[-70, 90, 1.3, 6], [80, -50, 1.15, 7], [-20, 60, 2.6, 8]]) {
      const a = nearCam(-11.5 + (i - 7) * 0.7, from, 0), b = nearCam(-11.5 + (i - 7) * 0.7, to, 0);
      world.walker(person(i), a.x, a.z, b.x, b.z, speed, i * 31);
    }
  }

  // Shore dressing uses the camera's local axes. Nothing crosses the fitted opening cone.
  {
    const mat = (c, map = coastalDetail('grain')) => {
      const m=new THREE.MeshLambertMaterial({color:c,map});
      m.onBeforeCompile=shader=>{shader.uniforms.shoreGrade={value:world.gradeNow.add};shader.fragmentShader='uniform vec3 shoreGrade;\n'+shader.fragmentShader.replace('#include <fog_fragment>',`float pigmentLuma=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
        float inland=clamp((52.0/255.0-shoreGrade.r)/(43.0/255.0),0.0,1.0);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,max(vec3(0.0),mix(vec3(pigmentLuma),gl_FragColor.rgb,1.35)*1.1),inland);
        #include <fog_fragment>`);};
      m.customProgramCacheKey=()=> 'sf-shore-pigment';return m;
    };
    const iron = mat(0x454e49), timber = mat(0x82705a,coastalDetail('wood')), concrete = mat(0xb3afa1, shoreConcrete());
    const dark = mat(0x363d3b), pale = mat(0xc2bca9), glass = mat(0x627d7d);
    const bake = new Bake(world), props=new Props(world), animals=new Animals(world);
    const batches = new Map();
    const addBox = (s,t,y,w,h,d,m) => {
      if (!batches.has(m)) batches.set(m, []);
      // Boxes batched in shore-local coordinates, then rotate the entire batch.
      batches.get(m).push([w,h,d,t,y,-s]);
    };
    const turn = Math.atan2(RIGHT.x, RIGHT.z) - Math.PI/2;
    const origin = nearCam(0,0,0);
    const solid = (s,t,w,d,h=2) => {
      for(let x=-w/2+.25;x<w/2;x+=.5) {
        const p=nearCam(s,t+x,0); world.post(p.x,p.z,Math.max(.3,d/2),h);
      }
    };
    const rodBatches = new Map();
    const rod = (a,b,r,m) => {
      const delta=b.clone().sub(a), length=delta.length();
      const matrix=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),new THREE.Vector3(r,length,r));
      if(!rodBatches.has(m))rodBatches.set(m,[]);
      rodBatches.get(m).push(matrix);
    };
    const localRod = (s,t,y,s2,t2,y2,r,m) => rod(nearCam(s,t,y),nearCam(s2,t2,y2),r,m);
    // Concrete paving, scored joints and granite curb. The centre stays open for walkers.
    for(let t=-108;t<110;t+=3) {
      for(const s of [-10,-13]) addBox(s,t,1.32,2.94,.14,.24,concrete);
      // Joints are already in the paving texture; no duplicate black strip.
    }
    // Benches face the bay, including seats for the existing seated visitors.
    for(const t of [-92,-64,-38,-14,6.65,28,48,76,98]) {
      const p=nearCam(-8.9,t,0);props.bench(p.x,p.z,Math.atan2(AHEAD.x,AHEAD.z),{y:1.3,scale:1.2});
      solid(-8.9,t,2.6,.7,2.4);
    }
    // Low chain rail along the bank; generous beach access gaps.
    for(let t=-105;t<=105;t+=5) {
      if(Math.abs(t)<8 || Math.abs(t-60)<5) continue;
      addBox(-7.5,t,1.83,.1,1.16,.1,iron);
      const p=nearCam(-7.5,t,0);world.post(p.x,p.z,.17,2.5);
      if(Math.abs(t+2.5)<8 || Math.abs(t+2.5-60)<5 || t===105) continue;
      for(let j=0;j<5;j++) {
        const y=2.27-.28*Math.sin(j/5*Math.PI), y2=2.27-.28*Math.sin((j+1)/5*Math.PI);
        localRod(-7.5,t+j,y,-7.5,t+j+1,y2,.025,iron);
      }
      solid(-7.5,t+2.5,5,.08,2.3);
    }
    for(const t of [-99,-69,-39,-9,21,51,81,105]) {
      const p=nearCam(-14.8,t,0);props.lamp(p.x,p.z,turn,{y:1.3,height:4.8,style:'street'});world.post(p.x,p.z,.25,6.2);
      const bin=nearCam(-15,t+2,0);props.bin(bin.x,bin.z,0,{y:1.3});bake.shadow(bin.x,bin.z,.8,.32,.8,1.34);
      solid(-15,t+2,.7,.7);
    }
    const signMap=drawTex(256,128,g=>{
      g.fillStyle='#ddd4b8';g.fillRect(0,0,256,128);g.fillStyle='#3c554e';g.fillRect(5,5,246,118);
      g.fillStyle='#ece4cc';g.font='bold 21px sans-serif';g.fillText('GOLDEN GATE',16,32);g.font='16px sans-serif';g.fillText('COASTAL TRAIL',16,55);
      g.fillRect(16,67,221,1);g.font='12px sans-serif';g.fillText('FORT POINT   ←',16,91);g.fillText('CRISSY FIELD  →',16,111);
    });
    for(const t of [-26,58]) {
      addBox(-14.3,t,2.2,.11,1.9,.11,iron);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.8),new THREE.MeshBasicMaterial({map:signMap,side:THREE.DoubleSide}));
      sign.position.copy(nearCam(-14.3,t,3));sign.rotation.y=Math.atan2(AHEAD.x,AHEAD.z);scene.add(sign);
      solid(-14.3,t,.2,.2,3.5);
    }
    for(let i=0;i<4;i++){
      const p=nearCam(-15.9,33+i*1.5,0);
      props.bicycle(p.x,p.z,turn,{y:1.3,color:[0x566b6c,0x883e2f,0x93948a,0x555f40][i],solid:true});
    }
    // Drift line: wet pebbles, stranded kelp and bleached logs, outside the postcard foreground.
    const pebbles=[],wrack=[],shells=[];
    for(let i=0;i<620;i++) {
      const t=-108+216*hash(i,1,204),s=-.5-5.5*hash(i,2,204);
      if(Math.abs(t)<9) continue;
      const p=nearCam(s,t,landY(s)+.04),r=.04+hash(i,3,204)*.17;
      pebbles.push([r,.04+r*.35,r*.7,p.x,p.y,p.z]);
      if(i%3===0) {const q=nearCam(-1.8-.45*Math.sin(t*.4),t,.4);wrack.push([.22,.025,.12,q.x,q.y,q.z]);}
      if(i%5===0)shells.push([.04,.025,.07,p.x,p.y+.04,p.z]);
    }
    world.instances(new THREE.IcosahedronGeometry(1,0),mat(0x81776a),pebbles);
    world.instances(new THREE.IcosahedronGeometry(1,0),mat(0x494a30),wrack);
    world.instances(new THREE.IcosahedronGeometry(1,0),pale,shells);
    for(const t of [-84,-48,-22,22,43,89]) {
      const y=landY(-4)+.15;
      localRod(-4,t-1.5,y,-4.6,t+1.4,y+.1,.16,timber);
      localRod(-4.35,t,y,-3.8,t+.7,y+.35,.075,timber);
      solid(-4.3,t,3,.45,1.2);
    }
    // Warming Hut: weatherboard walls, pitched tiled roof, porch and outdoor tables.
    const cafe=mat(0xffffff,coastalDetail('boards')),roof=mat(0xb5a08a,reuse(surface(5),3,2));
    addBox(-28,42,3.05,12,3.6,7,cafe);
    for(const side of [-1,1]){
      const r=new THREE.Mesh(new THREE.BoxGeometry(13,.22,4.2),roof);
      r.position.copy(nearCam(-28+side*1.8,42,5.7));r.rotation.y=turn;r.rotateX(side*.38);scene.add(r);
    }
    addBox(-23.9,42,4.6,12.8,.18,2.8,pale);
    for(const t of [36,40,44,48])addBox(-22.7,t,2.9,.13,3.3,.13,pale);
    addBox(-21.4,42,1.29,17,.06,10,mat(0xffffff,reuse(surface(4),5,3)));
    const cafeSign=drawTex(256,48,g=>{g.fillStyle='#304f45';g.fillRect(0,0,256,48);g.fillStyle='#ece4c9';g.font='bold 26px serif';g.textAlign='center';g.fillText('WARMING HUT',128,33);});
    const cs=new THREE.Mesh(new THREE.PlaneGeometry(5,.9),new THREE.MeshBasicMaterial({map:cafeSign}));cs.position.copy(nearCam(-24.46,42,4.2));cs.rotation.y=Math.atan2(AHEAD.x,AHEAD.z);scene.add(cs);
    for(let ds=-3.5;ds<=3.5;ds+=.5)solid(-28+ds,42,12,.5,6.7);
    for(const t of [35,41,47,54]){
      const tableAt=nearCam(-19,t,0);const table=props.picnicTable(tableAt.x,tableAt.z,turn,{y:1.3});
      table.traverse(o=>{if(o.isMesh&&o.geometry.type==='CylinderGeometry'){o.geometry=new THREE.BoxGeometry(1,1,1);o.scale.x*=1.5;o.scale.z*=1.5;o.material=timber;}});
      solid(-19,t,2.6,2.4,2.2);const q=nearCam(-19,t,0);
    }
    // A brick casemate fort below the southern bridge approach, west of the opening cone.
    const brick=mat(0xffffff,reuse(surface(6),5,1));
    addBox(-24,-90,7,55,12,20,brick);addBox(-24,-90,13.3,56,.65,21,concrete);
    for(let t=-116;t<-63;t+=3)addBox(-13.6,t,13.9,1.7,.8,.8,brick);
    for(let ds=-10;ds<=10;ds+=1)solid(-24+ds,-90,55,1,14);
    const fa=nearCam(-13.95,-117.5,0),fb=nearCam(-13.95,-62.5,0);bake.contact(fa.x,fa.z,fb.x,fb.z,3,.5);
    bake.shade(fa.x,fa.z,fb.x,fb.z,11.4,1.6,.4,true);
    // Inland topography begins beyond the playable fence, leaving ground heights unchanged.
    const hillHeight=(s,t)=>1.25+Math.max(0,Math.sin(Math.min(1,Math.max(0,(-s-64)/180))*Math.PI))*(38+18*Math.sin(t*.025));
    const pos=[],uv=[],idx=[],hillColors=[];
    for(let i=0;i<=18;i++)for(let j=0;j<=32;j++) {
      const s=-62-i*12,t=-270+j*17,p=nearCam(s,t,hillHeight(s,t));pos.push(p.x,p.y,p.z);uv.push(t/15,s/15);
      const patch=fbm(s/210,t/510,5,9,433),dry=patch>.52;
      hillColors.push(...mix3([.73,.79,.67],[1.12,1.08,.96],smooth(.3,.7,patch)));
      if(i&&j){const a=i*33+j;idx.push(a,a-33,a-1,a-1,a-33,a-34);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
    geo.setAttribute('color',new THREE.Float32BufferAttribute(hillColors,3));
    const meadow=new THREE.MeshLambertMaterial({color:0xe3e3d1,map:coastalDetail('meadow')});meadow.vertexColors=true;scene.add(new THREE.Mesh(geo,meadow));
    const trailPos=[],trailUv=[],trailIdx=[];
    for(let i=0;i<=90;i++){const t=-245+i*5.4,s=-94-18*Math.sin(t*.017);for(const d of [-.85,.85]){const p=nearCam(s+d,t,hillHeight(s+d,t)+.5);trailPos.push(...p.toArray());trailUv.push(d,t/4);}if(i){const a=i*2;trailIdx.push(a-2,a,a-1,a-1,a,a+1);}}
    const trail=new THREE.BufferGeometry();trail.setAttribute('position',new THREE.Float32BufferAttribute(trailPos,3));trail.setAttribute('uv',new THREE.Float32BufferAttribute(trailUv,2));trail.setIndex(trailIdx);trail.computeVertexNormals();scene.add(new THREE.Mesh(trail,mat(0xc6bda2,surface(1))));
    // Road and dashed centre line, at the hillside foot, beyond the playable park.
    addBox(-55,0,1.27,520,.04,7,mat(0xffffff,reuse(surface(3),60,1)));
    for(let t=-250;t<255;t+=10)addBox(-55,t,1.3,4,.015,.12,pale);
    for(const s of [-51.3,-58.7])addBox(s,0,1.3,520,.12,.25,concrete);
    const trees=new Trees(world,{bark:[91,82,65]});
    for(let i=0;i<38;i++) {
      const s=-20-hash(i,3,72)*27,t=-115+hash(i,4,72)*230;
      if((Math.abs(t-42)<17 && s>-43) || (s<-35 && t>-15 && t<57))continue;
      const p=nearCam(s,t,0),h=6+hash(i,5,72)*7;
      if(i%3===0) trees.conifer(p.x,p.z,h,[148,180,111],{solid:true,detail:.7});
      else trees.broadleaf(p.x,p.z,h,[164,189,121],{spread:1.05,solid:true,detail:.8});
    }
    const baseGround=world.ground;
    world.ground=(x,z)=>{const [s,t]=along(x,z);return s < -62 ? hillHeight(s,t):baseGround(x,z);};
    for(let i=0;i<180;i++) {
      const s=-76-hash(i,3,74)*150,t=-250+hash(i,4,74)*500,p=nearCam(s,t,0);
      if(Array.from({length:13},(_,k)=>[-78-(k%3)*36,-150+k*25]).some(([bs,bt])=>Math.abs(s-bs)<15&&Math.abs(t-bt)<14))continue;
      const height=11+hash(i,5,74)*16, spread=i%2?1.3:.8;
      // The hill rises beneath the western spans. Allow for the width and height
      // of the leaf clusters so that their crowns stay underneath the carriageway.
      const underDeck=p.z>DECK_FAR-height*spread && p.z<DECK_NEAR+height*spread;
      const treeHeight=underDeck ? Math.min(height,(DECK_Y-2-hillHeight(s,t))/1.6) : height;
      trees.broadleaf(p.x,p.z,treeHeight,i%2 ? [144,174,112] : [171,195,130],{spread,detail:.4});
    }
    // Coastal crowns frame the eastward sky beyond the walking corridor.
    for(const [s,t,h] of [[-19,99,19],[-21,120,22],[-18,24,11],[-7,-76,22]]){
      const p=nearCam(s,t,0);trees.broadleaf(p.x,p.z,h,[143,177,110],{spread:.85,solid:true,detail:.7});
    }
    trees.build({shadow:0});
    // Faceted outcrops and grass/scrub patches interrupt the inland slopes.
    const outcrops=[];
    for(let i=0;i<68;i++){
      const s=-72-hash(i,1,818)*160,t=-235+hash(i,2,818)*470,p=nearCam(s,t,hillHeight(s,t));
      if(Array.from({length:13},(_,k)=>[-78-(k%3)*36,-150+k*25]).some(([bs,bt])=>Math.abs(s-bs)<22&&Math.abs(t-bt)<18))continue;
      outcrops.push([2+hash(i,3,818)*4,1+hash(i,4,818)*2,3,p.x,p.y,p.z]);
    }
    // Broad, broken boulders use the same generated stone tile as the fitted shore.
    const slopeRockGeo=new THREE.IcosahedronGeometry(1,2),rp=slopeRockGeo.attributes.position;
    const rockUv=[];
    for(let i=0;i<rp.count;i++){
      const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),k=Math.pow(Math.abs(x)**3+Math.abs(y)**3+Math.abs(z)**3,-1/3);
      const lump=1+.09*Math.sin(x*13+z*8)*Math.cos(y*11);
      const xx=x*k*lump,yy=Math.min(y*k,.62-x*.18)*lump,zz=z*k*lump;
      rp.setXYZ(i,xx,yy,zz);rockUv.push((xx+yy*.6)*1.2,(zz+yy*.6)*1.2);
    }
    slopeRockGeo.setAttribute('uv',new THREE.Float32BufferAttribute(rockUv,2));slopeRockGeo.computeVertexNormals();
    const slopeRockMat=mat(0x8c8272,surface(2));
    world.instances(slopeRockGeo,slopeRockMat,outcrops);
    // Low rocky scrub follows the open slope below the barracks, leaving door approaches clear.
    const slopeScrub=[],slopeScrubB=[],slopeStone=[];
    for(let c=0;c<26;c++){
      // Each clump: one big bush, smaller ones crowded against it, and now and then a stone at its foot.
      const cs=-66-hash(c,1,1907)*37,ct=-66+hash(c,2,1907)*112,n=2+Math.floor(hash(c,3,1907)*5);
      for(let k=0;k<n;k++){
        const a=hash(c,k,1911)*6.283,d=k?0.9+hash(c,k,1913)*2.6:0,s2=cs+Math.cos(a)*d,t2=ct+Math.sin(a)*d*1.6;
        if(Array.from({length:13},(_,q)=>[-78-(q%3)*36,-150+q*25]).some(([bs,bt])=>Math.abs(s2-bs)<10&&Math.abs(t2-bt)<9))continue;
        const q=nearCam(s2,t2,hillHeight(s2,t2)),r=(k?.45:1.1)+hash(c,k,1917)*(k?.9:1.3);
        if(k===n-1&&c%3===0)slopeStone.push([r*.7,r*.5,r*.6,q.x,q.y+r*.1,q.z]);
        else ((c+k)%3?slopeScrub:slopeScrubB).push([r*(1+hash(c,k,1919)*.5),r*(.38+hash(c,k,1921)*.2),r,q.x,q.y+r*.12,q.z]);
      }
    }
    const brushMat=new THREE.MeshLambertMaterial({map:coastalDetail('leaves'),alphaTest:.35,side:THREE.DoubleSide,color:0xf2edbe,emissive:0x1c2310});
    function leafyBrush(clumps) {
      const sprays=[];
      clumps.forEach(([rx,ry,rz,x,y,z],i)=>{
        for(let j=0;j<9;j++){
          const a=j*2.4,r=Math.sqrt(hash(i,j,243))* .75;
          sprays.push([rx*.48,Math.max(.23,ry)*(.9+hash(i,j,244)),rz*.48,x+Math.cos(a)*rx*r,y+ry*.45+hash(i,j,245)*ry*.7,z+Math.sin(a)*rz*r]);
        }
      });
      for(const a of [0,Math.PI/3,Math.PI*2/3]){const g=new THREE.PlaneGeometry(2,2);g.rotateY(a);world.instances(g,brushMat,sprays);}
    }
    leafyBrush([...slopeScrub,...slopeScrubB]);
    world.instances(slopeRockGeo,slopeRockMat,slopeStone);
    for(let t=-53;t<39;t+=4){
      const s=-68,y=hillHeight(s,t);
      localRod(s,t,y,s,t,y+1.05,.07,timber);
      if(t<35)localRod(s,t,y+.8,s,t+4,hillHeight(s,t+4)+.8,.045,timber);
    }
    // Same textured block language as the near barracks; no photo card edge.
    const cityWalls=[0xe5c183,0x659c8d,0xd5a15e,0xbb7353,0x8f8cac].map(c=>mat(c,reuse(surface(8),1,1))),cityGround=mat(0x9da789,coastalDetail('scrub'));
    const cityHeight=(s,t)=>2+24*Math.pow(Math.sin(Math.max(0,Math.min(1,(s+220)/360))*Math.PI),2)*smooth(230,300,t);
    const cityPos=[],cityUv=[],cityIdx=[];
    for(let j=0;j<=10;j++)for(let i=0;i<=24;i++){
      const s=-220+i*15,t=230+j*20,p=nearCam(s,t,cityHeight(s,t));cityPos.push(...p.toArray());cityUv.push(s/14,t/14);
      if(i&&j){const a=j*25+i;cityIdx.push(a,a-25,a-1,a-1,a-25,a-26);}
    }
    const cityGeo=new THREE.BufferGeometry();cityGeo.setAttribute('position',new THREE.Float32BufferAttribute(cityPos,3));cityGeo.setAttribute('uv',new THREE.Float32BufferAttribute(cityUv,2));cityGeo.setIndex(cityIdx);cityGeo.computeVertexNormals();scene.add(new THREE.Mesh(cityGeo,cityGround));
    for(let i=0;i<120;i++){
      const t=200+Math.floor(i/20)*31+hash(i,3,616)*12,s=-180+(i%20)*13;
      const base=cityHeight(s,t),h=6+hash(i,1,616)*17;
      addBox(s,t,base+h/2,6+hash(i,2,616)*6,h,10,cityWalls[i%5]);
      if(i%3===0){const r=new THREE.Mesh(new THREE.ConeGeometry(7,2.5,4),roof);r.position.copy(nearCam(s,t,base+h+1));r.rotation.y=turn+Math.PI/4;scene.add(r);}
      else {addBox(s,t,base+h,10,.5,11,i%2?roof:concrete);addBox(s,t+2,base+h+1,.7,2,.7,brick);}
    }
    // Houses in the gaps, half a plot along and half a row back, so the rows overlap into streets and no house stands alone.
    for(let i=0;i<100;i++){
      const t=216+Math.floor(i/20)*31+hash(i,3,818)*10,s=-173.5+(i%20)*13;
      const base=cityHeight(s,t),h=7+hash(i,1,818)*13,w=7+hash(i,2,818)*5;
      addBox(s,t,base+h/2,w,h,10,cityWalls[(i*3+1)%5]);
      if(i%2){const r=new THREE.Mesh(new THREE.ConeGeometry(w*.78,2.4,4),roof);r.position.copy(nearCam(s,t,base+h+1.2));r.rotation.y=turn+Math.PI/4;scene.add(r);}
      else {addBox(s,t,base+h+.25,w+1,.5,11,i%4?roof:concrete);addBox(s+1.5,t+2,base+h+1.2,.7,2,.7,brick);}
    }
    {
      const townTrees=new Trees(world,{bark:[91,82,65]}),ground=world.ground;
      world.ground=(x,z)=>{const [ts,tt]=along(x,z);return cityHeight(ts,tt);};
      for(let i=0;i<64;i++){
        const row=Math.floor(i/16),ts=-176+(i%16)*16.5+hash(i,1,820)*6,tt=(row?200+row*31:190)+hash(i,2,820)*5,q=nearCam(ts,tt,0);
        townTrees.broadleaf(q.x,q.z,8+hash(i,3,820)*7,i%2?[70,98,66]:[88,112,74],{spread:1.15,detail:.3});
      }
      townTrees.build({shadow:0});world.ground=ground;
    }
    // Recessed dark window bands and varied heights keep the far city legible through fog.
    for(let i=0;i<40;i++){
      const s=-180+(i%20)*13,t=200+Math.floor(i/20)*31+hash(i,3,616)*12;
      const base=cityHeight(s,t),h=6+hash(i,1,616)*17;
      for(let y=3;y<h-1;y+=3.5)addBox(s,t-5.06,base+y,.1,1.4,4,glass);
    }
    // A second skyline layer behind the houses: varied blocks and a stepped beacon tower.
    for(let i=0;i<22;i++){
      const s=-210+i*16,t=425+(i%3)*14,base=cityHeight(s,t),h=15+hash(i,4,712)*25;
      addBox(s,t,base+h/2,9+i%4,h,10,cityWalls[(i+2)%5]);
    }
    {const s=-65,t=414,y=cityHeight(s,t);
      addBox(s,t,y+24,13,48,12,cityWalls[2]);
      addBox(s,t,y+51,9,6,8,cityWalls[0]);addBox(s,t,y+57,6,6,5,glass);
      addBox(s,t,y+61,8,2,7,pale);localRod(s,t,y+62,s,t,y+72,.35,iron);
      for(const dt of [-4,4])addBox(s,t+dt,y+25,.8,44,12,cityWalls[0]);
    }
    for(const t of [26,28,72]){const p=nearCam(-2.4,t,0);animals.gull(p.x,p.z,turn,{y:1.59});}
    for(let i=0;i<3;i++){const p=nearCam(9+i*8,28+i*16,0);animals.gull(p.x,p.z,turn,{flying:true,y:0,height:12+i*3,radius:4});}
    for(let i=0;i<3;i++){const p=nearCam(8+i*2,8+i*3,0);animals.duck(p.x,p.z,0,{y:.04,radius:.5});}
    // Shore road parking: cars with glazed cabins, rubber tyres, bumpers and lamps.
    const asphalt=mat(0xffffff,reuse(surface(3),22,6)),white=mat(0xd8d5bd);
    asphalt.emissive.setRGB(.035,.035,.028);
    addBox(-43,20,1.29,65,.06,13,asphalt);
    for(let t=-10;t<53;t+=6){addBox(-43,t,1.335,.10,.01,11,white);}
    const paints=[mat(0xb8bcb3),mat(0x6d888e),mat(0x8b4b3d),mat(0xdbd4bc)];   // still used for the boats and far cars below
    // Parked cars come from the shared vehicle kit: mixed types, nose in or nose out.
    const cars = new Cars(world), carHeading = Math.atan2(AHEAD.x, AHEAD.z);   // parked facing the water
    const TYPES = ['sedan', 'suv', 'hatch', 'pickup', 'sedan', 'van', 'hatch', 'mustang', 'sedan', 'hatch', 'pickup'];
    for (let i = 0; i < 11; i++) {
      const ahead = i < 7 ? -43 : -51, right = i < 7 ? -7 + i * 9 : 60 + (i - 7) * 9, at = nearCam(ahead, right, 0);
      const car = cars.add(TYPES[i], at.x, at.z, carHeading + (i % 3 === 1 ? Math.PI : 0), null, { solid: true });
      car.position.y = 1.32;   // the top of the asphalt
      if (i === 7) { parkedMustang = car; car.userData.sfMoving = true; car.name = '1970 Mustang fastback'; }
    }
    // Red-roofed barracks punctuate the wooded hill.
    const stucco=mat(0xffffff,surface(8)),garage=mat(0xc6c3b5,coastalDetail('boards'));
    const hedges=[];
    for(let i=0;i<13;i++){
      const s=-78-(i%3)*36,t=-150+i*25,y=hillHeight(s,t);
      addBox(s,t,y+2.05,14,12.1,10,stucco);
      const stairEnd=hillHeight(s+16.2,t);
      for(let j=0;j<12;j++){
        const ss=s+5.4+j*.9,gy=hillHeight(ss,t),top=y+.15+(stairEnd-y-.15)*j/12;
        const rise=Math.max(.28,Math.abs(stairEnd-y-.15)/12);
        addBox(ss,t,top-rise/2,3.2,rise,.9,concrete);
        addBox(ss+.43,t,top-rise*.55,3.12,rise*.7,.025,dark);
        addBox(ss+.39,t,top+.015,3.24,.03,.1,pale);
        if(j%2===0)for(const side of [-1,1])localRod(ss,t+side*1.55,top,ss,t+side*1.55,top+.85,.04,iron);
        if(j<11)for(const side of [-1,1])localRod(ss,t+side*1.55,top+.85,ss+.9,t+side*1.55,top+.85+(stairEnd-y-.15)/12,.025,iron);
      }
      for(const side of [-1,1]){
        for(let j=0;j<6;j++){
          const tt=t+side*(3+j*.9),gy=hillHeight(s+5.3,tt);
          addBox(s+5.3,tt,gy+.45,.94,.9,.45,concrete);
          const hp=nearCam(s+5.5,tt,gy+1);hedges.push([.7,.6,.7,hp.x,hp.y,hp.z]);
        }
      }
      addBox(s,t,y+8.3,15,.6,11,roof);
      addBox(s,t,y+9,12,.8,8,roof);addBox(s,t+3,y+10,.8,3,.8,brick);
    }
    leafyBrush(hedges);
    // Raised sea wall eastward; keeps the fitted foreground beach clear.
    for(let t=18;t<108;t+=3){
      addBox(-2.4,t,.7,3,1.4,1.1,concrete);addBox(-2.4,t,1.48,3.1,.18,1.3,pale);
      if(t%6===0){addBox(-2.4,t,1.99,.10,.9,.1,iron);localRod(-2.4,t,2.35,-2.4,t+3,2.15,.03,iron);localRod(-2.4,t+3,2.15,-2.4,t+6,2.35,.03,iron);}
      solid(-2.4,t,3,1.1,2.5);
    }
    // Fishing pier beyond the shore fence: piles and timber decking.
    addBox(10,94,1.1,5,.35,28,timber);
    for(let s=-3;s<24;s+=3){for(const t of [91.7,96.3]){addBox(s,t,.4,.3,4,.3,timber);localRod(s,t,2.1,s+3,t,2.1,.045,iron);}addBox(s,94,1.29,5,.05,.08,dark);}
    // Coastal ice plant, low scrub and flowers in drifts, never on the route.
    const plants=[],blooms=[],coastRocks=[];
    for(let i=0;i<500;i++){
      const s=-5.3-hash(i,4,311)*1.7,t=-105+hash(i,5,311)*210;   // on the bank, seaward of the chain rail at 7.5 m
      if(Math.abs(t)<10 || Math.abs(t-60)<5)continue;
      const p=nearCam(s,t,landY(s)+.13);plants.push([.18+hash(i,6,311)*.35,.14,.25,p.x,p.y,p.z]);
      if(i%5===0)blooms.push([.1,.07,.1,p.x,p.y+.19,p.z]);
      if(i%13===0){const q=nearCam(-.5,t,.2);coastRocks.push([.6,.5,.8,q.x,q.y,q.z]);}
    }
    // Ragged upright ice-plant sprays remain seaward of the rail.
    leafyBrush(plants.map(([x,y,z,px,py,pz])=>[x,.22,x,px,py,pz]));
    const leafMat=new THREE.MeshLambertMaterial({map:coastalDetail('leaves'),alphaTest:.35,side:THREE.DoubleSide});
    for(const angle of [0,Math.PI/2]){const geo=new THREE.PlaneGeometry(2,2);geo.rotateY(angle);world.instances(geo,leafMat,plants.filter((_,k)=>k%6===1).map(([x,y,z,px,py,pz])=>[.3,.34,.3,px,py+.3,pz]));}
    world.instances(new THREE.IcosahedronGeometry(1,0),mat(0xb87c91),blooms);
    world.instances(new THREE.IcosahedronGeometry(1,1),mat(0xffffff,surface(2)),coastRocks);
    {
      const walkers=[[-10.4,39,1,'walk'],[-11.3,40.2,1,'walk'],[-9.6,50,-1,'walk'],[-11,58,1,'jog'],[-10.2,66,-1,'walk'],[-11.6,67,-1,'walk'],[-9.2,45,0,'look'],[-9.0,34.4,-1,'walk'],[-8.3,35.5,-1,'walk'],[-11.7,36.8,1,'jog'],[-8.05,30.3,0,'photo'],
        [-12.5,-52,-1,'walk'],[-13.6,-53,-1,'walk'],[-15,-63,1,'walk'],[-11.8,-70,0,'photo'],[-17,-76,-1,'walk'],
        [-39.5,-6,0,'talk'],[-40.6,-5.2,2,'talk'],[-46.5,-14,-1,'walk'],[-37,-20,1,'walk'],[-47,9,0,'photo']];
      const tops=[[160,78,52],[66,102,126],[204,190,160],[88,116,90],[52,58,70],[176,146,74],[126,66,84]],along0=Math.atan2(RIGHT.x,RIGHT.z);
      walkers.forEach(([ws,wt,dir,task],k)=>{
        const q=nearCam(ws,wt,0),y=world.ground(q.x,q.z);
        const f=new Figure({build:k%2?'f':'m',topStyle:['jacket','hoodie','tee','shirt','sweater'][k%5],bottomStyle:['jeans','chinos','shorts','pants'][k%4],hairStyle:['crop','tied','cap','parted','long','curly'][k%6],
          height:1.62+(k%5)*.05,skin:[[207,163,123],[139,100,74],[227,187,153],[112,78,56]][k%4],hair:[[52,43,34],[120,84,44],[34,26,22]][k%3],top:tops[k%7],bottom:[[57,66,73],[70,72,84],[48,52,66]][k%3],shoes:k%2?[205,200,181]:[60,52,46]});
        const heading=dir===0?Math.atan2(AHEAD.x,AHEAD.z)+(k%2?.4:-.5):dir===2?along0+Math.PI+.6:along0+(dir<0?Math.PI:0);
        f.place(q.x,y,q.z,heading);
        if(task==='walk')f.walk(.5+k*.9,1);else if(task==='jog')f.walk(1.3,1.5);else if(task==='photo'){f.talk(.2);f.hold('camera');}else if(task==='talk')f.talk(k);else f.lean();
        scene.add(f.root);world.post(q.x,q.z,.3,1.8);
      });
    }
    // People at the cafe, photographers, anglers, surfers and walkers.
    for(let i=0;i<18;i++){
      const table=i<6,s=table?-19+(i%2?1:-1)*.75:i<10?-4.2:i<14?-8:-3.8;
      const t=table?35+Math.floor(i/2)*6: i<10?25+(i-6)*15:i<14?-48+(i-10)*17:72.5+(i-14)*5;   // the anglers start clear of the last person with a cup, at 70
      const p=nearCam(s,t,landY(s));
      const f=new Figure({build:i%2?'f':'m',topStyle:i%3?'jacket':'hoodie',bottomStyle:i%2?'chinos':'jeans',hairStyle:i%2?'tied':'cap',height:1.65+i%3*.07,skin:[[207,163,123],[139,100,74],[227,187,153]][i%3],hair:[52,43,34],top:i>=14?[35,45,49]:[[155,84,53],[84,118,139],[199,185,154],[96,123,95]][i%4],bottom:[57,66,73],shoes:[205,200,181]});
      f.place(p.x,p.y,p.z,Math.atan2(AHEAD.x,AHEAD.z)+(table&&i%2?Math.PI:0));if(table)f.sitOn(.47,'cup');else if(i<10)f.idle(i*.4);else if(i<14){f.talk(.2);f.hold('camera');}else f.lean();scene.add(f.root);
      if(i>=6&&i<10){f.idle(i*.3);f.hold('cup');}
      if(i>=10&&i<14){for(const dt of [-.45,0,.45])localRod(s+.7,t+dt,landY(s),s+.7,t,2.7,.025,iron);addBox(s+.7,t,2.8,.35,.22,.23,dark);}
      if(i>=14){
        f.talk(.3);
        localRod(s+.25,t,landY(s)+1,s+3.3,t+.3,4.8,.018,timber);
        localRod(s+3.3,t+.3,4.8,s+4.3,t+.3,.12,.004,iron);
      }
    }
    const dp=nearCam(-12.3,18,0), dog=animals.dog(dp.x,dp.z,turn,{y:1.3,coat:'tan',scale:.7});
    const wp=nearCam(-12.6,19.3,1.3),walker=Figure.random(701,'shore');walker.place(wp.x,wp.y,wp.z,turn).talk(.4);scene.add(walker.root);
    walker.root.updateMatrixWorld(true);rod(walker.arms[1].hand.getWorldPosition(new THREE.Vector3()),nearCam(-12.3,18,1.9),.012,dark);
    animals.roots.forEach(root=>root.userData.sfMoving=true);
    const westRidge=[],westIdx=[];
    for(let i=0;i<=36;i++){const t=-560-Math.sin(i*.34)*25,s=-130+i*12,h=8+29*Math.sin(i/36*Math.PI)+5*hash(i,2,883);for(const y of [-2,h]){const p=nearCam(s,t,y);westRidge.push(...p.toArray());}if(i){const a=i*2;westIdx.push(a-2,a,a-1,a-1,a,a+1);}}
    const westGeo=new THREE.BufferGeometry();westGeo.setAttribute('position',new THREE.Float32BufferAttribute(westRidge,3));westGeo.setIndex(westIdx);scene.add(new THREE.Mesh(westGeo,new THREE.MeshBasicMaterial({color:0x929f98,side:THREE.DoubleSide})));
    // Bay traffic lies well to the east, outside the locked bridge view.
    for(const [s,t,k] of [[60,12,.5],[35,60,1],[70,130,.8],[100,95,1.4]]){
      addBox(s,t,.6,5*k,1.1*k,2*k,pale);localRod(s,t,1,s,t,12*k,.065,iron);
      const sail=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshLambertMaterial({color:0xe7e3ce,map:coastalDetail('grain'),side:THREE.DoubleSide}));
      const ps=[nearCam(s,t,11*k),nearCam(s,t,2),nearCam(s,t+5*k,2)];sail.geometry.setAttribute('position',new THREE.Float32BufferAttribute(ps.flatMap(p=>p.toArray()),3));sail.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,0,0,1,0],2));sail.geometry.computeVertexNormals();scene.add(sail);
      addBox(s,t,.95*k,3.2*k,.18*k,1.6*k,timber);addBox(s,t,1.25*k,1.5*k,.7*k,1.2*k,glass);
      localRod(s,t-2.3*k,1.1*k,s,t+2.3*k,1.1*k,.035,pale);
    }
    addBox(175,260,2,65,4,14,iron);
    for(let i=0;i<12;i++)addBox(175+(i%2)*5,235+Math.floor(i/2)*8,5.5,7,3,4,paints[i%4]);
    // Alcatraz's low island and pale cellhouse beyond the sailing boats.
    addBox(190,235,1.5,45,3,17,concrete);addBox(190,235,7,28,8,9,stucco);addBox(190,219,9,2,15,2,pale);
    for(const t of [-92,-64,-38,-14,6.65,28,48,76,98]){const p=nearCam(-8.9,t,0);bake.shadow(p.x,p.z,1.7,.24,1.3,1.34);}
    // Cyclists pause by the racks on their way along the coastal trail.
    for(let i=0;i<2;i++){
      const p=nearCam(-15.9,33+i*1.5,1.25),rider=new Figure({height:1.72,skin:[204,160,126],hair:[42,39,33],top:i?[180,110,54]:[93,129,152],bottom:[45,49,53],shoes:[190,190,175]});
      rider.sitOn(.86);rider.place(p.x,p.y,p.z,Math.atan2(RIGHT.x,RIGHT.z));scene.add(rider.root);
    }
    // Pelicans glide low beside the pier; paired tapering wing segments make readable silhouettes.
    for(let i=0;i<6;i++){
      const s=8+i*3,t=76+i*4,y=5+Math.sin(i)*1.2;
      localRod(s,t,y,s+1.1,t,y,.10,pale);localRod(s+1.1,t,y,s+1.5,t,y-.1,.035,timber);
      for(const side of [-1,1]){localRod(s+.3,t,y,s-.1,t+side*.8,y+.15,.09,dark);localRod(s-.1,t+side*.8,y+.15,s-.5,t+side*1.6,y+.04,.035,dark);}
    }
    // The unsupported zigzag has been removed; a textured shore road serves the hill.
    // Near and middle-distance visitors keep each promenade view occupied.
    for(const [s,t,style,col,phase] of [[-10.2,15.2,'jacket',[80,107,122],.7],[-12.2,16.3,'tee',[162,83,56],2.1]]){
      const p=nearCam(s,t,landY(s)),f=new Figure({height:1.75,topStyle:style,bottomStyle:style==='tee'?'shorts':'chinos',top:col,bottom:[69,73,76],skin:[195,153,119],hair:[53,39,27],hairStyle:style==='tee'?'cap':'tied'});
      f.place(p.x,p.y,p.z,turn+Math.PI).walk(phase,1);scene.add(f.root);
    }
    {const p=nearCam(-46,-1,1.32),car=cars.add('hatch',p.x,p.z,carHeading, [150,36,30],{solid:true});car.position.y=1.32;}
    const crowd=[[-11,84],[-10.8,24],[-11,73],[-38,-18],[-36,-14],[-12,101],[-22,-57],[-20,-60],[-12,-59],[-2,9],[-1,10.5],[-16,66],[-38,2],[-47,5]];
    crowd.forEach(([s,t],i)=>{
      const p=nearCam(s,t,landY(s));const f=i===13?new Figure({age:'child',height:1.25,topStyle:'hoodie',top:[163,92,53],bottomStyle:'jeans',bottom:[54,66,78]}):Figure.random(100+i,'shore');
      f.place(p.x,p.y,p.z,turn+(i%3)*1.4);
      if(i===12){f.root.rotation.y=turn+.55;f.photograph();}else if(i===13){f.drink();}else if(i%4===0)f.phone();else if(i%4===1)f.talk(i*.5);else if(i%4===2)f.read('newspaper');else f.photograph();
      scene.add(f.root);
    });
    for(let i=0;i<3;i++){
      const a=nearCam(-11.3+(i%2)*.8,-102+i*27,0),b=nearCam(-11.3+(i%2)*.8,100-i*19,0);
      const f=Figure.random(250+i,'shore');world.walker(f,a.x,a.z,b.x,b.z,i%2?2.8:1.2,17+i*11);
    }
    const visitors=[[-10,20],[-12.7,23],[-36,0],[-37,3],[-15,-50],[-11,-51],[-15,38],[-8.1,80],[-9.5,84],[-12,41],[-10,44],[-48,-2],[-46,2],[-4,6.5],[-4.5,29],[-4.4,32]];
    visitors.forEach(([s,t],i)=>{
      const p=nearCam(s,t,landY(s)),f=i===3?new Figure({build:'f',physique:'stocky',height:1.72,hairStyle:'tied',topStyle:'shirt',top:[157,85,58],bottomStyle:'chinos',bottom:[57,65,73]}):Figure.random(930+i,'shore');
      f.place(p.x,p.y,p.z,turn+(i%2?Math.PI:0)).idle(i*.2);
      if(i%4===0)f.phone();else if(i%4===1)f.drink();else if(i%4===2)f.read();else f.walk(.8+i*.6,1);
      if(i===2){f.root.rotation.y=turn+.8;f.photograph();}
      if(i===3){f.root.rotation.y=turn+Math.PI-.5;f.walk(Math.PI/2,1.4);}
      scene.add(f.root);
    });
    // Terracotta pots with crossed leaf sprays, outside the pedestrian lane.
    const shrubLeaves=[];
    const potMat=mat(0x896347,coastalDetail('grain'));
    for(const [s,t] of [[-9,15],[-13.8,17],[-16.8,-52],[-16.8,-56],[-34,-6],[-34,6],[-22,38],[-20,44.8]]){
      const p=nearCam(s,t,1.3),pot=new THREE.Mesh(new THREE.CylinderGeometry(.47,.32,.69,10),potMat);
      pot.position.set(p.x,1.645,p.z);scene.add(pot);
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.51,.51,.12,10),potMat);rim.position.set(p.x,1.99,p.z);scene.add(rim);
      const soil=new THREE.Mesh(new THREE.CircleGeometry(.45,10),dark);soil.rotation.x=-Math.PI/2;soil.position.set(p.x,2.055,p.z);scene.add(soil);
      for(let j=0;j<13;j++){
        const a=j*2.4,r=.15+.33*hash(j,2,81),h=.25+.5*hash(j,3,81);
        const q=nearCam(s+Math.cos(a)*r,t+Math.sin(a)*r,2.05+h);
        shrubLeaves.push([.38,.44,.38,q.x,q.y,q.z]);
        localRod(s,t,2.04,s+Math.cos(a)*r,t+Math.sin(a)*r,2.05+h,.018,timber);
      }
      world.post(p.x,p.z,.55,1.7);bake.shadow(p.x,p.z,.85,.3,.85,1.34);
    }
    for(const angle of [0,Math.PI/2]){const g=new THREE.PlaneGeometry(2,2);g.rotateY(angle);world.instances(g,leafMat,shrubLeaves);}
    for(const [s,t] of [[-16,-54],[-48,-4],[-22,45]]){
      const p=nearCam(s,t,0);props.bicycle(p.x,p.z,turn,{y:1.3,color:0x54756a,solid:true});
      const q=nearCam(s-1,t+2,0);props.bin(q.x,q.z,turn,{y:1.3,solid:true});
    }
    for(const [s,t] of [[-18,-54],[-21,44.5]]){
      const p=nearCam(s,t,0);props.cafeTable(p.x,p.z,turn,{y:1.3,solid:true});
      props.cup(p.x,p.z,0,{y:2.07});
      for(const dt of [-.8,.8]){const q=nearCam(s,t+dt,0);props.cafeChair(q.x,q.z,turn+(dt>0?Math.PI:0),{y:1.3,solid:true});}
    }
    // Tall fittings break the promenade sky without changing the bridge-facing opening.
    {const p=nearCam(-14.5,18,0);props.lamp(p.x,p.z,turn,{y:1.3,height:6.5,style:'street',solid:true});}
    const tasks=[[-13.5,-46,'read'],[-10,-47,'photograph'],[-17.5,39,'drink'],[-18,42,'phone'],[-11,35,'read'],[-7.8,34,'photograph'],[-17,-53,'read'],[-20,-58,'photograph'],[-22,43.5,'drink'],[-23,38.5,'phone'],[-39,-2,'photograph'],[-37,7,'read']];
    tasks.forEach(([s,t,task],i)=>{
      const p=nearCam(s,t,1.3),f=new Figure({physique:['heavy','tall','slight','stocky','slim','regular'][i%6],height:[1.72,1.88,1.62,1.74,1.69,1.8][i%6],build:i%2?'f':'m',hairStyle:['receding','swept','tied','parted','bob','short'][i%6],skin:[[181,131,95],[222,178,137],[118,79,57]][i%3],hair:[38,29,22],top:[[60,85,64],[145,73,46],[175,164,128],[54,78,104],[119,71,86],[151,137,91]][i%6],topStyle:i%3?'shirt':'jacket',bottomStyle:i%2?'chinos':'shorts',bottom:[45,49,59]});
      f.place(p.x,p.y,p.z,turn+i*.65);f[task]();scene.add(f.root);world.post(p.x,p.z,.3,1.9);
    });
    // Shore-road traffic stays outside the pedestrian path.
    for(let i=0;i<4;i++){
      const p=nearCam(-55+(i%2?1.5:-1.5),-100+i*55,0), car=cars.add(i===0?'van':'sedan',p.x,p.z,Math.atan2(RIGHT.x,RIGHT.z)+(i%2?Math.PI:0),i===0?[201,191,162]:null,{solid:false});
      if(i===0)car.traverse(o=>{if(o.material?.isMeshLambertMaterial){o.material=o.material.clone();o.material.emissive.setRGB(.07,.065,.05);}});
      car.userData.sfMoving=true;
      world.ticks.push(time=>{const t=((time*(i%2?-6:6)+i*57+260)%520+520)%520-260;car.position.copy(nearCam(-55+(i%2?1.5:-1.5),t,1.32));});
    }
    // Table settings: weathered trays, cups, saucers and sandwiches.
    for(const t of [35,41,47,54])for(const side of [-1,1]){
      addBox(-19+side*.33,t,2.135,.44,.025,.3,pale);
      addBox(-19+side*.33,t+.09,2.17,.22,.055,.13,mat(0xc4a16b,coastalDetail('wood')));
      const cup=new THREE.Mesh(new THREE.CylinderGeometry(.065,.05,.16,10),pale);cup.position.copy(nearCam(-19+side*.35,t-.45,2.2));scene.add(cup);
      const coffee=new THREE.Mesh(new THREE.CircleGeometry(.057,10),dark);coffee.rotation.x=-Math.PI/2;coffee.position.copy(nearCam(-19+side*.35,t-.45,2.285));scene.add(coffee);
    }
    addBox(-24.46,42,2.6,1.5,2.6,.06,mat(0x344d43,coastalDetail('wood')));
    addBox(-24.4,42,3.05,1.12,1.2,.08,mat(0xffffff,coastalDetail('window')));
    addBox(-24.32,42.5,2.35,.06,.18,.12,pale);
    // Recessed shop windows show shelving beyond the reflecting glazing.
    const winMat=mat(0xffffff,coastalDetail('window'));
    for(const t of [38.5,45.5]){
      addBox(-24.47,t,3.05,2.1,1.5,.035,winMat);
      for(const dt of [-1.12,1.12])addBox(-24.35,t+dt,3.05,.12,1.8,.18,pale);
      addBox(-24.3,t,2.22,2.4,.14,.35,pale);
    }
    for(const [s,t,w,h,y] of [[-24.43,42,12,1.2,3.7],[-13.94,-90,55,5,8]]){
      const a=nearCam(s,t-w/2,0),b=nearCam(s,t+w/2,0);bake.shade(a.x,a.z,b.x,b.z,y,h,.55,true);
    }
    {const a=nearCam(-34,-62.35,0),b=nearCam(-14,-62.35,0);bake.shade(a.x,a.z,b.x,b.z,1.2,12,.32,true);}
    const porch=nearCam(-23,42,0);
    // Fort Point's three tiers of arched casemates and continuous parapet.
    const archMap=drawTex(128,192,g=>{g.clearRect(0,0,128,192);g.fillStyle='#302d28';g.beginPath();g.moveTo(18,192);g.lineTo(18,62);g.arc(64,62,46,Math.PI,0);g.lineTo(110,192);g.closePath();g.fill();g.strokeStyle='#9b8169';g.lineWidth=8;g.stroke();g.strokeStyle='#656352';g.lineWidth=3;for(let x=30;x<110;x+=17){g.beginPath();g.moveTo(x,55);g.lineTo(x,190);g.stroke();}});
    const archMat=new THREE.MeshLambertMaterial({map:archMap,transparent:true,alphaTest:.3});
    const arches=[];
    for(const y of [3.4,7.3,10.7])for(let t=-114;t<=-66;t+=4.4){const p=nearCam(-13.94,t,y);arches.push([2.7,2.8,1,p.x,p.y,p.z]);}
    const archGeo=new THREE.PlaneGeometry(1,1);archGeo.rotateY(Math.atan2(AHEAD.x,AHEAD.z));world.instances(archGeo,archMat,arches);
    addBox(-24,-62.4,13.8,.8,1.2,20,brick);
    addBox(-13.8,-90,13.8,55,1.2,.8,brick);
    addBox(-23,-90,14.1,5,1,5,pale);
    const lighthouse=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.7,4,10),pale);lighthouse.position.copy(nearCam(-23,-74,16.3));scene.add(lighthouse);
    const lantern=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.55,2.1,10),winMat);lantern.position.copy(nearCam(-23,-74,19.3));scene.add(lantern);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(2.1,1.7,10),iron);cap.position.copy(nearCam(-23,-74,21));scene.add(cap);
    // Porches, cornices, and varied bay windows on the hill barracks.
    for(let i=0;i<13;i++){
      const s=-78-(i%3)*36,t=-150+i*25,y=hillHeight(s,t);
      addBox(s+5.1,t,y+6.7,14.5,.32,.3,pale);
      addBox(s+6.5,t,y+.15,5,.25,3,concrete);addBox(s+6.5,t,y+4.2,5,.3,3,roof);
      for(const dt of [-2,2])addBox(s+7.6,t+dt,y+2.3,.16,3.6,.16,pale);
      for(const dt of [-4,4]){addBox(s+5.3,t+dt,y+2.2,2.3,.16,.45,pale);}
    }
    // Broken wash along the irregular tideline, no straight surf stripe.
    const washMat=new THREE.MeshBasicMaterial({color:0xc4d1c8,alphaMap:foamAlpha,transparent:true,depthWrite:false,opacity:.6});
    const wash=[];
    for(let i=0;i<190;i++){if(i%13!==0)continue;const t=-110+i*1.16,s=3.1+.6*Math.sin(t*.7)+.25*Math.sin(t*1.9),p=nearCam(s,t,.10);wash.push([.8,1,1.6,p.x,p.y,p.z]);}
    const washGeo=new THREE.PlaneGeometry(1,1);washGeo.rotateX(-Math.PI/2);world.instances(washGeo,washMat,wash);
    // Contact shade on pavement has to sit above the paving, not below it.
    for(const t of [-92,-64,-38,-14,6.65,28,48,76,98]){const p=nearCam(-8.9,t,0);}
    // (The car kit lays its own soft shadow under each car.)
    for(let t=-110;t<-58;t+=9){const p=nearCam(-17,t,0);}

    const bridgeShade=nearCam(-10,-74,0);
    props.build();
    bake.build();

    for(const [m,matrices] of rodBatches) {
      const mesh=world.instances(new THREE.CylinderGeometry(1,1,1,5),m,matrices.map(()=>[1,1,1,0,0,0]));
      matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;
    }
    for(const [m,items] of batches) {
      const mesh=world.boxes(m,items);mesh.rotation.y=turn;mesh.position.copy(origin);
    }
  }

  // ---------- animation, the start, and where the chapter ends ----------
  world.sky = sky;
  world.ticks.push((t) => {
    waterA.offset.set(t * 0.035, t * 0.05);
    waterB.offset.set(-t * 0.03, t * 0.022);
    if (!world.drive?.motor) for (const car of cars) car.position.x = X0 + ((((car.userData.start + t * car.userData.speed) % LEN) + LEN) % LEN);
    foam.forEach((m, i) => { m.material.opacity = m.userData.opacity * (0.8 + 0.2 * Math.sin(t * 1.1 + i * 1.7)); });
  });
  // Consolidate static meshes by material without changing the fitted vertices or shading.
  // Animated water, foam, cars, figures and the sky retain their own objects.
  scene.updateMatrixWorld(true);
  const protectedRoots=new Set([sky,...cars,...foam]);
  scene.traverse(o=>{if(o.isSkinnedMesh)protectedRoots.add(o.parent);if(o.userData.sfMoving||o.userData.figure)protectedRoots.add(o);});
  const groups=new Map();
  scene.traverse(o=>{
    if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||Array.isArray(o.material)||o.material.transparent||o.geometry.attributes.color)return;
    for(let p=o;p;p=p.parent)if(protectedRoots.has(p))return;
    if(!o.geometry.attributes.normal||!o.geometry.attributes.uv)return;
    const k=o.material.id+':'+o.renderOrder;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);
  });
  for(const objects of groups.values()){
    if(objects.length<2)continue;
    const arrays={position:[],normal:[],uv:[]};
    for(const o of objects){const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);for(const key of Object.keys(arrays))for(const n of g.attributes[key].array)arrays[key].push(n);g.dispose();o.removeFromParent();}
    const geo=new THREE.BufferGeometry();for(const [key,data] of Object.entries(arrays))geo.setAttribute(key,new THREE.Float32BufferAttribute(data,key==='uv'?2:3));
    const m=new THREE.Mesh(geo,objects[0].material);m.renderOrder=objects[0].renderOrder;scene.add(m);
  }

  // The figure kit disables culling globally. Bounds with a stride margin keep this
  // long waterfront's off-screen people out of the draw list without clipping poses.
  scene.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingSphere();o.boundingSphere.radius+=1.5;o.frustumCulled=true;}});

  const end = nearCam(-50, 57.6, 0), parked = parkedMustang.position.clone();
  world.drive = makeBridgeDrive(world, parkedMustang, cars, X0, X1, DECK_Y, surface(3), coastalDetail('meadow'));
  world.exit = { x: end.x, z: end.z, r: 1.6 };
  world.spots = memories.sf.map(({ at: [x, z], within, text }) => ({ x, z, r: within, text }));
  for (const [s,t,r,text] of [[-11,-22,9,'Coastal Trail'],[-19,42,10,'Warming Hut'],[-50,59,9,'Marine Drive']]) {
    const p = nearCam(s,t,0); world.spots.push({ x:p.x, z:p.z, r, text });
  }
  const startAt = nearCam(-1.6, 0.9, 0);
  // This gap between the foreground rocks leaves three clear skips into open water.
  skippingStone(world, nearCam(-.8, 2.8, landY(-.8) + .075),
    [nearCam(6.8, 2.3, .075), nearCam(11, 2.6, .075), nearCam(14.3, 3.1, .075)], onStoneImpact);
  world.drive.boarding = { x: parked.x, y: parked.y + 1.8, z: parked.z, r: 4.5, label: 'Drive the Mustang', act: () => onDrive?.() };
  world.interactions.push(world.drive.boarding);
  world.start = { x: startAt.x, z: startAt.z, heading: Math.atan2(AHEAD.x, AHEAD.z), camYaw: CAM.yaw, camPitch: 0.28 };
  // The establishing shot is the reference shot itself: it starts on the rocks and tilts up to the fitted view of the tower.
  {
    const cp = Math.cos(CAM.pitch), far = [CAM.x + cp * Math.cos(CAM.yaw) * 50, CAM.y + Math.sin(CAM.pitch) * 50, CAM.z - cp * Math.sin(CAM.yaw) * 50];
    world.opening = { pos: [CAM.x, CAM.y, CAM.z], look: [far[0], far[1] - 3.5, far[2]], lookDrift: [0, 3.5, 0], seconds: 6, fov: CAM.fov, wideZoom: 1 };   // the wide picture keeps the whole tower in view
  }
  const radio = nearCam(-8.86, 6.64, 1.3 + .5125*1.2);
  placeRadio(world, radio.x, radio.y, radio.z, Math.atan2(AHEAD.x, AHEAD.z));
  addBayFerry(world, nearCam);
  return world;
}
