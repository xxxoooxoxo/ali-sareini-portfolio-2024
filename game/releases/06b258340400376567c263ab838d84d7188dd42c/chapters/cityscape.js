// An original, compressed San Francisco street grid for the endless drive.
import * as THREE from 'three';
import { drawTex, hash, makeSky } from '../engine/look.js';
import { Trees } from '../engine/trees.js';
import { Cars } from '../engine/cars.js';
import { Figure } from '../engine/figure.js';
import { surface } from './sf-textures.js';
import { facadeMaterial } from './city-facades.js';

const BLOCK = 72;
const corners = [[-2,-1],[1,-1],[1,-2],[3,-2],[3,1],[2,1],[2,2],[-2,2]];
export const streetLevel = x => 9*Math.sin(x/82) + 2*Math.sin((x+37)/47);

function streetCircuit() {
  const path = new THREE.CurvePath(), sections=[];
  const turns=corners.map(([x,z],i)=>{
    const at=new THREE.Vector3(x*BLOCK,0,z*BLOCK);
    const prev=corners[(i+corners.length-1)%corners.length], next=corners[(i+1)%corners.length];
    return {at,enter:at.clone().add(new THREE.Vector3(Math.sign(prev[0]-x)*15,0,Math.sign(prev[1]-z)*15)),
      leave:at.clone().add(new THREE.Vector3(Math.sign(next[0]-x)*15,0,Math.sign(next[1]-z)*15))};
  });
  for(let i=0;i<turns.length;i++){
    const to=turns[(i+1)%turns.length];
    path.add(new THREE.LineCurve3(turns[i].leave,to.enter)); sections.push({end:path.getLength(),bend:false});
    path.add(new THREE.QuadraticBezierCurve3(to.enter,to.at,to.leave)); sections.push({end:path.getLength(),bend:true});
  }
  return {path,length:path.getLength(),speedLimit(s){
    const section=sections.find(part=>s<=part.end) ?? sections[0];
    return section.bend ? 12 : Math.min(25,Math.sqrt(12**2+10*(section.end-s)));
  }};
}

// Collect dissimilar facades and street surfaces by material in a handful of draws.
function geometryBatches(scene) {
  const batches=new Map();
  function quad(mat,a,b,c,d,u=1,v=1,tint=0xffffff,u0=0,v0=0) {
    if(!batches.has(mat)) batches.set(mat,{pos:[],uv:[],col:[],idx:[]});
    const buf=batches.get(mat),base=buf.pos.length/3,color=new THREE.Color(tint);
    for(const p of [a,b,c,d]) {buf.pos.push(...p);buf.col.push(color.r,color.g,color.b);}
    buf.uv.push(u0,v0,u0+u,v0,u0+u,v0+v,u0,v0+v);buf.idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  function finish() {
    for(const [mat,b] of batches){
      const geo=new THREE.BufferGeometry();
      for(const [attr,data,n] of [['position',b.pos,3],['uv',b.uv,2],['color',b.col,3]])
        geo.setAttribute(attr,new THREE.Float32BufferAttribute(data,n));
      geo.setIndex(b.idx);geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.castShadow=mat.isMeshLambertMaterial;
      scene.add(mesh);
    }
  }
  return {quad,finish};
}

export function makeCityscape() {
  const scene=new THREE.Scene(), route=streetCircuit();
  scene.fog=new THREE.Fog(0xc59c9b,70,490);
  const sky=makeSky([[0,[240,172,132]],[10,[210,152,150]],[28,[146,134,164]],[55,[91,104,151]],[90,[62,77,127]]]);
  scene.add(sky,new THREE.HemisphereLight(0xe9e5fc,0xbcbbc7,1.95));
  const sun=new THREE.DirectionalLight(0xffd3a3,1.95);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-57,right:57,top:57,bottom:-57,near:1,far:245});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;
  scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0xc4dbf1,.85);rim.position.set(1,.9,1);scene.add(rim);
  const lightAt=position=>{
    sky.position.copy(position);sun.target.position.copy(position);
    sun.position.set(position.x-76,position.y+75,position.z-39);
    sun.target.updateMatrixWorld();
  };
  const {quad,finish}=geometryBatches(scene);
  const asphalt=surface(3);
  const paving=drawTex(128,128,g=>{
    g.fillStyle='#c8c5bf';g.fillRect(0,0,128,128);
    for(let i=0;i<1300;i++){g.fillStyle=i%2?'#bfbcb5':'#d1cec9';g.fillRect(hash(i,2,12)*128,hash(i,3,12)*128,1.5,1);}
    g.fillStyle='#898985';g.fillRect(0,0,128,1.6);g.fillRect(0,0,1.6,128);
    g.fillRect(64,0,1.2,64);g.fillRect(0,64,128,1.2);
  });
  const mats={street:new THREE.MeshLambertMaterial({map:asphalt,color:0xb3b5c1,emissiveMap:asphalt,emissive:0x393f50}),
    paving:new THREE.MeshLambertMaterial({map:paving,color:0xc2b9b1}),
    trim:new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}),
    paint:new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true})};
  const boxes=[], lights=[], wire=[];
  const box=(x,y,z,w,h,d,tint,lit=false)=>{(lit?lights:boxes).push([x,y,z,w,h,d,tint]);};
  function ground(mat,x0,x1,z0,z1,lift,tile=1,tint=0xffffff) {
    // Subdivision keeps curbs, paint and intersections on the same hill profile.
    const slices=Math.ceil((x1-x0)/5);
    for(let i=0;i<slices;i++){
      const a=x0+(x1-x0)*i/slices,b=x0+(x1-x0)*(i+1)/slices;
      quad(mat,[a,streetLevel(a)+lift,z1],[b,streetLevel(b)+lift,z1],[b,streetLevel(b)+lift,z0],[a,streetLevel(a)+lift,z0],
        (b-a)/tile,(z1-z0)/tile,tint,a/tile,-z1/tile);
    }
  }
  ground(mats.street,-415,420,-340,346,0,5);
  const trees=new Trees({scene,ground:(x)=>streetLevel(x)+.21},{bark:[89,72,67]});
  const storefront=facadeMaterial('shop');
  function walls(mat,x,z,w,d,bottom,top,windowPitch,floors,tint,repeat=4,shop=-1) {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
    const edge=(a,b)=>{
      const bays=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/windowPitch));
      if (shop>=0) {
        const u=(shop%2)*.5+.002,v=shop<2?.502:.002;
        for(let i=0;i<bays;i++) {
          const x1=a[0]+(b[0]-a[0])*i/bays,z1=a[1]+(b[1]-a[1])*i/bays;
          const x2=a[0]+(b[0]-a[0])*(i+1)/bays,z2=a[1]+(b[1]-a[1])*(i+1)/bays;
          quad(mat,[x1,bottom(x1),z1],[x2,bottom(x2),z2],[x2,top,z2],[x1,top,z1],.496,.496,tint,u,v);
        }
        return;
      }
      quad(mat,[a[0],bottom(a[0]),a[1]],[b[0],bottom(b[0]),b[1]],[b[0],top,b[1]],[a[0],top,a[1]],bays/repeat,floors/repeat,tint);
    };
    edge([x0,z1],[x1,z1]);edge([x1,z1],[x1,z0]);edge([x1,z0],[x0,z0]);edge([x0,z0],[x0,z1]);
  }
  const signCache=new Map();
  function sign(text,w,h,x,y,z,turn,bg,ink,vertical=false) {
    const key=[text,bg,ink,vertical].join('/');
    if(!signCache.has(key)){
      const tex=drawTex(vertical?64:256,vertical?256:48,(g,cw,ch)=>{
        g.fillStyle=bg;g.fillRect(0,0,cw,ch);g.strokeStyle=ink;g.lineWidth=2;g.strokeRect(3,3,cw-6,ch-6);
        g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';
        if(vertical){g.font='bold 40px Georgia';[...text].forEach((letter,i)=>g.fillText(letter,cw/2,9+(i+.5)*(ch-18)/text.length));}
        else{g.font='bold 29px Georgia';g.fillText(text,cw/2,ch/2,cw-15);}
      });signCache.set(key,new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    }
    const label=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signCache.get(key));
    label.position.set(x,y,z);label.rotation.y=turn;scene.add(label);return label;
  }
  const storefronts=[['CAFFÈ ROMA','#314747','#efe2aa'],['CITY BOOKS','#695440','#fff0c1'],
    ['NOODLE HOUSE','#763734','#ffe1a3'],['RECORDS','#374658','#ffe0a2']];
  const wallTints=[0xe8c2a9,0xc1cfbf,0xb9c3ce,0xe3cda2,0xcaa49a,0xc6b7c6];
  const canopies=[0x834447,0x445f61,0x6c735b,0x735669];
  const doors=new THREE.MeshLambertMaterial({map:drawTex(64,96,g=>{
    g.fillStyle='#c4baa3';g.fillRect(0,0,64,96);g.fillStyle='#514a43';g.fillRect(5,4,54,91);
    g.fillStyle='#8b9b93';g.fillRect(11,12,42,34);g.strokeStyle='#b7ad96';g.lineWidth=3;g.strokeRect(10,53,43,32);
    g.fillStyle='#cba971';g.fillRect(45,48,6,3);
  }),side:THREE.DoubleSide});
  function building(ix,iz,lot,x,z,w,d,floors,kind,streetSide,frontRow,residential=false) {
    const seed=ix*71+iz*37+lot*13, tr=hash(seed,2,12), base=streetLevel(x), shopTop=base+4.25;
    const top=shopTop+floors*3.1, tint=kind==='glass'?0xd1dbe4:wallTints[Math.floor(tr*wallTints.length)];
    const shop=(iz===1||iz===2) && tr>.38 ? 2 : Math.floor(hash(seed,3,2)*4);
    walls(residential?facadeMaterial('plaster'):storefront,x,z,w,d,px=>streetLevel(px)+.15,shopTop,
      residential?3.4:7.7,residential?1:4,residential?tint:0xffeddd,4,residential?-1:shop);
    walls(facadeMaterial(kind),x,z,w,d,()=>shopTop,top,kind==='glass'?3.1:3.6,floors,tint,kind==='glass'?8:4);
    box(x,shopTop,z,w+.32,.32,d+.32,0x9c8a80);
    box(x,top+.13,z,w+.46,.32,d+.46,kind==='glass'?0x8b97a1:0xb09c90);
    if(kind!=='glass')box(x,top-.48,z,w+.18,.17,d+.18,0xc4b3a2);
    const roofH=kind==='glass'?2.9:1.4;
    box(x+w*.15,top+roofH*.5,z-d*.1,w*.29,roofH,d*.24,0x777c80);
    const face=z+streetSide*d/2;
    if(kind==='glass' && frontRow){
      for(const dx of [-w/2,0,w/2])box(x+dx,(top+shopTop)/2,face,.27,top-shopTop,.32,0x89949f);
      if(floors>12)box(x,top+2.5,z,w*.76,4.8,d*.73,0x858e97);
    }
    if (frontRow && kind!=='glass') {
      if (residential) {
        const px=x-w*.28, py=streetLevel(px), pz=face+streetSide*.04;
        quad(doors,[px-.77,py+.55,pz],[px+.77,py+.55,pz],[px+.77,py+3.35,pz],[px-.77,py+3.35,pz]);
        for(let j=0;j<3;j++)box(px,py+.22+j*.08,face+streetSide*(.94-j*.29),1.9,.20+j*.12,.50,0xb3a391);
        box(px,py+3.57,face+streetSide*.43,2.25,.25,1.02,0xd7c6ac);
        box(x,top+.55,face,w*.73,.62,.44,0xd8c5ab);
        box(x,top+.97,face,w*.45,.28,.47,0xc5ad95);
      } else {
        const awning=canopies[Math.floor(hash(seed,4,9)*canopies.length)];
        box(x,base+3.65,face+streetSide*.68,w-.65,.29,1.42,awning);
        box(x,base+3.36,face+streetSide*1.34,w-.64,.33,.12,awning);
      }
      if (!residential && (lot===0 || (lot===3 && iz===1))) {
        const [name,bg,ink]=storefronts[shop];
        sign(name,Math.min(w-2,11),1.18,x,base+4.8,face+streetSide*.22,streetSide>0?0:Math.PI,bg,ink);
      }
      if(kind==='plaster'){
        for(const dx of [-w*.25,w*.25]){
          // Projecting bays carry windows of their own. A tiered cornice caps each bay.
          const bayZ=face+streetSide*.50,bayW=w*.24;
          walls(facadeMaterial('plaster'),x+dx,bayZ,bayW,1.4,()=>shopTop+.25,top-.55,1.8,floors,tint);
          box(x+dx,top-.48,bayZ,bayW+.18,.24,1.65,0xe1cbb1);
          for(let f=1;f<floors;f++)box(x+dx,shopTop+f*3.1,bayZ,bayW+.12,.14,1.53,0xc0aa94);
        }
      }
    }
    if (kind==='brick' && frontRow) {
      const fx=x+w*.24;
      for(let f=1;f<Math.min(floors,6);f++){
        const y=shopTop+f*3.1;
        box(fx,y,face+streetSide*.72,3.5,.13,1.4,0x454548);
        box(fx,y+.83,face+streetSide*1.38,3.5,.09,.09,0x504b4d);
        for(const dx of [-1.62,-.8,0,.8,1.62])box(fx+dx,y+.41,face+streetSide*1.38,.065,.82,.065,0x504b4d);
        box(fx+1.48,y+1.48,face+streetSide*.40,.10,3,.10,0x46484a);
      }
    }
  }
  function pyramid(x,z) {
    const base=streetLevel(x), mat=facadeMaterial('glass');
    walls(mat,x,z,35,35,()=>base,base+16,3.4,5,0xc7c5b9);
    const sides=[[-1,1],[1,1],[1,-1],[-1,-1]], floors=32;
    const point=(side,level)=>{
      const half=17.4-16.4*level/floors;
      return [x+side[0]*half,base+16+105*level/floors,z+side[1]*half];
    };
    for(let floor=0;floor<floors;floor++)sides.forEach((a,i)=>{
      const b=sides[(i+1)%4],bays=Math.max(1,Math.round((34.8-32.8*floor/floors)/2.7));
      quad(mat,point(a,floor),point(b,floor),point(b,floor+.80),point(a,floor+.80),bays/8,1/8,0xd4d2c8,0,(floor%8)/8);
      quad(mats.trim,point(a,floor+.80),point(b,floor+.80),point(b,floor+1),point(a,floor+1),1,1,0xddd4c5);
    });
    for(const side of [-1,1])box(x,base+55,z+side*9.8,5.2,55,3.3,0xd1c9b9);
    box(x,base+126,z,.62,11,.62,0xbfc7c9);box(x,base+132,z,.5,.65,.5,0xffb46b,true);
  }
  for(let ix=-5;ix<=5;ix++)for(let iz=-4;iz<=4;iz++){
    const cx=(ix+.5)*BLOCK,cz=(iz+.5)*BLOCK;
    const near=ix>=-3&&ix<=3&&iz>=-3&&iz<=2;
    ground(mats.paving,cx-26.5,cx+26.5,cz-26.5,cz+26.5,.22,3.6);
    for(const side of [-1,1]){
      const z=cz+side*26.5;
      for(let j=0;j<10;j++){
        const a=cx-26.5+j*5.3,b=a+5.3;
        const left=side>0?a:b,right=side>0?b:a;
        quad(mats.trim,[left,streetLevel(left),z],[right,streetLevel(right),z],[right,streetLevel(right)+.22,z],[left,streetLevel(left)+.22,z],1,1,0xb6a89c);
      }
      box(cx+side*26.5,streetLevel(cx+side*26.5)+.10,cz,.26,.21,53,0xb7aba1);
    }
    if(ix===0 && iz===1){
      ground(mats.trim,cx-23,cx+23,cz-23,cz+23,.24,1,0x687d63);
      for(let j=0;j<12;j++)trees.broadleaf(cx+(j%4-1.5)*10,cz+(Math.floor(j/4)-1)*13,7+hash(j,1,84)*5,[107,126,86],{spread:1.12,detail:.38});
      box(cx,streetLevel(cx)+1.85,cz,3,3.3,3,0xbdb09b);continue;
    }
    const downtown=ix>=1 && iz< -1 || ix>=3 && iz<1 || ix>=0 && iz< -2;
    if(!near){
      const floors=(downtown?8:3)+Math.floor(hash(ix,iz,14)*(downtown?20:6));
      building(ix,iz,0,cx,cz,35+hash(ix,iz,1)*11,39,floors,downtown?'glass':'brick',1,false);continue;
    }
    for(let lot=0;lot<4;lot++){
      const sx=lot%2?1:-1,sz=lot<2?-1:1,x=cx+sx*12.1,z=cz+sz*12;
      if(ix===2 && (iz===-2&&sz===1 || iz===-1&&sz===-1))continue;
      const n=hash(ix*11+lot,iz,53);
      const kind=downtown && n>.33?'glass':n>.52?'brick':'plaster';
      const floors=kind==='glass'?7+Math.floor(n*13):2+Math.floor(hash(ix,iz+lot,54)*(ix<1&&iz<1?3:5));
      if(ix<1 && n<.48 && !(ix===-1 && iz===-1 && lot===0)){
        for(const offset of [-1,1])building(ix,iz,lot*2+(offset+1)/2,x+offset*5.8,z,11.1,22.9,2+(offset>0&&n>.23?1:0),'plaster',sz,true,true);
      }else building(ix,iz,lot,x,z,23.2,22.9,floors,kind,sz,true);
    }
    if((ix+iz)%3===0)trees.broadleaf(cx+23,cz-25,6.8,[98,116,83],{spread:.85,detail:.38});
  }
  // A plaza terminates the first avenue beyond the course's turn. The pyramid
  // stays in sight up the hill, then passes beside the passenger window.
  ground(mats.paving,158,202,-92,-52,.23,3);
  pyramid(180,-72);
  const poolMap=drawTex(64,64,g=>{
    const glow=g.createRadialGradient(32,32,1,32,32,31);
    glow.addColorStop(0,'#fff');glow.addColorStop(.38,'#aaa');glow.addColorStop(1,'#000');g.fillStyle=glow;g.fillRect(0,0,64,64);
  });
  const pool=new THREE.MeshBasicMaterial({map:poolMap,color:0xda955b,transparent:true,opacity:.27,blending:THREE.AdditiveBlending,depthWrite:false});
  // Boulevard markings stop at intersections. Zebra crossings sit at all four mouths.
  for(let ix=-4;ix<=4;ix++)for(let iz=-3;iz<=3;iz++){
    const x=ix*BLOCK,z=iz*BLOCK,y=streetLevel(x);
    for(const s of [-1,1]){
      for(let j=-3;j<=3;j++){
        ground(mats.paint,x+s*12-1.4,x+s*12+1.4,z+j*2.15-.48,z+j*2.15+.48,.023,1,0xcec6b4);
        ground(mats.paint,x+j*2.15-.48,x+j*2.15+.48,z+s*12-1.4,z+s*12+1.4,.023,1,0xcec6b4);
      }
    }
    for(let d=18;d<BLOCK-16;d+=10){
      ground(mats.paint,x+d,x+d+4,z-.095,z+.095,.02,1,0xdac397);
      ground(mats.paint,x-.095,x+.095,z+d,z+d+4,.02,1,0xdac397);
    }
    // Cast-iron lamps and the suspended trolley lines give the street a readable scale.
    for(const [dx,dz] of [[-10.6,10.6],[10.6,-10.6]]){
      const gx=x+dx,gz=z+dz,gy=streetLevel(gx);
      box(gx,gy+2.97,gz,.16,5.9,.16,0x424a48);box(gx,gy+.48,gz,.38,.96,.38,0x444947);
      box(gx,gy+5.9,gz-Math.sign(dz)*.9,.13,.15,1.9,0x444947);
      box(gx,gy+5.83,gz-Math.sign(dz)*1.8,.53,.18,.8,0xffda94,true);
      const l=gx-5,r=gx+5,m=gz-Math.sign(dz)*2.6;
      quad(pool,[l,streetLevel(l)+.037,m+5.5],[r,streetLevel(r)+.037,m+5.5],[r,streetLevel(r)+.037,m-5.5],[l,streetLevel(l)+.037,m-5.5]);
    }
    if(ix>=-2&&ix<=3&&iz>=-2&&iz<=2){
      const sx=x+10.1,sz=z+9.85,sy=streetLevel(sx);
      box(sx,sy+2.3,sz,.14,4.6,.14,0x626462);
      box(sx,sy+4.14,sz,.48,1.08,.41,0x514e44);
      box(sx-.25,sy+3.88,sz,.06,.20,.21,0x8bd39e,true);
      box(sx,sy+4.41,sz-.22,.20,.20,.06,0xdb785c,true);
      // Newspaper boxes and curbside meters.
      box(x-20,streetLevel(x-20)+.68,z+10.2,.80,1.03,.65,0x97634e);
      box(x-20,streetLevel(x-20)+.81,z+9.86,.62,.34,.04,0xbbc2bf);
      box(x+24,streetLevel(x+24)+.86,z-10,.11,1.66,.11,0x696b62);
      box(x+24,streetLevel(x+24)+1.63,z-10,.28,.38,.23,0x546b65);
    }
    for(const offset of [-2,2]){
      wire.push(x,y+6.8,z+offset,x+BLOCK/2,streetLevel(x+BLOCK/2)+6.1,z+offset,
        x+BLOCK/2,streetLevel(x+BLOCK/2)+6.1,z+offset,x+BLOCK,streetLevel(x+BLOCK)+6.8,z+offset);
    }
  }
  // Projecting signs are visible down the street, before the player reaches the shopfronts.
  for(const [x,z,word,bg,ink] of [[-54,-62,'VISTA','#873e43','#ffe19a'],[111,-155,'HOTEL','#375e65','#ffdf9f'],[57,132,'JADE','#7b3537','#ffcc67']]){
    const y=streetLevel(x)+9.1;
    box(x,y,z,.65,7,1.8,0x58474a);
    sign(word,1.73,6.8,x-.34,y,z,-Math.PI/2,bg,ink,true);
    sign(word,1.73,6.8,x+.34,y,z,Math.PI/2,bg,ink,true);
    box(x,y+3.55,z,.79,.14,2,0xffc379,true);
  }
  const theatreY=streetLevel(-48);
  box(-48,theatreY+4.12,-60.7,15.1,1.22,3.55,0x894747);
  for(const dy of [3.53,4.67])box(-48,theatreY+dy,-60.85,15.4,.16,3.62,0xf7c886,true);
  sign('VISTA  THEATRE',14.5,.86,-48,theatreY+4.12,-62.49,Math.PI,'#e6c28d','#632e36');
  for(const dx of [-7.5,7.5])for(let j=0;j<3;j++)
    box(-48+dx+j*.13,theatreY+5.4,-59.55,.14,9-j*.60,.35,0xe1bc96);
  // A tiled Chinatown gateway spans the street. Columns sit behind the curbs;
  // two upturned roof tiers and the hanging lanterns are visible on approach.
  const gateX=91, gateZ=144, gateY=streetLevel(gateX);
  for(const sign of [-1,1]){
    const z=gateZ+sign*10.6;
    box(gateX,gateY+3.65,z,1.02,7.15,1.02,0x87483d);
    box(gateX,gateY+.55,z,1.6,.7,1.6,0xb1a18d);
    box(gateX,gateY+6.9,z,1.9,.45,2.45,0xd4a168);
  }
  box(gateX,gateY+7.32,gateZ,1.2,1.05,23.1,0x984d3c);
  box(gateX,gateY+8.05,gateZ,2.4,.65,23.5,0xa36749);
  for(let dz=-10;dz<=10;dz+=2.5) {
    const rise=.62*(Math.abs(dz)/10)**3;
    box(gateX,gateY+8.42+rise/2,gateZ+dz,3.42,.35+rise,.45,0x9a6348);
    box(gateX,gateY+8.65+rise,gateZ+dz,4.38,.20,.75,0xb99161);
  }
  const glazedTile=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  function tiledRoof(y,width,depth) {
    const bands=12;
    for(let j=0;j<bands;j++){
      const z0=gateZ-width/2+j*width/bands,z1=z0+width/bands;
      const lift=z=>1.35*Math.pow(Math.abs(z-gateZ)/(width/2),4);
      for(const side of [-1,1]){
        const a=[gateX+side*depth,y+lift(z0),z0],b=[gateX+side*depth,y+lift(z1),z1],
          c=[gateX,y+1.6+lift(z1)*.48,z1],d=[gateX,y+1.6+lift(z0)*.48,z0];
        if(side<0)quad(glazedTile,a,b,c,d,1,1,0x54766b);else quad(glazedTile,b,a,d,c,1,1,0x385c57);
        box(gateX+side*depth,y+(lift(z0)+lift(z1))/2, (z0+z1)/2,.14,.20,width/bands,0xcaa574);
      }
    }
  }
  tiledRoof(gateY+8.05,25,2.95);
  box(gateX,gateY+9.74,gateZ,2.5,1.06,14.2,0xb17c55);
  tiledRoof(gateY+10.14,16,2.12);
  // A cream-and-oxblood heritage streetcar at the curbside stop. The rails
  // and contact wire share the same alignment as the pole on its clerestory.
  const tx=-21,tz=-80.05,ty=streetLevel(tx);
  const tram=new THREE.Group(), firstTramBox=boxes.length, firstTramLamp=lights.length;
  scene.add(tram);
  for(const z of [tz-.71,tz+.71])ground(mats.paint,-133,53,z-.06,z+.06,.03,1,0x8c9090);
  box(tx,ty+.64,tz,8.65,.72,1.93,0x733e39);
  box(tx,ty+1.28,tz,8.65,.60,1.97,0x984f43);
  box(tx,ty+1.58,tz,8.68,.12,1.99,0xe2c291);
  box(tx,ty+2.08,tz,8.25,.90,1.8,0x62787a);
  for(const side of [-1,1])for(let j=0;j<=9;j++){
    box(tx-4.11+j*.913,ty+2.10,tz+side*.91,.09,1.07,.10,0xd5b486);
  }
  box(tx,ty+2.66,tz,8.63,.22,2.06,0xe2cc9e);
  box(tx,ty+2.86,tz,5.8,.31,1.1,0x845c4d);
  box(tx,ty+3.04,tz,6.0,.09,1.24,0xa18973);
  const pole=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(tx,ty+3.04,tz),new THREE.Vector3(tx+4.1,ty+5.6,tz),new THREE.Vector3(tx+5.7,ty+6.4,tz)]);
  tram.add(new THREE.Line(pole,new THREE.LineBasicMaterial({color:0x52484a})));
  wire.push(-143,streetLevel(-143)+6.4,tz,0,streetLevel(0)+6.4,tz,0,streetLevel(0)+6.4,tz,72,streetLevel(72)+6.4,tz);
  tram.add(sign('F  MARKET',1.50,.37,tx-4.35,ty+2.62,tz,-Math.PI/2,'#302f30','#f6ca83'));
  tram.add(sign('MUNICIPAL RAILWAY',3.85,.37,tx,ty+1.21,tz+.995,0,'#79423a','#f0d5a3'));
  for(const side of [-1,1])box(tx+side*4.31,ty+.96,tz,.08,.22,.24,0xffcd90,true);
  instances(new THREE.BoxGeometry(1,1,1),boxes.splice(firstTramBox),new THREE.MeshLambertMaterial(),tram);
  instances(new THREE.BoxGeometry(1,1,1),lights.splice(firstTramLamp),new THREE.MeshBasicMaterial(),tram);
  for(const [x,z,id] of [[-24,-82.6,6],[-22.8,-82.7,7],[-42,-61.2,8],[89,-133.3,9],[90.3,-133.3,10],
    [205,-31,11],[203.8,-30.3,12],[-16,133,13],[-17.5,132.8,14],[-133,36,15]]){
    const f=Figure.random(870+id,'shore');
    f.place(x,streetLevel(x)+.22,z,id*.77);if(id%3===0)f.phone();else if(id%3===1)f.talk(.8);else f.hold('cup');
    f.root.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingSphere();o.frustumCulled=true;}});
    scene.add(f.root);
  }
  const lanterns=[];
  for(let x=-118;x<=118;x+=26){
    const y=streetLevel(x)+6.7;
    for(let j=0;j<8;j++){
      const z=133+j*3.1,h=y-.85*Math.sin(j*Math.PI/7);
      lanterns.push([x,h-.36,z,.39,.49,.39,0xe2593d]);
      box(x,h+.09,z,.24,.10,.24,0x815545);box(x,h-.88,z,.08,.26,.08,0xd49844);
      if(j)wire.push(x,y-.85*Math.sin((j-1)*Math.PI/7),z-3.1,x,h,z);
    }
  }
  const wires=new THREE.BufferGeometry();wires.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));
  scene.add(new THREE.LineSegments(wires,new THREE.LineBasicMaterial({color:0x615960,transparent:true,opacity:.72})));
  function instances(geo,items,mat,parent=scene) {
    const mesh=new THREE.InstancedMesh(geo,mat,items.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),size=new THREE.Vector3();
    items.forEach(([x,y,z,w,h,d,c],i)=>{mesh.setMatrixAt(i,m.compose(p.set(x,y,z),q,size.set(w,h,d)));mesh.setColorAt(i,new THREE.Color(c));});
    mesh.receiveShadow=true;parent.add(mesh);
  }
  instances(new THREE.BoxGeometry(1,1,1),boxes,new THREE.MeshLambertMaterial());
  instances(new THREE.BoxGeometry(1,1,1),lights,new THREE.MeshBasicMaterial());
  const paper=drawTex(96,96,g=>{
    const glow=g.createLinearGradient(0,0,0,96);
    for(const [at,c] of [[0,'#74635c'],[.17,'#cabdb4'],[.55,'#fff9dd'],[.83,'#d3b69e'],[1,'#695746']])glow.addColorStop(at,c);
    g.fillStyle=glow;g.fillRect(0,0,96,96);g.fillStyle='#ae998b';
    for(let j=9;j<95;j+=9)g.fillRect(0,j,96,1.5);
  });
  instances(new THREE.SphereGeometry(1,12,10),lanterns,new THREE.MeshBasicMaterial({map:paper}));
  trees.build({shadow:.25}); finish();
  const parkedCars=new Cars({scene,ground:x=>streetLevel(x)+.025});
  for(const [x,z,heading,type] of [[-94,-64,-Math.PI/2,'sedan'],[-54,-64,-Math.PI/2,'hatch'],[164,-136,-Math.PI/2,'van'],
    [224,-30,0,'sedan'],[208,36,Math.PI,'taxi'],[54,152,-Math.PI/2,'suv'],[-54,136,Math.PI/2,'pickup'],[-152,47,Math.PI,'hatch']]){
    parkedCars.add(type,x,z,heading,null,{solid:false});
  }
  lightAt(new THREE.Vector3());
  let tramTime=0;
  return {scene,lightAt,...route,
    tick(dt) {
      // A double-ended car dwells at each stop before returning along its track.
      tramTime=(tramTime+dt)%32;
      const leg=tramTime<16 ? tramTime : 32-tramTime;
      const phase=Math.max(0,Math.min(1,(leg-2)/12));
      const dx=-22*phase*phase*(3-2*phase);
      tram.position.set(dx,streetLevel(tx+dx)-ty,0);
    },
    keepCameraClear(pivot,eye) {
      const dx=eye.x-pivot.x,dz=eye.z-pivot.z,steps=Math.ceil(Math.hypot(dx,dz)/.5);
      for(let i=1;i<=steps;i++){
        const x=pivot.x+dx*i/steps,z=pivot.z+dz*i/steps;
        if(Math.min(Math.abs(x-Math.round(x/BLOCK)*BLOCK),Math.abs(z-Math.round(z/BLOCK)*BLOCK))<8.0)continue;
        eye.x=pivot.x+dx*(i-1)/steps;eye.z=pivot.z+dz*(i-1)/steps;
        eye.y=Math.max(eye.y,streetLevel(eye.x)+2.15);break;
      }
    },
  };
}
