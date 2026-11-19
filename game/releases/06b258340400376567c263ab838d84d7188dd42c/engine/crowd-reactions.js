// A report is a world event. Everyone in earshot reacts to the same sound,
// including people behind the player and when the game's audio is muted.
import * as THREE from 'three';

const sides=['Left','Right'];

// Capture a second pose from the person's authored stance. Seated characters
// keep their seat; standing ones bend their knees with their shoes planted.
export function makeBracePose(f) {
  const rigged=f.bones?.Spine?.isBone===true;
  const base=rigged ? f.rig : f.pelvis;
  const props=Object.values(f.held || {});
  const joints=[base,f.spine,f.head,...f.arms.flatMap(a=>[a.shoulder,a.elbow]),
    ...f.legs.flatMap(l=>[l.hip,l.knee,l.foot]),...props];
  const tracks=joints.map(joint=>({joint,p:joint.position.clone(),q:joint.quaternion.clone()}));
  const heading=f.root.getWorldQuaternion(new THREE.Quaternion());
  const axis=new THREE.Vector3(),rotation=new THREE.Quaternion();
  function bend(joint,angle) {
    axis.set(1,0,0).applyQuaternion(heading).applyQuaternion(joint.parent.getWorldQuaternion(rotation).invert());
    joint.quaternion.premultiply(rotation.setFromAxisAngle(axis,angle));
  }
  if(rigged && !f.seated){
    const feet=f.legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3()));
    base.position.y-=.31;base.position.z-=.055;
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(heading);
    f.root.updateMatrixWorld(true);
    for(let i=0;i<2;i++) f.moveAnkle(sides[i],feet[i],forward);
  }
  bend(f.spine,rigged && f.seated ? .60 : .70);
  bend(f.head,.25);
  const occupied=props.some(p=>['book','newspaper','laptop','camera','tray'].includes(p.userData.thing));
  if(!occupied){
    for(let i=0;i<2;i++){
      if(f.held?.[i])continue;
      if(rigged){
        const h=f.localJoint('Head');
        f.reach(sides[i],[h.x+(i ? -.13 : .13),h.y+.09,h.z+.06]);
      } else {
        f.arms[i].shoulder.rotateX(-1.1); f.arms[i].elbow.rotateX(-1.1);
      }
    }
  }
  if(rigged)f.grips();
  const poses=tracks.map(t=>({...t,toP:t.joint.position.clone(),toQ:t.joint.quaternion.clone()}));
  function apply(amount) {
    for(const {joint,p,q,toP,toQ} of poses){
      joint.position.lerpVectors(p,toP,amount);
      joint.quaternion.slerpQuaternions(q,toQ,amount);
    }
    f.root.updateMatrixWorld(true);
  }
  apply(0);
  return apply;
}

// YC bakes seated and standing figures into shared material batches. Keep
// the pose offsets and original vertices for just this person's ranges.
export function bakedBystander(position) {
  const ranges=[],point=new THREE.Vector3();
  return {
    position:position.clone(),floorPoints:[],
    bind(geometry,first,delta){
      const attribute=geometry.attributes.position;
      const rest=attribute.array.slice(first,first+delta.length);
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      for(let i=0;i<delta.length;i+=3){
        point.set(rest[i]+delta[i],rest[i+1]+delta[i+1],rest[i+2]+delta[i+2]);
        geometry.boundingBox.expandByPoint(point);
      }
      geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(geometry.boundingSphere??new THREE.Sphere());
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.boundingSphere.radius+=2.1;
      ranges.push({attribute,first,delta,rest,normal:geometry.attributes.normal,restNormals:null,upload:{start:first,count:delta.length}});
    },
    apply(amount,roll=null){
      for(const range of ranges){
        const {attribute,first,delta,rest,upload,normal}=range;
        if(roll && !range.restNormals)range.restNormals=normal.array.slice(first,first+delta.length);
        if(roll){
          for(let i=0;i<delta.length;i+=3){
            point.set(rest[i]+amount*delta[i],rest[i+1]+amount*delta[i+1],rest[i+2]+amount*delta[i+2]);
            point.applyMatrix4(roll).toArray(attribute.array,first+i);
            point.fromArray(range.restNormals,i).transformDirection(roll).toArray(normal.array,first+i);
          }
        } else for(let i=0;i<delta.length;i++)attribute.array[first+i]=rest[i]+amount*delta[i];
        if(range.restNormals){
          if(!roll){normal.array.set(range.restNormals,first);range.restNormals=null;}
          if(!normal.updateRanges.includes(upload))normal.updateRanges.push(upload);
          normal.needsUpdate=true;
        }
        // Off-screen batches may skip uploads for many frames.
        if(!attribute.updateRanges.includes(upload))attribute.updateRanges.push(upload);
        attribute.needsUpdate=true;
      }
    },
  };
}

// Contact samples for the toy tumble. Store positions, so baked chapters can
// release their original rigs and still keep shoes, sleeves and heads above ground.
export function foamFloorPoints(f,pose){
  const joints=[[f.head,.13],[f.pelvis,.14],...f.legs.flatMap(l=>[[l.foot,.065],[l.knee,.08]]),
    ...f.arms.flatMap(a=>[[a.shoulder,.10],[a.elbow,.075],[a.hand,.06]])];
  const samples=joints.map(([bone,r])=>({rest:bone.getWorldPosition(new THREE.Vector3()),tuck:new THREE.Vector3(),r:r*f.root.scale.y}));
  pose(1);
  joints.forEach(([bone],i)=>bone.getWorldPosition(samples[i].tuck));
  pose(0);return samples;
}

export function bakeBraceOffsets(f,parts,person) {
  const apply=makeBracePose(f),point=new THREE.Vector3();
  person.floorPoints=foamFloorPoints(f,apply);
  apply(1);
  for(const {source,mesh} of parts){
    const rest=mesh.geometry.attributes.position, offset=new Float32Array(rest.count*3);
    source.skeleton?.update();
    for(let i=0;i<rest.count;i++){
      source.getVertexPosition(i,point).applyMatrix4(source.matrixWorld);
      offset[3*i]=point.x-rest.getX(i);offset[3*i+1]=point.y-rest.getY(i);offset[3*i+2]=point.z-rest.getZ(i);
    }
    mesh.geometry.setAttribute('braceOffset',new THREE.BufferAttribute(offset,3));
  }
  apply(0);
}

export function makeCrowdReactions(world,playerRoot) {
  const active=new Set(), people=[];
  const walkers=new Map((world.walkers??[]).map(w=>[w.root,w]));
  function listen(position,apply,walker=null,figure=null,baked=null){
    const seed=(people.length*.61803398875)%1;
    people.push({position,apply,walker,figure,baked,seed,tagged:false,delay:0,hold:0,amount:0,strength:0});
  }
  world.scene.traverse(root=>{
    const f=root.userData.figure;
    if(!f || root===playerRoot)return;
    const walker=walkers.get(root);
    if(walker)listen(root.position,amount=>{walker.alarm=amount;},walker,f);
    else {
      let pose;
      listen(root.position,amount=>{pose??=makeBracePose(f);pose(amount);},null,f);
    }
  });
  for(const person of world.bakedBystanders??[])listen(person.position,person.apply,null,null,person);
  return {
    bystanders:people,
    pauseForTag(p){
      active.delete(p);
      if(p.amount)p.apply(0);
      p.delay=p.hold=p.strength=p.amount=0;p.tagged=true;
      if(p.walker){p.walker.tagPaused=true;p.walker.v=0;}
    },
    hearShot(source,rifle){
      const radius=rifle ? 24 : 18;
      for(const p of people){
        if(p.tagged)continue;
        const distance=p.position.distanceTo(source);
        if(distance>=radius)continue;
        if(!active.has(p)){
          p.delay=.04+.14*p.seed+.12*distance/radius;
          active.add(p);
        }
        if(p.hold<=0)p.walker?.fleeFrom(source);
        p.hold=1.35+1.45*p.seed;
        p.strength=Math.max(p.amount,.62+.38*(1-distance/radius));
      }
    },
    update(dt){
      for(const p of active){
        if(p.delay>0){p.delay-=dt;continue;}
        p.hold=Math.max(0,p.hold-dt);
        const next=p.hold>0 ? Math.min(p.strength,p.amount+dt*5.5) : Math.max(0,p.amount-dt*.88);
        if(next!==p.amount){p.amount=next;p.apply(next*next*(3-2*next));}
        if(!p.hold && !p.amount)active.delete(p);
      }
    },
  };
}
