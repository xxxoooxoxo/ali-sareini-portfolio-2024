// Chapter 2: the Green at Dartmouth on a winter evening, with snow falling.
// North is -Z. You start at the south end of the Green and look north at the tower of Baker Library.
// Sizes are in metres and compressed, like a game map.
import * as THREE from 'three';
import { rgb, hash, fbm, mix3, smooth, pixelTex, drawTex, reuse, makeSky, addLight } from '../engine/look.js';
import { Bake } from '../engine/bake.js';
import { World, gable } from '../engine/world.js';
import { Figure } from '../engine/figure.js';
import { Trees } from '../engine/trees.js';
import { Props } from '../engine/props.js';
import { Animals } from '../engine/animals.js';
import { Cars } from '../engine/cars.js';
import { CREAM, bricks, door, litFacade } from '../engine/paint.js';
import { dartmouthBrick, dartmouthSurface, dartmouthDetail, dartmouthSnow, bakerSurface } from './dartmouth-textures.js';
import { memories } from '../story.js';
import { placeRadio } from '../engine/portable-radio.js';
import { addSnowTracks } from '../engine/ground-details.js';
import { addPickup } from '../engine/interactions.js';

function snowballToss(world, snowmanX, snowmanZ, snow) {
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.115, 1), snow);
  ball.name = 'Thrown snowball';
  const puff = new THREE.Group();
  const crumb = new THREE.IcosahedronGeometry(.065, 0);
  for (let i = 0; i < 7; i++) puff.add(new THREE.Mesh(crumb, snow));
  world.scene.add(ball, puff);
  ball.visible = puff.visible = false;
  const from = new THREE.Vector3(), impact = new THREE.Vector3();
  let age = 0;
  const flight = .46, burst = .32;
  world.interactions.push({
    x: snowmanX, y: 1.85, z: snowmanZ, r: 4.4,
    get label() { return ball.visible || puff.visible ? null : 'Throw snowball'; },
    act(player) {
      player.figure.arms[1].hand.getWorldPosition(from);
      const facing = Math.atan2(from.x - snowmanX, from.z - snowmanZ);
      impact.set(snowmanX + .73 * Math.sin(facing), 2.15, snowmanZ + .73 * Math.cos(facing));
      ball.position.copy(from); puff.position.copy(impact);
      age = 0; ball.visible = true;
    },
  });
  world.ticks.push((_t, dt) => {
    if (!ball.visible && !puff.visible) return;
    age += dt;
    const u = Math.min(1, age / flight);
    ball.position.lerpVectors(from, impact, u);
    ball.position.y += 2.4 * u * (1 - u);
    ball.visible = age < flight;
    puff.visible = age >= flight && age < flight + burst;
    if (!puff.visible) return;
    const spread = (age - flight) / burst;
    puff.children.forEach((piece, i) => {
      const angle = i * 2.4;
      piece.position.set(Math.cos(angle) * spread * .42, spread * (.38 + Math.sin(angle)) - .6 * spread ** 2,
        Math.sin(angle) * spread * .42);
      piece.scale.setScalar(1 - spread);
    });
  });
}

/** @param {import('../engine/world.js').ChapterEvents} [events] */
export function buildDartmouth({ inventory } = {}) {
  const world = new World(), { scene } = world;
  const bake = new Bake(world);
  world.peopleFill = [100, 88, 76];
  const props=new Props(world,{night:true,snow:[214,222,240]});

  // Night palette sampled from the reference clip: indigo sky, a slightly paler horizon, warm lamplight.
  scene.fog = new THREE.Fog(rgb(50, 49, 80), 90, 380);
  world.sky = makeSky([[0, [68, 61, 86]], [10, [56, 53, 84]], [25, [47, 46, 80]], [45, [41, 42, 74]], [90, [35, 37, 66]]]);
  scene.add(world.sky);
  addLight(scene, [70, 63, 62], [102, 95, 100], [-0.45, 0.72, -0.35]); // cold light from the sky, a little from the moon

  const lambert = (o) => new THREE.MeshLambertMaterial({map:details.grain,...o});
  const GLOW = new THREE.Color(1, 1, 1);
  const details=Object.fromEntries(['wood','stone','copper','timber','metal','road','paving','door','grain'].map(k=>[k,dartmouthDetail(k)]));
  const softDot=drawTex(64,64,g=>{const d=g.createRadialGradient(32,32,0,32,32,29);d.addColorStop(0,'rgba(255,255,255,1)');d.addColorStop(.22,'rgba(255,255,255,.85)');d.addColorStop(.6,'rgba(255,255,255,.22)');d.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=d;g.fillRect(0,0,64,64);});
  softDot.wrapS=softDot.wrapT=THREE.ClampToEdgeWrapping;

  // ---------- sky: stars and a moon, which ride along with the sky dome ----------
  {
    const pts = [];
    for (let i = 0; i < 150; i++) {
      const a = hash(i, 1, 2) * 6.283, e = 0.12 + hash(i, 2, 2) * 1.3;
      pts.push(Math.cos(a) * Math.cos(e) * 2800, Math.sin(e) * 2800, Math.sin(a) * Math.cos(e) * 2800);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    for(let k=0;k<3;k++){
      const part=geo.clone();part.setIndex(Array.from({length:150},(_,i)=>i).filter(i=>i%3===k));
      world.sky.add(new THREE.Points(part,new THREE.PointsMaterial({color:rgb(190,194,236),map:softDot,transparent:true,size:[1.8,2.6,3.6][k],sizeAttenuation:false,fog:false,depthWrite:false})));
    }
    const disc = drawTex(64,64,g=>{g.fillStyle='#e5e5ed';g.beginPath();g.arc(32,32,26,0,7);g.fill();for(let i=0;i<25;i++){const x=15+hash(i,1,6)*34,y=15+hash(i,2,6)*34;g.fillStyle='rgba(123,134,167,.12)';g.beginPath();g.arc(x,y,2+hash(i,3,6)*4,0,7);g.fill();}});
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: rgb(226, 230, 250), fog: false, depthWrite: false }));
    moon.position.set(-360, 1150, -2100); moon.scale.setScalar(150); world.sky.add(moon);
    const clouds=drawTex(256,128,(g,w,h)=>{const image=g.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=x/w,v=y/h,n=fbm(u,v,6,4,75),alpha=smooth(.43,.7,n)*Math.sin(v*Math.PI)**2*smooth(0,.22,u)*(1-smooth(.78,1,u));const o=(y*w+x)*4;image.data[o]=104;image.data[o+1]=100;image.data[o+2]=157;image.data[o+3]=alpha*85;}g.putImageData(image,0,0);});
    const cloudMat=new THREE.SpriteMaterial({map:clouds,transparent:true,depthWrite:false,fog:false});
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7,c=new THREE.Sprite(cloudMat);c.position.set(Math.sin(a)*2300,380+hash(i,1,4)*290,Math.cos(a)*2300);c.scale.set(1900,500,1);world.sky.add(c);}

  }

  // ---------- ground ----------
  const snowTex = dartmouthSnow('fresh');
  const slushTex = dartmouthSnow('trodden');
  const pathFade=drawTex(128,128,(g,w,h)=>{const im=g.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=x/w,v=y/h,n=fbm(u,v,11,3,36);const edge=Math.min(u,1-u),end=Math.min(v,1-v);const fade=smooth(.015,.24,edge+(n-.5)*.16)*smooth(0,.18,end);const k=(y*w+x)*4;im.data[k]=im.data[k+1]=im.data[k+2]=fade*210;im.data[k+3]=255;}g.putImageData(im,0,0);});
  pathFade.wrapS=pathFade.wrapT=THREE.ClampToEdgeWrapping;
  const roadTex = details.road;
  slushTex.wrapS=slushTex.wrapT=THREE.RepeatWrapping;
  snowTex.wrapS=snowTex.wrapT=THREE.RepeatWrapping;
  const snowPatches = [], pavedPatches = [];
  const flat = (x0, x1, z0, z1, tex, tile, y = 0) => {
    if (tex === snowTex) snowPatches.push([x0,x1,z0,z1]);
    if (tex === details.paving) pavedPatches.push([x0,x1,z0,z1]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lambert({ map: reuse(tex, (x1 - x0) / tile, (z1 - z0) / tile), transparent:tex===slushTex, alphaMap:tex===slushTex?pathFade:null, depthWrite:tex!==slushTex, emissive:tex===roadTex?rgb(42,34,36):rgb(18,18,26),emissiveMap:reuse(tex,(x1-x0)/tile,(z1-z0)/tile),color: tex===slushTex?rgb(255,242,240):rgb(255,243,242) }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); scene.add(m);
  };
  flat(-160, 160, -160, 160, roadTex, 3, -0.03);   // streets, and everything beyond them
  flat(-44, 44, -52, 52, snowTex, 5);              // the Green
  flat(-62, 62, -88, -62, snowTex, 5);             // the lawn in front of Baker
  flat(-62, -55, -62, 70, snowTex, 5); flat(55, 62, -62, 70, snowTex, 5); flat(-55, 55, 64, 70, snowTex, 5); // snowy verges
  flat(-1.8, 1.8, -52, 52, slushTex, 4, 0.03); flat(-44, 44, -1.8, 1.8, slushTex, 4, 0.03); // paths trodden across the Green
  flat(-1.3, 1.3, -85, -62, slushTex, 4, 0.03);
  // Cross paths have a feathered edge across their width, without intersecting plane seams.
  for (const angle of [0.868, -0.868]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8,136), lambert({map:reuse(slushTex,.7,34),alphaMap:pathFade,transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    m.rotation.set(-Math.PI/2,0,angle);m.position.y=.022;scene.add(m);
  }

  for(const [x,z,w,d] of [[0,-28,12,26],[28,9,17,10],[-29,-20,19,9],[-5,30,14,9],[-5,14,12,12]])flat(x-w/2,x+w/2,z-d/2,z+d/2,slushTex,3,.035);

  flat(55,62,-52,52,details.paving,3,.006);flat(-62,-55,-52,52,details.paving,3,.006);

  // ---------- buildings ----------
  const white = lambert({ map: details.wood, color: rgb(236, 232, 222), emissive:rgb(22,20,17),emissiveMap:details.wood });
  const floodlit = lambert({ map: details.stone, color: rgb(236, 232, 222), emissive: rgb(165, 120, 67), emissiveMap: details.stone }); // lit from below at night
  const roofTex = dartmouthSnow('roof');
  const snowRoof = lambert({ map: reuse(roofTex,2,2), color: rgb(245, 245, 255), emissive:rgb(60,62,74), emissiveMap:roofTex });
  const copper = lambert({ map: details.copper, color: rgb(92, 150, 128), emissive: rgb(16, 30, 26), flatShading: true });
  const brickTex = dartmouthBrick();
  const brick = (rx, ry) => lambert({ map: reuse(brickTex, rx * 2, ry * 2) });
  const whiteBoxes = [], whitePosts = [], litBoxes = [];
  const facades = Object.fromEntries(['brickFacade','whiteFacade','shopFacade'].map(k=>[k,{map:dartmouthSurface(k),emissiveMap:dartmouthSurface(k,true)}]));

  // Rows of windows, some with a light on. One tile is 9.6 m of wall.
  const windows = (floors, extra) => (g, win, glow) => {
    if (!glow) { g.fillStyle = CREAM; g.fillRect(0, 0, 96, 3); }
    for (let f = 0; f < floors; f++) for (let k = 0; k < 3; k++) { if (!glow) extra?.(g, 10 + k * 32, 8 + f * 32); win(10 + k * 32, 8 + f * 32, 12, 18); }
  };
  const brick3 = litFacade(96, 96, windows(3), { share: 0.5 });
  const brick4 = litFacade(96, 128, windows(4), { share: 0.62, seed: 5 });
  const shutters = (g, x, y) => { g.fillStyle = '#1f3a2c'; g.fillRect(x - 6, y - 1, 4, 20); g.fillRect(x + 14, y - 1, 4, 20); };
  const white3 = litFacade(96, 96, windows(3, shutters), { base: [228, 226, 218], mortar: 'rgb(210,208,202)', share: 0.45, seed: 9 });

  // Recesses, glazing and projecting joinery stay legible at the low render resolution.
  const foundation = [], trim = [], caps = [], darkPanes = [], warmPanes = [], amberPanes = [], iron = [];
  const clapboard = drawTex(128,128,g=>{g.fillStyle='#c9c8c0';g.fillRect(0,0,128,128);for(let y=0;y<128;y+=8){g.fillStyle='#a1a7ae';g.fillRect(0,y,128,1);g.fillStyle='#e3e1d7';g.fillRect(0,y+1,128,1);}});
  const block = (x0, x1, z0, z1, h, tex) => {
    const pale = tex === white3;
    const facade=facades[pale?'whiteFacade':'brickFacade'];
    const wall = len => lambert({map:reuse(facade.map,Math.max(1,Math.round(len/12)),1),emissiveMap:reuse(facade.emissiveMap,Math.max(1,Math.round(len/12)),1),emissive:rgb(170,150,115)});
    world.box(x1-x0,h,z1-z0,[wall(z1-z0),wall(z1-z0),snowRoof,snowRoof,wall(x1-x0),wall(x1-x0)],(x0+x1)/2,h/2,(z0+z1)/2);
    world.wall(x0,x1,z0,z1);
    bake.building(x0,x1,z0,z1,h,{flood:[255,192,108],floodStrength:pale?.24:.25,floodHeight:h});
    for(let u=x0+3;u<x1;u+=6)for(const z of [z0-1,z1+1])bake.pool(u,z,5,[255,188,100],.4);
    for(let u=z0+3;u<z1;u+=6)for(const x of [x0-1,x1+1])bake.pool(x,u,5,[255,188,100],.4);
    const face = (axis, fixed, lo, hi, sign) => {
      const put=(arr,w,hh,d,u,y,out=0)=>arr.push(axis==='x'?[w,hh,d,u,y,fixed+sign*out]:[d,hh,w,fixed+sign*out,y,u]);
      put(foundation,hi-lo+.5,.9,.2,(lo+hi)/2,.45,.12);
      for(const [y,hh,d] of [[h-.5,.24,.32],[h,.3,.65]]) put(trim,hi-lo+.5,hh,d,(lo+hi)/2,y,.12);
      put(caps,hi-lo+.9,.18,.85,(lo+hi)/2,h+.22,.12);
      // Panelled door and shallow threshold; colliders remain the building footprint.
      const u=(lo+hi)/2;
      put(iron,1.7,2.8,.25,u,1.4,.21);
      for(const d of [-1,1])put(trim,.2,3.1,.4,u+d,1.55,.25);
      put(trim,2.4,.3,.65,u,3.15,.3);
      put(caps,2.55,.14,.7,u,3.36,.3);
      put(warmPanes,1.5,.45,.14,u,2.5,.36);
      // Raised panels and worn brass are painted in the door material.
      for(let k=0;k<3;k++)put(trim,2.7,.12,.25,u,.06+k*.09,.3+k*.25);
      // Cornice dentils, individual icicles and foundation snowdrifts.
      for(let u=lo+.6;u<hi;u+=1.15)put(trim,.25,.3,.32,u,h-.26,.28);
      for(let u=lo+.4;u<hi;u+=.83){const l=.15+hash(Math.round(u*10),fixed,19)*.6;put(caps,.055,l,.07,u,h-l/2,.54);}
    };
    face('x',z1,x0,x1,1);face('x',z0,x0,x1,-1);
    face('z',x0,z0,z1,-1);face('z',x1,z0,z1,1);
  };
  // A pitched, snow-covered roof. The ridge runs along the longer side.
  const pitched = (x0, x1, z0, z1, y, rise, ends = brick(1, 0.5)) => {
    const alongX = x1 - x0 > z1 - z0;
    const g = gable((alongX ? z1 - z0 : x1 - x0) + 0.8, rise, (alongX ? x1 - x0 : z1 - z0) + 0.8, ends, snowRoof);
    // Gable roofs have no UVs in the shared kit; use metre-scale snow here.
    const roofGeo=g.children[1].geometry, rp=roofGeo.attributes.position, uv=[];
    for(let i=0;i<rp.count;i++)uv.push(rp.getX(i)/4,rp.getZ(i)/4);
    roofGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    if (alongX) g.rotation.y = Math.PI / 2;
    g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); scene.add(g);
    const cx=(x0+x1)/2, cz=(z0+z1)/2, span=alongX?x1-x0:z1-z0;
    for(let k=-1;k<=1;k+=2){
      const x=cx+(alongX?k*span*.32:0),z=cz+(alongX?0:k*span*.32);
      world.box(1.2,3,1.4,brick(.4,1),x,y+rise-.2,z);
      trim.push([1.6,.25,1.8,x,y+rise+1.3,z]);caps.push([1.7,.18,1.9,x,y+rise+1.5,z]);
    }
    for(let u=-span/2+5;u<span/2-3;u+=7){
      const x=alongX?cx+u:cx-2.5,z=alongX?cz+3:cz+u;
      world.box(2,1.9,2,white,x,y+rise*.58,z);
      const roof=gable(2.6,1,2.5,white,snowRoof);roof.position.set(x,y+rise*.58+.95,z);scene.add(roof);
      darkPanes.push([1.15,1.25,.1,x,y+rise*.58,z+1.06]);
      trim.push([.09,1.3,.12,x,y+rise*.58,z+1.13]);
    }

  };
  const round = (r, h, x, y, z, mat, sides = 8, r2 = r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, sides), mat); m.position.set(x, y, z); scene.add(m); return m; };

  // Baker Library across the north side, with its white clock tower.
  block(-34, 34, -104, -88, 13, brick3); pitched(-34, 34, -104, -88, 13, 5.5);
  block(-52, -34, -104, -91, 9, brick3); pitched(-52, -34, -104, -91, 9, 3.6);
  block(34, 52, -104, -91, 9, brick3); pitched(34, 52, -104, -91, 9, 3.6);
  const entry = litFacade(128, 96, (g, win, glow) => {
    if (!glow) { g.fillStyle = CREAM; g.fillRect(0, 0, 128, 4); door(g, 54, 54, 20, 42, '#2a2018'); }
    for (const x of [16, 98]) { win(x, 14, 14, 26); win(x, 56, 14, 26); }
    win(57, 12, 14, 28);
  }, { share: 0.85, seed: 3 });
  const hallMap=bakerSurface('brick');
  const hallBrick=(x,y)=>{const map=reuse(hallMap,x*.8,y*.8);return lambert({map,emissive:rgb(132,92,53),emissiveMap:map});};
  world.box(20, 14.5, 3.4, [hallBrick(1,4),hallBrick(1,4),snowRoof,snowRoof,hallBrick(5,3.6),hallBrick(5,3.6)], 0, 7.25, -86.6);
  world.wall(-10, 10, -88.5, -84.9);
  for(const [x,y] of [[-6.7,3.7],[6.7,3.7],[-6.7,10.2],[6.7,10.2],[0,11.3]]){
    darkPanes.push([2.25,3.5,.16,x,y,-84.82]);
    const room=bakerSurface('room',Math.round(x+y+20)%5);
    world.box(1.9,3.1,.14,lambert({map:room,emissive:rgb(215,185,140),emissiveMap:room}),x,y,-84.69);
    for(const dx of [-1.08,1.08])trim.push([.17,3.6,.28,x+dx,y,-84.6]);
    for(const dy of [-1.7,0,1.7])trim.push([2.4,.15,.3,x,y+dy,-84.58]);
    trim.push([.09,3.4,.3,x,y,-84.55],[2.65,.22,.6,x,y-1.8,-84.5]);caps.push([2.7,.12,.65,x,y-1.64,-84.49]);
  }
  // Projecting belt courses and individual window lintels break the flat entry mass.
  // They lie flush on the wall, behind the pilasters, and stop at the door and at the middle window.
  for(const [y,h,gap] of [[.55,1.1,1.75],[6.1,.3,0],[12.5,.3,1.5]]){
    if(!gap)litBoxes.push([20.3,h,.3,0,y,-84.75]);
    else for(const s of [-1,1])litBoxes.push([10.15-gap,h,.3,s*(gap+10.15)/2,y,-84.75]);
  }
  for(const x of [-6.7,6.7])for(const y of [3.7,10.2]){
    litBoxes.push([2.65,.28,.55,x,y+1.95,-84.48],[.3,.45,.58,x,y+1.99,-84.42]);
  }
  iron.push([2.5,3.7,.2,0,1.85,-84.76]);
  for(const x of [-1.4,1.4])trim.push([.22,4,.45,x,2,-84.55]);
  trim.push([3.15,.25,.6,0,4.05,-84.5],[.12,3.7,.3,0,1.85,-84.55]);
  warmPanes.push([2.5,.6,.1,0,3.4,-84.58]);
  for(const x of [-.65,.65])for(const y of [.8,1.9])trim.push([.85,.07,.15,x,y,-84.51]);

  for (const x of [-9.3, -4.3, 4.3, 9.3]) litBoxes.push([1, 13.4, 0.5, x, 6.7, -84.7]);
  litBoxes.push([20.8, 1.1, 0.9, 0, 13.95, -84.7]);
  const pediment = gable(20.8, 4.6, 3.8, lambert({map:reuse(hallMap,3.4,1.2),emissive:rgb(132,92,53),emissiveMap:reuse(hallMap,3.4,1.2)}), snowRoof); pediment.position.set(0, 14.5, -86.6); scene.add(pediment);

  for(const x of [-8,-3,3,8])bake.wash(x-1.8,-84.44,x+1.8,-84.44,0,12,[255,170,65],.55);
  bake.shade(-10,-84.4,10,-84.4,11,3.5,.66,true);
  for(const x of [-6.7,6.7])for(const y of [3.7,10.2])bake.shade(x-1.12,-84.51,x+1.12,-84.51,y+.6,1.1,.7,true);
  bake.pool(0,-70,23,[255,135,38],.25,.085);
  for(const x of [-8,0,8])bake.pool(x,-82,12,[255,140,55],.25,.085);
  const TZ = -96;
  for(const x of [-3,3]){
    props.lamp(x,TZ+5,0,{y:13,height:.6,style:'street',pool:false});
    bake.wash(x-1.2,TZ+4.56,x+1.2,TZ+4.56,13,13,[255,190,100],.65);
  }

  bake.building(-4.5,4.5,TZ-4.5,TZ+4.5,14.6,{y:13,flood:[255,199,114],floodStrength:.85,floodHeight:14.6});
  world.box(9, 14.6, 9, hallBrick(2.8, 4.5), 0, 20.3, TZ);                      // brick stage, up through the roof
  for(const x of [-4.15,4.15])litBoxes.push([.46,12.8,.35,x,20.7,TZ+4.58]);
  for(const y of [18.9,23.5,26.5])litBoxes.push([9.2,.18,.35,0,y,TZ+4.58]);
  for(const x of [-9.3,-4.3,4.3,9.3])for(const dx of [-.28,0,.28])litBoxes.push([.075,12.8,.12,x+dx,6.7,-84.38]);
  litBoxes.push([9.9, 0.8, 9.9, 0, 27.9, TZ]);
  const clockTex = drawTex(256, 256, (g) => {
    g.scale(4,4);
    g.drawImage(details.stone.image,0,0,64,64);
    g.fillStyle = '#2e2e36'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill();
    g.fillStyle = '#c6ba98'; g.beginPath(); g.arc(32, 32, 20.5, 0, 7); g.fill();
    g.strokeStyle = '#2e2e36'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 17); g.moveTo(32, 32); g.lineTo(43, 37); g.stroke();
    g.fillStyle = '#2e2e36'; for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283; g.fillRect(31 + Math.sin(a) * 17.5, 31 - Math.cos(a) * 17.5, 2, 2); }
  });
  const clock = lambert({ map: clockTex, emissive: rgb(220, 184, 124), emissiveMap: clockTex });
  world.box(8.2, 7, 8.2, [clock, clock, floodlit, floodlit, clock, clock], 0, 31.8, TZ);   // the clock stage
  litBoxes.push([9, 0.7, 9, 0, 35.65, TZ]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) litBoxes.push([0.9, 1.7, 0.9, sx * 3.9, 36.85, TZ + sz * 3.9]);
  const archTex = drawTex(32, 64, (g) => {
    g.fillStyle = CREAM; g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#23233a'; g.fillRect(9, 26, 14, 30); g.beginPath(); g.arc(16, 26, 7, 0, 7); g.fill();
  });
  // Actual open lantern: sky is visible between the eight columns.
  round(3.5,.5,0,36.3,TZ,floodlit);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.sin(a)*2.9,z=TZ+Math.cos(a)*2.9;
    whitePosts.push([.26,6.4,.26,x,39.65,z]);
    litBoxes.push([.75,.35,.75,x,36.65,z],[.75,.35,.75,x,42.65,z]);
  }
  round(.9,1.8,0,39,TZ,copper);
  for(const x of [-3.9,3.9])for(const z of [TZ-4.15,TZ+4.15])litBoxes.push([.42,6.8,.3,x,31.8,z]);
  round(3.7, 0.6, 0, 43.3, TZ, floodlit);
  round(2.3, 3.2, 0, 45.2, TZ, floodlit);
  round(2.5, 9.5, 0, 51.55, TZ, copper, 8, 0.05);                                                   // the copper spire
  world.box(0.16, 3.2, 0.16, copper, 0, 57.9, TZ); world.box(1.7, 0.25, 0.12, copper, 0, 59, TZ);   // weathervane

  // Dartmouth Row on the east side: white halls, the middle one with a cupola.
  const whiteEnds = lambert({ map: details.wood, color: rgb(228, 226, 218) });
  block(62, 76, -22, 22, 11, white3); pitched(62, 76, -22, 22, 11, 4.4, whiteEnds);
  block(60.6,62,-7,7,11,white3);
  const hallPediment = gable(14.4, 3.6, 1.6, white, snowRoof); hallPediment.rotation.y = -Math.PI / 2; hallPediment.position.set(61.4, 11, 0); scene.add(hallPediment);
  world.wall(60.6, 62, -7, 7);
  litBoxes.push([3.4, 3.4, 3.4, 69, 16.9, 0]);
  round(1.65,.25,69,18.6,0,floodlit);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;whitePosts.push([.14,2.8,.14,69+Math.sin(a)*1.3,20,Math.cos(a)*1.3]);}
  round(1.65,.3,69,21.3,0,floodlit);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.75, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), copper); dome.position.set(69, 21.4, 0); scene.add(dome);
  world.box(0.12, 2.2, 0.12, copper, 69, 24.2, 0);
  block(62, 74, -46, -28, 10, white3); pitched(62, 74, -46, -28, 10, 3.6, whiteEnds);
  block(62, 74, 28, 46, 10, white3); pitched(62, 74, 28, 46, 10, 3.6, whiteEnds);

  // Brick halls along the west side, the middle one with a white portico.
  block(-76, -62, -46, -24, 12, brick3); pitched(-76, -62, -46, -24, 12, 4);
  block(-76, -62, -18, 14, 13, brick3); pitched(-76, -62, -18, 14, 13, 4.2);
  for (const z of [-8.6, -4, 0.6, 5.2]) { whitePosts.push([0.5, 9.6, 0.5, -60.4, 4.8, z]); world.post(-60.4, z, 0.6); }
  whiteBoxes.push([2.6, 1.2, 16, -60.7, 10.2, -1.7]);
  const westPediment = gable(16, 3.4, 2.6, white, snowRoof); westPediment.rotation.y = Math.PI / 2; westPediment.position.set(-60.7, 10.8, -1.7); scene.add(westPediment);
  block(-76, -62, 22, 46, 11, brick3); pitched(-76, -62, 22, 46, 11, 3.8);

  // The inn and its neighbours along the south side.
  block(-8, 40, 70, 86, 15, brick4);
  bake.wash(40,69.96,-8,69.96,0,19,[255,186,110],.44);
  whiteBoxes.push([46, 0.4, 3.4, 16, 3.7, 68.4]);
  for (let x = -6; x <= 38; x += 5.5) { whitePosts.push([0.16, 3.5, 0.16, x, 1.75, 66.9]); world.post(x, 66.9, 0.25); }
  block(-50, -16, 70, 84, 11, brick3); pitched(-50, -16, 70, 84, 11, 3.6);
  block(46, 76, 70, 90, 10, brick3);
  // Nothing is built beyond the buildings, so the edges are closed off.
  world.wall(-120, -62, -140, 140); world.wall(62, 120, -140, 140); world.wall(-120, 120, 70, 140); world.wall(-120, 120, -140, -88);

  world.boxes(lambert({map:reuse(details.stone,6,1),color:rgb(181,181,176)}),foundation);
  world.boxes(white,trim); world.boxes(snowRoof,caps);
  world.boxes(lambert({color:rgb(24,34,48)}),darkPanes);
  const interior=drawTex(64,128,g=>{
    const grad=g.createLinearGradient(0,0,0,128);grad.addColorStop(0,'#ad814a');grad.addColorStop(.5,'#edc580');grad.addColorStop(1,'#987046');g.fillStyle=grad;g.fillRect(0,0,64,128);
    for(let x=0;x<64;x++){if(x<13||x>51){g.fillStyle=`rgba(92,63,39,${.2+.2*Math.sin(x*1.7)**2})`;g.fillRect(x,0,1,128);}}
    g.fillStyle='rgba(50,39,32,.25)';g.fillRect(0,101,64,27);g.fillRect(9,88,20,13);
    g.strokeStyle='#423f37';g.lineWidth=3;g.strokeRect(1,2,62,124);
    for(let x=16;x<64;x+=16){g.fillStyle='#514735';g.fillRect(x,0,2,128);g.fillStyle='#d3c0a0';g.fillRect(x+2,0,1,128);}
    g.fillStyle='#756449';g.fillRect(0,59,64,5);
    for(let i=0;i<300;i++){g.fillStyle=i%2?'rgba(255,236,192,.08)':'rgba(57,47,34,.09)';g.fillRect(i*17%64,i*31%128,2,2);}
  });
  world.boxes(lambert({map:interior,emissive:rgb(174,130,75),emissiveMap:interior}),warmPanes);
  world.boxes(lambert({color:rgb(132,112,83),emissive:rgb(74,54,28)}),amberPanes);
  world.boxes(lambert({map:details.door,color:rgb(230,235,230)}),iron);
  world.boxes(white, whiteBoxes); world.posts(white, whitePosts); world.boxes(floodlit, litBoxes);

  // ---------- trees: pines under snow, and bare trees ----------
  const trees = new Trees(world, { bark: [62, 50, 52], sun: [-0.4, 0.8, 0.45], snow: [194, 202, 221] });
  const pine = (x, z, h) => trees.conifer(x, z, h, [34, 62, 56], { snow: [176, 184, 224], solid: true });
  const bare = (x, z, h) => trees.bare(x, z, h, [73, 76, 79], { solid: true });
  for (const side of [-1, 1]) {
    for (let z = -42, i = 0; z <= 42; z += 14, i++) bare(side * (40 + hash(i, side, 1) * 2), z + hash(i, side, 2) * 3, 12 + hash(i, side, 3) * 4);
    for (let x = -28, i = 0; x <= 28; x += 14, i++) { if (Math.abs(x) > 4) bare(x + hash(i, side, 4) * 3, side * (47 + hash(i, side, 5) * 2), 12 + hash(i, side, 6) * 4); }
    for (const [x, z, h] of [[16, -70, 13], [27, -80, 16], [41, -72, 14], [53, -84, 15], [22, -64.5, 9]]) pine(side * x, z, h);
    pine(side * 58, 66, 12); pine(side * 57.5, -57, 13);
  }
  pine(58.5, 24.5, 11); pine(58, -25, 12); pine(-58.5, 18, 12); pine(-58, -21, 11);
  // Layered pine ridge closes gaps between the campus roofs.
  for(let i=0;i<55;i++){const a=i*Math.PI*2/55;trees.conifer(Math.cos(a)*148,Math.sin(a)*148,19+hash(i,3,4)*16,[20,36,40],{snow:[77,91,111]});}
  pine(-12,-45,10);
  pine(-9,-56,11);
  for(let i=0;i<18;i++)bare(-39+(i%2)*78,-48+i*5.5,8+hash(i,2,91)*5);
  for(const twig of trees.clusters.twig)twig.matrix.scale(new THREE.Vector3(.55,.55,.55));
  trees.build({ shadow: 0.22 });

  // ---------- lamps: a post, a glowing head, a halo, and a pool of warm light on the snow ----------
  const glowTex = drawTex(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.35, '#777'); grad.addColorStop(1, '#000');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  });
  const halo = new THREE.SpriteMaterial({ map: softDot, transparent:true, color: rgb(255, 137, 36), opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pool = new THREE.MeshBasicMaterial({ map: glowTex, color: rgb(150, 96, 52), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const posts = [], heads = [];
  const lamp = (x,z) => {
    const fixture=props.lamp(x,z,0,{height:4.2,style:'lantern',solid:true,pool:false,color:0x718086});
    fixture.traverse(m=>{if(m.isMesh&&m.geometry.type==='BoxGeometry'&&m.material.isMeshBasicMaterial){m.material=m.material.clone();m.material.map=null;m.material.color=rgb(255,192,65);m.material.fog=false;}if(m.isMesh&&m.material.isMeshLambertMaterial){m.material=m.material.clone();m.material.emissive=rgb(34,26,16);m.material.emissiveMap=m.material.map;}});
    heads.push([.2,.4,.2,x,3.9,z]);
    // A camera-facing halo, with its centre just in front of the opaque lantern.
    const glow=new THREE.Sprite(halo);glow.position.set(x,3.93,z);glow.scale.setScalar(2.8);glow.center.set(.5,.5);scene.add(glow);
    const poolMesh=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshBasicMaterial({map:softDot,color:rgb(255,142,48),transparent:true,opacity:.40,blending:THREE.AdditiveBlending,depthWrite:false}));
    poolMesh.rotation.x=-Math.PI/2;poolMesh.position.set(x,.078,z);scene.add(poolMesh);
    if(z===-24){const light=new THREE.PointLight(0xffca92,9,10,2);light.position.set(x,3.7,z);scene.add(light);}
  };
  for (const z of [-44, -24, 24]) lamp(z===-24?8.5:(z % 16 ? 2.7 : -2.7), z);
  for (const x of [-30, 30]) lamp(x, 2.7);
  for(const [x,z] of [[-30,-24],[-10,8],[-6,43]])lamp(x,z);
  for (const [x, z] of [[-41, -49], [41, -49], [-41, 49], [41, 49], [3, -72], [-3, -84], [57, 9], [57, -9], [-57, 6], [-57, -10], [12, 65.5], [-30, 65.5], [-9, 56]]) lamp(x, z);



  // ---------- snow sculpture and a snowman ----------
  const snow = lambert({ map: dartmouthSnow('ice'), color: rgb(214, 232, 250), transparent:true,opacity:.72,depthWrite:false });
  const carvedBlock=new THREE.BoxGeometry(1,1,1,4,4,4),cp=carvedBlock.attributes.position;
  for(let i=0;i<cp.count;i++){
    const p=new THREE.Vector3().fromBufferAttribute(cp,i),inner=p.clone().clampScalar(-.38,.38),normal=p.clone().sub(inner).normalize();
    p.copy(inner).addScaledVector(normal,.12);cp.setXYZ(i,p.x,p.y,p.z);
  }
  const cuv=carvedBlock.attributes.uv;
  for(let i=0;i<cuv.count;i++){const face=Math.floor(i/25);cuv.setXY(i,cuv.getX(i)*(face<2?2.3:3.1)+face*.173,cuv.getY(i)*1.6+face*.219);}
  carvedBlock.computeVertexNormals();
  world.instances(carvedBlock,snow, [[8, 2, 8, -15, 1, -13], [5.6, 2.4, 5.6, -15, 3.2, -13], [3, 3, 3, -15, 5.9, -13],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [0.8, 0.9, 0.8, -15 + a * 1.1, 7.85, -13 + b * 1.1]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [1.1, 1.2, 1.1, -15 + a * 2.25, 5, -13 + b * 2.25])]);
  world.wall(-19, -11, -17, -9);
  // The rounded carving itself carries the blue light: no rectangular wash cards.
  snow.emissive=rgb(65,70,77); snow.emissiveMap=snow.map;
  bake.pool(-15,-10,8,[164,183,198],.18);
  {
    const snowman = snow.clone();
    const ball = (r, y) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), snowman); m.position.set(11, y, 7); scene.add(m); };
    ball(1.0, 0.85); ball(0.72, 2.15); ball(0.5, 3.1);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), lambert({ color: rgb(236, 130, 50), emissive: rgb(60, 30, 10) }));
    nose.rotation.x = Math.PI / 2; nose.position.set(11, 3.1, 7.6); scene.add(nose);
    round(0.5, 0.2, 11, 2.72, 7, lambert({ color: rgb(30, 98, 62) }), 8, 0.42);                    // a green scarf
    world.boxes(lambert({ color: rgb(30, 28, 32) }), [[0.09, 0.09, 0.05, 10.82, 3.24, 7.44], [0.09, 0.09, 0.05, 11.18, 3.24, 7.44], [0.1, 0.1, 0.05, 11, 2.3, 7.7], [0.1, 0.1, 0.05, 11, 1.95, 7.72]]);
    world.boxes(lambert({ color: rgb(74, 54, 44) }), [[1.1, 0.07, 0.07, 9.95, 2.4, 7], [1.1, 0.07, 0.07, 12.05, 2.4, 7]]);
    world.post(11, 7, 1.05);
  }

  // ---------- winter street furniture, traffic traces and piled snow ----------
  const timber=lambert({map:details.timber,emissive:rgb(42,31,18),emissiveMap:details.timber}), metal=lambert({map:details.metal,color:rgb(70,80,86)});
  const snowItems=[], woodItems=[], metalItems=[], trackItems=[], bootItems=[];
  const moundGeo=new THREE.IcosahedronGeometry(1,2);
  const mound=(x,z,sx,sy,sz)=>snowItems.push([sx,sy,sz,x,sy*.22,z]);
  // Continuous low banks: irregular cross-sections, buried toes, no repeated balls.
  const drift=(ax,az,bx,bz,width,height,seed)=>{
    const length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length;
    const n=Math.ceil(length/.8),vertices=[],uv=[],indices=[];
    for(let i=0;i<=n;i++){
      const t=i/n,phase=t*length,w=width*(.8+.18*Math.sin(phase*.47+seed)+.12*Math.sin(phase*1.1));
      const h=height*(.7+.22*Math.sin(phase*.61+seed)+.1*Math.sin(phase*1.73))*Math.min(1,t*6,(1-t)*6);
      for(let j=0;j<7;j++){const q=j/6*2-1;vertices.push(ax+(bx-ax)*t+nx*w*q,Math.max(-.012,h*Math.pow(Math.max(0,1-q*q),1.7)-.025),az+(bz-az)*t+nz*w*q);uv.push(phase/4,j/6);if(i<n&&j<6){const k=i*7+j;indices.push(k,k+7,k+1,k+1,k+7,k+8);}}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mat=lambert({map:snowTex,emissive:rgb(80,78,86),emissiveMap:snowTex,side:THREE.DoubleSide});scene.add(new THREE.Mesh(geo,mat));
  };
  for(const x of [-44,44,-55,55,-61.6,61.6])for(const [a,b] of [[-50,-4],[4,51]])drift(x,a,x,b,1,.32,x);
  for(const z of [-52,52])for(const [a,b] of [[-42,-4],[4,42]])drift(a,z,b,z,1.3,.35,z);
  for(const [a,b] of [[-33,-11],[11,33]])drift(a,-87.6,b,-87.6,1.5,.45,a);
  for(const [ax,az,bx,bz] of [[-9,23,-12,7]])drift(ax,az,bx,bz,.9,.18,ax);
  
  const snowBench=(x,z,heading,scale)=>{
    const b=props.bench(x,z,heading,{solid:true,scale,snow:false});
    for(const [w,h,d,y,z0] of [[2,.045,.62,.54,0],[2,.045,.09,1.08,-.34]]){
      const cap=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),snowRoof);cap.position.set(0,y,z0);b.add(cap);
    }
    bake.shadow(x,z,1.8,.42,1.1,.095);
  };
  for(const [x,z] of [[25,12],[-27,-18],[-3,23]])snowBench(x,z,.6,1.25);
  // Tyre ruts, with broken snow between wheel tracks.
  for(const x of [-51,-49,49,51])for(let z=-85;z<67;z+=1.4)trackItems.push([.28,.012,1.4,x,.012,z]);
  for(const z of [-59,-57,58,60])for(let x=-54;x<55;x+=1.4)trackItems.push([1.4,.012,.28,x,.012,z]);
  world.boxes(lambert({map:details.road,color:rgb(170,175,185),emissive:rgb(14,15,18)}),trackItems);
  for(const [x,z] of [[-7,34],[7,20],[-7,-30],[8,-66],[-32,5],[32,-5]]){
    snowBench(x,z,Math.PI,1.4);
  }
  const lane=[],salt=[];
  for(let z=-83;z<65;z+=7)for(const x of [-49.5,49.5])lane.push([.13,.012,2.8,x,.018,z]);
  for(let x=-52;x<55;x+=7)for(const z of [-57,58])lane.push([2.8,.012,.13,x,.018,z]);
  for(let z=-50;z<52;z+=1.7)for(const x of [-52.7,-46.4,46.4,52.7])salt.push([.35+hash(z,x,3)*.4,.025,1.4,x,.015,z]);
  for(let x=-52;x<55;x+=1.7)for(const z of [54,61.7])salt.push([1.4,.025,.45,x,.015,z]);
  world.boxes(lambert({map:details.stone,color:rgb(220,215,190),emissive:rgb(25,24,20)}),lane);
  // Road salt stays in the road texture; repeated flattened ellipsoids read as scalloped banks.
  for(const z of [-36,-14,13,36])for(const x of [-56,56])lamp(x,z);
  for(const x of [-43,-17,8,34])lamp(x,64.5);
  // Broken, elongated warm reflections in the salted street wheel tracks.
  const wetStreak=drawTex(32,128,g=>{for(let y=0;y<128;y++){const a=Math.sin(y/128*Math.PI)**2*(.25+.65*hash(y,1,28));g.fillStyle=`rgba(255,255,255,${a})`;g.fillRect(7+Math.sin(y*.7)*3,y,16,1);}});
  const reflectionGeo=new THREE.PlaneGeometry(1,1);reflectionGeo.rotateX(-Math.PI/2);
  const reflections=[];
  for(const h of heads){const x=Math.abs(h[3])>45?h[3]*.88:h[3],z=h[5]>53?h[5]-6:h[5];if(Math.abs(h[3])>45||h[5]>53){
    for(let j=0;j<4;j++)reflections.push([.18+j*.13,1,5+j*1.9,x+(j-1.5)*.27,.081,z-1+j*.7]);
  }}
  world.instances(reflectionGeo,new THREE.MeshBasicMaterial({map:wetStreak,color:rgb(244,175,86),transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false}),reflections);
  const snowReflections=[];
  for(const h of heads)if(Math.abs(h[3])<45&&h[5]<53){
    for(let j=0;j<5;j++)snowReflections.push([.3+j*.24,1,8+j*2,h[3]+(j-2)*.65,.083,h[5]+5+j*.5]);
  }
  world.instances(reflectionGeo,new THREE.MeshBasicMaterial({map:wetStreak,color:rgb(255,155,65),transparent:true,opacity:.26,blending:THREE.AdditiveBlending,depthWrite:false}),snowReflections);
  const lampGlowGeo=new THREE.BufferGeometry();lampGlowGeo.setAttribute('position',new THREE.Float32BufferAttribute(heads.flatMap(h=>h.slice(3)),3));
  scene.add(new THREE.Points(lampGlowGeo,new THREE.PointsMaterial({map:softDot,color:rgb(255,143,36),transparent:true,opacity:.55,size:3.8,blending:THREE.AdditiveBlending,depthWrite:false})));


  // Cars from the shared vehicle kit: rows parked under snow along the streets, clear of the crossings,
  // and two driving slowly past with their lamps on.
  const cars = new Cars(world, { night: true, snow: [214, 222, 240] });
  // The car kit lays its own soft shadow under each car.
  for (const side of [-1, 1]) for (const [za, zb] of [[-46, -9], [9, 46]]) cars.park(side * 53.6, za, side * 53.6, zb, { flip: side > 0 });
  cars.add('sedan',-53.6,0,0,null,{solid:true,lights:true});
  cars.add('hatch',53.6,0,Math.PI,null,{solid:true,lights:true});
  cars.park(-40, 62.6, -9, 62.6); cars.park(9, 62.6, 40, 62.6, { flip: true });
  // Keep vehicle motion local until the kit drive callback's undefined detail variables are fixed.
  for(const [type,x,za,zb,speed,offset] of [['sedan',-48.6,-50,56,6.5,20],['suv',48.6,54,-50,6,70]]){
    const car=cars.add(type,x,za,0),span=Math.abs(zb-za);car.userData.keepAnimated=true;
    world.ticks.push(t=>{const lap=((t*speed+offset)%(span*2))/span,k=lap<1?lap:2-lap;car.position.set(x,0,za+(zb-za)*k);car.rotation.y=(zb>za?0:Math.PI)+(lap<1?0:Math.PI);});
  }
  const sign=(x,z,text,w=2.8,y=2.45)=>{
    const tex=drawTex(256,64,g=>{g.fillStyle='#16392d';g.fillRect(0,0,256,64);g.strokeStyle='#c3c9b5';g.lineWidth=3;g.strokeRect(3,3,250,58);g.fillStyle='#ede4c9';g.font='22px Georgia';g.textAlign='center';g.fillText(text,128,39);});
    world.box(w,.55,.12,lambert({map:tex,emissive:rgb(190,164,118),emissiveMap:tex}),x,y,z);
    metalItems.push([.09,2.1,.09,x,1.05,z]);world.post(x,z,.15,2.8);
    snowItems.push([w*.54,.08,.16,x,2.84,z]);
  };
  sign(-1,44,'DARTMOUTH');sign(-39,53,'E. WHEELOCK ST',3.5);sign(39,-52,'N. MAIN ST');sign(-15,-7.8,'WINTER CARNIVAL',3.5);
  world.boxes(timber,woodItems);world.boxes(metal,metalItems);
  world.instances(moundGeo,snowRoof,snowItems);

  // The carnival castle has faceted carved turrets, arched relief and tool marks.
  const carved=lambert({map:dartmouthSnow('carved'),color:rgb(205,230,246),emissive:rgb(21,35,44),emissiveMap:dartmouthSnow('carved'),flatShading:true});
  const grooves=[],turrets=[];
  for(const dx of [-2.5,2.5])for(const dz of [-2.5,2.5]){
    turrets.push([.85,3.6,.85,-15+dx,3.8,-13+dz]);
    round(1.12,1.65,-15+dx,6.3,-13+dz,carved,8,.05);
  }
  world.posts(carved,turrets);
  const arch=new THREE.Mesh(new THREE.TorusGeometry(1.35,.24,5,14,Math.PI),carved);arch.position.set(-15,2.5,-8.97);scene.add(arch);
  world.boxes(carved,[[.48,1.6,.35,-16.35,1.7,-8.97],[.48,1.6,.35,-13.65,1.7,-8.97]]);
  for(let row=0;row<8;row++)for(let j=0;j<5;j++)grooves.push([.65,.035,.018,-18.5+j*1.45+(row%2)*.3,.4+row*.2,-8.98]);
  const iceRims=[];
  for(const [r,y] of [[4,2],[2.8,4.4],[1.5,7.4]])for(let k=0;k<=12;k++){
    const u=-r+k*r/6;
    for(const side of [-1,1])iceRims.push([.07,.07,.07,-15+u,y,-13+side*r],[.07,.07,.07,-15+side*r,y,-13+u]);
  }
  const rimBulbs = world.instances(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:rgb(255,196,78)}),iceRims);
  const rimGeo=new THREE.BufferGeometry();rimGeo.setAttribute('position',new THREE.Float32BufferAttribute(iceRims.flatMap(a=>a.slice(3)),3));
  const rimGlow = new THREE.PointsMaterial({map:softDot,color:rgb(255,162,58),size:.7,opacity:.7,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  scene.add(new THREE.Points(rimGeo,rimGlow));
  const iceCore = world.box(2.1,4.5,2.1,new THREE.MeshBasicMaterial({map:roofTex,color:rgb(255,188,99)}),-15,3,-13);
  bake.pool(-15,-9,9,[255,154,68],.28,.086);
  const iceLight=new THREE.PointLight(0xffb553,18,15,2);iceLight.position.set(-15,3,-9);scene.add(iceLight);
  iceLight.name = 'Snow castle light';
  props.lamp(-19.6,-9,0,{height:1.1,style:'street',pool:false});
  bake.pool(-19.6,-9,5,[255,175,89],.4);
  const castleLights = [
    [snow.emissive, rgb(36, 131, 195)], [carved.emissive, rgb(24, 82, 129)],
    [rimBulbs.material.color, rgb(156, 227, 255)], [rimGlow.color, rgb(70, 180, 255)],
    [iceCore.material.color, rgb(91, 195, 255)], [iceLight.color, rgb(65, 170, 255)],
  ].map(([color, blue]) => ({ color, blue, warm: color.clone() }));
  let blueLights = false;
  world.interactions.push({
    x: -19.6, y: 1.65, z: -9, r: 3,
    get label() { return blueLights ? 'Light the castle amber' : 'Light the castle blue'; },
    act() {
      blueLights = !blueLights;
      for (const light of castleLights) light.color.copy(blueLights ? light.blue : light.warm);
    },
  });
  // Narrow polished edges catch the internal illumination without brick joints.
  world.boxes(new THREE.MeshBasicMaterial({map:details.grain,color:rgb(143,163,174)}),[ [.08,2.1,.08,-17.75,3.1,-10.18],[.06,2.7,.06,-13.55,5.65,-11.45] ]);
  // Garland on the inn and wreaths at the library, deliberately restrained.
  const green=lambert({map:details.timber,color:rgb(76,119,66),emissive:rgb(27,40,17),emissiveMap:details.timber}), bulbs=[],wreathLeaves=[],wreathBerries=[];
  for(const x of [-4.3,4.3]){
    const wreath=new THREE.Mesh(new THREE.TorusGeometry(.68,.18,5,12),green);wreath.position.set(x,4.1,-84.36);scene.add(wreath);
    world.box(.4,.4,.1,lambert({color:rgb(149,37,43)}),x,3.45,-84.16);
    for(let j=0;j<28;j++){const a=j*Math.PI/14;wreathLeaves.push([.15,.24,.12,x+Math.sin(a)*.68,4.1+Math.cos(a)*.68,-84.28]);if(j%4===0)wreathBerries.push([.075,.075,.07,x+Math.sin(a)*.7,4.1+Math.cos(a)*.7,-84.10]);} 
  }
  world.instances(new THREE.IcosahedronGeometry(1,0),green,wreathLeaves);world.instances(new THREE.SphereGeometry(1,6,4),lambert({color:rgb(173,48,28),emissive:rgb(45,12,5)}),wreathBerries);
  for(let x=-6;x<39;x+=.65)bulbs.push([.08,.08,.08,x,3.4-Math.sin((x+6)/5.5*Math.PI)**2*.45,66.8]);
  world.instances(new THREE.SphereGeometry(1,10,6),new THREE.MeshBasicMaterial({color:rgb(255,199,119)}),bulbs);

  // December tree: snowy layered boughs, a spiral of warm bulbs and a star.
  const festive=[], festiveSnow=[], festiveWood=[];
  for(let tier=0;tier<9;tier++){
    const y=1.5+tier*.88,r=3.7-tier*.36;

    for(let j=0;j<20;j++){const a=j*Math.PI/10+tier*.4;festive.push([.075,.075,.075,-9+Math.cos(a)*r*.89,y+.35+Math.sin(a*3)*.18,-56+Math.sin(a)*r*.89]);}
  }
  const star=new THREE.Mesh(new THREE.OctahedronGeometry(.42),new THREE.MeshBasicMaterial({color:rgb(255,222,132)}));star.position.set(-9,11.4,-56);scene.add(star);world.post(-9,-56,3.7);
  bake.pool(-9,-56,10,[255,182,88],.55);
  // Two small hot-drinks huts frame the approach, leaving the main path clear.
  for(const [x,z] of [[-5.5,-35],[3.4,-34.5]]){
    world.box(5,2.7,3,timber,x,1.35,z);world.wall(x-2.6,x+2.6,z-1.6,z+1.6,4.2);
    const roof=gable(6,1.5,4,timber,snowRoof);
    // The shared gable has no roof UVs; supply them locally for the snow grain.
    const roofGeo=roof.children[1].geometry,rp=roofGeo.attributes.position,ruv=[];
    for(let k=0;k<rp.count;k++)ruv.push(rp.getX(k)/3,rp.getZ(k)/3);
    roofGeo.setAttribute('uv',new THREE.Float32BufferAttribute(ruv,2));
    const roofSnow=lambert({map:roofTex,emissive:rgb(70,72,85),emissiveMap:roofTex});
    for(const side of [-1,1]){const lip=world.box(3.4,.14,.26,roofSnow,x+side*1.5,3.48,z+2.08);lip.rotation.z=-side*Math.atan(.5);}
    world.box(6.05,.12,.22,roofSnow,x,2.78,z+2.03);
    roof.position.set(x,2.7,z);scene.add(roof);
    world.box(4.35,1.45,.08,lambert({map:facades.shopFacade.map,emissiveMap:facades.shopFacade.map,emissive:rgb(255,150,58)}),x,1.9,z+1.54);
    world.box(5.25,.22,.8,timber,x,1.05,z+1.8);
    sign(x,z+2.08,'HOT COCOA',2.7,2.25);
    for(let j=0;j<13;j++)festive.push([.07,.07,.07,x-2.7+j*.45,2.67,z+2.21]);
    for(let j=0;j<7;j++)festiveWood.push([.12,.18,.12,x-1.7+j*.5,1.25,z+1.95]);
    const ornament=lambert({color:rgb(174,57,32),emissive:rgb(80,23,9)});
    for(let j=0;j<5;j++){
      const shape=new THREE.Shape(),cx=x-1.8+j*.88,cy=2.48;
      if(j%2){for(let k=0;k<10;k++){const a=k*Math.PI/5,r=k%2?.10:.24;const px=Math.sin(a)*r,py=Math.cos(a)*r;k?shape.lineTo(px,py):shape.moveTo(px,py);}shape.closePath();}
      else {shape.moveTo(0,-.23);shape.bezierCurveTo(-.4,.02,-.22,.34,0,.12);shape.bezierCurveTo(.22,.34,.4,.02,0,-.23);}
      const charm=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false,curveSegments:5}),j%2?floodlit:ornament);
      charm.position.set(cx,cy,z+2.24);scene.add(charm);
      festiveWood.push([.018,.22,.018,cx,2.7,z+2.25]);
    }
    // Produce trays, jars and a painted wooden nutcracker at the end of the counter.
    const stock=[];
    for(let j=0;j<18;j++)stock.push([.14,.14,.14,x+.45+j%6*.21,1.25+Math.floor(j/6)*.13,z+1.98]);
    world.instances(new THREE.IcosahedronGeometry(1,0),ornament,stock);
    world.box(1.5,.16,.48,timber,x+1,1.19,z+1.96);
    world.box(.32,.46,.25,ornament,x-2,1.53,z+1.97);
    world.box(.26,.25,.23,white,x-2,1.88,z+1.97);
    world.box(.34,.25,.28,metal,x-2,2.13,z+1.97);
    for(const dx of [-.1,.1])world.box(.09,.27,.12,metal,x-2+dx,1.16,z+1.97);
    world.box(.23,.035,.02,metal,x-2,1.87,z+2.1);
    for(const dx of [-.06,.06])world.box(.035,.04,.02,metal,x-2+dx,1.95,z+2.1);
    bake.pool(x,z+3,13,[255,148,58],.32,.085);
    const light=new THREE.PointLight(0xffa43e,22,10,2);light.position.set(x,2.5,z+2);scene.add(light);
    props.pendant(x+2.1,z+1.9,0,{height:2.65,pool:false});
    for(let j=0;j<5;j++){props.cup(x-.7+j*.33,z+2.03,0,{y:1.18,scale:1.25});}
    round(.3,.65,x-1.55,1.52,z+1.95,lambert({map:details.metal,color:rgb(180,158,116),emissive:rgb(65,49,30),emissiveMap:details.metal}),10);
    round(.34,.08,x-1.55,1.88,z+1.95,metal,10);
    world.box(.24,.06,.1,metal,x-1.55,1.38,z+2.27);
    for(let j=0;j<3;j++){props.plate(x+.9+j*.4,z+1.95,0,{y:1.17});round(.12,.09,x+.9+j*.4,1.24,z+1.95,lambert({map:details.timber,color:rgb(232,165,90)}));}
    const steamGeo=new THREE.BufferGeometry(),steamPos=[];
    for(let i=0;i<18;i++)steamPos.push(x-1.55+Math.sin(i*.65)*.12,1.98+i*.055,z+1.95+Math.cos(i)*.045);
    steamGeo.setAttribute('position',new THREE.Float32BufferAttribute(steamPos,3));
    scene.add(new THREE.Points(steamGeo,new THREE.PointsMaterial({map:softDot,color:rgb(221,211,193),transparent:true,opacity:.65,size:.65,depthWrite:false})));
    const wreath=new THREE.Mesh(new THREE.TorusGeometry(.35,.1,5,12),green);wreath.position.set(x+1.65,2.3,z+1.62);scene.add(wreath);
    drift(x-2.6,z+2.5,x-2.6,z-1.5,.55,.3,x);
  }
  const stallHalos=new THREE.BufferGeometry();
  stallHalos.setAttribute('position',new THREE.Float32BufferAttribute(festive.filter(a=>a[1]===.07).flatMap(a=>a.slice(3)),3));
  scene.add(new THREE.Points(stallHalos,new THREE.PointsMaterial({map:softDot,color:rgb(255,155,45),size:1.7,opacity:.7,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));
  bake.pool(1,-26,12,[255,145,55],.14,.085);
  world.boxes(white,festiveWood);
  // Shopfronts along the inn, below the existing veranda.
  const shop=lambert({map:facades.shopFacade.map,emissiveMap:facades.shopFacade.emissiveMap,emissive:rgb(200,174,126)});
  for(let x=-3;x<39;x+=8)world.box(7.5,3.6,.1,shop,x,1.8,69.91);
  const wireMat=lambert({map:details.metal,color:rgb(61,57,49)});
  const wire=points=>{const curve=new THREE.CatmullRomCurve3(points);scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve,points.length*2,.009,4,false),wireMat));};
  wire(Array.from({length:91},(_,i)=>{const x=-6+i*.5;return new THREE.Vector3(x,3.4-Math.sin((x+6)/5.5*Math.PI)**2*.45,66.8);}));
  // Garland arcs between carnival posts.
  for(const [ax,az,bx,bz] of [[-18,-40,14,-53],[-31,-8,-5,-8]]){
    for(const [x,z] of [[ax,az],[bx,bz]]){world.box(.12,5,.12,timber,x,2.5,z);world.post(x,z,.15);}
    wire(Array.from({length:45},(_,j)=>{const t=j/44;return new THREE.Vector3(ax+(bx-ax)*t,5-Math.sin(t*Math.PI)*1.1,az+(bz-az)*t);}));
    for(let j=0;j<=44;j++){const t=j/44;festive.push([.035,.035,.035,ax+(bx-ax)*t,5-Math.sin(t*Math.PI)*1.1,az+(bz-az)*t]);}
  }
  world.instances(new THREE.SphereGeometry(1,10,6),new THREE.MeshBasicMaterial({color:rgb(255,198,100)}),festive);
  for(const list of [bulbs,festive]){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(list.flatMap(a=>a.slice(3)),3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({map:softDot,transparent:true,blending:THREE.AdditiveBlending,color:rgb(255,191,104),size:1.0,opacity:.8,depthWrite:false})));
  }
  // Distant college town and church beyond the Green.
  for(let i=0;i<12;i++){const x=-100+i*18,h=10+hash(i,2,16)*10;world.box(14,h,10,lambert({map:facades.brickFacade.map,emissive:rgb(52,43,31),emissiveMap:facades.brickFacade.emissiveMap}),x,h/2,-122);}
  world.box(8,19,8,white,-88,9.5,-87);round(4.7,20,-88,29,-87,floodlit,4,0);
  // Extra compressed tracks and path banks.
  const banks=[],skiTracks=[];

  for(let z=-39;z<30;z+=.8)for(const x of [20,20.4])skiTracks.push([.045,.01,.7,x+Math.sin(z*.04)*3,.04,z]);
  world.instances(moundGeo,snowRoof,banks);world.boxes(lambert({color:rgb(104,118,147)}),skiTracks);


  // ---------- people, in coats, hats and scarves ----------
  const JACKETS = [[99, 112, 143], [76, 129, 96], [164, 68, 57], [136, 122, 108], [187, 142, 88], [98, 91, 80], [137, 105, 123]];
  const SKIN = [[214, 170, 132], [150, 104, 72], [232, 190, 150], [112, 78, 56]];
  const HAIR = [[34, 26, 22], [120, 84, 44], [70, 44, 28], [56, 38, 28]];
  const person = (i) => {
    const woman = i % 2 === 1;
    return new Figure({ variant:i, physique: ['slim','regular','stocky','heavy','tall'][i%5], coatLength:i%3?'long':'short', hatFit:i%2?'loose':'fitted', face: i % 3, skin: SKIN[i % 4], hair: HAIR[(i * 3) % 4], hairStyle: ['beanie','swept','long','parted','receding','tied','cap'][i%7], build: woman ? 'f' : 'm', height: 1.58 + ((i * 7) % 11) * 0.035,
      top: JACKETS[i % 7], topStyle: i % 2 ? 'coat' : 'puffer', scarf: true, bottomStyle: i % 2 ? 'chinos' : 'jeans', bottom: i % 3 ? [44, 46, 58] : [70, 72, 84], shoes: [52, 44, 40] });
  };
  const walkingPerson=i=>{const f=person(i);f.root.userData.keepAnimated=true;return f;};
  // x, z, facing: people standing and talking
  [[-10.5, -6.4, 4.0], [-9.4, -7.4, 0.9], [9.6, 9.6, 0.75], [24, 60, 3.6], [25.2, 60.8, 5.4]].forEach(([x, z, facing], i) => {
    const f=person(i); f.place(x,0,z,facing); f.talk(i*.7); f.hold('cup'); scene.add(f.root); world.post(x, z, 0.35, 1.9);
  });
  // People crossing the Green on the paths, back and forth: from x, z to x, z, speed.
  [[0.6, 48, 0.6, -48, 1.3], [1.2, -50, 1.2, 40, 1.15], [-40, 47.6, 38, -44.6, 1.25], [36, 43.4, -34, -39.4, 1.2], [-42, 0.7, 42, 0.7, 1.1], [0.8, -64, 0.8, -83, 0.9]].forEach(([ax, az, bx, bz, speed], i) => world.walker(walkingPerson(i + 2), ax, az, bx, bz, speed, i * 23 + 30));

  // Walk routes stay outside the eight-metre opening stroll corridor.
  [[-4,-45,-4,-60],[4,-51,4,-66],[1,-62,-5,-70],[-26,-18,-36,-13],[-8,-4,-11,-7]].forEach(([ax,az,bx,bz],i)=>world.walker(walkingPerson(180+i),ax,az,bx,bz,.7,i*.6));

  // Pairs, carnival customers and a group admiring the snow castle.
  const gathering=[[45,4],[46.2,4.6],[48,-9],[49,-9.8],[-44,-8],[-45.1,-8.8],[-46,4],[-47,4.8],[4,49],[5.2,49.7],[18,58],[19.2,58.7],[-2.5,-29],[3.5,-31],[4.7,-31.7],[-4.5,-32],[-4,-43],[-5.2,-43.6],[-11,-39],[-12,-40], [11,-51],[12,-51],[-20,-7],[-21,-8],[-9,-16],[-8,-15],[13,5],[15,7],[17,6],[24,-28],[25,-28],[22,28],[23,29],[-36,18],[-35,19]];
  gathering.forEach(([x,z],i)=>{const f=person(i+12);const mate=gathering[i%2?i-1:Math.min(i+1,gathering.length-1)];f.place(x,0,z,Math.atan2(mate[0]-x,mate[1]-z));if(i%4===0)f.hold('cup');else if(i%4===1)(f.talk(i*.6),f.hold('cup'));else if(i%4===2)f.phone();else f.hold('cup');scene.add(f.root);world.post(x,z,.32,1.9);});
  const foreground=[[27,10],[29.5,8.4],[32,7],[-25,-22],[-26.4,-21.2],[-30,-15],[-5,37],[-3.7,37.5],[1,42],[-9,12],[-7.8,11.5],[-3,6],[55.1,-3.4],[57.7,1.7],[-7,-32.5],[7.8,-38.6],[-50,24],[-51,22.5],[-20,64],[-18.7,64.5]];
  foreground.forEach(([x,z],i)=>{
    const f=person(i+61),mate=foreground[i%2?i-1:Math.min(i+1,foreground.length-1)];f.place(x,0,z,Math.atan2(mate[0]-x,mate[1]-z));
    if(i%3===0){f.talk(i);f.hold('cup');}else if(i%3===1)f.hold('cup');else f.hold('cup');
    scene.add(f.root);world.post(x,z,.32,1.9);
  });
  // Close customers leave the central route open and face back into the market.
  [[-.85,-21.6,2.7],[.8,-22.5,-2.4],[-5.9,-33.4,Math.PI],[1.1,-38,1.3],[2.4,-37.8,-1.8],[-5.3,-39,Math.PI],[-5.3,14,2.8],[-7.8,13,3.4],[-24,59,1.4],[-22,60.2,4.2]].forEach(([x,z,h],i)=>{
    const f=person(110+i);f.place(x,0,z,h);f.idle(i*.3);if(i<2)f.walk(i?4.7:1.5,1);else if(i%3===0)f.hold('cup');else if(i%3===1)f.phone();else f.hold('book');scene.add(f.root);world.post(x,z,.3,1.9);
  });
  const marketChild=new Figure({age:'child',height:1.17,build:'m',topStyle:'puffer',top:[169,61,45],bottomStyle:'jeans',bottom:[63,69,84],hairStyle:'beanie',scarf:true});
  marketChild.place(-2.9,0,-38.5,-1.5);marketChild.hold('cup');scene.add(marketChild.root);world.post(-2.9,-38.5,.24,1.3);
  const parent=person(128);parent.place(-4,0,-38.5,1.4);parent.drink();scene.add(parent.root);world.post(-4,-38.5,.32,1.9);
  // Customers on the camera-facing side of both counters; the stroll corridor
  // x=-1.2, z=-40..-48 is deliberately empty. Pairs leave gaps to the hall.
  const customers=[[-5.8,-30.8],[-4.7,-30.4],[-3.6,-29.9],[-6.6,-28.2],[-5.4,-27.8],
    [2.5,-30.9],[3.7,-30],[4.7,-28.9],[2.1,-28.4],[3.2,-27.5],
    [-3.3,-26.4],[-2.4,-25.6],[1.9,-25.2],[3,-24.6],[-4.3,-24.5],[-3.4,-23.8],
    [-2.2,-35.5],[.2,-35.9],[.3,-33.8],[5.9,-30.1],[6.5,-27.5],[4.3,-26]];
  customers.slice(0,16).map(([x,z])=>[x*.72,z]).forEach(([x,z],i)=>{
    const f=i===4||i===13?new Figure({age:'child',height:i===4?1.12:1.28,variant:150+i,topStyle:'coat',top:JACKETS[(i+2)%7],bottom:[46,39,33],hairStyle:'beanie',scarf:true}):person(150+i);
    f.place(x,0,z,i<10?Math.PI+(i%2?.3:-.2):i%2?2.7:3.7);
    if(i>=10&&i<16)f.walk(1.2+i*.65,1);else if(i%3===0)f.drink();else if(i%3===1){f.talk(i);f.hold('cup');}else f.armsCrossed();
    scene.add(f.root);world.post(x,z,i===4||i===13?.23:.3,1.9);
  });
  // A scaled younger figure beside the adult, in a red winter coat.
  const child=new Figure({age:'child',height:1.22,build:'f',physique:'regular',topStyle:'coat',top:[151,49,52],bottom:[53,58,70],hairStyle:'beanie',scarf:true});
  child.place(29.1,0,10.8,2.8);child.walk(1.5,1);scene.add(child.root);world.post(29.1,10.8,.23,1.3);
  for(const [i,x,z] of [[90,-7,34.2],[91,7,20.2],[92,-7,-29.8]]){
    const f=person(i);f.place(x,0,z,Math.PI);f.sitOn(.72,'cup');scene.add(f.root);
  }
  // Skis carried upright; a child's sled and partly buried bicycles.
  const gear=[];
  for(const x of [24.35,24.6])gear.push([.12,2.7,.08,x,1.5,-28]);
  for(const dx of [-.38,.38])gear.push([.06,.13,1.9,17+dx,.15,8.6]);
  gear.push([.95,.12,1.4,17,.32,8.6],[.035,.035,1.6,17,.4,7.2]);
  world.boxes(timber,gear);
  for(const [x,z] of [[-34,4],[33,-4]])props.bicycle(x,z,Math.PI/2,{solid:true,snow:true});
  for(const [x,z] of [[-7.5,-33],[9,-39],[31,-4]])props.bin(x,z,0,{solid:true});
  const builtProps=props.build();
  // A little warm bounce survives kit batching on the textured metal and wood.
  for(const m of builtProps)if(m.isMesh&&m.material.isMeshLambertMaterial&&m.material!==snowRoof){m.material.emissive=rgb(18,14,9);m.material.emissiveMap=m.material.map;}
  const animals=new Animals(world);animals.dog(-10.3,11.2,2,{coat:'brown',pose:'sit',scale:.8});
  bake.shadow(-10.3,11.2,.5,.3,.7);

  // ---------- falling snow: a box of flakes that follows the camera ----------
  {
    const COUNT = 1600, SIZE = [46, 26, 46], pts = new Float32Array(COUNT * 3), seeds = [];
    for (let i = 0; i < COUNT; i++) seeds.push([hash(i, 1, 9) * SIZE[0], hash(i, 2, 9) * SIZE[1], hash(i, 3, 9) * SIZE[2], 1.6 + hash(i, 4, 9) * 1.6]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const colors=new Float32Array(COUNT*3);geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    for(let bucket=0;bucket<3;bucket++){
      const part=new THREE.BufferGeometry();part.setAttribute('position',geo.attributes.position);part.setAttribute('color',geo.attributes.color);
      part.setIndex(Array.from({length:COUNT},(_,i)=>i).filter(i=>i%3===bucket));
      const flakes=new THREE.Points(part,new THREE.PointsMaterial({transparent:true,vertexColors:true,map:softDot,size:[6,8,10][bucket],sizeAttenuation:false,opacity:.8,depthWrite:false}));
      flakes.frustumCulled=false;scene.add(flakes);
    }
    const wrap = (v, size, centre) => ((((v - centre) % size) + size * 1.5) % size) - size / 2 + centre;
    world.ticks.push((t) => {
      const c = world.sky.position; // the sky dome sits on the camera
      seeds.forEach(([x, y, z, fall], i) => {
        pts[i * 3] = wrap(x + Math.sin(t * 0.6 + i) * 0.5 + t * 0.7, SIZE[0], c.x);
        pts[i * 3 + 1] = wrap(y - t * fall, SIZE[1], c.y + 8);
        pts[i * 3 + 2] = wrap(z + t * 0.3, SIZE[2], c.z);
      });
      for(let i=0;i<COUNT;i++){
        const x=pts[i*3],y=pts[i*3+1],z=pts[i*3+2];
        let warm=0;for(const h of heads)warm=Math.max(warm,Math.max(0,1-Math.hypot(x-h[3],y-h[4],z-h[5])/5));
        colors.set([.87+warm*.13,.9-warm*.12,.98-warm*.4],i*3);
      }
      geo.attributes.color.needsUpdate=true;
      geo.attributes.position.needsUpdate = true;
    });
  }

  // ---------- where the chapter ends, and the captions ----------
  world.exit = { x: 0, z: -83.6, r: 1.6 };
  world.spots = memories.dartmouth.map(({ at: [x, z], within, text }) => ({ x, z, r: within, text }));
  world.start = { x: -1.2, z: -40, heading: Math.PI, camYaw: Math.PI / 2, camPitch: 0.25 };   // past the two huts, so neither wall fills the camera behind you
  // The establishing shot: the tower and the moon over the crowd at the carnival stalls.
  world.opening = { pos: [0.3, 1.5, -14], look: [0, 20, -96], drift: [0, 0.05, -1.6], seconds: 6, fov: 50 };
  // Batch repeated parked-car fittings and static joinery by geometry/material.
  // Moving cars remain separate so their lights and plates follow their bodies.
  scene.updateMatrixWorld(true);
  const batches=new Map();
  scene.traverse(m=>{
    if(!m.isMesh||m.isInstancedMesh||m.isSkinnedMesh||m.geometry.type!=='BoxGeometry'||Array.isArray(m.material)||m.material.transparent)return;
    for(let p=m;p&&p!==scene;p=p.parent)if(p.userData.keepAnimated||p.userData.lookKey!==undefined)return;
    const mat=m.material,key=JSON.stringify([m.geometry.parameters,mat.type,mat.map?.uuid,mat.color?.getHex(),mat.emissive?.getHex(),mat.emissiveMap?.uuid,mat.side,mat.vertexColors]);
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);
  });
  for(const meshes of batches.values())if(meshes.length>1){
    const inst=new THREE.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
    meshes.forEach((m,i)=>{inst.setMatrixAt(i,m.matrixWorld);m.removeFromParent();});inst.computeBoundingSphere();scene.add(inst);
  }
  // Merge fixed fittings with the same finish, regardless of their dimensions.
  // People and animated props retain their own bounds and skeletons.
  const fixed=new Map();
  scene.updateMatrixWorld(true);
  scene.traverse(m=>{
    if(!m.isMesh||m.isInstancedMesh||m.isSkinnedMesh||Array.isArray(m.material)||m.material.transparent||m.material.vertexColors||!m.geometry.attributes.uv||!m.geometry.attributes.normal)return;
    for(let p=m;p&&p!==scene;p=p.parent)if(p.userData.keepAnimated || p.userData.figure||p.userData.lookKey!==undefined)return;
    const a=m.material,key=[a.type,a.map?.uuid,a.color?.getHex(),a.emissive?.getHex(),a.emissiveMap?.uuid,a.side,a.flatShading].join(':');
    if(!fixed.has(key))fixed.set(key,[]);fixed.get(key).push(m);
  });
  for(const list of fixed.values())if(list.length>1){
    const pos=[],norm=[],uv=[];
    for(const m of list){const geo=m.geometry.clone().applyMatrix4(m.matrixWorld),g=geo.index?geo.toNonIndexed():geo;
      pos.push(...g.attributes.position.array);norm.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);m.removeFromParent();g.dispose();if(g!==geo)geo.dispose();}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    scene.add(new THREE.Mesh(geo,list[0].material));
  }
  // Fold the bystanders' separate blob meshes into the existing shadow batch.
  for(const root of scene.children)if(root.name==='Pedestrian'&&!root.userData.keepAnimated){
    const shadow=root.children.find(m=>m.isMesh&&m.material.transparent&&m.material.opacity===.32);
    if(shadow)shadow.removeFromParent();
  }
  // The shared model disables culling for animation. Each stationary person can
  // instead use a posed bound; moving roots carry the walkers' local bounds.
  scene.traverse(m=>{
    if(m.isSkinnedMesh){m.computeBoundingSphere();m.frustumCulled=true;}
  });
  bake.build();
  // The carnival set sits on its flight case beside the busy cocoa counter.
  const radioX = -8.95, radioZ = -32.6;
  world.box(1.15,.62,.64,timber,radioX,.34,radioZ);
  for (const y of [.07,.65]) world.box(1.17,.045,.66,metal,radioX,y,radioZ);
  const badge = drawTex(160,72,g => {
    g.fillStyle = '#27383d'; g.fillRect(0,0,160,72);
    g.strokeStyle = '#b0c9b9'; g.strokeRect(3,3,154,66);
    g.fillStyle = '#e6d6aa'; g.beginPath(); g.arc(25,30,13,0,2*Math.PI); g.fill();
    g.fillStyle = '#819c9d'; g.beginPath(); g.moveTo(8,49); g.lineTo(25,29); g.lineTo(34,39); g.lineTo(47,24); g.lineTo(59,49); g.fill();
    g.fillStyle = '#f1e5c7'; g.font = 'bold 14px sans-serif'; g.fillText('NIGHT SCHOOL',51,31);
    g.fillStyle = '#e5a36a'; g.font = 'bold 12px monospace'; g.fillText('92.7 FM',54,51);
  });
  const nameplate = new THREE.Mesh(new THREE.PlaneGeometry(.88,.40),lambert({map:badge,emissiveMap:badge,emissive:rgb(66,66,55)}));
  nameplate.position.set(radioX,.34,radioZ+.322); scene.add(nameplate);
  world.wall(radioX-.58,radioX+.58,radioZ-.33,radioZ+.33,.675);
  world.post(radioX,radioZ,.40,1.15);
  placeRadio(world, radioX, .673, radioZ, .08);
  addSnowTracks(world, (x,z) => {
    const contains = ([x0,x1,z0,z1]) => x>x0 && x<x1 && z>z0 && z<z1;
    return snowPatches.some(contains) && !pavedPatches.some(contains);
  });
  snowballToss(world, 11, 7, lambert({ map: dartmouthSnow('carved'), color: 0xf0f7ff, emissive: 0x596274 }));

  const pin = new THREE.Mesh(new THREE.CircleGeometry(.105, 18), lambert({ map: drawTex(64, 64, g => {
    g.fillStyle = '#d4b877'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#265845'; g.beginPath(); g.arc(32, 32, 28, 0, 2 * Math.PI); g.fill();
    g.translate(32, 32); g.strokeStyle = '#e7f2e2'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 20);
      g.moveTo(-6, 17); g.lineTo(0, 11); g.lineTo(6, 17); g.stroke(); g.rotate(Math.PI / 3);
    }
  }), side: THREE.DoubleSide }));
  pin.position.set(-6.51, 1.22, -32.89); pin.rotation.x = -1.15;
  addPickup(world, inventory, 'carnival-pin', pin, 'Take carnival pin');
  return world;
}
