// The bind pose is a standing domestic shorthair. Local +Z is the nose.
// Paws are placed in the sagittal plane with fixed-length upper/lower limbs.
import * as THREE from 'three';

export const CAT_SCALE=.62;
export const SOLE=.181;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;

const layout=[];
function joint(name,x,y,z,parent='base'){
  layout.push({name,parent,x,y,z});return name;
}
joint('base',0,0,0,null);
joint('hips',0,.016,-.121);joint('chest',0,.018,.082);
joint('neck',0,.050,.111,'chest');joint('head',0,.078,.153,'neck');
for(const side of [-1,1]){
  const s=String(side);
  joint('ear'+s,side*.058,.142,.143,'head');
  joint('upperF'+s,side*.048,.014,.102);
  joint('lowerF'+s,side*.048,-.078,.074,'upperF'+s);
  joint('pawF'+s,side*.048,-.159,.099,'lowerF'+s);
  joint('upperH'+s,side*.055,.018,-.137);
  joint('lowerH'+s,side*.055,-.066,-.086,'upperH'+s);
  joint('hockH'+s,side*.055,-.103,-.167,'lowerH'+s);
  joint('pawH'+s,side*.055,-.159,-.148,'hockH'+s);
}
export const tailPath=[[0,.037,-.164],[.003,.030,-.218],[.006,.031,-.270],[.011,.044,-.322],
  [.016,.064,-.370],[.018,.090,-.416],[.016,.12,-.456]];
tailPath.forEach(([x,y,z],i)=>joint('tail'+i,x,y,z,i?'tail'+(i-1):'hips'));
const rest=Object.fromEntries(layout.map(b=>[b.name,b]));
export const boneIndex=Object.fromEntries(layout.map((b,i)=>[b.name,i]));

export function bindCat(geometry,material){
  const bones={},mesh=new THREE.SkinnedMesh(geometry,material);
  for(const p of layout){
    const bone=new THREE.Bone();bone.name=p.name;bones[p.name]=bone;
    bone.position.set(p.x,p.y,p.z);
    if(p.parent){
      const parent=rest[p.parent];bone.position.x-=parent.x;bone.position.y-=parent.y;bone.position.z-=parent.z;
      bones[p.parent].add(bone);
    }else mesh.add(bone);
  }
  mesh.bind(new THREE.Skeleton(layout.map(p=>bones[p.name])));
  mesh.rotation.order='YXZ';
  mesh.scale.setScalar(CAT_SCALE);
  // Includes all animated poses, even when the first visible frame is a leap.
  mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.01,-.09),.49);
  mesh.userData.rig=bones;
  return mesh;
}

// hip lift, chest lift, front paw (y,z), hind paw (y,z), hock sweep,
// tail carriage and neck pitch. Feet stay on the same plane while weight settles.
const carry=[-.027,-.017,-.098,.105,-.093,-.062,-.92,.16,-.12];
const coil=[-.059,-.041,-.099,.114,-.094,-.053,-1.16,.20,.06];
const push=[.012,.008,-.062,.179,-.107,-.239,.36,-.05,-.12];
const float=[.025,.008,-.111,.174,-.080,-.108,-.89,-.045,-.18];
const reach=[.030,-.004,-.155,.137,-.104,-.093,-.63,.08,-.22];
const catchPose=[-.023,-.046,-.159,.113,-.123,-.123,-.37,.20,-.16];
const compressed=[-.054,-.029,-.159,.113,-.159,-.147,-.48,.23,-.06];
const standing=[0,0,-.159,.11,-.159,-.147,0,.19,-.10];

function limb(side,front){
  const id=(front?'F':'H')+side, a=rest['upper'+id],b=rest['lower'+id],
    c=rest[(front?'paw':'hock')+id],d=rest['paw'+id];
  const angle=(a,b)=>Math.atan2(b.z-a.z,a.y-b.y);
  return {id,front,upper:a,length1:Math.hypot(b.y-a.y,b.z-a.z),length2:Math.hypot(c.y-b.y,c.z-b.z),
    a:angle(a,b),b:angle(b,c),ankle:angle(c,d),heel:Math.hypot(d.y-c.y,d.z-c.z)};
}
const limbs=[limb(-1,true),limb(1,true),limb(-1,false),limb(1,false)];

function placePaw(bones,leg,bodyLift,y,z,sweep,toe){
  const {id,upper,length1,length2}=leg;
  const top=bones['upper'+id],lower=bones['lower'+id],paw=bones['paw'+id];
  top.position.y=upper.y+bodyLift;
  const ankleAngle=leg.ankle+sweep;
  if(!leg.front){y+=Math.cos(ankleAngle)*leg.heel;z-=Math.sin(ankleAngle)*leg.heel;}
  const dy=y-top.position.y,dz=z-upper.z,len=clamp(Math.hypot(dy,dz),Math.abs(length1-length2)+.001,length1+length2-.0001);
  const bend=Math.acos(clamp((length1**2+len**2-length2**2)/(2*length1*len),-1,1));
  const first=Math.atan2(dz,-dy)+(leg.front?-bend:bend);
  const second=Math.atan2(dz-length1*Math.sin(first),-dy-length1*Math.cos(first));
  top.rotation.x=leg.a-first;
  lower.rotation.x=leg.b-second-top.rotation.x;
  let parentPitch=leg.b-second;
  if(!leg.front){
    bones['hock'+id].rotation.x=leg.ankle-ankleAngle-parentPitch;
    parentPitch=leg.ankle-ankleAngle;
  }
  paw.rotation.x=toe-parentPitch;
}

export function poseCat(cat,state,age,clock,descent=0,dt=1){
  let from=carry,to=carry,t=0;
  if(state==='coil'){to=coil;t=smooth(age/.10);}
  if(state==='flight'){
    if(age<.16){from=coil;to=push;t=smooth(age/.16);}
    else if(age<.41){from=push;to=float;t=smooth((age-.16)/.25);}
    else {from=float;to=reach;t=smooth(descent);}
  }
  if(state==='drop'){from=float;to=reach;t=smooth(age/.16);}
  if(state==='paddle'){from=carry;to=standing;t=.52;}
  if(state==='land'){
    if(age<.09){from=reach;to=catchPose;t=smooth(age/.09);}
    else if(age<.23){from=catchPose;to=compressed;t=smooth((age-.09)/.14);}
    else {from=compressed;to=standing;t=smooth((age-.23)/.39);}
  }
  const controls=cat.userData.pose??=carry.slice(),follow=1-Math.exp(-dt*32);
  for(let i=0;i<controls.length;i++)controls[i]=mix(controls[i],mix(from[i],to[i],t),follow);
  const at=i=>controls[i], b=cat.userData.rig;
  const quiet=state==='carry'||(state==='land'&&age>.63),phase=clock*2.7+cat.userData.beat;
  const breath=quiet ? .0028*Math.sin(phase) : 0,hips=at(0),chest=at(1)+breath;
  b.hips.position.y=rest.hips.y+hips;b.chest.position.y=rest.chest.y+chest;
  b.chest.scale.x=1+breath*2;b.neck.rotation.x=at(8);
  const look=state==='carry' ? 1 : state==='coil' ? 1-t : 0;
  b.head.rotation.y=-.48*look+(quiet ? .09*Math.sin(phase*.49) : 0);
  b.head.rotation.x=(quiet ? .035*Math.sin(phase*.65) : 0)-descent*.07-cat.rotation.x*.6;
  for(const leg of limbs){
    const lead=leg.id.endsWith('-1')?1:-1, airborne=state==='flight'||state==='drop';
    const swim=state==='paddle' ? Math.sin(age*12+lead*1.5+(leg.front?0:Math.PI)) : 0;
    placePaw(b,leg,leg.front?chest:hips,at(leg.front?2:4)+(airborne?lead*.006:0)+.018*swim,
      at(leg.front?3:5)+(airborne?lead*.012:0)+.055*swim,at(6),airborne?(leg.front?-.23:.32):0);
  }
  for(const side of [-1,1]){
    const flick=quiet?Math.max(0,Math.sin(phase*.67+side*1.9))**16:0;
    b['ear'+side].rotation.set(.09*flick,side*(.10*look+.24*flick),side*.05*flick);
  }
  tailPath.forEach((_,i)=>{
    const u=i/(tailPath.length-1);
    const tail=b['tail'+i],lag=1-Math.exp(-dt*(18-9*u));
    tail.rotation.x=mix(tail.rotation.x,at(7)+.028*Math.sin(phase-i*.50),lag);
    tail.rotation.y=mix(tail.rotation.y,(.035+.055*u)*Math.sin(phase*.72-i*.55),lag);
  });
}
