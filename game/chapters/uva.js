// Chapter 1: the Lawn at UVA on a fall evening.
// North is -Z. You start near the middle of the Lawn and look north at the Rotunda.
// Sizes are in metres and compressed, like a game map: the real Lawn is about half again as long.
import * as THREE from 'three';
import { rgb, hash, fbm, mix3, pixelTex, drawTex, reuse, makeSky, addLight } from 'life/engine/look.js';
import { World, strip as rawStrip, gable } from 'life/engine/world.js';
import { Figure } from 'life/engine/figure.js';
import { Trees } from 'life/engine/trees.js';
import { CREAM, bricks } from 'life/engine/paint.js';
import { Animals } from 'life/engine/animals.js';
import { Props } from 'life/engine/props.js';
import { Bake } from 'life/engine/bake.js';
import { uvaTexture, uvaBrick, uvaDetail } from 'life/chapters/uva-textures.js';
import { memories } from 'life/story.js';
import { placeRadio } from 'life/engine/portable-radio.js';
import { addLooseLeaves } from 'life/engine/ground-details.js';

// The Lawn steps up toward the Rotunda in three terraces.
const ease=t=>t*t*(3-2*t);
const terrace = z => z>49?0:z>45?ease((49-z)/4):z>-3?1:z>-7?1+ease((-3-z)/4):2;
// Sample terrace ramps closely and assign the same analytic normal across each
// width: no enormous diagonal interpolated between unlike corner normals.
function strip(xa,xb,rows,mat,tile,lift=0){
  const dense=[];
  for(let i=0;i<rows.length-1;i++){
    const [a]=rows[i],[b]=rows[i+1],count=Math.max(1,Math.ceil((a-b)*2));
    for(let j=0;j<count;j++){const z=a+(b-a)*j/count;dense.push([z,terrace(z)]);}
  }const z=rows.at(-1)[0];dense.push([z,terrace(z)]);
  const mesh=rawStrip(xa,xb,dense,mat,tile,lift),p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<p.count;i++){const z=p.getZ(i),d=(terrace(z+.01)-terrace(z-.01))/.02,v=new THREE.Vector3(0,1,-d).normalize();n.setXYZ(i,v.x,v.y,v.z);}
  return mesh;
}
const PAVILIONS = [60, 34, 8, -18, -42]; // where the five pavilions on each side stand, along z

function playCatch(world, thrower, receiver) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .035, 16),
    new THREE.MeshBasicMaterial({ map: uvaDetail('trim'), color: rgb(235,156,61) }));
  disc.name = 'Lawn disc';
  world.scene.add(disc);
  const hand = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3();
  const { x, y, z } = thrower.root.position, reach = 6;
  const students = [thrower, receiver].map(figure => ({ figure, facing: figure.root.rotation.y }));
  let sender = thrower, catcher = receiver;
  let state = 'rally', elapsed = 0, visitor = null;
  function pass(next) {
    start.copy(disc.position);
    state = next;
    elapsed = 0;
  }
  world.interactions.push({
    x, y: y + 2.1, z, r: reach,
    get label() { return state === 'rally' ? 'Call for a pass' : state === 'held' ? 'Throw it back' : null; },
    act(player) {
      visitor = player;
      if (state === 'held') pass('return');
      else state = 'called'; // Finish the throw already in the air. Whoever catches it passes to you.
    },
  });
  world.ticks.push((t, dt) => {
    elapsed += dt;
    if (visitor && state !== 'return' && Math.hypot(visitor.pos.x - x, visitor.pos.z - z) > reach + .5) {
      if (state === 'called') { state = 'rally'; visitor = null; }
      else pass('return');
    }
    const responder = state === 'called' ? catcher : sender;
    for (const { figure, facing } of students) {
      const root = figure.root;
      const toward = visitor && figure === responder ? Math.atan2(visitor.pos.x - root.position.x, visitor.pos.z - root.position.z) : facing;
      const turn = toward - root.rotation.y;
      root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-8 * dt));
    }
    sender.arms[1].hand.getWorldPosition(hand);
    if (state === 'rally' || state === 'called') {
      const u = Math.min(1, elapsed / 1.25);
      disc.position.lerpVectors(hand, catcher.arms[1].hand.getWorldPosition(end), u);
      disc.position.y += Math.sin(Math.PI * u) * 1.4;
      if (u === 1) {
        [sender, catcher] = [catcher, sender];
        pass(visitor ? 'incoming' : 'rally');
      }
    } else {
      if (state === 'return') end.copy(hand);
      else visitor.figure.arms[1].hand.getWorldPosition(end);
      if (state === 'held') disc.position.copy(end);
      else {
        const u = Math.min(1, elapsed / .95);
        disc.position.lerpVectors(start, end, u);
        disc.position.y += Math.sin(Math.PI * u) * 1.15;
        if (u === 1) {
          if (state === 'return') { state = 'rally'; visitor = null; elapsed = 0; }
          else state = 'held';
        }
      }
    }
    disc.rotation.set(0, t * 7, state === 'held' ? 0 : .15);
  });
}

export function buildUva() {
  const world = new World(), { scene } = world;
  world.fov=64;
  world.grade = { multiply: [255, 242, 222], add: [10, 7, 3] };
  world.peopleFill = [28, 19, 10];
  world.contact = .34;
  world.shadow = { range: 55, size: 4096, keepPainted: true }; // low-angle cast shadows plus tree contact shade

  world.ground = (x, z) => {
    if (Math.abs(x) < 9.5 && z < -49 && z >= -57) return 2 + Math.min(14, Math.floor((-49-z)/ (8/14))+1)*.25; // the Rotunda steps
    if (Math.abs(x) < 9.5 && z < -57 && z > -64.5) return 5.5;                      // the portico floor
    return terrace(z);
  };

  // Sunset palette sampled from the reference clip: pink overhead, orange at the horizon, warm low light.
  scene.fog = new THREE.Fog(rgb(216, 163, 121), 85, 480);
  world.sky = makeSky([[0,[208,181,185]],[12,[208,180,194]],[18,[208,180,194]],[25,[160,158,235]],[30,[146,158,255]],[40,[190,178,247]],[55,[188,174,247]],[90,[180,168,240]]]);
  // Preserve the approved paint colours while the rest of the scene uses a lighter grade.
  const keepSunsetPaint = material => {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        gl_FragColor.rgb = (gl_FragColor.rgb * vec3(1.,214./255.,150./255.) + vec3(28.,7.,-3.)/255.) / vec3(1.,242./255.,222./255.);
        #include <dithering_fragment>`);
    };
    material.customProgramCacheKey = () => 'uva-approved-sunset-paint';
    return material;
  };
  keepSunsetPaint(world.sky.material);
  scene.add(world.sky);
  addLight(scene, [94, 87, 73], [220, 155, 100], [-0.75, 0.30, 0.65]); // the sun is low in the west, a little behind you

  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const grassTex = uvaDetail('grass');grassTex.anisotropy=8;
  const pathTex = uvaTexture('path');
  const clockTex = drawTex(256, 256, (g) => { // the pediment, with its clock
    g.clearRect(0,0,256,256);g.fillStyle='#454139';g.beginPath();g.arc(128,128,122,0,Math.PI*2);g.fill();
    g.fillStyle='#e7dcc3';g.beginPath();g.arc(128,128,109,0,Math.PI*2);g.fill();
    g.strokeStyle='#423a31';g.lineWidth=5;
    for(let i=0;i<12;i++){const a=i*Math.PI/6;g.beginPath();g.moveTo(128+86*Math.sin(a),128-86*Math.cos(a));g.lineTo(128+99*Math.sin(a),128-99*Math.cos(a));g.stroke();}
    g.lineWidth=8;g.beginPath();g.moveTo(128,128);g.lineTo(128,52);g.moveTo(128,128);g.lineTo(174,157);g.stroke();
  });

  const white = lambert({ map: uvaDetail('stone'), color: rgb(228, 255, 245), emissive:rgb(8,13,25) }), stone = lambert({ map: uvaDetail('stone'), color: rgb(220, 214, 200) });
  const pavilionGable = lambert({ map: reuse(uvaDetail('stone'), 5, 2), color: rgb(228, 255, 245), emissive: rgb(8, 13, 25) });   // the same stone at the scale of the wall below it
  const slate = lambert({ map: uvaDetail('roof'), color: rgb(146, 141, 143), flatShading: true });
  const brickCache=new Map();
  const brick = (rx, ry) => {const k=`${rx}:${ry}`;if(!brickCache.has(k))brickCache.set(k,lambert({map:uvaBrick(rx*2,ry*2)}));return brickCache.get(k);}; // rx, ry count 3.2 m units

  // White columns, their bases and caps, and other trim are collected here and drawn in two batches.
  const whitePosts = [], whiteBoxes = [], stoneBoxes = [], friezeBoxes = [];
  const soffitMat = lambert({ map: uvaDetail('coffers'), emissive: rgb(46, 38, 26), emissiveMap: uvaDetail('coffers') });
  const friezeMat = lambert({ map: uvaDetail('stone'), color: rgb(196, 214, 206), emissive: rgb(6, 10, 19) });   // the white trim, a tone deeper
  const lunetteGlass = new THREE.MeshBasicMaterial({ map: drawTex(64, 32, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 32); grad.addColorStop(0, '#2c3038'); grad.addColorStop(1, '#5a4a44');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 32);
    g.strokeStyle = '#d9d2bf'; g.lineWidth = 1.5;   // glazing bars fanning from the sill
    for (const a of [.52, 1.05, 1.57, 2.09, 2.62]) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 40, 32 - Math.sin(a) * 40); g.stroke(); }
    g.beginPath(); g.arc(32, 32, 15, Math.PI, 0); g.stroke();
  }) });
  const column = (x, y, z, r, h) => {
    // Shallow carved flutes in the shaft, not painted cloudy bands.
    const shaft=new THREE.CylinderGeometry(r*.91,r,h-.55,80,1);
    const sp=shaft.attributes.position;
    for(let i=0;i<sp.count;i++){const a=Math.atan2(sp.getX(i),sp.getZ(i)),k=1-.055*(.5+.5*Math.cos(a*20));sp.setX(i,sp.getX(i)*k);sp.setZ(i,sp.getZ(i)*k);}
    shaft.computeVertexNormals();
    const sm=new THREE.Mesh(shaft,white);sm.position.set(x,y+h/2,z);sm.userData.metreUV=.8;scene.add(sm);
    whiteBoxes.push([r * 2.7, 0.3, r * 2.7, x, y + 0.15, z], [r * 2.9, 0.35, r * 2.9, x, y + h - 0.17, z]);
    // Torus-like stacked collars, a spreading capital and necking.
    for (const [dy, rr, hh] of [[0.32,1.28,.14],[0.49,1.12,.12],[h-.65,1.07,.13],[h-.43,1.35,.22]]) {
      whitePosts.push([r*rr,hh,r*rr,x,y+dy,z]);
    }
    if (h > 8) for (const dx of [-1,1]) for (const dz of [-1,1])
      whitePosts.push([r*.25,.35,r*.25,x+dx*r*.7,y+h-.48,z+dz*r*.7]);
    world.post(x, z, r + 0.08);
  };

  // ---------- ground ----------
  scene.add(strip(-170, 170, [[140, 0], [49, 0], [45, 1], [-3, 1], [-7, 2], [-130, 2]], keepSunsetPaint(lambert({ map: grassTex, color:rgb(152,219,255), emissiveMap:grassTex, emissive:rgb(25,45,50) })), 4.5));
  for (const side of [-1, 1]) { // brick walks under the colonnades
    scene.add(strip(side * 23, side * 29.1, [[76, 0], [49, 0], [45, 1], [-3, 1], [-7, 2], [-49, 2]], lambert({ map: pathTex, color:rgb(230,230,235), emissiveMap:pathTex, emissive:rgb(92,83,76) }), 1.6, 0.04));
  }

  // ---------- colonnades of student rooms, one run per terrace ----------
  const chimneys = [];
  for (const side of [-1, 1]) for (const [za, zb, y] of [[47, 76, 0], [-5, 47, 1], [-49, -5, 2]]) {
    const len = zb - za, zc = (za + zb) / 2;
    world.box(1, 3.5, len, [lambert({map:uvaTexture('room',len/6.4,1)}),lambert({map:uvaTexture('room',len/6.4,1)}),brick(.2,len/6.4),brick(.2,len/6.4),brick(.2,.55),brick(.2,.55)], side * 29.5, y + 1.75, zc);
    world.wall(side * 29, side * 30, za, zb);
    // A continuous stone plinth grounds the actual student-room wall.
    stoneBoxes.push([.22,.30,len,side*28.88,y+.15,zc]);
    // Cover the atlas's mossy top margin with a real slate coping at roof scale.
    const coping=world.box(.10,.43,len,slate,side*28.94,y+3.30,zc);coping.userData.metreUV=1.2;
    whiteBoxes.push([.55,.25,len,side*23.95,y+4.45,zc]);
    whiteBoxes.push([6.25, 0.55, len, side * 27.1, y + 4.48, zc]);
    world.box(6.4,.18,len,slate,side*27.1,y+4.83,zc);
    const ceiling = world.box(5.95,.025,len,lambert({map:uvaDetail('coffers'),emissive:rgb(12,14,17)}),side*27.2,y+4.185,zc);
    ceiling.userData.metreUV=2.4;
    for (let z = za + 1.6; z < zb; z += 3.2) {
      whiteBoxes.push([1.4,.2,.18,side*24.3,y+4.38,z]);
      if (PAVILIONS.some((pz) => Math.abs(z - pz) < 6.6)) continue; // the pavilions bring their own, taller columns
      column(side * 23.8, y, z, 0.24, 4.3);
    }
    for (let z = za + 3.2; z < zb; z += 6.4) chimneys.push([0.9, 1.5, 0.7, side * 29.4, y + 5.65, z]);
  }
  world.boxes(brick(0.4, 0.6), chimneys);

  // ---------- pavilions ----------
  const hip = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4);
  const pavMat = brick(4,3); // modelled glazing over brick keeps distant walls sharp
  PAVILIONS.forEach((z0, i) => {
    for (const side of [-1, 1]) {
      const y = terrace(z0), x = side * 33.75;
      const sideBrick=brick(3,3);
      world.box(9.5, 9.5, 13, [pavMat,pavMat,sideBrick,sideBrick,sideBrick,sideBrick], x, y + 4.75, z0);
      world.wall(side * 29, side * 38.5, z0 - 6.5, z0 + 6.5);
      // Narrow end piers use masonry at brick scale, not an enlarged facade crop.
      for(const dz of [-5.85,5.85])world.box(.025,9.2,1.3,brick(.4,2.875),side*28.985,y+4.6,z0+dz);
      whiteBoxes.push([10.4, 0.5, 13.9, x, y + 9.6, z0]);
      const roof = new THREE.Mesh(hip, slate);
      roof.scale.set(7.6, 2.8, 10.1); roof.position.set(x, y + 11.25, z0); scene.add(roof);
      const order = (i * 2 + (side > 0 ? 1 : 0)) % 5;
      const bays = order === 1 ? [-4.8, 4.8] : order === 3 ? [-4.8,-2.9,2.9,4.8] : [-4.8,-1.6,1.6,4.8];
      for (const dz of bays) column(side * 23.9, y, z0 + dz, order === 2 ? .30 : .24, 8.2);
      {
        whiteBoxes.push([3.8,.46,12.4,side*25,y+4.56,z0]);
        for (let dz=-5.8; dz<=5.8; dz+=.55) whitePosts.push([.045,1,.045,side*23.5,y+5.15,z0+dz]);
        whiteBoxes.push([.14,.14,12.2,side*23.5,y+5.65,z0]);
      }
      whiteBoxes.push([3.6, 1.1, 12.4, side * 25, y + 8.75, z0]);
      // The entablature facing the Lawn: an architrave fillet, a frieze in a second tone with triglyphs, and a row of dentils.
      whiteBoxes.push([.07,.07,12.44,side*23.17,y+8.52,z0],[.1,.07,12.5,side*23.16,y+9.24,z0]);
      friezeBoxes.push([.03,.42,12.36,side*23.19,y+8.79,z0]);
      for(let dz=-5.9;dz<=5.91;dz+=1.18)whiteBoxes.push([.05,.4,.34,side*23.17,y+8.79,z0+dz]);
      for(let dz=-6.1;dz<=6.11;dz+=.305)whiteBoxes.push([.1,.12,.15,side*23.15,y+9.12,z0+dz]);
      if ((i + (side > 0 ? 1 : 0)) % 3 !== 1) { // every other pavilion has a pediment, the rest a flat parapet
        const g = gable(12.4, 2.6, 3.6, pavilionGable, slate);
        g.rotation.y = Math.PI / 2; g.position.set(side * 25, y + 9.3, z0); scene.add(g);
        // Courses of small blocks, each course half a block out of step with the one below, around a half-round window.
        [[.32,10.8],[.67,9.2],[1.02,7.5],[1.37,5.8],[1.72,4.1],[2.07,2.4]].forEach(([rise,width],course)=>{
          stoneBoxes.push([.03,.028,width,side*23.185,y+9.3+rise,z0]);
          for(let dz=(course%2?.29:0);dz<width/2-.2;dz+=.58)for(const s of dz?[-1,1]:[1]){
            if(Math.abs(dz)<.95&&rise<1.3)continue;   // the window
            stoneBoxes.push([.014,.30,.014,side*23.18,y+9.3+rise-.18,z0+s*dz]);
          }
        });
        const lunette=new THREE.Mesh(new THREE.CircleGeometry(.78,14,0,Math.PI),lunetteGlass);
        lunette.rotation.y=-side*Math.PI/2;lunette.position.set(side*23.16,y+9.62,z0);scene.add(lunette);
        const arch=new THREE.Mesh(new THREE.TorusGeometry(.8,.065,4,14,Math.PI),white);
        arch.rotation.y=-side*Math.PI/2;arch.position.set(side*23.15,y+9.62,z0);arch.userData.metreUV=.8;scene.add(arch);
        whiteBoxes.push([.06,.07,1.74,side*23.15,y+9.6,z0],[.05,.74,.05,side*23.15,y+9.98,z0]);
        whiteBoxes.push([3.9,.16,12.8,side*25,y+9.38,z0],[4,.12,13,side*25,y+9.57,z0]);
      } else whiteBoxes.push([3.6, 0.9, 12.4, side * 25, y + 9.7, z0]);
    }
  });

  // ---------- the Rotunda ----------
  const ROT_Z = -75, FLOOR = 5.5;
  const round = (r, h, y, mat, sides = 24) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), mat);
    m.position.set(0, y, ROT_Z); scene.add(m); return m;
  };
  round(12.3, 3.5, 3.75, brick(24, 1.2));                              // base
  round(11.5, 14, FLOOR + 7, lambert({map:uvaTexture('drum',8,1)})); // brick drum
  round(11.9, 1.5, 20.25, white);                                      // cornice
  round(11.2, 0.8, 21.4, stone); round(10.4, 0.7, 22.15, stone);       // steps up to the dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), lambert({map:uvaDetail('stone'),color:rgb(245,239,221)}));
  dome.scale.y = 0.80; dome.position.set(0, 22.5, ROT_Z); scene.add(dome);
  round(1.5, 0.5, 30.9, stone, 10);
  // Raised standing seams trace the pale dome; three horizontal seams follow its curvature.
  const seamMat=lambert({map:uvaDetail('stone'),color:rgb(234,224,204)});
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10,points=[];
    for(let j=0;j<=16;j++){const p=j*Math.PI/32;points.push(new THREE.Vector3(10.23*Math.sin(p)*Math.cos(a),22.5+8.18*Math.cos(p),ROT_Z+10.23*Math.sin(p)*Math.sin(a)));}
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.028,4,false),seamMat));
  }


  world.post(0, ROT_Z, 12);

  // Portico: a platform, wide steps down to the Lawn, six columns and the clock pediment.
  stoneBoxes.push([19, FLOOR, 7.5, 0, FLOOR / 2, -60.75]);
  const treadMat=keepSunsetPaint(lambert({map:uvaDetail('tread'),color:rgb(220,250,255)})), riserMat=keepSunsetPaint(lambert({map:uvaDetail('trim'),color:rgb(145,170,210)}));
  const stepDepth = 8 / 14, rise = 0.25, capHeight = 0.045, lip = 0.03;
  for(let i=0;i<14;i++){
    const bottom = 2 + i * rise, front = -49 - i * stepDepth;
    // The riser stops under the cap. Its lip projects forward only, so the
    // last tread meets the portico without painting over the landing.
    const step = world.box(19, rise-capHeight, stepDepth, riserMat, 0, bottom+(rise-capHeight)/2, front-stepDepth/2);
    const cap = world.box(19, capHeight, stepDepth+lip, treadMat, 0, bottom+rise-capHeight/2, front-(stepDepth-lip)/2);
    step.userData.metreUV = cap.userData.metreUV = 1.2;
  }
  for (const side of [-1, 1]) { // low walls either side of the steps
    stoneBoxes.push([1.2, 6.2, 7.5, side * 10.1, 3.1, -60.75], [1.2, 4.2, 8, side * 10.1, 2.1, -53]);
    world.wall(side * 9.5, side * 10.7, -64.5, -49);
  }
  for (const x of [-8, -4.8, -1.6, 1.6, 4.8, 8]) column(x, FLOOR, -57.9, 0.55, 9.5);
  for (const x of [-8, 8]) column(x, FLOOR, -61.3, 0.55, 9.5);
  whiteBoxes.push([18.4, 1.8, 8.6, 0, 15.9, -61.2]);
  const porticoCeiling=world.box(18.35,.03,8.55,lambert({map:uvaDetail('coffers')}),0,14.985,-61.2);porticoCeiling.userData.metreUV=1.65;
  const pediment = gable(18.4, 3.6, 8.6, white, slate);
  pediment.position.set(0, 16.8, -61.2); scene.add(pediment);
  const clock=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.45),lambert({map:clockTex,transparent:true}));clock.position.set(0,18.15,-56.88);scene.add(clock);
  world.box(13, 9.5, 0.6, lambert({map:uvaTexture('drum')}), 0, FLOOR + 4.75, -63.2); // in front of the curve of the drum
  world.wall(-9.5, 9.5, -66, -62.9);

  // Low wings either side, and walls that close the corners of the Lawn.
  for (const side of [-1, 1]) {
    world.box(19, 4, 9, brick(6, 1.3), side * 21, 4, -73);
    whiteBoxes.push([19.6, 0.5, 9.6, side * 21, 6.2, -73], [19, 0.8, 0.3, side * 21, 6.8, -68.6]);
    for (let k = 0; k < 6; k++) column(side * (12.6 + 3.3 * k), 2, -68.1, 0.3, 3.8);
    world.wall(side * 11.5, side * 30.5, -77.5, -68.5);
    world.box(1, 3, 21, brick(6.5, 1), side * 29.5, 3.5, -59.5);
    world.wall(side * 29, side * 30, -70, -49);
  }

  // ---------- Old Cabell Hall closes the south end ----------
  world.box(46, 13, 14, lambert({map:uvaTexture('cabell')}), 0, 6.5, 97);
  world.wall(-23, 23, 90, 104);
  for (const x of [-13, -7.8, -2.6, 2.6, 7.8, 13]) column(x, 0, 88, 0.6, 10.5);
  world.wall(-14, 14, 87.3, 90);
  whiteBoxes.push([29, 1.8, 3.6, 0, 11.4, 88.6]);
  const southPediment = gable(29, 4, 3.6, white, slate);
  southPediment.rotation.y = Math.PI; southPediment.position.set(0, 12.3, 88.6); scene.add(southPediment);
  for (const side of [-1, 1]) {
    world.box(1, 3, 14, brick(4.4, 1), side * 29.5, 1.5, 83); world.wall(side * 29, side * 30, 76, 90);
    world.box(7, 3, 1, brick(2.2, 1), side * 26.5, 1.5, 90.5); world.wall(side * 23, side * 30, 90, 91);
  }

  addLawnDetail();
  // Expand trim once, then merge below; each surface keeps metre-scaled UVs.
  for(const [r,h,,x,y,z] of whitePosts){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),white);m.position.set(x,y,z);m.userData.metreUV=.8;scene.add(m);}
  for(const [mat,items] of [[white,whiteBoxes],[stone,stoneBoxes],[friezeMat,friezeBoxes]])for(const [w,h,d,x,y,z] of items){const m=world.box(w,h,d,mat,x,y,z);m.userData.metreUV=1.2;}

  // Detail is batched by material; local facade coordinates face the Lawn.
  function addLawnDetail() {
    const dark = lambert({map:uvaDetail('wood'),color:rgb(75,165,95),emissive:rgb(4,13,3)}), glass = lambert({map:uvaDetail('iron')});
    const wood = lambert({map:uvaDetail('wood')}), iron = lambert({map:uvaDetail('iron')});
    const darkBoxes=[], doorBoxes=[], glassBoxes=[], woodBoxes=[], ironBoxes=[], ironPosts=[], warmBoxes=[];
    const warm = new THREE.MeshBasicMaterial({map:uvaDetail('trim'),color:rgb(255,197,120)});
    // u runs along a facade; d points out of it.
    const face = (x,y,z,nx,nz) => (out,u,v,w,h,d,depth=0) =>
      out.push([Math.abs(nz)*w+Math.abs(nx)*d,h,Math.abs(nx)*w+Math.abs(nz)*d,
        x+nz*u+nx*depth,y+v,z-nx*u+nz*depth]);
    const window = (f,u,v,w=1.2,h=2,shutters=true,lit=false) => {
      f(lit?warmBoxes:glassBoxes,u,v,w,h,.10,.04);
      for(const du of [-w/2,w/2]) f(whiteBoxes,u+du,v,.12,h+.22,.18,.13);
      for(const dv of [-h/2,h/2]) f(whiteBoxes,u,v+dv,w+.3,.12,.22,.15);
      f(whiteBoxes,u,v,.055,h,.12,.18);
      for(const dv of [-h/6,h/6]) f(whiteBoxes,u,v+dv,w,.055,.12,.18);
      f(stoneBoxes,u,v-h/2-.12,w+.48,.16,.42,.16);
      if(shutters) for(const side of [-1,1]) {
        f(darkBoxes,u+side*(w/2+.39),v,.5,h+.1,.14,.10);
        for(let k=0;k<7;k++) f(darkBoxes,u+side*(w/2+.39),v-h/2+.16+k*h/7,.56,.045,.20,.15);
      }
    };
    // Shared door fan texture; avoid per-door material allocations.
    const fanTex=drawTex(64,32,g=>{
      g.clearRect(0,0,64,32);g.fillStyle='#c4ad81';g.beginPath();g.arc(32,32,29,Math.PI,2*Math.PI);g.fill();
      g.strokeStyle='#e9deca';g.lineWidth=3;g.stroke();
      for(let a=0;a<=Math.PI;a+=Math.PI/6){g.beginPath();g.moveTo(32,32);g.lineTo(32+28*Math.cos(a),32-28*Math.sin(a));g.stroke();}
    });
    const fanMat=lambert({map:fanTex,transparent:true,side:THREE.DoubleSide});
    const fanGeo=new THREE.PlaneGeometry(1.5,.75);
    const doorAt=(f,x,y,z,nx,nz)=>{
      f(doorBoxes,0,1.2,1.25,2.4,.15,.1);
      for(const u of [-.73,.73])f(whiteBoxes,u,1.3,.16,2.6,.25,.18);
      f(whiteBoxes,0,2.65,1.65,.14,.3,.18);
      for(const u of [-.29,.29])for(const v of [.55,1.5]) f(woodBoxes,u,v,.47,.7,.06,.19);
      f(warmBoxes,.45,1.2,.07,.07,.07,.22);
      const mesh=new THREE.Mesh(fanGeo,fanMat);mesh.rotation.y=Math.atan2(nx,nz);
      mesh.position.set(x+nx*.18,y+2.98,z+nz*.18);scene.add(mesh);
      f(stoneBoxes,0,.08,1.9,.16,.7,.3);
    };
    for(const side of [-1,1]) {
      for(const [za,zb,y] of [[47,76,0],[-5,47,1],[-49,-5,2]]) {
        // Balustrade above the student-room arcade.
        for(const dy of [3.95,4.85])for(let z=za;z<zb;z+=.5){
          if(PAVILIONS.some(p=>Math.abs(z+.25-p)<6.4))continue;
          whiteBoxes.push([.23,.17,Math.min(.5,zb-z),side*23.5,y+dy,z+.25]);
        }
        for(let z=za+.3;z<zb;z+=.72) {
          if(PAVILIONS.some(p=>Math.abs(z-p)<6.8))continue;
          whitePosts.push([.065,.8,.065,side*23.5,y+4.4,z]);
        }
        for(let z=za+3;z<zb-2;z+=6.4){
          if(PAVILIONS.some(p=>Math.abs(z-p)<7))continue;
          const x=side*28.97,f=face(x,y,z,-side,0);
          // Student-room doors, glazing and shutters are painted into the facade.
          // Roof coping and chimney pots.
          stoneBoxes.push([1.15,.18,.95,side*29.4,y+6.45,z]);
        }
      }
      PAVILIONS.forEach((z,i)=>{
        const y=terrace(z), x=side*28.97, f=face(x,y,z,-side,0);
        // Selected upper rooms are occupied, with mullions retained.
        for(const u of [-3.4,0,3.4])for(const v of [2.3,6.5])window(f,u,v,1.2,2.1,true,i%2===0&&u===3.4&&v>4);
        doorAt(f,x,y,z,-side,0);
        for(const v of [4.7,9.25]) f(whiteBoxes,0,v,13.3,.18,.34,.12);
        for(const u of [-6.25,6.25])f(whiteBoxes,u,4.6,.26,9.2,.25,.12);
        for(const [v,w,d] of [[8.22,.16,3.85],[8.5,.14,3.7],[9.25,.24,4.0]])whiteBoxes.push([d,w,12.8,side*25,y+v,z]);
        // The porch ceiling is seen from the Lawn at a low angle: large coffers, a warm bounce, and beams that catch the light.
        // It hangs just under the lowest moulding of the entablature, whose plain underside would otherwise be all you see.
        const soffit=world.box(3.84,.035,12.78,soffitMat,side*25,y+8.118,z);soffit.userData.metreUV=2.4;
        for(const dz of [-4.13,-2.07,0,2.07,4.13])whiteBoxes.push([3.6,.15,.2,side*25,y+8.03,z+dz]);
        whiteBoxes.push([.2,.13,12.5,side*25,y+8.04,z]);
        for(const dz of [-4.6,4.6]){
          world.box(1.25,2.2,1.1,brick(.4,.7),side*32,y+11.9,z+dz);
          stoneBoxes.push([1.5,.2,1.35,side*32,y+13.1,z+dz]);
        }
        // Low rear garden enclosures; visible beyond the side roofs.
        world.box(11,2.2,.55,brick(3.5,.7),side*40,y+1.1,z+8);
        stoneBoxes.push([11.2,.18,.72,side*40,y+2.3,z+8]);
        world.wall(side*34.5,side*45.5,z+7.7,z+8.3,3);
      });
    }
    // Rotunda mouldings and dentil course; slim rings articulate the dome springing.
    for(const [r,h,y] of [[12.12,.24,19.55],[12.35,.27,20.92],[11.65,.22,21.72],[10.75,.22,22.42],[10.25,.16,22.65]])round(r,h,y,stone,48);
    for(let i=0;i<64;i++){
      const a=i*Math.PI*2/64;
      whiteBoxes.push([.24,.36,.24,12*Math.sin(a),20.55,ROT_Z+12*Math.cos(a)]);
    }
    const rotEntry=face(0,FLOOR,-62.88,0,1);
    rotEntry(doorBoxes,0,2.6,2.7,5.2,.15,.03);
    for(const u of [-1.5,1.5])rotEntry(whiteBoxes,u,2.8,.22,5.6,.28,.13);
    rotEntry(whiteBoxes,0,5.65,3.3,.25,.38,.16);
    for(const u of [-.65,.65])for(const v of [.9,2.4,4])rotEntry(woodBoxes,u,v,1.02,1.1,.1,.15);
    // Drum facade carries the portico glazing; avoid overlapping modelled windows.
    for(const y of [15.1,15.55,16.65])whiteBoxes.push([19,.18,8.9,0,y,-61.2]);
    for(let x=-8.6;x<9;x+=.6)whiteBoxes.push([.25,.26,.4,x,16.38,-56.8]);
    // Balustraded terraces flanking the portico, out of the approach.
    for(const side of [-1,1]){
      stoneBoxes.push([10.5,.32,8.3,side*16.5,5.5,-62.5]);
      world.box(10.5,3.3,8.3,brick(3,1),side*16.5,3.65,-62.5);
      world.wall(side*11.25,side*21.75,-66.65,-58.35,6.8);
      for(const yy of [5.78,6.85])whiteBoxes.push([10.7,.2,.35,side*16.5,yy,-58.25]);
      for(let x=11.4;x<22;x+=.65)whitePosts.push([.09,.95,.09,side*x,6.3,-58.25]);
      for(let k=0;k<7;k++)stoneBoxes.push([1.35,.18,8/7,side*10.1,2.6+k*.5,-49.6-k*8/7]);
    }
    // Old Cabell: tall glazed bays, rusticated plinth, roof, cornice and corner piers.
    const cabell=face(0,0,89.97,0,-1);
    // Cabell arched glazing and rustication are in the facade map.
    for(const y of [.65,2,12.6,13.2])whiteBoxes.push([46.6,.28,14.6,0,y,97]);
    const cabRoof=gable(47,4.8,15,brick(14,1.6),slate);cabRoof.position.set(0,13.4,97);scene.add(cabRoof);
    for(const x of [-22,22])whiteBoxes.push([.75,12.5,.6,x,6.5,89.7]);

    // Brick cross walks and edging follow exactly the existing terrace profile.
    const rows=[[82,0],[49,0],[45,1],[-3,1],[-7,2],[-49,2]];
    for(const side of [-1,1]) {
      scene.add(strip(side*20.8,side*23,rows,lambert({map:pathTex}),1.6,.045));
      for(let z=-48;z<81;z+=.8)stoneBoxes.push([.17,.10,.77,side*20.8,terrace(z)+.095,z]);
    }
    for(const z of [72,43,-9,-47])scene.add(strip(-23,23,[[z+1,terrace(z+1)],[z-1,terrace(z-1)]],lambert({map:pathTex}),1.6,.055));
    // Foot-worn patches. The mowing bands are part of the grass texture.
    const patchTex=drawTex(64,64,g=>{
      const a=g.createRadialGradient(32,32,3,32,32,32);a.addColorStop(0,'rgba(153,123,71,.45)');a.addColorStop(1,'rgba(153,123,71,0)');
      g.fillStyle=a;g.fillRect(0,0,64,64);
    });
    const patchMat=lambert({map:patchTex,transparent:true,depthWrite:false});
    const patchGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2), patches=[];
    for(let i=0;i<35;i++){const x=-20+i*1.15,z=-27+i*.24;patches.push([2.5,1,1.8,x,terrace(z)+.04,z]);}
    for(let i=0;i<28;i++){const z=-18+i*1.8,x=-10+i*.45;patches.push([1.8,1,2.6,x,terrace(z)+.04,z]);}
    for(let i=0;i<65;i++){
      const z=-43+hash(i,8,5)*119,x=(i%2?1:-1)*(17+hash(i,2,5)*3);
      patches.push([2+hash(i,4,5)*4,1,1.2+hash(i,5,5)*3,x,terrace(z)+.026,z]);
    }
    world.instances(patchGeo,patchMat,patches);

    const props=new Props(world,{night:true});
    for(const side of [-1,1])for(const z of [68,39,14,-16,-42]){
      props.lamp(side*21.8,z,0,{style:'lantern',height:4.4,solid:true,pool:false});
      props.bench(side*19.4,z-3,side*Math.PI/2,{solid:true});
      props.bin(side*22.2,z-5,0,{solid:true});
    }
    for(const side of [-1,1])for(const z of [19,42,-24]){
      props.bicycle(side*27.7,z-1.4,0,{solid:true});
      props.bench(side*28,z+5,side*Math.PI/2,{solid:true});
      const board=props.noticeBoard(side*28.6,z-3,-side*Math.PI/2,{text:'LAWN / MUSIC / FRIDAY',solid:true});
      board.traverse(m=>{if(m.isMesh&&m.geometry.type==='PlaneGeometry')m.material.map=uvaDetail('notice');});
      props.pendant(side*26,z,0,{height:2.8});
    }
    for(const [x,z] of [[-2.7,-1],[7,40],[-4,-5]]){props.cup(x,z);props.takeaway(x+.3,z+.2);}
    props.build();
    world.boxes(dark,darkBoxes);world.boxes(lambert({map:uvaDetail('wood'),color:rgb(92,74,62)}),doorBoxes);world.boxes(glass,glassBoxes);world.boxes(wood,woodBoxes);
    world.boxes(iron,ironBoxes);world.posts(iron,ironPosts);world.boxes(warm,warmBoxes);

    // Clear sunset gradient, as in the San Francisco lawn reference.
    const sun=new THREE.Mesh(new THREE.CircleGeometry(30,32),new THREE.MeshBasicMaterial({color:rgb(255,222,149),fog:false,depthWrite:false}));
    sun.position.set(-1200,480,1040);sun.lookAt(0,0,0);world.sky.add(sun);
    const glowTex=drawTex(64,64,g=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,210,114,.65)');r.addColorStop(.3,'rgba(255,173,79,.2)');r.addColorStop(1,'rgba(255,153,70,0)');g.fillStyle=r;g.fillRect(0,0,64,64)});
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));glow.position.copy(sun.position);glow.scale.set(230,230,1);world.sky.add(glow);
    world.fence=(x,z)=>Math.abs(x)>29 || z>89 || z< -87;
  }

  // Contact shade supplements the low sun on architecture and props.
  const bake = new Bake(world);
  // Slatted seats need broad contact shade as well as the directional silhouette.
  for(const side of [-1,1]){
    for(const z of [68,39,14,-16,-42])bake.shadow(side*19.4,z-3,.65,.28,1.2);
    for(const z of [19,42,-24])bake.shadow(side*28,z+5,.65,.28,1.2);
  }
  for(const side of [-1,1]) {
    for(const z of PAVILIONS){
      const y=terrace(z),x=side*28.98;
      bake.shade(x,z-6.5,x,z+6.5,y+7,2.5,.48,true);
      bake.contact(x,z-6.5,x,z+6.5,side*3,.48,y+.06);
      if(side>0)bake.wash(x-.015,z-6.5,x-.015,z+6.5,y,9,[255,155,78],.16);
      else bake.shade(x+.015,z-6.5,x+.015,z+6.5,y,9,.4);
    }
    for(const z of [68,39,14,-16,-42])bake.pool(side*21.8,z,3.6,[255,168,74],.65);
  }

  bake.shade(-9,-62.86,9,-62.86,FLOOR,9,.15,true);
  bake.contact(-9,-62.8,9,-62.8,-3,.65,FLOOR+.025);
  bake.wash(-1.2,-62.65,1.2,-62.65,FLOOR,5,[255,177,83],.45);
  bake.pool(0,-61.4,2.3,[255,169,80],.28,FLOOR+.055);
  // Soft edge leaf drifts, separate from the lawn so the whole ground never looks tiled with leaves.
  const leafAlpha=drawTex(64,64,g=>{const r=g.createRadialGradient(32,32,12,32,32,32);r.addColorStop(0,'white');r.addColorStop(1,'black');g.fillStyle=r;g.fillRect(0,0,64,64)});
  const leafMat=lambert({map:uvaDetail('fallenLeaves'),alphaMap:leafAlpha,transparent:true,depthWrite:false});
  const leafItems=[];
  for(const side of [-1,1])for(let z=-45;z<80;z+=7)if(Math.abs(z+5)>6&&Math.abs(z-47)>6)leafItems.push([2.4,1,2.4,side*(17.5+hash(z,4,7)*3),terrace(z)+.035,z]);
  for(const [x,z] of [[-11,-14],[9,-37],[8,10],[-8,40],[2,-33],[-8.8,-17],[-10,-4.8]])leafItems.push([1.8,1,1.8,x,terrace(z)+.035,z]);
  // Drape leaves over terrace ramps; a flat decal cuts a triangular seam there.
  for(const [w,,d,x,,z] of leafItems){
    const geo=new THREE.PlaneGeometry(w,d,12,12).rotateX(-Math.PI/2),p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const xx=x+p.getX(i),zz=z+p.getZ(i);p.setXYZ(i,xx,terrace(zz)+.035,zz);}
    geo.computeVertexNormals();scene.add(new THREE.Mesh(geo,leafMat));
  }
  // Rear university ranges and gently serpentine garden walls close oblique views.
  const farMat=lambert({map:uvaTexture('pavilion'),color:rgb(173,151,134)});
  for(const side of [-1,1]){
    for(let z=-65;z<100;z+=24){world.box(13,11,18,farMat,side*64,6,z);world.box(14,.6,19,stone,side*64,11.8,z);}
    const garden=[];
    for(let z=-52;z<83;z+=1.3)garden.push([.6,2.5,1.5,side*(39+1.5*Math.sin(z*.32)),terrace(z)+1.25,z]);
    world.boxes(brick(.2,.8),garden);
  }

  for(const [x,z,h] of [[-32,-125,19],[35,-138,24],[-57,-153,25],[62,-172,30]]){
    world.box(22,h,16,farMat,x,2+h/2,z);const r=gable(23,4,17,farMat,slate);r.position.set(x,2+h,z);scene.add(r);
  }

  for(const side of [-1,1])for(let i=0;i<11;i++){
    const x=side*(76+(i%3)*12),z=-135+i*27,h=15+(i%4)*3;
    world.box(15,h,18,farMat,x,h/2,z);
    const roof=gable(16,4.5,19,farMat,slate);roof.position.set(x,h,z);scene.add(roof);
    for(const dx of [-5,5])world.box(1.1,3,1.3,farMat,x+dx,h+3,z-4);
  }
  // A continuous, opaque distant hill, with one small roof group and a spire.
  // Basic materials keep this layer pale under the low sun; distance fog supplies haze.
  // The ridge is wooded: soft tree masses in two tones, painted at the haze's own colours so it stays a far layer.
  const haze=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,map:drawTex(256,256,(g)=>{
    g.fillStyle='rgb(164,151,148)';g.fillRect(0,0,256,256);
    for(let i=0;i<340;i++){
      const x=hash(i,1,77)*256,y=hash(i,2,77)*256,r=5+hash(i,3,77)*10;
      g.fillStyle=i%3?`rgba(134,122,126,${.3+hash(i,4,77)*.3})`:`rgba(190,170,156,${.25+hash(i,5,77)*.25})`;
      for(const ox of [-256,0,256])for(const oy of [-256,0,256]){g.beginPath();g.ellipse(x+ox,y+oy,r,r*.72,0,0,6.3);g.fill();}
    }
  },1/52,1/52)});
  // Halls on the ridge: brick walls with rows of windows, a few of them catching the sunset, under darker roofs.
  const hazeWalls=[[176,150,140],[186,172,160]].map((wall,k)=>new THREE.MeshBasicMaterial({map:drawTex(128,64,(g)=>{
    g.fillStyle=`rgb(${wall})`;g.fillRect(0,0,128,64);
    g.fillStyle='rgba(120,104,104,.5)';g.fillRect(0,0,128,3);g.fillRect(0,31,128,1.5);g.fillRect(0,61,128,3);
    for(let row=0;row<2;row++)for(let col=0;col<7;col++){
      const lit=hash(col,row,91+k)>.72;
      g.fillStyle='rgb(206,194,182)';g.fillRect(6+col*17.6,7+row*29,10,17);
      g.fillStyle=lit?'rgb(242,196,128)':'rgb(112,102,112)';g.fillRect(7.5+col*17.6,8.5+row*29,7,14);
    }
  })}));
  const hazeEnd=new THREE.MeshBasicMaterial({color:rgb(170,150,142)}),hazeRoof=new THREE.MeshBasicMaterial({color:rgb(128,114,120)});
  for(const [z,offset] of [[230,0],[-240,45]]) {
    const top=(x)=>(z<0?45+20*Math.exp(-Math.pow((x-110)/90,2)):25+12*Math.exp(-Math.pow((x-offset)/85,2)))+2*Math.sin(x*.027);
    const outline=new THREE.Shape();outline.moveTo(-230,-8);
    for(let x=-230;x<=230;x+=10)outline.lineTo(x,top(x));
    outline.lineTo(230,-8);outline.closePath();
    const hill=new THREE.Mesh(new THREE.ShapeGeometry(outline),haze);hill.position.z=z;scene.add(hill);
    [[30,15,8],[48,22,11],[70,12,7],[-14,16,7],[96,18,9],[121,11,6]].forEach(([x,w,h],k)=>{
      const base=k<3?(z<0?54:32):top(x)-3;world.box(w,h,9,hazeWalls[k%2],x,base+h/2,z-4);
      const roof=gable(w+1,3,10,hazeEnd,hazeRoof);roof.position.set(x,base+h,z-4);scene.add(roof);
      for(const dx of [-w*.3,w*.28])world.box(1.2,2.6,1.2,hazeEnd,x+dx,base+h+2.4,z-4);   // chimneys
    });
    world.box(2.5,12,2.5,hazeEnd,57,41,z-5);
    world.boxes(hazeRoof,[[.9,2.2,.1,57,44.5,z-3.7],[2.9,.3,2.9,57,47,z-5]]);   // belfry opening and cornice
    const spire=new THREE.Mesh(new THREE.ConeGeometry(1.8,10,6),hazeRoof);spire.position.set(57,52,z-5);scene.add(spire);
  }

  // A lit university range sits between the southern tree line and the far ridge.
  const southRange=lambert({map:uvaDetail('stone'),color:rgb(183,166,145),emissive:rgb(20,16,12)});
  world.box(34,20,9,southRange,-22,22,145);
  const rangeRoof=gable(36,4,10,southRange,slate);rangeRoof.position.set(-22,32,145);scene.add(rangeRoof);
  const distantWindow=new THREE.MeshBasicMaterial({color:rgb(105,95,79)});
  for(let x=-36;x<=-8;x+=3.5)for(const y of [17,22,27]){
    world.box(1.25,2.1,.08,distantWindow,x,y,140.45);
    world.box(1.45,.12,.16,southRange,x,y-1.1,140.4);
  }

  // ---------- trees ----------
  // Fall colours as they look in this light: dark olive, orange, red-brown, gold, dull green.
  const FALL = [[92, 80, 36], [140, 115, 54], [113, 100, 48], [152, 118, 55], [117, 108, 47]];
  const trees = new Trees(world, { leaf: 1.7, bark: [84, 56, 38], sun: [-0.75, 0.30, 0.65] });
  const tree = (x, z, h, kind, near = false) => trees.broadleaf(x, z, h, FALL[kind], { solid: near, detail: near ? 1 : 0.55 });
  tree(-7.5, 76.5, 17, 0, true); tree(9.5, 79, 15, 0, true); // two big ones frame the opening view
  for (const side of [-1, 1]) {
    for (let z = 66, i = 0; z > -42; z -= 13.5, i++) tree(side * (18.4 + hash(i, side, 1) * 1.6), z + hash(i, side, 2) * 3, 11 + hash(i, side, 3) * 4, 1 + ((i + (side > 0 ? 1 : 0)) % 3), true);
    for (let z = 110, i = 0; z > -110; z -= 11, i++) tree(side * (42 + hash(i, side, 6) * 16), z, 15 + hash(i, side, 7) * 7, hash(i, side, 8) > 0.6 ? 1 : i % 2 ? 0 : 4);
  }
  for (let x = -54, i = 0; x <= 54; x += 12, i++) { tree(x, -100 - hash(i, 3, 9) * 8, 16 + hash(i, 4, 9) * 6, i % 2 ? 0 : 4); tree(x, 114 + hash(i, 5, 9) * 6, 16, i % 2 ? 4 : 0); }
  tree(-9, -30, 14, 1, true);
  tree(-14.8, -9.5, 12.5, 4, true); // crown frames the south-facing picnic without blocking the start
  trees.build();

  // Merge architecture by shared material. All vertices remain in world coordinates.
  scene.updateMatrixWorld(true);
  const mergeGroups=new Map(),remove=[];
  scene.traverse(m=>{
    if(!m.isMesh||m.isInstancedMesh||m===world.sky)return;
    for(let p=m.parent;p;p=p.parent)if(p===world.sky)return;
    if(Array.isArray(m.material))return;
    const geo=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld);
    if(m.userData.metreUV||m.material===slate||m.material===white||m.material===stone){
      const p=geo.attributes.position,n=geo.attributes.normal,u=new Float32Array(p.count*2),tile=m.userData.metreUV||1.8;
      for(let i=0;i<p.count;i++){
        const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
        u[i*2]=(ay>ax&&ay>az?p.getX(i):ax>az?p.getZ(i):p.getX(i))/tile;
        u[i*2+1]=(ay>ax&&ay>az?p.getZ(i):p.getY(i))/tile;
      }geo.setAttribute('uv',new THREE.BufferAttribute(u,2));
    }
    if(!geo.attributes.normal||!geo.attributes.uv||geo.attributes.color){geo.dispose();return;}
    const k=m.material.uuid;if(!mergeGroups.has(k))mergeGroups.set(k,{mat:m.material,parts:[]});mergeGroups.get(k).parts.push(geo);remove.push(m);
  });
  for(const m of remove)m.removeFromParent();
  for(const {mat,parts} of mergeGroups.values()){
    const geo=new THREE.BufferGeometry();
    for(const name of ['position','normal','uv']){const size=parts[0].attributes[name].itemSize;const a=new Float32Array(parts.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;for(const g of parts){a.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}geo.setAttribute(name,new THREE.BufferAttribute(a,size));}
    scene.add(new THREE.Mesh(geo,mat));for(const p of parts)p.dispose();
  }
  // ---------- people ----------
  // top colour, top style, bottom colour, bottom style
  const OUTFITS = [[[150, 60, 40], 'sweater', [60, 66, 90], 'jeans'], [[220, 214, 200], 'shirt', [52, 56, 70], 'pants'], [[58, 84, 120], 'hoodie', [58, 65, 88], 'pants'],
    [[184, 123, 76], 'jacket', [40, 44, 60], 'pants'], [[120, 40, 44], 'stripe', [70, 72, 84], 'pants'], [[70, 110, 80], 'cardigan', [44, 44, 52], 'pants'], [[210, 186, 117], 'shirt', [60, 60, 70], 'pants']];
  const SKIN = [[214, 170, 132], [150, 104, 72], [232, 190, 150], [112, 78, 56]];
  const HAIR = [[34, 26, 22], [120, 84, 44], [70, 44, 28], [65, 48, 34]];
  const person = (i) => {
    const [top, topStyle, bottom, bottomStyle] = OUTFITS[i % 7], woman = i % 2 === 1;
    const specific=i===12?{top:[175,195,225],topStyle:'shirt',bottom:[40,48,70],hairStyle:'parted'}:i===13?{top:[48,57,83],topStyle:'cardigan',bottom:[44,49,72],hairStyle:'bun'}:i===35?{top:[65,113,150],topStyle:'cardigan',hairStyle:'parted'}:i===45?{top:[92,105,166],topStyle:'cardigan',bottom:[80,95,150],bottomStyle:'skirt',skin:[221,181,158]}:{};
    return new Figure({ variant:i, physique: ['regular','slight','slim','stocky','heavy','tall'][i%6], face: i % 3, skin: SKIN[i % 4], hair: HAIR[(i * 3) % 4], hairStyle: ['parted','tied','crop','curly','quiff','long','swept','short'][i%8], build: woman ? 'f' : 'm',
      pattern: topStyle==='shirt'?'check':undefined, fit:'loose', height: (woman ? 1.60 : 1.72) + ((i * 7) % 5) * 0.045, top, topStyle, bottom, bottomStyle: woman && i%3===0 ? 'skirt' : bottomStyle, bag: i%4===0 && i<12 ? 'backpack' : null, shoes: i % 3 ? [220, 216, 208] : [60, 50, 44], ...specific });
  };
  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), keepSunsetPaint(lambert({ map: uvaDetail('blanket'), color:rgb(235,255,255), emissiveMap:uvaDetail('blanket'), emissive:rgb(23,28,37) })));
  blanket.rotation.x = -Math.PI / 2; blanket.position.set(7.3, world.ground(7.3, 40.6) + 0.03, 40.6); scene.add(blanket);
  // Friends studying, tossing a disc, and resting on the Rotunda steps.
  const newcomers=[[-3.7,-6.5,2.1,1],[-2.5,-7.5,3.7,1],[2.8,-8,3.3,1],[4,-8.4,3,1]];
  newcomers.forEach(([x,z,h,sitting],i)=>{const f=person(i+12).place(x,world.ground(x,z),z,h);if(sitting)f.sit(i%2 ? 'recline' : 'cross-legged');else [()=>f.armsCrossed(),()=>f.phone(),()=>f.lean()][i%3]();scene.add(f.root);world.post(x,z,.36,1.9);});
  const openingPicnic=blanket.clone();openingPicnic.position.set(1.7,terrace(-23)+.045,-23);scene.add(openingPicnic);
  const southPicnic=blanket.clone();southPicnic.position.set(-7,-0+terrace(-14.7)+.045,-14.7);scene.add(southPicnic);
  const picnic=blanket.clone();picnic.position.set(-3.3,world.ground(-3.3,-5)+.045,-5);scene.add(picnic);
  // Small study groups anchor the lower thirds of the three oblique lawn views.
  for(const [x,z,id] of [[5,-34,80],[-15,-7,82],[-9,-4.5,84]]){
    const rug=blanket.clone();rug.position.set(x,terrace(z)+.045,z);scene.add(rug);
    for(let j=0;j<2;j++){
      const px=x+(j? .75:-.75),pz=z-.25;
      const f=person(id+j).place(px,world.ground(px,pz),pz,id===82?(j?3.8:2.6):(j?2.2:-.6));
      f.sit(id===82?0:(j?'recline':'cross-legged'));if(!j)f.hold('book');
      scene.add(f.root);world.post(px,pz,.3,1.2);
    }
  }
  const bags=[],books=[],pages=[];
  for(const [x,z] of [[-4.8,-5],[3.4,-8],[10.4,-35],[15,4],[-9,23],[7,40]]){
    const y=world.ground(x,z);bags.push([.3,.33,.24,x,y+.18,z]);books.push([.45,.07,.32,x+.6,y+.06,z+.2]);pages.push([.4,.045,.29,x+.6,y+.085,z+.2]);bake.shadow(x,z,.5,.4);
  }
  world.boxes(lambert({map:uvaDetail('bag')}),bags);world.boxes(lambert({map:uvaDetail('book')}),books);world.boxes(stone,pages);
  const animals=new Animals(world);
  animals.dog(7,-2.5,-1.2,{coat:'tan',pose:'sit',scale:.8});
  animals.pigeon(25,15,0,{radius:.5});animals.pigeon(24.5,14.2,1,{radius:.6});
  bake.shadow(7,-2.5,.7,.35,.45);
  // People placed in each judged view, keeping the central route unobstructed.
  // The last four sit on the Rotunda steps. They face down the steps, so their legs rest on the step below.
  const close=[[1.7,-23,1],[3.2,-26,0],[-10,-9,1],[-8.5,-8.5,1],[17,31,0],[18,34,0],[26.5,-5,0],[27,9,0],[25,31,1],[23,36,0],[-25,8,0],[-25,-18,1],[-6,-51,1],[-4,-54,1],[4,-55,1],[7,-52,1]];
  close.forEach(([x,z,seated],i)=>{const f=person(i+31).place(x,world.ground(x,z),z,i===2?3.8:i===3?2.7:i===4?Math.atan2(1,2):i===5?Math.atan2(-1,-2):i>=12?(i%2?-.6:.6):i%2?2.5:.6);if(seated){f.sit(i===2||i===3?0:i%2);if(i<4)f.hold('book');}else [()=>f.armsCrossed(),()=>f.phone(),()=>{f.talk(i);f.hold('cup');}][i%3]();scene.add(f.root);world.post(x,z,.3,1.8);});
  const lawnGroups=[
    [-4,3,3.5,'book'],[-2.6,4,2.4,'sit'],[-3,2,1.3,'cup'],[-1.8,2.4,4.4,'talk'],
    [4,17,.5,'walk'],[5.4,18,.5,'walk'],[10,39,2,'book'],[11.3,40,4,'sit'],
    [3,-38,3.1,'camera'],[5,-39,4.2,'cup'],[-6,-43,1.1,'talk'],[-4.5,-42,4.2,'cup'],
    [11,-25,2.2,'throw'],[14,-20,4.7,'catch'],[-8,56,1.4,'talk'],[-6.5,56,4.5,'cup'],
    [-12.6,-12.3,1.2,'walk'],[-10.5,-12.8,1.2,'walk'],
    [-9.25,-15.15,.3,'sit'],[-7.95,-15.35,-.25,'book']   // a pair on the south blanket, looking down the Lawn
  ];
  let thrower, receiver;
  lawnGroups.forEach(([x,z,h,task],i)=>{
    const f=person(i+54).place(x,world.ground(x,z),z,h);
    if(task==='book'||task==='sit'){f.sit(i<2?0:(i%2?'recline':'cross-legged'));if(task==='book')f.hold('book');}
    else if(task==='walk')f.walk(i>=16?(i%2?1.6:4.7):.6+i*.7,1);
    else if(task==='throw'){thrower=f;f.talk(1);f.aim(f.bones.RightArm,[-.8,.2,.5]);f.aim(f.bones.RightForeArm,[-.9,.1,.5]);}
    else if(task==='catch'){receiver=f;f.talk(.6);}
    else {task==='talk'?f.armsCrossed():f.talk(i);if(task!=='talk')f.hold(task);if(task==='camera')f.photograph();}
    scene.add(f.root);world.post(x,z,.3,1.8);
  });
  playCatch(world, thrower, receiver);
  const lawnProps=new Props(world);
  for(const [x,z] of [[-15,1],[6,-40],[12,41]])lawnProps.bicycle(x,z,.7,{solid:true});
  lawnProps.bicycle(-7,-13,1.8,{solid:true});
  lawnProps.bench(-11,-18.6,1.9,{solid:true});
  const southRug=blanket.clone();southRug.position.set(-8.6,terrace(-15.6)+.045,-15.6);scene.add(southRug);
  lawnProps.takeaway(-9.0,-16.0,0);lawnProps.cup(-8.7,-15.9,0);
  lawnProps.build();
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),lambert({map:uvaDetail('book'),color:0xdfc29a}));ball.position.set(12.4,terrace(-22)+.18,-22);scene.add(ball);
  const child=new Figure({age:'child',height:1.23,top:[165,83,56],topStyle:'hoodie',bottom:[64,70,82],bottomStyle:'pants',hairStyle:'curly'}).place(22,world.ground(22,36),36,.3);child.walk(.8,1);scene.add(child.root);world.post(22,36,.25,1.3);
  const foreground=blanket.clone();foreground.scale.set(1.25,1.2,1);foreground.position.set(-1.55,terrace(-1.5)+.045,-1.5);scene.add(foreground);
  // Ground decals must follow the terrace, otherwise their planes cut a hard
  // diagonal through the slope. Subdivide and drape, retaining each fade's UVs.
  for(const part of Object.values(bake.parts)){
    const dst={pos:[],uv:[],col:[],idx:[]};
    for(let q=0;q<part.pos.length/12;q++){
      const p=part.pos.slice(q*12,q*12+12),uv=part.uv.slice(q*8,q*8+8),col=part.col.slice(q*16,q*16+16);
      const flat=[p[4],p[7],p[10]].every(y=>Math.abs(y-p[1])<.001);
      const nx=flat?Math.max(1,Math.ceil(Math.hypot(p[3]-p[0],p[5]-p[2])/1.5)):1;
      const nz=flat?Math.max(1,Math.ceil(Math.hypot(p[9]-p[0],p[11]-p[2])/1.5)):1;
      const sample=(arr,stride,c,u,v)=>arr[c]*(1-u)*(1-v)+arr[stride+c]*u*(1-v)+arr[2*stride+c]*u*v+arr[3*stride+c]*(1-u)*v;
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
        const base=dst.pos.length/3;
        for(const [u,v] of [[i/nx,j/nz],[(i+1)/nx,j/nz],[(i+1)/nx,(j+1)/nz],[i/nx,(j+1)/nz]]){
          const x=sample(p,3,0,u,v),z=sample(p,3,2,u,v);
          dst.pos.push(x,flat?world.ground(x,z)+.065:sample(p,3,1,u,v),z);
          for(let c=0;c<2;c++)dst.uv.push(sample(uv,2,c,u,v));
          for(let c=0;c<4;c++)dst.col.push(sample(col,4,c,u,v));
        }dst.idx.push(base,base+1,base+2,base,base+2,base+3);
      }
    }Object.assign(part,dst);
  }
  bake.build();
  // A few people walk the brick paths under the colonnades, up and down.
  [[26, 70, -40, 1.3], [26.4, -30, 60, 1.1], [-26, 20, 72, 1.2], [-26.4, -44, 10, 1.4]].forEach(([x, za, zb, speed], i) => world.walker(person(i + 3), x, za, x, zb, speed, i * 17));

  // Head accessories share the figure skeleton and bind space. Merge only those
  // with the same material, parent and transform; animation and contacts stay intact.
  const hairBatches=new Map();
  scene.traverse(m=>{
    if(!m.isSkinnedMesh||!m.userData.characterAccessory||Array.isArray(m.material))return;
    const matKey=m.material.map?m.material.uuid:[m.material.type,m.material.color.getHex(),m.material.emissive?.getHex(),m.material.side].join(':');
    const key=m.parent.uuid+':'+matKey+':'+m.skeleton.uuid+':'+m.matrix.elements.join(',');
    if(!hairBatches.has(key))hairBatches.set(key,[]);
    hairBatches.get(key).push(m);
  });
  for(const meshes of hairBatches.values()){
    if(meshes.length<2)continue;
    const parts=meshes.map(m=>m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone());
    const names=Object.keys(parts[0].attributes);
    if(parts.some(g=>names.some(n=>!g.attributes[n]))){parts.forEach(g=>g.dispose());continue;}
    const geo=new THREE.BufferGeometry();
    for(const name of names){
      const first=parts[0].attributes[name],a=new first.array.constructor(parts.reduce((n,g)=>n+g.attributes[name].array.length,0));
      let at=0;for(const g of parts){a.set(g.attributes[name].array,at);at+=g.attributes[name].array.length;}
      geo.setAttribute(name,new THREE.BufferAttribute(a,first.itemSize,first.normalized));
    }
    meshes[0].geometry=geo;
    meshes.slice(1).forEach(m=>m.removeFromParent());parts.forEach(g=>g.dispose());
  }

  // The existing outer tree line closes the horizon; no repeated skyline card.

  // ---------- where the chapter ends, and the captions ----------
  world.exit = { x: 0, z: -62.4, r: 1.4 };
  world.spots = memories.uva.map(({ at: [x, z], within, text }) => ({ x, z, r: within, text }));
  world.start = { x: 0, z: -22, heading: Math.PI, camYaw: Math.PI / 2, camPitch: 0.08 };
  // The establishing shot: from behind a picnic on the grass, under the branch, with the Rotunda filling the frame.
  world.opening = { pos: [-3.9, 2.4, -0.6], look: [1.8, 12, -62], drift: [0.5, 0.05, -1.4], seconds: 6, fov: 46 };
  placeRadio(world, 2.65, terrace(-22.4)+.05, -22.4, -.72);
  addLooseLeaves(world);
  return world;
}
