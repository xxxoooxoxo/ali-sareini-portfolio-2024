// const props = new Props(world, {night:false, snow:null}); queue then props.build();
// All placement methods: (x,z,heading=0,options={}); options: y (absolute base), scale=1,
// solid=false (height-aware collider), color (hex or RGB), snow (RGB or true), text.
// lamp(x,z,heading,options): style='park'|'lantern'|'street', height, pool=true; pendant(): height=2.6.
// bench(), bin(), bollard(), bicycle(), bikeRack(), hydrant(), mailbox(), planter(), plant().
// sign(), signPost(), noticeBoard(): text; cafeTable(), cafeChair(), picnicTable().
// officeChair(), sofa(), laptop(), cup(), plate(), takeaway(); lamp/pendant use constructor night.
// add(kind,x,z,heading,options) is the generic equivalent; returns queued Group (transform before build).
// build() instances queued geometry by geometry/material; returns meshes, drains queue; safe to call again.
import * as THREE from 'three';
import {kitMaterial,kitTexture,labelTexture,softTexture,shrubTexture,mergeKitMeshes} from './kit-textures.js';
import { registerBicycle } from './bicycle.js';
const box=new THREE.BoxGeometry(1,1,1), cylinder=new THREE.CylinderGeometry(1,1,1,10), ball=new THREE.SphereGeometry(1,6,4), ring=new THREE.TorusGeometry(1,.075,4,12), tyre=new THREE.TorusGeometry(1,.058,6,28);

function propParts(g,metal){
  const part=(geo,mat,s,p,r=[0,0,0])=>{const m=new THREE.Mesh(geo,mat);m.scale.fromArray(s);m.position.fromArray(p);m.rotation.set(r[0],r[1],r[2]);g.add(m);return m;};
  const b=(s,p,m=metal,r)=>part(box,m,s,p,r),c=(s,p,m=metal,r)=>part(cylinder,m,s,p,r),e=(s,p,m=metal)=>part(ball,m,s,p);
  const bar=(a,d,r=.025,m=metal)=>{const av=new THREE.Vector3(...a),dv=new THREE.Vector3(...d),v=dv.clone().sub(av);const q=c([r,v.length(),r],av.add(dv).multiplyScalar(.5).toArray(),m);q.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return q;};
  return {part,b,c,e,bar};
}

// Batch the original city bike into a frame, steering fork and crank. Only the
// spokes need to spin on the round wheels. Copies share geometry and materials.
function bicycleModel(color){
  const paint=kitMaterial('metal',color),rubber=kitMaterial('plastic',0x1d1f1e),steel=kitMaterial('metal',0xb4b6ac),leather=kitMaterial('plastic',0x2c2420);
  const frame=new THREE.Group(),fork=new THREE.Group(),crank=new THREE.Group();
  const body=propParts(frame,paint),steering=propParts(fork,steel),pedals=propParts(crank,steel);
  const rear=[0,.34,-.53],front=[0,.34,.53],bb=[0,.29,-.08],seat=[0,.80,-.25],top=[0,.86,.33],head=[0,.70,.38];
  const spokes=new THREE.MeshLambertMaterial({map:kitTexture('spokes'),alphaTest:.2,transparent:true,side:THREE.DoubleSide});
  const disk=new THREE.PlaneGeometry(1,1);
  for(const {wheel,hub,name} of [{wheel:body,hub:rear,name:'Rear spokes'},{wheel:steering,hub:front,name:'Front spokes'}]){
    wheel.part(tyre,rubber,[.34,.34,.34],hub,[0,Math.PI/2,0]);
    wheel.part(tyre,steel,[.305,.305,.2],hub,[0,Math.PI/2,0]);
    wheel.part(disk,spokes,[.62,.62,1],hub,[0,Math.PI/2,0]).name=name;
    wheel.c([.035,.09,.035],hub,steel,[0,0,Math.PI/2]);
  }
  body.bar(bb,seat,.022);body.bar(seat,top,.02);body.bar(bb,head,.024);body.bar(top,head,.026);
  for(const side of [-1,1]){
    body.bar([side*.045,rear[1],rear[2]],[side*.02,bb[1],bb[2]],.013);
    body.bar([side*.045,rear[1],rear[2]],[side*.015,seat[1]-.03,seat[2]],.012);
    steering.bar([side*.04,head[1],head[2]],[side*.045,front[1],front[2]],.015,paint);
    steering.bar([0,1.0,.3],[side*.2,1.01,.27],.012);
    steering.bar([side*.2,1.01,.27],[side*.29,1.0,.2],.012);
    steering.bar([side*.29,1.0,.2],[side*.3,1.0,.12],.018,rubber);
    pedals.bar([side*.065,bb[1],bb[2]],[side*.065,bb[1]-side*.15,bb[2]+side*.06],.011);
    const hand=new THREE.Object3D(),foot=new THREE.Object3D(),limb=side>0?'Left':'Right';
    hand.name=limb+' grip';hand.position.set(side*.295,1,.16);fork.add(hand);
    foot.name=limb+' pedal';foot.position.set(side*.115,bb[1]-side*.15,bb[2]+side*.06);crank.add(foot);
  }
  body.bar(seat,[0,.93,-.275],.014,steel);
  body.e([.075,.028,.13],[0,.95,-.29],leather);body.e([.04,.024,.09],[0,.95,-.18],leather);
  steering.bar(top,[0,1.0,.3],.014);
  body.c([.085,.012,.085],[.05,bb[1],bb[2]],steel,[0,0,Math.PI/2]);
  body.bar([.05,bb[1]+.08,bb[2]],[.05,rear[1]+.03,rear[2]],.006,rubber);
  body.bar([.05,bb[1]-.08,bb[2]],[.05,rear[1]-.03,rear[2]],.006,rubber);
  mergeKitMeshes(frame);
  body.bar([-.03,bb[1],bb[2]-.1],[-.2,.01,bb[2]-.02],.01,steel).name='Kickstand';
  for(const {section,name,pivot} of [{section:fork,name:'Fork',pivot:head},{section:crank,name:'Crank',pivot:bb}]){
    mergeKitMeshes(section);
    section.name=name;section.position.fromArray(pivot);
    for(const mesh of section.children)mesh.position.sub(section.position);
    frame.add(section);
  }
  // Each tread turns freely on its spindle while its crank arm goes around.
  for (const side of ['Left', 'Right']) {
    const tread = new THREE.Mesh(box, rubber);
    tread.scale.set(.105, .02, .08);
    crank.getObjectByName(side + ' pedal').add(tread);
  }
  frame.name='Bicycle';frame.userData.keepAnimated=true;
  return frame;
}

export class Props {
 constructor(world,{night=false,snow=null}={}){this.world=world;this.night=night;this.snow=snow;this.queue=[];this.materials=new Map();this.bicycleModels=new Map();}
 mat(kind,color){const key=kind+JSON.stringify(color);if(!this.materials.has(key))this.materials.set(key,kitMaterial(kind,color));return this.materials.get(key);}
 add(kind,x,z,heading=0,o={}){
  let g;
  if(kind==='bicycle'){
    const color=o.color??0x697e87,key=JSON.stringify(color);
    if(!this.bicycleModels.has(key))this.bicycleModels.set(key,bicycleModel(color));
    g=this.bicycleModels.get(key).clone();
  }else g=new THREE.Group();
  g.position.set(x,o.y??this.world.ground(x,z),z);g.rotation.y=heading;g.scale.setScalar(o.scale??1);this.queue.push(g);
  if(kind==='bicycle'){registerBicycle(this.world,g,o);return g;}
  const metal=this.mat(['lamp','bench','bin','bollard'].includes(kind)?'iron':'metal',o.color??0x92958b),wood=this.mat('wood',0xd5bc8d),white=this.mat('plastic',0xeee7d3),fabric=this.mat('fabric',o.color??0x8c9b9d),leaf=this.mat('foliage',0x66814c);
  const {part,b,c,e,bar}=propParts(g,metal);
  const legs=(w,d,h)=>{for(const a of [-1,1])for(const v of [-1,1])b([.055,h,.055],[a*w/2,h/2,v*d/2]);};
  const text=(s,p,t=o.text??'PARK',bg)=>{const m=new THREE.MeshLambertMaterial({map:labelTexture(t,bg),side:THREE.DoubleSide});part(new THREE.PlaneGeometry(1,1),m,s,p);};
  const glow=(at,size)=>{e([size*.5,size*.35,size*.5],at,this.night?new THREE.MeshBasicMaterial({map:kitMaterial('plastic').map,color:0xffdf9a}):white);if(this.night){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:softTexture(),color:0xffcc80,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));s.position.fromArray(at);s.scale.setScalar(size*1.8);g.add(s);if(o.pool!==false){const m=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshBasicMaterial({map:softTexture(),color:0xd8b875,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(at[0],.025,at[2]);g.add(m);}}};
  let h=1,rx=.4,rz=.4;
  switch(kind){
   case 'lamp': {h=o.height??(o.style==='street'?6:3.6);rx=rz=.15;c([.12,.3,.12],[0,.15,0]);c([.055,h,.055],[0,h/2,0]);if(o.style==='street'){bar([0,h,0],[1.2,h+.15,0],.055);b([.65,.12,.3],[1.2,h+.15,0]);glow([1.2,h+.05,0],.5);}else if(o.style==='lantern'){for(let i=0;i<8;i++){const a=i*Math.PI/4;c([.018,h*.7,.018],[Math.cos(a)*.06,h*.35,Math.sin(a)*.06]);}b([.43,.09,.43],[0,h-.55,0]);for(const a of [-1,1])for(const v of [-1,1])bar([a*.17,h-.5,v*.17],[a*.22,h,v*.22],.018);part(new THREE.ConeGeometry(.38,.25,4),metal,[1,1,1],[0,h+.1,0],[0,Math.PI/4,0]);b([.32,.42,.32],[0,h-.27,0],this.night?new THREE.MeshBasicMaterial({map:kitTexture('lantern'),color:0xffe1a3}):this.mat('lantern',0xe0d5b4));glow([0,h-.27,0],.18);}else{c([.36,.09,.36],[0,h,0]);b([.35,.38,.35],[0,h-.23,0],this.night?new THREE.MeshBasicMaterial({map:kitTexture('lantern'),color:0xffdf9a}):this.mat('lantern',0xe0d5b4));for(const a of [-1,1])for(const v of [-1,1])bar([a*.18,h-.45,v*.18],[a*.18,h,v*.18],.018);glow([0,h-.23,0],.18);}break;}
   case 'pendant':h=o.height??2.6;bar([0,h,0],[0,h+.7,0],.015);part(new THREE.ConeGeometry(.34,.25,12,1,true),this.mat('metal',0xb5b4a0),[1,1,1],[0,h,0]);glow([0,h-.12,0],.3);break;
   case 'bench':rx=1.05;rz=.4;h=1;for(let i=0;i<5;i++)b([2,.065,.12],[0,.48,-.28+i*.14],wood);for(let i=0;i<3;i++)b([2,.12,.06],[0,.7+i*.15,-.34],wood);for(const s of [-1,1]){bar([s*.8,.05,-.3],[s*.8,1,-.36],.045);bar([s*.8,.05,.3],[s*.8,.65,.3],.045);bar([s*.8,.65,.3],[s*.8,.65,-.35],.035);}if(o.snow??this.snow)b([2,.05,.65],[0,.54,0],white);break;
   case 'bin':h=.9;c([.28,.85,.28],[0,.43,0]);c([.32,.07,.32],[0,.89,0]);for(let i=0;i<12;i++){const a=i*Math.PI/6;bar([Math.sin(a)*.29,.1,Math.cos(a)*.29],[Math.sin(a)*.29,.76,Math.cos(a)*.29],.018,wood);}c([.17,.02,.17],[0,.932,0],this.mat('metal',0x171b1b));break;
   case 'bollard':h=.85;c([.08,.8,.08],[0,.4,0]);e([.09,.09,.09],[0,.82,0]);c([.083,.08,.083],[0,.65,0],white);break;
   case 'bikeRack':rx=1.2;for(let i=0;i<4;i++){const xx=-.9+i*.6;bar([xx,0,-.3],[xx,.65,-.3]);bar([xx,.65,-.3],[xx,.65,.3]);bar([xx,.65,.3],[xx,0,.3]);}break;
   case 'sign':case 'signPost':case 'noticeBoard':h=kind==='noticeBoard'?2:2.6;rx=kind==='noticeBoard'?.8:.45;bar([0,0,0],[0,h,0],.045);b([rx*2,.55,.06],[0,h-.3,.06],wood);text([rx*1.9,.48,1],[0,h-.3,.095],o.text??(kind==='noticeBoard'?'LOCAL NEWS':'PARK →'));break;
   case 'hydrant':h=.7;c([.14,.55,.14],[0,.3,0],this.mat('metal',o.color??0x9c4333));e([.16,.14,.16],[0,.6,0]);c([.1,.5,.1],[0,.4,0],metal,[0,0,Math.PI/2]);break;
   case 'mailbox':h=1.1;bar([0,0,0],[0,.8,0],.07);b([.48,.4,.5],[0,.9,0]);b([.32,.035,.02],[0,1,.26],this.mat('metal',0x202424));text([.3,.08,1],[0,.85,.261],'POST');break;
   case 'planter':case 'plant':{
    const seed=o.seed??Math.abs(Math.round(x*17+z*31)),variant=((seed%3)+3)%3;h=variant===1?1.45:1.2;
    const clay=this.mat('terracotta',variant===2?0xbba58d:0xba7955);
    part(new THREE.CylinderGeometry(.27,.19,.4,12,1,true),clay,[1,1,1],[0,.2,0]);
    part(new THREE.TorusGeometry(.265,.03,4,12),clay,[1,1,1],[0,.39,0],[Math.PI/2,0,0]);
    c([.24,.025,.24],[0,.36,0],this.mat('wood',0x30251b));bar([0,.36,0],[0,.88,0],.025,wood);
    // Keep cutout cards outside the opaque merger; each shrub has one foliage draw.
    const positions=[],uv=[],normals=[];
    for(let i=0;i<12;i++){
      const a=i*2.399+seed,cy=variant===1?.68+(i%4)*.18:.74+Math.sin(i*4.2)*.16;
      const size=variant===1?.65-(i%4)*.1:.55+(i%3)*.06,cx=Math.sin(a)*.15,cz=Math.cos(a)*.15;
      const right=new THREE.Vector3(Math.cos(a),0,Math.sin(a)).multiplyScalar(size/2),up=new THREE.Vector3(0,size/2,0),center=new THREE.Vector3(cx,cy,cz);
      const q=[center.clone().sub(right).sub(up),center.clone().add(right).sub(up),center.clone().add(right).add(up),center.clone().sub(right).add(up)];
      for(const j of [0,1,2,0,2,3]){positions.push(...q[j]);uv.push(...[[0,0],[1,0],[1,1],[0,1]][j]);normals.push(0,1,0);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    g.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:shrubTexture(variant),alphaTest:.4,transparent:true,depthWrite:true,side:THREE.DoubleSide})));break;
   }
   case 'cafeTable':h=.76;rx=rz=.5;c([.48,.06,.48],[0,.74,0],white);c([.045,.7,.045],[0,.35,0]);bar([-.35,.04,0],[.35,.04,0]);bar([0,.04,-.35],[0,.04,.35]);break;
   case 'cafeChair':case 'officeChair':h=1;if(kind==='officeChair'){c([.045,.36,.045],[0,.26,0]);for(let i=0;i<5;i++){const a=i*Math.PI*2/5,xx=Math.cos(a)*.3,zz=Math.sin(a)*.3;bar([0,.1,0],[xx,.07,zz],.025);e([.045,.045,.045],[xx,.045,zz]);}}else legs(.4,.4,.45);b([.48,.08,.48],[0,.48,0],kind==='officeChair'?fabric:wood);b([.48,.4,.06],[0,.77,-.21],kind==='officeChair'?fabric:wood);if(kind==='officeChair')for(const s of [-1,1]){b([.07,.06,.4],[s*.3,.67,0],this.mat('plastic',0x555a58));bar([s*.3,.49,-.15],[s*.3,.65,-.15],.025);}break;
   case 'picnicTable':h=.8;rx=1.1;rz=.9;for(let i=0;i<5;i++)b([2,.08,.14],[0,.78,-.32+i*.16],wood);for(const s of [-1,1]){for(let j=0;j<2;j++)b([2,.07,.135],[0,.45,s*.75+(j-.5)*.155],wood);for(const xx of [-.7,.7])bar([xx,.05,s*.75],[xx,.75,s*.2],.07,wood);bar([-.8,.12,s*.55],[.8,.71,s*.2],.035,metal);bar([.8,.12,s*.55],[-.8,.71,s*.2],.035,metal);}break;
   case 'sofa':rx=1.1;rz=.5;h=.95;legs(1.8,.7,.2);b([2,.3,.85],[0,.35,0],fabric);for(const s of [-1,1])b([.94,.48,.19],[s*.49,.7,-.4],fabric);for(const s of [-1,1])b([.2,.4,.85],[s,.55,0],fabric);for(const s of [-1,1])b([.85,.13,.68],[s*.46,.55,.04],fabric);break;
   case 'laptop':h=.33;rx=.23;rz=.17;b([.45,.025,.32],[0,.02,0],this.mat('keyboard',0xffffff));b([.45,.29,.025],[0,.17,-.15]);part(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:o.text?labelTexture(o.text):kitTexture('screen')}),[.4,.24,1],[0,.17,-.134]);break;
   case 'cup':h=.12;rx=rz=.065;c([.055,.12,.055],[0,.06,0],this.mat('cup',0xffffff));c([.06,.012,.06],[0,.126,0],white);c([.045,.007,.045],[0,.135,0],white);break;
   case 'plate':h=.02;rx=rz=.14;c([.14,.015,.14],[0,.01,0],white);c([.11,.005,.11],[0,.02,0],this.mat('food',0xffffff));break;
   case 'book':h=.04;rx=.12;rz=.17;b([.24,.04,.34],[0,.02,0],this.mat('book',0xffffff));break;
   case 'takeaway':h=.09;rx=.12;rz=.09;b([.24,.08,.18],[0,.04,0],this.mat('takeaway',0xffffff));b([.25,.012,.19],[0,.087,0],this.mat('takeaway',0xffffff));break;
   default:throw new Error('Unknown prop '+kind);
  }
  if(o.solid){const s=o.scale??1,co=Math.abs(Math.cos(heading)),si=Math.abs(Math.sin(heading));this.world.wall(x-(rx*co+rz*si)*s,x+(rx*co+rz*si)*s,z-(rz*co+rx*si)*s,z+(rz*co+rx*si)*s,g.position.y+h*s);}return g;
 }
 build(){
  const root=new THREE.Group(),moving=[],out=[];
  for(const g of this.queue){if(g.userData.keepAnimated)moving.push(g);else root.add(g);}
  mergeKitMeshes(root);root.updateMatrixWorld(true);
  const collect=m=>{if(m.isMesh||m.isSprite)out.push(m);};
  root.traverse(collect);
  for(const m of out){m.matrixWorld.decompose(m.position,m.quaternion,m.scale);this.world.scene.add(m);}
  for(const g of moving){this.world.scene.add(g);g.traverse(collect);}
  this.queue=[];return out;
 }

}
for(const kind of ['lamp','pendant','bench','bin','bollard','bicycle','bikeRack','sign','signPost','hydrant','mailbox','planter','plant','cafeTable','cafeChair','picnicTable','noticeBoard','officeChair','sofa','laptop','cup','plate','takeaway','book'])Props.prototype[kind]=function(x,z,h=0,o={}){return this.add(kind,x,z,h,o);};
