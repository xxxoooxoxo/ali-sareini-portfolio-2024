// Chapter 3: Y Combinator, indoors. One hall with the long dinner tables and the Demo Day stage,
// which is the part every batch shares whichever office it met in.
// North is -Z. You come in at the south door and the stage is at the north end.
import * as THREE from 'three';
import { rgb, hash, drawTex, addLight } from '../engine/look.js';
import { World } from '../engine/world.js';
import { Props } from '../engine/props.js';
import { Bake } from '../engine/bake.js';
import { Figure } from '../engine/figure.js';
import { chestHeight } from '../engine/combat.js';
import { ycMaterials, ycDetail } from './yc-textures.js';
import { memories } from '../story.js';
import { placeRadio } from '../engine/portable-radio.js';
import { bakedBystander, bakeBraceOffsets } from '../engine/crowd-reactions.js';
import { addPickup } from '../engine/interactions.js';

const W = 13, D = 20, H = 6;          // half width, half depth and height of the hall
const STAGE = { x: 6.5, front: -15.5, top: 0.5 };
const ORANGE = [238, 124, 48];

/** @param {import('../engine/world.js').ChapterEvents} [events] */
export function buildYc({ inventory } = {}) {
  const world = new World(), { scene } = world;
  scene.background = rgb(34, 30, 28);
  scene.fog = new THREE.Fog(rgb(34, 30, 28), 40, 140);
  world.peopleFill = [115, 103, 88];
  world.grade = { multiply: [255, 255, 255], add: [7, 6, 4] };
  addLight(scene, [88, 77, 66], [118, 103, 84], [-0.22, 1, 0.16]);   // a dim hall: the pendants below do the lighting
  world.contact = .28;
  world.shadow = { range: 29, size: 4096 };

  // The stage is half a metre up, with a short ramp of steps at its front edge.
  world.ground = (x, z) => Math.abs(x)<STAGE.x && z<STAGE.front ? STAGE.top
    : x>=6.5 && x<8.5 && z>-19.4 && z<-17.4 ? .5*(8.5-x)/2 : 0;

  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const detail = Object.fromEntries(['metal','wood','ceiling','keyboard','carton','cup','leaf','book','cabinet','stretcher'].map(k=>[k,ycDetail(k)]));
  const flat = (c) => lambert({ map: detail.metal, color: rgb(...c) });
  const glow = (c) => new THREE.MeshBasicMaterial({ color: rgb(...c), fog: false });
  // A flat panel that faces into the room. turn: 0 faces south, PI north, -PI/2 west, PI/2 east.
  const panel = (w, h, mat, x, y, z, turn = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = turn; scene.add(m); return m; };

  const textures = ycMaterials();
  const props = new Props(world,{night:true});
  const tiled = (source, x, y) => {
    const copy = source.clone(); copy.repeat.set(x,y); copy.needsUpdate = true;
    source.userData.copies.push(copy); return copy;
  };

  // ---------- the room ----------
  const concrete = textures.parquet;
  const floorTex = tiled(concrete, 20, 32); floorTex.userData.soft = true;   // soft boards: no extra sharpening toward the far wall
  const floor = panel(W * 2, D * 2, lambert({ map: floorTex, color:rgb(142,145,156) }), 0, 0, 0); floor.rotation.set(-Math.PI / 2, 0, 0);
  // Warm bounce is stronger along the perimeter ceiling bays; the central bay stays subdued.
  for(const [cx,width,tint] of [[-9,8,[124,110,93]],[0,10,[106,95,81]],[9,8,[124,110,93]]]){
    const ceiling=panel(width,D*2,new THREE.MeshBasicMaterial({map:tiled(detail.ceiling,8*width/(W*2),12),color:rgb(...tint),fog:false}),cx,H,0);
    ceiling.rotation.set(Math.PI/2,0,0);
  }
  const wallWhite = lambert({ map: tiled(textures.brick, 8, 2), color: rgb(226, 215, 195), emissive:rgb(26,19,12), emissiveMap:tiled(textures.brick,8,2) });
  panel(W * 2, H, wallWhite, 0, H / 2, -D);                    // north, behind the stage
  panel(W * 2, H, wallWhite, 0, H / 2, D, Math.PI);            // south, with the door
  panel(D * 2, H, wallWhite, -W, H / 2, 0, Math.PI / 2);       // west
  panel(D * 2, H, lambert({ map: tiled(textures.brick, 12, 2), color: rgb(168,122,86), emissive:rgb(14,10,7), emissiveMap:tiled(textures.brick,12,2) }), W, H / 2, 0, -Math.PI / 2);    // east: the orange wall
  for (const [xa, xb, za, zb] of [[-W - 2, -W, -D, D], [W, W + 2, -D, D], [-W, W, -D - 2, -D], [-W, W, D, D + 2]]) world.wall(xa, xb, za, zb);
  world.boxes(lambert({map:detail.wood,color:rgb(80,64,48),emissive:rgb(11,9,6),fog:false}), [-12, -4, 4, 12].map((z) => [W * 2, 0.4, 0.3, 0, H - 0.2, z]));   // ceiling beams
  panel(1.8, 2.6, flat([40, 36, 34]), 0, 1.3, D - 0.02, Math.PI);                                    // the door you came in by

  const mottoTex = drawTex(512, 64, (g) => {
    g.scale(.25,.25);g.filter='blur(.2px)';
    g.clearRect(0, 0, 2048, 256);
    g.fillStyle = '#e2d2b0'; g.font = 'bold 112px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MAKE SOMETHING PEOPLE WANT', 1024, 132);
    // Brushed on years ago: the paint has thinned in strokes and flaked off in specks.
    g.filter='none';g.globalCompositeOperation='destination-out';
    for(let i=0;i<2600;i++){g.fillStyle=`rgba(0,0,0,${.25+hash(i,3,23)*.5})`;g.fillRect(hash(i,1,23)*2048,hash(i,2,23)*256,3+hash(i,4,23)*22,2+hash(i,5,23)*3);}
    g.globalCompositeOperation='source-over';
  });
  panel(8.8, 1.1, lambert({ map: mottoTex, transparent: true, depthWrite: false }), W - 0.02, 4.42, 2.5, -Math.PI / 2);   // above the pinboards, whole
  // Tall windows on the west wall, with the evening outside.
  // The evening street outside: the painted view, cropped to what lies inside its own frame.
  const windowTex = textures.street.clone(); windowTex.repeat.set(.895, .859); windowTex.offset.set(.0547, .0977); windowTex.needsUpdate = true;
  textures.street.userData.copies.push(windowTex);
  for (const z of [-12, -4, 4, 12]) panel(3.2, 3.6, new THREE.MeshBasicMaterial({ map: windowTex, fog: false }), -W + 0.02, 3.2, z, Math.PI / 2);

  // ---------- the stage ----------
  world.box(STAGE.x * 2, STAGE.top, D + STAGE.front, lambert({map:textures.fabric,color:rgb(113,105,94),emissive:rgb(18,15,11)}), 0, STAGE.top / 2, (-D + STAGE.front) / 2);
  world.wall(-6.7,6.7,-15.65,-15.35,1.6);
  world.boxes(lambert({map:detail.wood,color:rgb(106,86,64)}),[[13.4,.1,.12,0,1.25,-15.5],...[-6.5,-3.25,0,3.25,6.5].map(x=>[.09,1.2,.09,x,.65,-15.5])]);
  world.wall(-6.8,-6.5,-20,-15.5,1.6);
  world.wall(6.5,6.8,-17.4,-15.5,1.6);
  // East-side ramp, reached around the audience rather than straight through the centre.
  const rampGeo=new THREE.BoxGeometry(2.05,.08,2);
  const ramp=new THREE.Mesh(rampGeo,lambert({map:detail.wood,color:rgb(160,137,106)}));
  ramp.position.set(7.5,.25,-18.4);ramp.rotation.z=-Math.atan(.25);scene.add(ramp);
  let slide = 0;
  const paintSlide = g => {
    g.save();
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.scale(2,2);g.filter='blur(.5px)';
    g.fillStyle=['#ceba91','#465865','#717f66'][slide];g.fillRect(0,0,512,256);
    g.fillStyle='#b67a49';g.fillRect(28,32,84,88);
    g.fillStyle='#fff';g.font='bold 72px Arial';g.fillText('Y',46,103);
    g.fillStyle=slide ? '#eee3c9' : '#69604c';g.font='bold 43px Arial';
    g.fillText(['DEMO DAY','PROTOTYPE','LAUNCH'][slide],139,88);
    if (slide === 0) {
      g.font='17px Arial';g.fillText('BUILD SOMETHING GREAT',30,224);
      for(let i=0;i<5;i++){g.fillStyle='#8c947a';g.fillRect(155+i*58,182-i*15,34,15+i*15);}
    } else if (slide === 1) {
      // Three sketched screens of a prototype, projected in slate and cream.
      g.strokeStyle='#d9cbae';g.lineWidth=3;
      for (const x of [63,207,351]) {
        g.strokeRect(x,139,98,68);g.fillStyle='#c2895e';g.fillRect(x+1,140,96,11);
        g.fillStyle='#93a29b';g.fillRect(x+9,161,32,35);g.fillRect(x+49,163,38,6);g.fillRect(x+49,177,25,5);
      }
    } else {
      g.strokeStyle='#eadabb';g.lineWidth=5;g.beginPath();
      [[48,207],[139,195],[230,167],[321,174],[430,126]].forEach(([x,y],i)=>i ? g.lineTo(x,y) : g.moveTo(x,y));
      g.stroke();g.fillStyle='#e2ad72';g.fillRect(423,119,14,14);
    }
    const falloff=g.createRadialGradient(230,110,30,250,125,300);falloff.addColorStop(0,'rgba(255,240,200,.16)');falloff.addColorStop(1,'rgba(60,42,22,.36)');g.fillStyle=falloff;g.fillRect(0,0,512,256);
    g.filter='none';
    for(let y=0;y<256;y+=1.5){g.fillStyle=`rgba(40,30,18,${.03+.03*hash(y,3,29)})`;g.fillRect(0,y,512,.5);}
    for(let i=0;i<5200;i++){g.fillStyle=i%2?'rgba(255,246,220,.07)':'rgba(48,36,22,.08)';g.fillRect(hash(i,1,29)*512,hash(i,2,29)*256,1,1);}
    // The screen fabric: faint seams, and a soft shadow where its top edge curls.
    for(const x of [171,342]){g.fillStyle='rgba(60,46,30,.07)';g.fillRect(x,0,1,256);}
    const curl=g.createLinearGradient(0,0,0,26);curl.addColorStop(0,'rgba(40,30,20,.3)');curl.addColorStop(1,'rgba(40,30,20,0)');g.fillStyle=curl;g.fillRect(0,0,512,26);
    g.restore();
  };
  const screenTex = drawTex(1024,512,paintSlide);
  const projection = new THREE.MeshBasicMaterial({map:screenTex,color:rgb(236,233,224),fog:false});
  projection.name = 'Demo Day projection';
  panel(6.5,3.25,projection,0,3.15,-D+.05);
  world.box(0.7, 1.1, 0.5, flat([60, 54, 50]), -2.95, STAGE.top + 0.55, -17.2);                             // the lectern
  world.post(-2.95, -17.2, 0.5, 1.9);

  // ---------- long tables with benches, laptops and cups ----------
  const tableTop = lambert({ map: tiled(detail.wood,1,4), color: rgb(157, 149, 137) }), dark = flat([78, 77, 73]);
  const tops = [], legs = [], laptops = [], screens = [], cups = [];
  for (const x of [-7.6, 0, 7.6]) for (const z of [-7.5, 5.5]) {
    tops.push([1.1, 0.04, 8, x, 0.79, z]);
    world.boxes(tableTop,[[.32,.08,8,x-1.2,.45,z],[.32,.08,8,x+1.2,.45,z]]);
    for(const dz of [-3.85,3.85]){
      world.boxes(tableTop,[[1.25,.12,.2,x,.64,z+dz],[2.2,.12,.24,x,.18,z+dz],
        [.15,.7,.2,x-.43,.35,z+dz],[.15,.7,.2,x+.43,.35,z+dz],
        [.14,.42,.2,x-1.2,.21,z+dz],[.14,.42,.2,x+1.2,.21,z+dz]]);
    }
    for (const dz of [-3.6, 3.6]) legs.push([0.12, 0.72, 0.18, x, 0.36, z + dz], [0.08, 0.43, 0.18, x - 1.2, 0.215, z + dz], [0.08, 0.43, 0.18, x + 1.2, 0.215, z + dz]);
    world.wall(x - 1.4, x + 1.4, z - 4.05, z + 4.05, 1);
    for (let k = 0; k < 5; k++) {
      const lz = z - 3.3 + k * 1.65 + (hash(k, x, 3) - 0.5) * 0.5, side = hash(k, z, 4) > 0.5 ? 1 : -1;
      laptops.push([0.3, 0.02, 0.22, x + side * 0.22, 0.81, lz]);
      screens.push([0.02, 0.2, 0.3, x + side * 0.08, 0.91, lz]);
      if (hash(k, x + z, 5) > 0.4) cups.push([0.07, 0.11, 0.07, x - side * 0.3, 0.855, lz + 0.3]);
    }
  }
  world.boxes(tableTop, tops);
  world.boxes(lambert({map:detail.keyboard}), laptops.map(([w, h, d, x, y, z]) => [d, h, w, x, y, z]));
  world.boxes(dark, screens.filter(v=>Math.abs(v[3])>1));
  // Six authored displays, assigned consecutively within each table.
  const screenMats = ['code','chart','slides','call','sheet','terminal'].map(kind=>new THREE.MeshBasicMaterial({map:drawTex(128,64,g=>{
    g.fillStyle=['code','terminal'].includes(kind)?'#293c39':'#b8bcae';g.fillRect(0,0,128,64);
    g.fillStyle='#5b6d70';g.fillRect(0,0,128,7);
    if(kind==='code'||kind==='terminal')for(let i=0;i<8;i++){g.fillStyle=kind==='terminal'?'#89b796':i%3?'#b6c4b2':'#b68b67';g.fillRect(5+(kind==='code'?i%3*7:0),12+i*6,18+(i*19)%76,2);}
    if(kind==='chart'){g.strokeStyle='#5a756a';g.beginPath();g.moveTo(10,14);g.lineTo(10,56);g.lineTo(119,56);g.stroke();for(let i=0;i<6;i++){g.fillStyle=i%2?'#6e9290':'#ae805e';g.fillRect(18+i*16,49-i*6,10,6+i*6);}}
    if(kind==='slides'){g.fillStyle='#a97753';g.fillRect(10,14,34,38);g.fillStyle='#626b67';g.fillRect(52,16,65,6);for(let i=0;i<3;i++)g.fillRect(52,30+i*8,54-i*9,3);}
    if(kind==='call')for(let i=0;i<6;i++){const x=5+i%3*41,y=11+Math.floor(i/3)*26;g.fillStyle=['#718582','#9a8c77','#687b91'][i%3];g.fillRect(x,y,37,23);g.fillStyle='#c5a082';g.fillRect(x+15,y+4,8,8);g.fillStyle='#414d54';g.fillRect(x+10,y+13,18,9);}
    if(kind==='sheet'){for(let i=0;i<7;i++)for(let j=0;j<5;j++){g.fillStyle=i===0?'#6b8980':(i+j)%2?'#acb0a0':'#c4c3b2';g.fillRect(4+j*24,10+i*7,22,6);g.fillStyle='#747d70';g.fillRect(7+j*24,12+i*7,8+(i+j)%3*4,1);}}
  }),color:rgb(201,187,154)}));
  let screenIndex=0;
  for(const [w,h,d,x,y,z] of screens){
    const screenMat=screenMats[(screenIndex+++2)%screenMats.length];
    if(Math.abs(x)<1){
      world.box(.3,.2,.018,dark,x,y,z);
      // The laptop at the stage end of the centre table drives both displays.
      const presenting = z < -10;
      panel(.27,.175,presenting ? projection : screenMat,x,y,z+.011,.0);
      if (presenting) world.interactions.push({
        x, y: y + .45, z, r: 3.2, label: 'Next slide',
        act() {
          slide = (slide + 1) % 3;
          paintSlide(screenTex.image.getContext('2d'));
          screenTex.needsUpdate = true;
        },
      });
      continue;
    }
    panel(.26,.17,screenMat,x+.012,y,z,Math.PI/2);
    panel(.26,.17,screenMat,x-.012,y,z,-Math.PI/2);
  }
  for(const [r,h,d,x,y,z] of cups){
    const ceramic=flat([225,216,188]);
    world.posts(ceramic,[[.055,.105,.055,x,.865,z]]);
    world.posts(glow([50,33,22]),[[.045,.004,.045,x,.92,z]]);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.043,.012,5,12),ceramic);
    handle.position.set(x+.064,.868,z);scene.add(handle);
  }
  // Dinner laid out along the west wall.
  world.box(1, 0.9, 9, lambert({map:tiled(detail.cabinet,4,1),color:rgb(213,195,164)}), -W + 1.1, 0.45, -1); world.wall(-W, -W + 1.7, -5.6, 3.6, 1.2);
  world.boxes(flat([170, 174, 178]), [-4, -2, 0, 2].map((z) => [0.6, 0.1, 1.1, -W + 1.1, 0.95, z]));
  world.boxes(flat([196, 120, 60]), [-4, 0].map((z) => [0.5, 0.06, 0.95, -W + 1.1, 1.02, z]));
  world.boxes(flat([120, 150, 80]), [-2, 2].map((z) => [0.5, 0.06, 0.95, -W + 1.1, 1.02, z]));

  // ---------- hanging lamps: a shade, a halo, and a pool of light on the floor ----------
  const glowTex = drawTex(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16); grad.addColorStop(0, '#fff'); grad.addColorStop(0.4, '#666'); grad.addColorStop(1, '#000');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  });
  const halo = new THREE.SpriteMaterial({ map: glowTex, color: rgb(255, 214, 160), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pool = new THREE.MeshBasicMaterial({ map: glowTex, color: rgb(22, 18, 13), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const cords = [], shades = [];
  for (const x of [-7.6, 0, 7.6]) for (const z of [-10, -5, 3, 8, 14]) {
    cords.push([0.02, 1.6, 0.02, x, H - 0.8, z]); shades.push([0.5, 0.28, 0.5, x, H - 1.7, z]);
    const s = new THREE.Sprite(halo); s.position.set(x, H - 1.75, z); s.scale.setScalar(.22); scene.add(s);

  }
  // A row of pendants down each aisle. They hang over open floor, so each one's pool of light shows.
  const AISLE_LAMPS = [-3.8, 3.8].flatMap((x) => [-11.5, -3.5, 4.5, 11.5].map((z) => [x, z]));
  const aisleShade = lambert({ map: detail.metal, color: rgb(78, 74, 64), fog: false });
  for (const [x, z] of AISLE_LAMPS) {
    cords.push([0.02, 1.6, 0.02, x, H - 0.8, z]);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.29, .22, 12, 1, true), aisleShade); shade.position.set(x, 4.43, z); scene.add(shade);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(.255, 16), glow([255, 229, 176])); inner.rotation.x = Math.PI / 2; inner.position.set(x, 4.322, z); scene.add(inner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.105, 12, 8), glow([255, 255, 255])); bulb.position.set(x, 4.29, z); scene.add(bulb);
    const bloom = new THREE.Sprite(halo); bloom.position.set(x, 4.27, z); bloom.scale.setScalar(.66); scene.add(bloom);
  }
  // Low cross-room pendants give the side views a foreground ceiling silhouette.
  for(const [x,z] of [[8,1],[-8,.5]]){
    world.box(.025,1.35,.025,dark,x,5.325,z);
    const shade=new THREE.Mesh(new THREE.ConeGeometry(.58,.27,16,1,true),lambert({map:detail.metal,color:rgb(123,105,77),fog:false}));
    shade.position.set(x,4.53,z);scene.add(shade);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.58,.035,6,24),lambert({map:detail.metal,color:rgb(78,77,73),fog:false}));
    rim.rotation.x=Math.PI/2;rim.position.set(x,4.395,z);scene.add(rim);
    const diffuser=new THREE.Mesh(new THREE.CircleGeometry(.54,24),new THREE.MeshBasicMaterial({color:rgb(242,213,164),side:THREE.DoubleSide,fog:false}));   // fog off also keeps the lit disc from throwing a shadow
    diffuser.rotation.x=Math.PI/2;diffuser.position.set(x,4.40,z);scene.add(diffuser);
    const s=new THREE.Sprite(halo);s.position.set(x,4.34,z);s.scale.setScalar(.46);scene.add(s);
  }
  world.boxes(dark, cords);
  for (const x of [-4.5, 0, 4.5]) { const s = new THREE.Sprite(halo); s.position.set(x, H - 0.5, -16.5); s.scale.setScalar(.28); scene.add(s); } // stage lights

  // ---------- wall lamps, dark corners and years of use ----------
  // Brass wall lamps between the windows and boards. Each throws a warm fan up and down the brick; the wall between them stays dim.
  const wallGlow = new THREE.MeshBasicMaterial({ map: glowTex, color: rgb(112, 76, 40), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const brass = lambert({ map: detail.metal, color: rgb(150, 118, 62), emissive: rgb(40, 28, 12), fog: false });
  const lampGlass = new THREE.MeshBasicMaterial({ color: rgb(255, 222, 160), fog: false });
  // x, y, z of the lamp, and which way the wall faces (turn as for panel()).
  const sconces = [[-W, 3.9, -6.95, Math.PI / 2], [-W, 3.9, 1.05, Math.PI / 2], [-W, 3.9, 8, Math.PI / 2], [-W, 3.9, 16.9, Math.PI / 2], [-W, 3.9, -17.2, Math.PI / 2],
    [W, 3.7, -7, -Math.PI / 2], [W, 2.9, 2.5, -Math.PI / 2], [W, 3.7, 10.5, -Math.PI / 2], [W, 3.7, -17.3, -Math.PI / 2], [W, 3.7, 18, -Math.PI / 2],
    [-9.6, 4.1, D, Math.PI], [-4.4, 4.1, D, Math.PI], [4.4, 4.1, D, Math.PI], [9.6, 4.1, D, Math.PI]];
  for (const [x, y, z, turn] of sconces) {
    const nx = Math.sin(turn), nz = Math.cos(turn);   // out of the wall, into the room
    const glowCard = panel(3.6, 4.6, wallGlow, x + nx * 0.035, y - 0.25, z + nz * 0.035, turn); glowCard.renderOrder = 3;
    world.box(nz ? 0.14 : 0.05, 0.34, nz ? 0.05 : 0.14, brass, x + nx * 0.03, y - 0.1, z + nz * 0.03);
    world.box(nz ? 0.035 : 0.2, 0.035, nz ? 0.2 : 0.035, brass, x + nx * 0.12, y - 0.12, z + nz * 0.12);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.26, 8, 1, true), lampGlass);
    shade.position.set(x + nx * 0.22, y + 0.04, z + nz * 0.22); scene.add(shade);
    const s = new THREE.Sprite(halo); s.position.set(x + nx * 0.26, y + 0.04, z + nz * 0.26); s.scale.setScalar(0.5); scene.add(s);
  }
  // The ceiling falls into shade toward the walls, deepest in the corners.
  const fadeTex = drawTex(8, 64, (g) => { const grad = g.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, 'rgba(8,6,5,0)'); grad.addColorStop(1, 'rgba(8,6,5,.78)'); g.fillStyle = grad; g.fillRect(0, 0, 8, 64); });
  const fadeMat = new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const fadeQuad = (a, b, c, d) => {   // a and b lie along the wall (dark), c and d out in the room (clear)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, fadeMat); m.renderOrder = 2; scene.add(m); return m;
  };
  const cy = H - 0.012;
  fadeQuad([-W, cy, D], [-W, cy, -D], [-W + 5, cy, -D], [-W + 5, cy, D]);
  fadeQuad([W, cy, -D], [W, cy, D], [W - 5, cy, D], [W - 5, cy, -D]);
  fadeQuad([-W, cy, -D], [W, cy, -D], [W, cy, -D + 6], [-W, cy, -D + 6]);
  fadeQuad([W, cy, D], [-W, cy, D], [-W, cy, D - 6], [W, cy, D - 6]);
  // The top of each wall is in shade too, above the reach of the lamps.
  for (const [a, b, n] of [[[-W, D], [-W, -D], [1, 0]], [[W, -D], [W, D], [-1, 0]], [[-W, -D], [W, -D], [0, 1]], [[W, D], [-W, D], [0, -1]]]) {
    const o = 0.03;
    fadeQuad([a[0] + n[0] * o, H, a[1] + n[1] * o], [b[0] + n[0] * o, H, b[1] + n[1] * o], [b[0] + n[0] * o, H - 2.1, b[1] + n[1] * o], [a[0] + n[0] * o, H - 2.1, a[1] + n[1] * o]);
  }
  // Water stains and soot on the boards overhead: one large map over the whole ceiling, so nothing repeats.
  const stainTex = drawTex(256, 256, (g) => {
    for (let i = 0; i < 110; i++) {
      const x = hash(i, 1, 57) * 256, y = hash(i, 2, 57) * 256, r = 5 + hash(i, 3, 57) * 22, a = g.createRadialGradient(x, y, r * .2, x, y, r);
      const dark = hash(i, 4, 57) > .3;
      a.addColorStop(0, dark ? 'rgba(46,34,22,.5)' : 'rgba(238,224,196,.2)'); a.addColorStop(.8, dark ? 'rgba(46,34,22,.3)' : 'rgba(238,224,196,.1)'); a.addColorStop(1, 'rgba(46,34,22,0)');
      g.fillStyle = a; g.beginPath(); g.ellipse(x, y, r, r * (.5 + hash(i, 5, 57) * .6), hash(i, 6, 57) * 3, 0, 6.3); g.fill();
    }
  });
  const stains = panel(W * 2, D * 2, new THREE.MeshBasicMaterial({ map: stainTex, transparent: true, depthWrite: false, fog: false }), 0, H - 0.006, 0); stains.rotation.set(Math.PI / 2, 0, 0); stains.renderOrder = 1;
  const wearTex = drawTex(512, 512, (g) => {
    for (let i = 0; i < 150; i++) {   // dull trodden patches and darker spills
      const x = hash(i, 1, 71) * 512, y = hash(i, 2, 71) * 512, r = 10 + hash(i, 3, 71) * 46, a = g.createRadialGradient(x, y, r * .15, x, y, r), dark = hash(i, 4, 71) > .35;
      a.addColorStop(0, dark ? `rgba(34,24,14,${.22 + hash(i, 5, 71) * .2})` : 'rgba(255,232,190,.14)'); a.addColorStop(1, dark ? 'rgba(34,24,14,0)' : 'rgba(255,232,190,0)');
      g.fillStyle = a; g.beginPath(); g.ellipse(x, y, r, r * (.4 + hash(i, 6, 71) * .6), hash(i, 7, 71) * 3, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 520; i++) {   // scuffs and drag marks, mostly along the length of the hall
      const x = hash(i, 8, 71) * 512, y = hash(i, 9, 71) * 512, len = 4 + hash(i, 10, 71) * 22, tilt = (hash(i, 11, 71) - .5) * .9;
      g.strokeStyle = i % 3 ? `rgba(30,22,14,${.22 + hash(i, 12, 71) * .28})` : 'rgba(250,230,196,.09)'; g.lineWidth = .8 + hash(i, 13, 71) * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(tilt) * len, y + Math.cos(tilt) * len); g.stroke();
    }
    for (const x of [150, 362]) {   // the two aisles are walked dull down the middle
      const lane = g.createLinearGradient(x - 26, 0, x + 26, 0); lane.addColorStop(0, 'rgba(40,30,18,0)'); lane.addColorStop(.5, 'rgba(40,30,18,.2)'); lane.addColorStop(1, 'rgba(40,30,18,0)');
      g.fillStyle = lane; g.fillRect(x - 26, 0, 52, 512);
    }
  });
  const wear = panel(W * 2, D * 2, new THREE.MeshBasicMaterial({ map: wearTex, transparent: true, depthWrite: false }), 0, 0.012, 0); wear.rotation.set(-Math.PI / 2, 0, 0); wear.renderOrder = 1;
  // Each west window lays its panes on the floor in the last blue of the evening.
  const paneTex = drawTex(64, 64, (g) => {
    g.filter = 'blur(1.2px)'; g.fillStyle = '#fff';
    for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) g.fillRect(4 + c * 19.5, 4 + r * 29, 16.5, 26);
    g.filter = 'none'; g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 64, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = fade; g.fillRect(0, 0, 64, 64);
  });
  const paneMat = new THREE.MeshBasicMaterial({ map: paneTex, color: rgb(98, 104, 160), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  for (const z of [-12, -4, 4, 12]) {
    const geo = new THREE.BufferGeometry();   // a slanted patch: the light comes in from a little north of west
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-11.6, .02, z + 1.5, -11.6, .02, z - 1.5, -6.4, .02, z - 0.2, -6.4, .02, z + 3.4], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2)); geo.setIndex([0, 2, 1, 0, 3, 2]);
    const m = new THREE.Mesh(geo, paneMat); m.renderOrder = 3; scene.add(m);
  }
  // The projector's light spills off the screen onto the brick round it.
  { const spill = panel(10.5, 6.4, new THREE.MeshBasicMaterial({ map: glowTex, color: rgb(96, 84, 62), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }), 0, 3.15, -D + .03); spill.renderOrder = 2; }
  // Grime on the brick: streaks under the roof line, damp patches, scuffs low down. One map per wall, never repeated.
  const grime = (seed) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: drawTex(512, 128, (g) => {
    for (let i = 0; i < 46; i++) {   // streaks running down from the top
      const x = hash(i, 1, seed) * 512, len = 22 + hash(i, 2, seed) * 70, w = 2 + hash(i, 3, seed) * 7, a = g.createLinearGradient(0, 0, 0, len);
      a.addColorStop(0, `rgba(44,34,24,${.22 + hash(i, 4, seed) * .25})`); a.addColorStop(1, 'rgba(44,34,24,0)'); g.fillStyle = a; g.fillRect(x, 0, w, len);
    }
    for (let i = 0; i < 60; i++) {   // damp and soot patches, and a few places where the limewash is fresh
      const x = hash(i, 5, seed) * 512, y = hash(i, 6, seed) * 128, r = 8 + hash(i, 7, seed) * 30, a = g.createRadialGradient(x, y, 0, x, y, r), pale = hash(i, 8, seed) > .75;
      a.addColorStop(0, pale ? 'rgba(250,238,210,.2)' : `rgba(50,38,26,${.16 + hash(i, 9, seed) * .2})`); a.addColorStop(1, pale ? 'rgba(250,238,210,0)' : 'rgba(50,38,26,0)');
      g.fillStyle = a; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const low = g.createLinearGradient(0, 96, 0, 128); low.addColorStop(0, 'rgba(40,30,20,0)'); low.addColorStop(1, 'rgba(40,30,20,.34)'); g.fillStyle = low; g.fillRect(0, 96, 512, 32);
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(36,28,20,.22)'; g.fillRect(hash(i, 10, seed) * 512, 104 + hash(i, 11, seed) * 22, 3 + hash(i, 12, seed) * 14, 1.5); }
  }) });
  panel(W * 2, H, grime(61), 0, H / 2, -D + 0.012);
  panel(W * 2, H, grime(62), 0, H / 2, D - 0.012, Math.PI);
  panel(D * 2, H, grime(63), -W + 0.012, H / 2, 0, Math.PI / 2);
  panel(D * 2, H, grime(64), W - 0.012, H / 2, 0, -Math.PI / 2);

  // ---------- layered architecture and the useful clutter of a shared hall ----------
  const steel = flat([93, 94, 90]), trim = flat([178, 171, 154]);
  const cloth = lambert({map:textures.fabric, color:rgb(113,119,125)});
  const timber = lambert({map:detail.stretcher,color:rgb(186,156,116)});
  const structural = [], rims = [], ducts = [], seams = [];
  for(const x of [-12.85,12.85]) {
    rims.push([.18,.22,40,x,.11,0],[.24,.18,40,x,5.64,0]);
    for(const z of (x>0?[-18,18]:[-18,-8,0,8,18])) structural.push([.32,5.65,.35,x,2.82,z]);
  }
  rims.push([26,.22,.18,0,.11,-19.85],[26,.22,.18,0,.11,19.85]);
  // Twin longitudinal service ducts, collars, transverse beams and track hangers.
  for(const x of [-10,10]) {
    ducts.push([.62,.48,38,x,5.4,0]);

  }
  for(let z=-18;z<=18;z+=6) {
    structural.push([25,.17,.28,0,5.05,z],[25,.10,.32,0,5.75,z]);
    for(let x=-12;x<=12;x+=3) structural.push([.08,.7,.08,x,5.4,z]);
  }
  for(const x of [-7.6,0,7.6]) structural.push([.08,.10,38,x,5.8,0]);
  const trussMat=lambert({map:tiled(detail.wood,3,1),color:rgb(66,53,41),emissive:rgb(15,12,8),fog:false});   // dark stained timber against the pale boards
  world.boxes(trussMat,structural);world.boxes(trim,rims);
  for(const z of [-18,-12,-6,0,6,12,18])for(const side of [-1,1]){
    const brace=world.box(6.4,.18,.22,trussMat,side*3.1,5.42,z);brace.rotation.z=side*.11;
  }
  // Glazed roof lights retain dusk even where the high ceiling is visible.
  const roofSky = drawTex(256,256,(g)=>{
    const grad=g.createLinearGradient(0,0,256,256);grad.addColorStop(0,'#343a7c');grad.addColorStop(.55,'#6a5f9a');grad.addColorStop(1,'#c48a84');
    g.fillStyle=grad;g.fillRect(0,0,256,256);
    // Long evening clouds, lit from below, and a few early stars.
    for(let i=0;i<9;i++){
      const y=20+hash(i,1,31)*210,x=hash(i,2,31)*200-30,w=90+hash(i,3,31)*120,h=7+hash(i,4,31)*10;
      g.fillStyle=`rgba(${i%2?'226,150,140':'74,70,122'},${.35+hash(i,5,31)*.3})`;
      g.beginPath();g.ellipse(x+w/2,y,w/2,h,-.12,0,Math.PI*2);g.fill();
      g.fillStyle='rgba(246,196,160,.28)';g.beginPath();g.ellipse(x+w/2,y+h*.45,w*.42,h*.3,-.12,0,Math.PI*2);g.fill();
    }
    g.fillStyle='#e9e2d0';for(let i=0;i<14;i++)g.fillRect(hash(i,6,31)*256,hash(i,7,31)*120,1.5,1.5);
    // Grime gathered along the frame, and a pale reflection of the hall lamps on the glass.
    g.strokeStyle='rgba(30,26,34,.45)';g.lineWidth=14;g.strokeRect(0,0,256,256);
    g.fillStyle='rgba(255,226,170,.10)';g.beginPath();g.moveTo(40,0);g.lineTo(86,0);g.lineTo(216,256);g.lineTo(170,256);g.fill();
  });
  const glazing = lambert({map:detail.metal,color:rgb(58,52,46),emissive:rgb(20,17,13),fog:false});
  for(const z of [-10,2,14]){
    const sky=panel(3.6,3.2,new THREE.MeshBasicMaterial({map:roofSky,color:rgb(214,214,226),fog:false}),3.8,5.99,z);sky.rotation.x=Math.PI/2;
    world.boxes(trussMat,[[3.8,.12,.12,3.8,5.9,z-1.6],[3.8,.12,.12,3.8,5.9,z+1.6],[.12,.12,3.2,2,5.9,z],[.12,.12,3.2,5.6,5.9,z]]);
    // Four panes across and three along, on thin steel bars.
    world.boxes(glazing,[...[-.9,0,.9].map(dx=>[.055,.09,3.2,3.8+dx,5.92,z]),...[-.533,.533].map(dz=>[3.6,.07,.045,3.8,5.93,z+dz])]);
  }
  // Warm strip lights between the beams.
  const strips=[], stripBacks=[];
  for(let k=0;k<6;k++){
    const z=-15+k*6;
    for(const x of [1.2,10.9,-11]){
      if(Math.abs(x-3.8)<2.6&&[-10,2,14].some(s=>Math.abs(z-s)<2.2))continue;
      stripBacks.push([.16,.07,2.1,x,5.9,z]);strips.push([.09,.03,1.96,x,5.855,z]);
    }
  }
  world.boxes(glazing,stripBacks);
  world.boxes(new THREE.MeshBasicMaterial({color:rgb(255,232,188),fog:false}),strips);
  // Recessed window reveals, thick sills, glazing bars and radiators below.
  const frames=[], radiator=[];
  for(const z of [-12,-4,4,12]){
    for(const dz of [-1.68,1.68]) frames.push([.3,3.9,.14,-12.8,3.2,z+dz]);
    for(const y of [1.32,5.08]) frames.push([.3,.16,3.5,-12.8,y,z]);
    frames.push([.48,.13,3.65,-12.7,1.28,z],[.13,3.6,.06,-12.72,3.2,z-.57],[.13,3.6,.06,-12.72,3.2,z+.57],[.13,.07,3.3,-12.72,3.22,z]);
    // Frame a warm reflected strip; no realtime reflection or shadow pass.
    for(let k=0;k<15;k++) radiator.push([.22,.6,.075,-12.66,.63,z-1.05+k*.15]);
  }
  world.boxes(trim,frames);world.boxes(wallWhite,radiator);
  for(const z of [-12,-4,4,12]) world.wall(-13,-12.5,z-1.2,z+1.2,1.0);
  // Framed design studies above the buffet, clear of the window openings.
  const study=drawTex(256,256,g=>{
    g.fillStyle='#bcb398';g.fillRect(0,0,256,256);
    g.fillStyle='#394c49';g.fillRect(22,22,212,118);
    g.strokeStyle='#c8b986';g.lineWidth=3;
    for(let i=0;i<5;i++){g.beginPath();g.arc(128,82,16+i*13,0,Math.PI*2);g.stroke();}
    g.fillStyle='#554b3d';g.font='bold 20px Arial';g.fillText('MAKE / TEST',22,177);
    g.font='13px Arial';g.fillText('LEARN / REPEAT',22,204);
    for(let i=0;i<4;i++)g.fillRect(22,221+i*5,160-i*23,1);
  });
  for(const z of [-9.1,-1.1]){
    world.box(.12,1.85,1.65,timber,-12.85,3.5,z);
    panel(1.48,1.67,lambert({map:study}),-12.77,3.5,z,Math.PI/2);
    world.box(.48,.09,2.7,timber,-12.55,2.25,z);
    for(let k=0;k<5;k++)world.box(.24,.28+k%2*.12,.12,lambert({map:detail.book}),-12.5,2.44,z-.9+k*.15);
  }
  // Surface-mounted service pipes and clamps follow the ceiling bays.
  world.boxes(steel,ducts);
  for(const x of [-11.5,-11.15]) {
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,38,8),steel);
    pipe.rotation.x=Math.PI/2;pipe.position.set(x,5.65,0);scene.add(pipe);
    for(let z=-18;z<=18;z+=3)world.box(.48,.12,.12,dark,x,5.66,z);
  }
  // Entry door is a built inset with push bars and a transom, not a painted rectangle.
  world.boxes(timber,[ [.13,2.9,.22,-1,1.45,19.8],[.13,2.9,.22,1,1.45,19.8],[2.15,.16,.22,0,2.9,19.8] ]);
  world.boxes(steel,[ [.06,2.6,.1,0,1.3,19.7],[1.7,.065,.12,0,1.15,19.66] ]);
  const sign=(text,w,h,x,y,z,turn=0)=>{const tex=drawTex(512,128,g=>{g.scale(2,2);g.filter='blur(.45px)';g.fillStyle='#343a35';g.fillRect(0,0,256,64);g.fillStyle='#d5c6a3';g.font='bold 26px Arial';g.textAlign='center';g.fillText(text,128,41);const fade=g.createLinearGradient(0,0,256,64);fade.addColorStop(0,'#a58a5920');fade.addColorStop(.5,'#ffffff08');fade.addColorStop(1,'#090e1430');g.fillStyle=fade;g.fillRect(0,0,256,64);g.filter='none';for(let i=0;i<900;i++){g.fillStyle=i%2?'rgba(255,244,214,.07)':'rgba(10,14,12,.12)';g.fillRect(hash(i,1,37)*256,hash(i,2,37)*64,2+hash(i,3,37)*9,1);}g.strokeStyle='rgba(230,214,176,.35)';g.lineWidth=1.5;g.strokeRect(3,3,250,58);g.strokeStyle='rgba(8,10,9,.5)';g.lineWidth=2;g.strokeRect(1,1,254,62);});return panel(w,h,new THREE.MeshBasicMaterial({map:tex}),x,y,z,turn);};
  sign('DEMO DAY',5,.55,0,4.65,-13.6);
  sign('WELCOME',1.7,.42,0,3.35,19.72,Math.PI);
  // Concrete joints and a quiet perimeter band anchor the scale of the floor.
  for(let z=-18;z<20;z+=4)seams.push([26,.006,.018,0,.006,z]);
  for(let x=-12;x<=12;x+=4)seams.push([.018,.006,40,x,.006,0]);
  // Parquet carries its own joints.
  // Soft contact shadows and elongated lamp sheen; all static unlit cards.
  const shadowTex=drawTex(64,64,g=>{const a=g.createRadialGradient(32,32,4,32,32,32);a.addColorStop(0,'rgba(0,0,0,.42)');a.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=a;g.fillRect(0,0,64,64);});
  const shadowMat=new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false});
  const groundCard=(w,d,mat,x,z,y=.012)=>{const m=panel(w,d,mat,x,y,z);m.rotation.x=-Math.PI/2;return m;};

  for(const x of [-7.6,0,7.6])for(const z of [-10,-5,3,8,14]){
    if(z===14&&x!==0)groundCard(.6,2.8,new THREE.MeshBasicMaterial({map:glowTex,color:rgb(116,100,77),transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false}),x+.7,z+.7,.025);
    const shade=new THREE.Mesh(new THREE.ConeGeometry(.29,.22,12,1,true),flat([78,74,64]));
    shade.position.set(x,4.43,z);scene.add(shade);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(.255,16),glow([255,229,176]));
    inner.rotation.x=Math.PI/2;inner.position.set(x,4.322,z);scene.add(inner);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),glow([255,255,255]));
    bulb.position.set(x,4.29,z);scene.add(bulb);
    const bloom=new THREE.Sprite(halo);bloom.position.set(x,4.27,z);bloom.scale.setScalar(.66);scene.add(bloom);
    if(z!==14||x!==0)groundCard(1.05,2.3,pool,x,z,z===14?.026:.816);

  }
  // Table aprons, proper trestles, bowls, napkins, notebooks, and bags beneath benches.
  const aprons=[], feet=[], dishes=[], papers=[], bags=[], straps=[];
  // Detail batches share geometry and materials.
  for(const x of [-7.6,0,7.6])for(const z of [-7.5,5.5]){
    for(const dx of [-.51,.51])aprons.push([.06,.17,7.9,x+dx,.65,z]);
    for(const dz of [-3.6,3.6])feet.push([1.3,.08,.35,x,.06,z+dz]);
    for(let k=0;k<4;k++){
      const zz=z-2.8+k*1.8,side=k%2?1:-1;
      dishes.push([.15,.025,.15,x+side*.25,.815,zz+.55]);
      papers.push([.27,.012,.22,x-side*.24,.81,zz+.38]);

      if(k%2===0){bags.push([.33,.42,.24,x+.97,.23,zz]);straps.push([.2,.04,.27,x+.97,.46,zz]);}
    }
  }
  world.boxes(timber,aprons);world.boxes(tableTop,feet);world.instances(new THREE.CylinderGeometry(1,.8,1,24),flat([228,222,206]),dishes);world.boxes(lambert({map:detail.book}),papers);world.posts(flat([54,35,24]),cups.map(([r,h,d,x,y,z])=>[r*.75,.006,r*.75,x,y+h/2+.002,z]));
  // Front audience chairs face north; leave a broad centre aisle and both side aisles.
  const seats=[], chairLegs=[], jackets=[];
  for(const z of [-12.6,-13.8,-15])for(const x of [-5.4,-4.5,-3.6,2.2,3.1,4,4.9]){
    if(x===2.2&&z!==-12.6)continue;
    const chair=props.officeChair(x,z,Math.PI,{solid:true,color:0xa79d87});
    chair.traverse(o=>{if(o.isMesh&&o.material.emissive){o.material.emissive.setRGB(.12,.10,.075);o.material.emissiveMap=o.material.map;}});groundCard(1,1.1,shadowMat,x,z);
  }
  // Bentwood side chairs: round seats and open curved backs beside the stage.
  for(const x of [-9.7,9.7])for(const z of [-13,-14.5]){
    world.posts(timber,[[.28,.065,.28,x,.48,z]]);
    for(const dx of [-.2,.2])for(const dz of [-.19,.19])world.box(.045,.47,.045,timber,x+dx,.235,z+dz);
    const back=new THREE.Mesh(new THREE.TorusGeometry(.25,.035,6,14,Math.PI),timber);
    back.position.set(x,.89,z+.22);scene.add(back);
    world.boxes(timber,[[-.22,.88],[.22,.88]].map(([dx,y])=>[.045,.42,.045,x+dx,.69,z+.22]));
    world.post(x,z,.35,1.2);
  }
  // Screen casing, speakers, footlights, lectern top and microphone.
  world.boxes(dark,[[6.75,.16,.15,0,4.84,-19.86],[6.75,.16,.15,0,1.46,-19.86],[.14,3.5,.15,-3.32,3.15,-19.86],[.14,3.5,.15,3.32,3.15,-19.86], [.9,.12,.65,-2.95,1.65,-17.2],[.8,.12,.65,-2.95,.56,-17.2]]);
  for(const x of [-4.8,4.8]){
    world.box(.7,1.65,.55,cloth,x,1.35,-18.5); world.post(x,-18.5,.48,2.2);
    for(const y of [1,1.65]){const m=new THREE.Mesh(new THREE.CircleGeometry(.22,12),dark);m.position.set(x,y,-18.21);scene.add(m);}
  }
  world.posts(dark,[[.018,.36,.018,-2.95,1.89,-17.13],[.04,.12,.04,-2.95,2.08,-17.13]]);
  world.boxes(glow([235,195,121]),[-5,-3,-1,1,3,5].map(x=>[.25,.035,.1,x,.51,-15.52]));
  world.boxes(steel,[[12,.1,.1,0,5.5,-16.5]]);
  world.posts(dark,[-4.5,0,4.5].map(x=>[.16,.35,.16,x,5.24,-16.5]));
  // Coffee station: cabinets, appliance, grinders, cup stacks and supply shelves.
  world.boxes(timber,[[1.1,.88,4,-11.85,.44,9.5]]);world.wall(-12.6,-11.1,7.3,11.7,1.5);
  world.boxes(steel,[[1.2,.08,4.1,-11.85,.92,9.5],[.6,.48,1.05,-11.85,1.2,9.2]]);
  world.boxes(dark,[[.12,.17,.8,-11.5,1.1,9.2],[.6,.06,1,-11.7,.99,9.2]]);
  world.posts(steel,[[.16,.42,.16,-11.85,1.17,10.2]]);
  world.posts(flat([228,222,206]),[8,8.25,8.5,10.9].map(z=>[.08,.24,.08,-11.6,1.08,z]));
  sign('COFFEE',2,.45,-12.63,2.15,9.5,Math.PI/2);
  // Cabinet reveals, hardware, raised buffet trays and serving spoons.
  const cabinetLines=[], handles=[], serving=[];
  for(const z of [-4,-2,0,2,8,9,10,11]) {
    cabinetLines.push([.016,.7,.025,-11.34,.44,z]);
    handles.push([.08,.025,.22,-11.29,.68,z+.25]);
  }
  world.boxes(dark,cabinetLines);world.boxes(steel,handles);
  for(const z of [-4,-2,0,2]){
    serving.push([.035,.025,.42,-11.55,1.09,z+.2]);
    for(const dz of [-.5,.5])serving.push([.64,.12,.035,-11.9,1.01,z+dz]);
  }
  world.boxes(steel,serving);
  // Freestanding whiteboards stay against the orange wall, clear of the motto.
  const boardTex=drawTex(256,128,g=>{g.fillStyle='#e1dfd2';g.fillRect(0,0,256,128);g.strokeStyle='#68746e';g.lineWidth=2;for(let k=0;k<3;k++){g.strokeRect(12+k*82,25,65,35);g.beginPath();g.moveTo(25+k*80,64);g.lineTo(45+k*80,94);g.stroke();}g.fillStyle='#ae7147';for(let k=0;k<8;k++)g.fillRect(14+k*29,103,17,12);g.fillStyle='#565c58';g.font='12px Arial';g.fillText('BUILD  /  TALK TO USERS  /  REPEAT',12,16);});
  const markedBoard = drawTex(256, 128, g => {
    g.drawImage(boardTex.image, 0, 0);
    g.strokeStyle = '#b84617'; g.lineWidth = 4; g.lineCap = g.lineJoin = 'round';
    for (const x of [12, 94, 176]) {
      g.beginPath(); g.moveTo(x + 13, 42); g.lineTo(x + 24, 51); g.lineTo(x + 49, 31); g.stroke();
    }
    g.fillStyle = '#b84617'; g.font = 'bold italic 22px sans-serif'; g.fillText('SHIP IT!', 83, 89);
    g.beginPath(); g.ellipse(127, 81, 53, 17, -.05, 0, Math.PI * 2); g.stroke();
  });
  for(const z of [-8,12]){
    const surface = lambert({map:boardTex});
    world.box(.12,1.55,3,steel,12.45,1.8,z);panel(2.85,1.4,surface,12.37,1.8,z,-Math.PI/2);
    world.boxes(steel,[[.08,1.2,.08,12.45,.6,z-1.2],[.08,1.2,.08,12.45,.6,z+1.2],[.7,.08,.15,12.3,.08,z-1.2],[.7,.08,.15,12.3,.08,z+1.2]]);
    world.wall(11.95,12.8,z-1.6,z+1.6,2.6);
    world.interactions.push({
      x: 12.36, y: 1.8, z, r: 2.15,
      get label() {
        if (!inventory?.has('yc-marker')) return null;
        return surface.map === boardTex ? 'Draw on whiteboard' : 'Erase sketch';
      },
      act() { surface.map = surface.map === boardTex ? markedBoard : boardTex; },
    });
  }
  // Plants: slender stems and overlapping pointed leaves, not solid green balls.
  for(const [x,z] of [[-11.6,17],[11.6,17],[-10,-17],[10,-17]]){props.plant(x,z,0,{scale:1.6});world.post(x,z,.55,2.3);groundCard(1.6,1.6,shadowMat,x,z);}

  // ---------- founders ----------
  const TOPS = [[[60, 62, 70], 'hoodie'], [[236, 232, 224], 'tee'], [[40, 52, 84], 'hoodie'], [[150, 60, 40], 'tee'], [[70, 110, 80], 'shirt'], [[30, 30, 34], 'tee'], [ORANGE, 'tee'], [[96, 70, 110], 'hoodie']];
  const SKIN = [[214, 170, 132], [150, 104, 72], [232, 190, 150], [112, 78, 56]];
  const HAIR = [[34, 26, 22], [120, 84, 44], [70, 44, 28], [62, 45, 33]];
  let wardrobe=0;
  const stagedPeople=[];
  const person = (_seed, seated=false) => {
    const i=wardrobe++;
    const woman = i % 3 === 1;
    const palette=[[61,83,96],[146,56,46],[83,103,71],[196,197,190],[117,58,44],[54,61,66],[116,128,130],[46,76,122],[63,94,89],[87,72,62],[38,98,74]];
    const topStyle=['shirt','jacket','tee','shirt','cardigan','cardigan','jacket','shirt','tee','cardigan','shirt'][i%11];
    const f = new Figure({ physique: 'slim', fit:'regular', face: i % 4, skin: SKIN[i % 4], hair: HAIR[(i * 3) % 4],
      hairStyle: ['parted','bun','crop','quiff','curly','crop','parted','long','parted'][i%9],
      build: woman ? 'f' : 'm', height: [1.78,1.61,1.72,1.94,1.76,1.68,1.83][i%7],
      top:palette[i%11], topStyle, pattern:i%3===0?['check','stripe','floral'][Math.floor(i/3)%3]:undefined, sleeveLength:'long',
      bag:!seated&&i%4===1?['backpack','tote','shoulder'][Math.floor(i/4)%3]:null,
      bottomStyle:['chinos','pants','jeans','chinos'][i%4],
      bottom: [[69,65,57],[38,42,48],[54,62,59],[75,72,65]][i%4],
      shoes: i % 3 ? [180,167,144] : [52,44,40] });
    f.root.userData.lookKey=i; stagedPeople.push(f);return f;
  };
  // x, z, facing: knots of people talking between the tables, a queue for dinner, and a speaker at the lectern
  [[-2.95, -17.9, 0], [-3.4, 0.4, 0.9], [-2.5, 1.3, 4.1], [-4.2, 1.6, 2.4], [4.5, 6, 5.2], [3.0, 7, 0.6], [4.4, 11.8, 3.8], [3.4, 12.6, 0.9], [4.8, 13, 5.5],
    [-10.2, 4.6, 0.2], [-10, 5.8, 3.3], [-10.4, 7.4, 1.2], [3.8, -11.6, 3.1], [-3.9, -12, 3.2], [10.9, -3, 4.5], [10.6, 9, 1.4], [11.4, 9.9, 3.6]].forEach(([x, z, facing], i) => {
    const f=person(i).place(x, world.ground(x, z), z, facing); [()=>f.greet(i*.7),()=>f.walk(.85+i*.4,.8).hold('tray'),()=>f.photograph(),()=>f.drink(),()=>f.carry('laptop',.8+i*.3)][i%5]();scene.add(f.root); world.post(x, z, 0.35, 1.9);
  });
  // People working at the tables, each at a laptop, and a few in the front row waiting for the next pitch.
  for (const x of [-7.6, 0, 7.6]) for (const z of [-7.5, 5.5]) for (let k = 0; k < 5; k+=2) {
    const lz = z - 3.3 + k * 1.65 + (hash(k, x, 3) - 0.5) * 0.5, side = hash(k, z, 4) > 0.5 ? 1 : -1; // the same spot as that seat's laptop
    if((x===-7.6&&z===5.5&&k===0)||(x===0&&z===-7.5&&k===4))continue;
    scene.add(person(30 + k + Math.round(x + z),true).place(x + side * 1.2, 0, lz+(k===0?.35:k===4?-.35:0), -side * Math.PI / 2).sitOn(0.49,false).hold('cup').root);
  }
  for (const [row,z] of [-13.8,-15].entries()) for (const [i,x] of [-5.4,-4.5,-3.6,2.2,3.1,4,4.9].entries()) if(x!==2.2)scene.add(person(50+i+row*7,true).place(x,0,z,Math.PI).sitOn(.505,'cup').root);
  // Near faces face south toward the opening camera; each has one readable task.
  // Six looks use precisely the same seat, proportions and drinking pose for comparison.
  const coffeeLooks = [
    {hairStyle:'crop',topStyle:'hoodie',top:[65,76,72]},
    {hairStyle:'quiff',topStyle:'cardigan',top:[94,74,59]},
    {hairStyle:'parted',topStyle:'shirt',pattern:'check',top:[105,115,107]},
    {hairStyle:'curly',topStyle:'hoodie',top:[63,75,87]},
    {hairStyle:'parted',topStyle:'cardigan',top:[103,94,74]},
    {hairStyle:'quiff',topStyle:'shirt',pattern:'check',top:[93,108,123]},
  ];
  const coffee=new Figure({ physique:'slim',build:'m',height:1.80,face:2,
    skin:[180,135,99],hair:[28,23,20],fit:'regular',sleeveLength:'long',
    bottomStyle:'pants',bottom:[32,36,41],shoes:[47,42,35],bag:null,
    ...coffeeLooks[4] });
  coffee.root.userData.lookKey=101;
  coffee.place(-1.2,0,-5.6,2.3).sitOn(.49,false).hold('cup');
  const mouth=coffee.localJoint('Head');coffee.reach('Right',[-.065,mouth.y-.04,mouth.z+.16]);
  coffee._grips();scene.add(coffee.root);
  const host=person(102).place(-2.4,0,-7.6,.2).walk(.9,.7).hold('tray');scene.add(host.root);world.post(-2.4,-7.6,.32,1.9);
  const greeter=person(103).place(.9,0,15.4,.15).photograph();scene.add(greeter.root);world.post(.9,15.4,.32,1.9);
  const reader=person(104).place(-1,0,15.8,-.2).phone();scene.add(reader.root);world.post(-1,15.8,.32,1.9);
  const guest=person(105).place(7,0,.3,-1.8).carry('laptop',.9);scene.add(guest.root);world.post(7,.3,.32,1.9);
  const reviewer=person(106).place(3.1,0,-5.1,.1).phone();scene.add(reviewer.root);world.post(3.1,-5.1,.32,1.9);
  const colleague=person(107).place(3.3,0,-3.6,3.25).talk(.7);scene.add(colleague.root);world.post(3.3,-3.6,.32,1.9);
  const movingRoots=new Set();const movingPerson=i=>{const f=person(i);movingRoots.add(f.root);return f;};
  world.walker(movingPerson(21), -3.8, 15, -3.8, -11, 1.1, 4); world.walker(movingPerson(22), 3.8, -10, 3.8, 9, 1.0, 12); world.walker(movingPerson(23), 10.8, 16, 10.8, -13, 1.2, 20);


  // Round two: painted illumination, domestic clutter and dense audience seating.
  const bake = new Bake(world);
  for(const x of [-7.6,0,7.6])for(const z of [-10,-5,3,8,14]){
    if(z===14){if(x!==0)bake.pool(x,z,1.25,[255,192,112],.24);}
    else bake.pool(x,z,1.1,[255,216,145],.085,.816);
    bake.pool(x,z,3.2,[255,198,128],.2);   // the spill on the floor either side of the table
  }
  for(const [x,z] of AISLE_LAMPS){bake.pool(x,z,2.5,[255,200,128],.55);bake.pool(x,z,1.1,[255,226,170],.3);}
  for(const [ax,az,bx,bz] of [[-12.9,-19.9,12.9,-19.9],[12.9,-19.9,12.9,19.9],[12.9,19.9,-12.9,19.9],[-12.9,19.9,-12.9,-19.9]]){
    bake.wash(ax,az,bx,bz,.8,4.6,[229,179,108],.12);
    bake.shade(ax,az,bx,bz,4.3,1.7,.25,true);bake.contact(ax,az,bx,bz,1.7,.55);bake.shade(ax,az,bx,bz,0,.7,.32);
  }
  for(const z of [-12,-4,4,12]){
    const m=panel(3.2,2,pool,-12.92,2,z,Math.PI/2);m.renderOrder=2;
  }
  bake.pool(0,-17.4,2.6,[227,190,126],.12,.52);
  bake.wash(-6,-19.91,6,-19.91,.5,4.8,[227,190,126],.08);
  for(const z of [-12,-4,4,12])bake.pool(-11.4,z,1.5,[136,171,228],.14);


  // Ambient occlusion remains under the full table and both benches even between pendants.
  for(const x of [-7.6,0,7.6])for(const z of [-7.5,5.5]){
    for(const dx of [-1.2,0,1.2])for(const dz of [-3,-1.5,0,1.5,3])
      bake.shadow(x+dx,z+dz,dx===0?.85:.45,.4,1.25);
  }
  for(const x of [-7,7])bake.shadow(x,14.5,2,.32,.85);
  for(const x of [-9.7,9.7])for(const z of [-13,-14.5])bake.shadow(x,z,.4,.28,.4);
  bake.shadow(10.2,4.2,.8,.3,.8);
  bake.shadow(11.9,3.8,.65,.3,1.35);
  bake.build();
  const food=[], boxes=[], cans=[], phones=[], pizza=[], cables=[];
  for(const x of [-7.6,0,7.6])for(const z of [-7.5,5.5])for(let k=0;k<5;k++){
    const zz=z-3.1+k*1.5;
    food.push([.12,.035,.11,x+.26,.84,zz+.5]);
    if(k===1)boxes.push([.29,.06,.24,x-.25,.84,zz+.55]);
    cans.push([.048,.15,.048,x+.35,.88,zz+.14]);
    phones.push([.09,.014,.17,x-.39,.815,zz-.2]);
    cables.push([.012,.008,.65,x+.07,.81,zz]);
    if(k===2)pizza.push([.62,.055,.62,x,.835,zz+.2]);
  }
  world.posts(flat([232,223,203]),food.map(v=>[.155,.014,.145,v[3],.821,v[5]]));
  // Rounded eight-sided bread rolls, with irregular salad rather than stacked discs.
  world.instances(new THREE.SphereGeometry(1,8,5),flat([169,113,59]),food.filter((_,i)=>i%2===0).map(v=>[.12,.065,.105,v[3],.865,v[5]]));world.boxes(lambert({map:detail.carton}),boxes);world.instances(new THREE.CylinderGeometry(1,1,1,16),lambert({map:detail.cup,color:rgb(180,115,85)}),cans);world.boxes(dark,phones);world.boxes(dark,cables);world.boxes(lambert({map:detail.carton}),pizza);
  // Alternate bread with salad bowls and plated triangular pizza slices.
  const otherFood=food.filter((_,i)=>i%2===1);
  world.instances(new THREE.CylinderGeometry(1,.65,1,10),flat([186,177,150]),otherFood.filter((_,i)=>i%2===0).map(v=>[.135,.055,.13,v[3],.85,v[5]]));
  world.instances(new THREE.SphereGeometry(1,8,4),flat([110,127,69]),otherFood.filter((_,i)=>i%2===0).map(v=>[.12,.025,.11,v[3],.885,v[5]]));
  const sliceGeo=new THREE.CylinderGeometry(1,1,1,3);
  world.instances(sliceGeo,flat([193,145,74]),otherFood.filter((_,i)=>i%2===1).map(v=>[.14,.025,.13,v[3],.845,v[5]]));
  world.posts(flat([151,66,43]),otherFood.map(v=>[.027,.009,.027,v[3]+.025,.875,v[5]]));
  for(const x of [-7.6,0,7.6])for(const z of [-7.5,5.5]){
    const jugMat=flat([163,182,178]);
    world.posts(jugMat,[[.065,.18,.065,x+.24,.9,z+1.2],[.045,.035,.045,x+.24,1.005,z+1.2]]);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.06,.012,5,12),jugMat);handle.position.set(x+.31,.93,z+1.2);scene.add(handle);
  }
  world.posts(flat([232,222,201]),cans.map(v=>[.055,.018,.055,v[3],.962,v[5]]));
  world.boxes(flat([101,117,55]),food.map(v=>[.16,.018,.12,v[3]+.015,.842,v[5]-.025]));
  world.boxes(flat([205,177,117]),food.filter((_,i)=>i%2===0).map(v=>[.06,.008,.025,v[3]+.025,.925,v[5]]));

  // Wall pinboards, bookcases and sofa alcoves fill the rear half of the hall.
  for(const z of [-13,-1,6,15])panel(3.4,3.4,lambert({map:textures.pinboard}),12.78,2.1,z,-Math.PI/2);
  const shelves=[], books=[];
  for(const x of [-8,-4,4,8]){
    shelves.push([2.6,2.8,.25,x,1.4,19.4]);
    for(let y=.4;y<2.8;y+=.65){shelves.push([2.6,.08,.55,x,y,19.1]);for(let k=0;k<6;k++)books.push([.13+.03*(k%2),.3+hash(k,x+y,5)*.22,.28,x-1.12+k*.19,y+.23,19]);
      
      if(y<1)props.plant(x+.65,19,0,{y:y+.28,scale:.45});}
    world.wall(x-1.4,x+1.4,18.7,19.9,2.8);
  }
  world.boxes(timber,shelves);for(let i=0;i<5;i++)world.boxes(lambert({map:detail.book,color:rgb(...[[156,109,83],[99,123,130],[162,146,108],[130,102,110],[113,129,92]][i])}),books.filter((_,j)=>j%5===i));
  for(const x of [-7,7]){
    const sofa=props.sofa(x,14.5,Math.PI,{color:0x646b67});sofa.scale.x=1.7;world.wall(x-1.9,x+1.9,13.8,15.3,1.3);
  }
  sign('EXIT',1.3,.4,0,3.2,19.65,Math.PI);sign('02:59',1.35,.45,3.5,1,-19.7);
  // Backdrop pleats and stage monitors, clear of the access steps.
  const pleats=[];for(let x=-6.5;x<=6.5;x+=.18)if(Math.abs(x)>4.45)pleats.push([.13,5.25,.12,x,3.125,-19.94]);world.boxes(flat([56,63,71]),pleats);
  world.boxes(dark,[[.7,.35,.48,-4.8,.68,-16.1],[.7,.35,.48,4.8,.68,-16.1],[.32,.025,.22,-2.95,1.73,-17.2],[.32,.22,.025,-2.95,1.85,-17.3]]);
  // A camera behind the audience, on a splayed three-legged tripod.
  world.box(.32,.25,.4,dark,5.9,1.65,-11.8);world.post(5.9,-11.8,.45,1.9);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const leg=world.box(.035,1.55,.035,steel,5.9+Math.cos(a)*.17,.8,-11.8+Math.sin(a)*.17);leg.rotation.z=Math.cos(a)*.22;leg.rotation.x=Math.sin(a)*.22;}

  // Window conversations and a compact lounge in the orange-wall recess.
  for(const [x,z,i,a] of [[10.4,.8,81,1],[11.1,2.2,82,3.7],[-10.1,-1.5,83,.12],[-10.0,.0,84,3.25]]){
    const f=person(i).place(x,0,z,a);i%2?f.talk(i):f.armsCrossed();scene.add(f.root);world.post(x,z,.32,1.8);
  }
  world.boxes(cloth,[[.85,.4,2.5,11.9,.38,3.8],[.24,1,2.5,12.4,.65,3.8],[1,.6,.18,11.9,.52,2.55],[1,.6,.18,11.9,.52,5.05]]);
  world.wall(11.35,12.7,2.4,5.2,1.2);
  scene.add(person(86,true).place(11.85,0,3.6,-Math.PI/2).sitOn(.58,'cup').root);
  props.cafeTable(10.2,4.2,0,{scale:1.4});world.post(10.2,4.2,.7,1.2);
  for(const x of [-7.6,0,7.6])for(const z of [-7.5,5.5]){
    world.boxes(timber,[ [.07,.09,7.2,x-1.34,.22,z],[.07,.09,7.2,x+1.34,.22,z] ]);
    world.box(.14,.05,.65,flat([175,174,159]),x,.84,z);
    world.boxes(dark,[-.2,0,.2].map(dz=>[.065,.008,.04,x,.87,z+dz]));
  }
  // Under-lit boards and ducts stay visible above the pendants.
  for(const x of [-7.6,0,7.6])for(const z of [-10,-5,3,8,14]){

  }
  for(const x of [-7.6,0,7.6])for(const z of [-10,-5,3,8,14]){
    const lamp=new THREE.PointLight(rgb(255,220,170),25,6,2);   // a tight warm pool under each pendant
    lamp.position.set(x,3.5,z);scene.add(lamp);
  }
  const nearFill=new THREE.PointLight(rgb(233,188,132),.65,7,1.8);nearFill.position.set(-2,2.7,-2.8);scene.add(nearFill);
  const screenSpill=new THREE.PointLight(rgb(227,199,148),.8,9,1.3);screenSpill.position.set(0,2.5,-18.5);scene.add(screenSpill);
  // Projector housing and lens: a physical source for the framed, imperfect slide.
  world.box(.62,.2,.5,steel,6,4.85,-8.5);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.10,16),new THREE.MeshBasicMaterial({map:glowTex,color:rgb(152,184,221)}));lens.position.set(6,4.85,-8.76);lens.rotation.y=Math.PI;scene.add(lens);
  // A thin volume between the ceiling lens and the screen. Dust crossing it
  // picks up the colour of the actual slide on the laptop.
  const projectionLight = [0xe6c697,0xb2d2e7,0xc1d0a7];
  const shaft = new THREE.BufferGeometry();
  const screenZ = -D+.08;
  shaft.setAttribute('position',new THREE.Float32BufferAttribute([
    ...lens.position.toArray(), -3.25,1.525,screenZ, 3.25,1.525,screenZ, 3.25,4.775,screenZ, -3.25,4.775,screenZ,
  ],3));
  shaft.setAttribute('color',new THREE.Float32BufferAttribute([
    1,1,1,.08, 1,1,1,.015, 1,1,1,.015, 1,1,1,.015, 1,1,1,.015,
  ],4));
  shaft.setIndex([0,1,2,0,2,3,0,3,4,0,4,1]);
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, fog:false });
  beamMat.forceSinglePass = true;
  scene.add(new THREE.Mesh(shaft,beamMat));
  const motes = new THREE.BufferGeometry(), moteCount = 72;
  const drift = new THREE.Float32BufferAttribute(new Float32Array(moteCount*3),3).setUsage(THREE.DynamicDrawUsage);
  const dust = new THREE.PointsMaterial({ size:.038, map:glowTex, opacity:.68, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false });
  motes.setAttribute('position',drift);
  const dustCloud = new THREE.Points(motes,dust); dustCloud.name = 'Projector dust'; dustCloud.frustumCulled = false; scene.add(dustCloud);
  const particles = Array.from({length:moteCount}, (_,i) => ({
    depth:.08+.9*hash(i,2,51), across:hash(i,3,51)*2-1, seed:hash(i,4,51)*2*Math.PI,
  }));
  world.ticks.push(t => {
    beamMat.color.setHex(projectionLight[slide]); dust.color.copy(beamMat.color); screenSpill.color.copy(beamMat.color);
    particles.forEach(({depth,across,seed},i) => {
      const x = 6*(1-depth)+depth*(3.05*across+.15*Math.sin(t*.35+seed));
      const y = 4.85+(3.15-4.85)*depth + depth*1.46*Math.sin(t*.18+seed);
      drift.setXYZ(i,x,y,-8.76+(screenZ+8.76)*depth);
    });
    drift.needsUpdate = true;
  });
  // ---------- where the chapter ends, and the captions ----------
  world.exit = { x: 1.2, z: -17.4, r: 1.3 };
  world.spots = memories.yc.map(({ at: [x, z], within, text }) => ({ x, z, r: within, text }));
  world.start = { x: -3, z: 14, heading: Math.PI, camYaw: 1.49, camPitch: -0.2 };
  // The establishing shot: down a dinner table at seat height, founders on both sides, the stage beyond.
  world.opening = { pos: [-.7, 1.95, -2], look: [0, .7, -19], drift: [0, 0, -0.9], seconds: 6, fov: 58 };

  // Small human-scale marks: laptop stickers, event posters and an analogue clock.
  const decals=[];for(const [w,h,d,x,y,z] of screens.filter(v=>Math.abs(v[3])>1))decals.push([.008,.055,.08,x+.014,y+.035,z+.05]);world.boxes(glow([229,125,61]),decals);
  const clockTex=drawTex(128,128,g=>{g.fillStyle='#ddd7c5';g.beginPath();g.arc(64,64,60,0,Math.PI*2);g.fill();g.strokeStyle='#302f2b';g.lineWidth=3;for(let i=0;i<12;i++){const a=i*Math.PI/6;g.beginPath();g.moveTo(64+Math.sin(a)*50,64+Math.cos(a)*50);g.lineTo(64+Math.sin(a)*55,64+Math.cos(a)*55);g.stroke();}g.lineWidth=5;g.beginPath();g.moveTo(40,48);g.lineTo(64,64);g.lineTo(91,31);g.stroke();});
  panel(.9,.9,lambert({map:clockTex}),12.9,4.3,-9.5,-Math.PI/2);
  for(const z of [-16,8,16])sign(z===8?'OFFICE HOURS':z===16?'BUILD / LAUNCH':'TALK TO USERS',2.2,.75,-12.75,2.8,z,Math.PI/2);
  scene.traverse(o=>{if(o.isMesh&&o.material&&!Array.isArray(o.material)&&!o.material.isMeshBasicMaterial&&!o.material.map&&!o.material.transparent){o.material=o.material.clone();o.material.map=detail.metal;o.material.needsUpdate=true;}});
  props.laptop(.25,8.7,2.6,{y:.81});props.cup(-.2,9.0,0,{y:.81});props.book(.05,8.2,.5,{y:.81});props.takeaway(-.25,8.45,.3,{y:.81});props.plate(.3,9.2,0,{y:.81});
  props.build();
  // People close to the camera in the long views, cut by the frame edge the way the reference frames its crowds.
  for (const [x, z, facing, task] of [[-2.15, 16.1, 3.5, 'cup'], [-4.25, 12.3, 2.6, 'arms'], [2.2, -13.3, 0.45, 'cup'], [1.3, 16.4, 3.0, 'laptop']]) {
    const f = person(0).place(x, world.ground(x, z), z, facing);
    if (task === 'cup') f.drink(); else if (task === 'arms') f.armsCrossed(); else f.carry('laptop', 1.2);
    scene.add(f.root); world.post(x, z, 0.35, 1.9);
  }
  // Event badges follow each final pose before its figure is frozen into scene meshes.
  const badgeMat=lambert({map:drawTex(64,96,g=>{
    g.fillStyle='#d4cdb6';g.fillRect(0,0,64,96);g.fillStyle='#b86734';g.fillRect(0,0,64,23);
    g.fillStyle='#4b504b';g.fillRect(10,36,24,5);g.fillRect(10,48,43,3);g.fillRect(10,58,32,3);
  })}),cordMat=flat([36,34,29]);
  for(const f of stagedPeople){
    if(movingRoots.has(f.root)||f.root.userData.lookKey%3===2)continue;
    const c=f.localJoint('Spine2'),n=f.localJoint('Neck');
    const front=c.z+(f.look.physique==='heavy'?.27:.22), y=c.y-.08;
    const path=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.09,n.y-.03,n.z+.07),new THREE.Vector3(-.07,c.y-.06,front),
      new THREE.Vector3(0,y,front+.015),new THREE.Vector3(.07,c.y-.06,front),new THREE.Vector3(.09,n.y-.03,n.z+.07)]);
    const cord=new THREE.Mesh(new THREE.TubeGeometry(path,10,.006,4,false),cordMat);
    const badge=new THREE.Mesh(new THREE.BoxGeometry(.105,.145,.009),badgeMat);
    badge.position.set(0,y-.065,front+.02);f.root.add(cord,badge);
    const chest=f.bones?.Spine2?.isBone===true ? f.bones.Spine2 : f.spine;
    chest.attach(cord);chest.attach(badge);
  }
  // Merge static cards with shared materials, preserving dynamic and skinned people.
  scene.updateMatrixWorld(true);
  const frozenMaterials=new Map();
  const frozenRanges = new Map();
  world.contacts=[];
  // Freeze only stationary NPCs at their authored pose. Keep walkers skinned.
  for(const root of [...scene.children])if(root.name==='Pedestrian'&&!movingRoots.has(root)){
    world.contacts.push([root.position.x,world.ground(root.position.x,root.position.z),root.position.z,.85]);
    const bystander=bakedBystander(root.position), parts=[];
    world.bakedBystanders.push(bystander);
    // Keep the posed rig off-scene. A knockdown temporarily swaps just this
    // guest's baked vertex ranges for that rig, then restores the shared batches.
    const guest = new THREE.Group();
    guest.name = root.name;
    guest.position.copy(root.position);
    guest.rotation.copy(root.rotation);
    guest.scale.copy(root.scale);
    Object.defineProperty(guest.userData, 'frozenRoot', { value: root });
    guest.userData.chestHeight = chestHeight(root);
    guest.userData.frozenRanges = [];
    scene.add(guest);
    root.updateMatrixWorld(true);let partIndex=0;
    root.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.clone();
      geo.setAttribute('authoredPosition',o.geometry.attributes.position.clone());
      if(o.material.customProgramCacheKey?.().startsWith('people-')){
        const original=o.material.onBeforeCompile;const mat=o.material.clone();mat.onBeforeCompile=shader=>{original(shader);shader.vertexShader='attribute vec3 authoredPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('headPoint=position','headPoint=authoredPosition').replace('restPoint=position','restPoint=authoredPosition');};mat.customProgramCacheKey=()=>o.material.customProgramCacheKey()+'-frozen';o.userData.frozenMaterial=mat;
      }
      if(o.isSkinnedMesh){o.skeleton.update();const p=geo.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}geo.deleteAttribute('skinIndex');geo.deleteAttribute('skinWeight');geo.computeVertexNormals();}
      geo.applyMatrix4(o.matrixWorld);const key=o.material.customProgramCacheKey?.().startsWith('people-')
        ? root.userData.lookKey+':'+partIndex+++':'+o.material.color?.getHexString()
        : [o.material.type,o.material.map?.uuid,o.material.color?.getHexString(),o.material.side,o.material.transparent,o.material.opacity].join(':');
      if(!frozenMaterials.has(key))frozenMaterials.set(key,o.userData.frozenMaterial||o.material);
      const mat=frozenMaterials.get(key);if(mat.emissive)mat.emissive.copy(mat.color).multiplyScalar(.40);const m=new THREE.Mesh(geo,mat);m.userData.noShot=true;scene.add(m);
      const range = { position: geo.attributes.position, first: 0, count: geo.attributes.position.count };
      guest.userData.frozenRanges.push(range);
      frozenRanges.set(m, range);
      m.userData.bystander=bystander;parts.push({source:o,mesh:m});
    });
    bakeBraceOffsets(root.userData.figure,parts,bystander);root.removeFromParent();
  }
  const batches=new Map();
  for(const m of [...scene.children])if(m.isMesh&&!m.isInstancedMesh&&!m.isSkinnedMesh&&!Array.isArray(m.material)&&m.geometry.attributes.normal&&m.geometry.attributes.uv){
    const key=m.material.uuid+(m.userData.noShot?'-figure':''); if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);
  }
  for(const meshes of batches.values())if(meshes.length>1){
    const attrs={position:[],normal:[],uv:[],authoredPosition:[]};
    const ranges=[];
    const mergedRanges = [];
    for(const m of meshes){
      const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld);
      if(m.userData.bystander)ranges.push({person:m.userData.bystander,first:attrs.position.length,delta:g.attributes.braceOffset.array});
      const range = frozenRanges.get(m);
      if (range) {
        range.first = attrs.position.length / 3;
        range.count = g.attributes.position.count;
        mergedRanges.push(range);
      }
      for(const key of Object.keys(attrs))attrs[key].push(...(g.attributes[key]||g.attributes.position).array);
      g.dispose();m.removeFromParent();
    }
    const geo=new THREE.BufferGeometry();for(const [key,data]of Object.entries(attrs))geo.setAttribute(key,new THREE.Float32BufferAttribute(data,key==='uv'?2:3));
    for (const range of mergedRanges) range.position = geo.attributes.position;
    for(const {person,first,delta} of ranges)person.bind(geo,first,delta);
    const m=new THREE.Mesh(geo,meshes[0].material);m.renderOrder=meshes[0].renderOrder;m.userData.noShot=meshes[0].userData.noShot;scene.add(m);
  }
  for(const m of scene.children)if(m instanceof THREE.Mesh && m.userData.bystander){
    m.userData.bystander.bind(m.geometry,0,m.geometry.attributes.braceOffset.array);
    m.geometry.deleteAttribute('braceOffset');delete m.userData.bystander;
  }

  placeRadio(world, -.05, .812, 9.26, -.18);

  // The orange-capped magnetic marker hangs on the rear whiteboard until picked up.
  const markerPen = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .22, 8), flat([225,220,205]));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .09, 8), flat(ORANGE));
  cap.position.y = .115; markerPen.add(barrel, cap);
  markerPen.position.set(12.33, 1.22, 12.54); markerPen.rotation.x = 1.48;
  addPickup(world, inventory, 'yc-marker', markerPen, 'Take whiteboard marker');
  return world;
}
