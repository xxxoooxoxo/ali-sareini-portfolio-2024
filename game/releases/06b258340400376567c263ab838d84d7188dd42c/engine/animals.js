// const animals = new Animals(world); animals attach immediately; build() is optional (returns roots).
// dog(x,z,heading=0,{coat:'tan'|'black'|'white'|'brown'|RGB, pose:'stand'|'sit'|'walk',
//   to:[x,z], speed:0.8, scale:1, y:absoluteBase, solid:false}); +Z is forward.
// gull(x,z,heading=0,{flying:false,height:5,radius:3,speed:0.5,scale:1,y}); flying circles its start.
// pigeon(x,z,heading=0,{radius:0.4,speed:0.35,scale:1,y}); pecks and shuffles around its start.
// duck(x,z,heading=0,{y:waterHeight,radius:1,speed:0.2,scale:1}); drifts at the specified water height.
// add(kind,x,z,heading=0,options={}) dispatches to those four methods; every method returns a Group.
// Animation uses world.ticks(time,dt); all geometry is smoothly shaded with small diffuse textures.
import * as THREE from 'three';
import {kitMaterial,softTexture,mergeKitMeshes} from './kit-textures.js';
const sphere=new THREE.SphereGeometry(1,6,4),face=sphere.clone(),birdFace=sphere.clone(),cone=new THREE.ConeGeometry(1,1,6);
for(let i=0;i<face.attributes.position.count;i++){const p=face.attributes.position;face.attributes.uv.setXY(i,p.getX(i)*.5+.5,p.getY(i)*.5+.5);}
for(let i=0;i<birdFace.attributes.position.count;i++){const p=birdFace.attributes.position;birdFace.attributes.uv.setXY(i,.3+p.getZ(i)*.25,.55+p.getY(i)*.35);}
// Six-sided anatomical sections: z, centre height, width, vertical radius.
function profile(rows){const p=[],uv=[],n=8;const point=(r,k)=>{const a=k/n*Math.PI*2;return [Math.cos(a)*r[2],r[1]+Math.sin(a)*r[3],r[0]];};
 const tri=(a,b,c)=>{for(const v of [a,b,c]){p.push(...v);uv.push((v[2]+1)/2,v[1]/1.2);}};
 for(let j=0;j<rows.length-1;j++)for(let k=0;k<n;k++){const a=point(rows[j],k),b=point(rows[j],k+1),c=point(rows[j+1],k+1),d=point(rows[j+1],k);tri(a,b,d);tri(b,c,d);}
 for(const [r,rev]of [[rows[0],true],[rows.at(-1),false]])for(let k=1;k<n-1;k++){const a=point(r,0),b=point(r,k),c=point(r,k+1);tri(a,rev?c:b,rev?b:c);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
 const groups=new Map(),norm=g.attributes.normal;for(let i=0;i<p.length/3;i++){const k=p.slice(i*3,i*3+3).map(v=>v.toFixed(5)).join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}for(const ids of groups.values()){const n=new THREE.Vector3();for(const i of ids)n.add(new THREE.Vector3().fromBufferAttribute(norm,i));n.normalize();for(const i of ids)norm.setXYZ(i,n.x,n.y,n.z);}return g;}
const dogBody=profile([[-.73,.73,.035,.05],[-.65,.73,.12,.13],[-.4,.77,.22,.23],[-.12,.78,.17,.16],[.22,.76,.25,.28],[.44,.78,.20,.26],[.53,.80,.07,.14]]),small=new THREE.SphereGeometry(1,7,4),eyeGeo=new THREE.OctahedronGeometry(1),limbGeo=new THREE.CylinderGeometry(1,.65,1,6,1,true);
function greetDog(world, dog, head, tail, paw) {
  dog.name = 'Park dog';
  head.name = 'Dog head';
  let remaining = 0, turn = 0;
  const { x, y, z } = dog.position;
  world.interactions.push({
    x, y: y + 1.2 * dog.scale.y, z, r: 2.35,
    get label() { return remaining > 0 ? null : 'Greet dog'; },
    act(player) {
      const delta = Math.atan2(player.pos.x - x, player.pos.z - z) - dog.rotation.y;
      turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(delta), Math.cos(delta))));
      remaining = 2;
    },
  });
  world.ticks.push((t, dt) => {
    if (remaining <= 0) return;
    remaining = Math.max(0, remaining - dt);
    const weight = Math.min(1, remaining * 3, (2 - remaining) * 6);
    head.rotation.set(-.27 * weight, turn * weight, .28 * weight);
    paw.rotation.x = -.65 * weight;
    tail.rotation.y += weight * Math.sin(t * 15) * .95;
  });
}

export class Animals{
 constructor(world){this.world=world;this.roots=[];this.mats=new Map();}
 mat(kind,c){const k=kind+JSON.stringify(c);if(!this.mats.has(k))this.mats.set(k,kitMaterial(kind,c));return this.mats.get(k);}
 add(kind,x,z,h=0,o={}){if(!['dog','gull','pigeon','duck'].includes(kind))throw new Error('Unknown animal '+kind);return this[kind](x,z,h,o);}
 build(){return this.roots;}
 root(x,z,h,o){const g=new THREE.Group();g.userData.noShot=true;g.position.set(x,o.y??this.world.ground(x,z),z);g.rotation.y=h;g.scale.setScalar(o.scale??1);this.world.scene.add(g);this.roots.push(g);return g;}
 shadow(){}
 part(g,s,p,mat,geo=sphere){const m=new THREE.Mesh(geo,mat);m.scale.set(...s);m.position.set(...p);g.add(m);return m;}
 dog(x,z,h=0,o={}){
  const g=this.root(x,z,h,o),coat=Array.isArray(o.coat)?o.coat:({tan:0xb59467,black:0x42413c,white:0xd9d4bd,brown:0x82634a}[o.coat]??0xb59467),m=this.mat(o.coat==='white'?'longfur':'fur',coat),dark=this.mat('fur',0x34332d),cream=this.mat('fur',o.coat==='black'?0x55534f:o.coat==='white'?0xf3eee0:0xcebf9b),sit=o.pose==='sit';
  this.shadow(g,.45,.8);
  const torso=new THREE.Group();g.add(torso);this.part(torso,[1,1,1],[0,sit?-.15:0,0],this.mat('dogcoat',coat),dogBody);
  this.part(torso,[.18,.29,.20],[0,.91,.36],m,small);
  const head=new THREE.Group();head.position.set(0,1.12,.49);g.add(head);
  this.part(head,[.16,.18,.20],[0,0,0],m,new THREE.SphereGeometry(1,8,5));
  this.part(head,[.105,.085,.19],[0,-.06,.19],cream,small);this.part(head,[.077,.055,.045],[0,-.04,.35],dark,small);
  for(const side of [-1,1]){const ear=this.part(head,[.08,.17,.07],[side*.135,.11,-.045],dark,cone);ear.rotation.z=side*-.22;this.part(head,[.022,.024,.018],[side*.08,.035,.15],dark,eyeGeo);}
  const segment=(parent,a,b,r,mat)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const mesh=this.part(parent,[r,d.length(),r],av.add(bv).multiplyScalar(.5).toArray(),mat,limbGeo);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());};
  const legs=[];for(const side of [-1,1])for(const end of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*.18,.72,end*.38);g.add(pivot);
    const knee=[0,-.31,end<0?.16:-.045],ankle=[0,-.59,end<0?-.04:.015];
    segment(pivot,[0,0,0],knee,end<0?.12:.085,m);segment(pivot,knee,ankle,.052,cream);
    this.part(pivot,[.075,.055,.12],[0,-.62,ankle[2]+.055],cream,small);
    if(sit&&end<0){pivot.position.y=.48;pivot.rotation.x=-.85;}legs.push(pivot);
  }
  const tail=new THREE.Group();tail.position.set(0,.80,-.60);g.add(tail);
  const curve=new THREE.CatmullRomCurve3([[0,0,0],[0,-.12,-.18],[.02,-.08,-.38],[.04,.08,-.52]].map(p=>new THREE.Vector3(...p)));
  const tg=new THREE.TubeGeometry(curve,6,.045,5,false);const tp=tg.attributes.position;for(let i=0;i<tp.count;i++){const u=Math.floor(i/6)/6,center=curve.getPointAt(u),v=new THREE.Vector3().fromBufferAttribute(tp,i).sub(center).multiplyScalar(1.35-u*.95).add(center);tp.setXYZ(i,v.x,v.y,v.z);}tg.computeVertexNormals();tail.add(new THREE.Mesh(tg,m));
  mergeKitMeshes(torso);
  const colliderIndex=this.world.circles.length;
  if(o.solid)this.world.post(x,z,.4*(o.scale??1),g.position.y+1.2*(o.scale??1));
  const to=o.to??[x+3,z],len=Math.hypot(to[0]-x,to[1]-z),speed=o.speed??.8;
  this.world.ticks.push(t=>{tail.rotation.y=Math.sin(t*5)*.25;if(o.pose==='walk'&&len>.001){const q=(t*speed/len)%2,k=q<1?q:2-q;g.position.x=x+(to[0]-x)*k;g.position.z=z+(to[1]-z)*k;g.position.y=o.y??this.world.ground(g.position.x,g.position.z);g.rotation.y=Math.atan2(to[0]-x,to[1]-z)+(q>=1?Math.PI:0);if(o.solid){const c=this.world.circles[colliderIndex];c[0]=g.position.x;c[1]=g.position.z;c[3]=g.position.y+1.2*(o.scale??1);}
legs.forEach((p,i)=>p.rotation.x=Math.sin(t*speed*8+(i===0||i===3?0:Math.PI))*.48);}});
  if (o.friendly) greetDog(this.world, g, head, tail, legs[1]);
  for(const node of [...g.children].filter(n=>n.isGroup))mergeKitMeshes(node);return g;
 }
 bird(kind,x,z,h,o){const g=this.root(x,z,h,o),duck=kind==='duck',gull=kind==='gull',m=this.mat(kind,gull?0xe0dfd1:duck?0x887e67:0x7e8390),dark=this.mat('fur',0x343a3d),headmat=this.mat('fur',duck?0x435c46:gull?0xdeddd2:0x65756e),beak=this.mat('plastic',duck?0xbda252:0xc1a477);
 if(!o.flying)this.shadow(g,.24,.38);
 this.part(g,[.15,.16,.28],[0,.22,0],m);const head=new THREE.Group();head.position.set(0,.4,.18);g.add(head);this.part(head,[.095,.105,.11],[0,0,0],this.mat(kind+'head',0xffffff),birdFace);this.part(head,[duck?.065:.035,.025,.095],[0,-.015,.12],beak);for(const s of [-1,1])this.part(head,[.014,.014,.014],[s*.085,.025,.04],dark);
 if(duck){this.part(g,[.1,.025,.1],[0,.335,.18],this.mat('fur',0xc1c4b5));for(const s of [-1,1])this.part(g,[.022,.065,.17],[s*.148,.25,-.04],this.mat('fur',0x655c50));}
 const wings=[];for(const s of [-1,1]){const wing=new THREE.Group();wing.position.set(s*.12,.25,0);g.add(wing);this.part(wing,[.075,.46,.055],[s*.035,0,-.025],m,cone);wing.children[0].rotation.x=-Math.PI/2;wings.push(wing);if(!duck&&!o.flying){this.part(g,[.012,.1,.012],[s*.065,.08,0],beak);this.part(g,[.045,.012,.055],[s*.065,.012,.03],beak);}}
 const tail=this.part(g,[.1,.3,.035],[0,.24,-.27],dark,cone);tail.rotation.x=-Math.PI/2;
 if(gull&&o.flying){wings.forEach((w,i)=>{w.children[0].rotation.set(0,0,i?-Math.PI/2:Math.PI/2);w.children[0].scale.set(.12,.72,.035);w.children[0].position.set(i? .3:-.3,0,-.03);this.part(w,[.25,.025,.08],[i?.72:-.72,0,-.08],dark);});}
 const radius=o.radius??(duck?1:gull?3:.4),speed=o.speed??(duck?.2:.35);
 this.world.ticks.push(t=>{if(gull&&o.flying){const a=t*(o.speed??.5)+h;g.position.set(x+Math.cos(a)*radius,(o.y??this.world.ground(x,z))+(o.height??5)+Math.sin(t*.9)*.15,z+Math.sin(a)*radius);g.rotation.y=-a;wings.forEach((w,i)=>w.rotation.z=Math.sin(t*5)*(i?1:-1)*.35);}else if(!gull){const a=t*speed+h,move=duck?1:Math.max(0,Math.sin(t*1.1));g.position.x=x+Math.cos(a)*radius;g.position.z=z+Math.sin(a)*radius;g.position.y=o.y??this.world.ground(g.position.x,g.position.z);g.rotation.y=-a;head.rotation.x=duck?Math.sin(t)*.07:Math.max(0,Math.sin(t*2.7))*.8;g.rotation.z=duck?Math.sin(t*1.3)*.04:Math.sin(t*9)*move*.035;}});return g;}
 gull(x,z,h=0,o={}){return this.bird('gull',x,z,h,o);}pigeon(x,z,h=0,o={}){return this.bird('pigeon',x,z,h,o);}duck(x,z,h=0,o={}){return this.bird('duck',x,z,h,o);}
}
