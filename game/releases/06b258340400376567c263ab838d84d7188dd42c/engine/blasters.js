import * as THREE from 'three';

import { makeSceneryProbe, makeImpactMarks } from './scenery-hits.js';
import { makeWeaponModel } from './weapon-models.js';
export { weaponNames } from './weapon-models.js';

const unit=new THREE.BoxGeometry();
const up=new THREE.Vector3(0,1,0);

export function makeWeapons() {
  const guns=[null,makeWeaponModel(false),makeWeaponModel(true)];
  const group=new THREE.Group();group.name='Player weapons';group.userData.noShot=true;group.add(guns[1].model,guns[2].model);
  const marks=makeImpactMarks(group),sightCandidates=[];
  let scenery=null;
  const brass=new THREE.MeshLambertMaterial({color:0xcbaa61});
  const amber=new THREE.MeshBasicMaterial({color:0xffdd97});
  const flash=new THREE.Mesh(new THREE.OctahedronGeometry(1,0),amber);
  flash.name='Muzzle flash';group.add(flash);
  const chipMat=new THREE.MeshBasicMaterial({color:0xe8cc99,transparent:true,depthWrite:false});
  const chip=new THREE.Mesh(new THREE.IcosahedronGeometry(.075,0),chipMat);
  chip.name='Impact puff';group.add(chip);
  const shots=Array.from({length:12},()=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.014,.019,1,5),amber);mesh.name='Tracer';group.add(mesh);
    return {mesh,p:new THREE.Vector3(),v:new THREE.Vector3(),life:0,items:[]};
  });
  const cases=Array.from({length:10},()=>{
    const mesh=new THREE.Mesh(unit,brass);mesh.scale.set(.027,.032,.065);mesh.name='Spent case';group.add(mesh);
    return {mesh,v:new THREE.Vector3(),life:0};
  });
  const ray=new THREE.Ray(), forward=new THREE.Vector3(), muzzle=new THREE.Vector3(), aim=new THREE.Vector3();
  const delta=new THREE.Vector3(), end=new THREE.Vector3(), offHand=new THREE.Vector3();
  const knuckle=new THREE.Vector3(), twistAxis=new THREE.Vector3(), twist=new THREE.Quaternion();
  let shotIndex=0,caseIndex=0,cooldown=0,kick=0,burst=0,puff=0,waterImpact=false;
  let lastGear=0, raisedFor=0, carry=1;
  function clear() {
    group.visible=false;flash.visible=chip.visible=false;
    guns[1].model.visible=guns[2].model.visible=false;
    for (const item of [...shots,...cases]) {item.life=0;item.mesh.visible=false;}
    cooldown=kick=burst=puff=0;marks.clear();
    for(const shot of shots)shot.items.length=0;
    sightCandidates.length=0;
    lastGear=0;raisedFor=0;carry=1;
  }
  clear();
  function turnChestBone(bone,angle) {
    twistAxis.copy(up).applyQuaternion(bone.parent.getWorldQuaternion(twist).invert());
    bone.quaternion.premultiply(twist.setFromAxisAngle(twistAxis,angle));
  }

  const shoulder=new THREE.Vector3(), elbow=new THREE.Vector3(), reach=new THREE.Vector3();
  const palmOffset=new THREE.Vector3(),wristGoal=new THREE.Vector3();
  function fitPalm(f,side,goal) {
    const hand=f.bones[side+'Hand'],finger=f.bones[side+'HandIndex1'];
    // reach() targets the wrist. The center of the palm shifts a little as the
    // wrist turns, so correct the grip after the first solve if it still gaps.
    for(let pass=0;pass<2;pass++){
      hand.getWorldPosition(elbow);
      palmOffset.set(0,0,0);
      if(finger?.isBone===true)palmOffset.subVectors(finger.getWorldPosition(knuckle),elbow).multiplyScalar(.55);
      wristGoal.copy(goal).sub(palmOffset);
      if(wristGoal.distanceToSquared(elbow)<.000016)break;
      f.reach(side,f.root.worldToLocal(wristGoal).toArray());
    }
  }
  function poseWeapon({model,support,stock,handle},f,view,pitch,rifle) {
    const shouldered=rifle && f.bones?.Spine2?.isBone===true;
    if (shouldered) {
      const turn=.66+.24*carry;
      turnChestBone(f.bones.Spine2,-turn);
      if(f.bones.Neck?.isBone===true)turnChestBone(f.bones.Neck,turn-.08);
      f.arms[1].shoulder.getWorldPosition(model.position);
      model.position.add(shoulder.set(-.045,-.045,.108).applyQuaternion(f.root.quaternion));
    } else {
      if(f.bones?.RightArm?.isBone===true){
        f.aim(f.bones.RightArm,[-.14-.28*carry,pitch-.43-.18*carry,.86]);
        f.aim(f.bones.RightForeArm,[.12-.14*carry,pitch+.20-.10*carry,.96]);
      }
      f.arms[1].hand.getWorldPosition(model.position);
      const finger=f.bones?.RightHandIndex1;
      if(finger?.isBone===true)model.position.lerp(finger.getWorldPosition(knuckle),.55);
    }
    model.lookAt(aim.copy(model.position).add(view));
    model.rotateY(carry*(shouldered ? -.27 : -.21));
    model.rotateX(carry*(rifle ? .24 : .23)-kick*1.8);
    model.translateZ(-kick*.65);
    if(!shouldered){
      model.position.sub(shoulder.copy(handle).multiply(model.scale).applyQuaternion(model.quaternion));
      return;
    }

    // The rear pad rests on the front of the jacket. Solve both hands from
    // there, so turning the prop never swings the stock through the back.
    model.position.sub(shoulder.copy(stock.position).multiply(model.scale).applyQuaternion(model.quaternion));
    const left=f.arms[0];
    left.shoulder.getWorldPosition(shoulder);left.elbow.getWorldPosition(elbow);
    const span=shoulder.distanceTo(elbow)+elbow.distanceTo(left.hand.getWorldPosition(knuckle))-.006;
    reach.subVectors(support.getWorldPosition(offHand),shoulder);
    const distance=reach.length();
    if(distance>span)model.position.addScaledVector(reach,(span-distance)/distance);
    fitPalm(f,'Right',model.localToWorld(offHand.copy(handle)));
    support.getWorldPosition(offHand);
    fitPalm(f,'Left',offHand);
  }

  function advanceShots(dt,sound) {
    for(const shot of shots){
      if (shot.life<=0) continue;
      const travel=Math.min(shot.life,dt);
      let hit=null;
      for(let left=travel;left>1e-7;){
        const h=Math.min(left,1/60);left-=h;
        delta.copy(shot.v).multiplyScalar(h);delta.y-=2*h*h;shot.v.y-=4*h;
        const distance=delta.length();
        ray.origin.copy(shot.p);ray.direction.copy(delta).normalize();
        hit=scenery.cast(ray,distance,shot.items,end);
        shot.p.copy(end);
        if (hit) break;
      }
      shot.life=hit ? 0 : Math.max(0,shot.life-dt);
      shot.mesh.visible=shot.life>0;
      if(hit){
        chip.position.copy(end);puff=.14;
        waterImpact=marks.add(hit,ray,sound);
        chipMat.color.setHex(waterImpact ? 0xdaf0ec : 0xc9b99d);

      } else {
        shot.mesh.position.copy(shot.p).addScaledVector(ray.direction,-.26);
        shot.mesh.quaternion.setFromUnitVectors(up,ray.direction);shot.mesh.scale.y=.52;
      }
    }
  }
  function advanceCases(world,dt){
    for(const item of cases){
      if(item.life<=0)continue;
      item.life-=dt;item.mesh.visible=item.life>0;
      const pos=item.mesh.position;
      pos.addScaledVector(item.v,dt);item.v.y-=12*dt;
      const floor=world.ground(pos.x,pos.z)+.025;
      if(pos.y<floor){pos.y=floor;item.v.y=Math.abs(item.v.y)*.28;item.v.x*=.62;item.v.z*=.62;}
      item.mesh.rotation.x+=item.v.length()*dt*3;item.mesh.rotation.z+=item.v.y*dt;
    }
  }
  return {
    attach(scene){clear();scenery=null;scene.add(group);},
    detach(){clear();scenery=null;group.removeFromParent();},clear,
    update(world,player,camera,gear,fire,dt,sound){
      if(!gear && !group.visible)return;
      group.visible=true;
      cooldown=Math.max(0,cooldown-dt);kick*=Math.exp(-dt*12);
      burst=Math.max(0,burst-dt);puff=Math.max(0,puff-dt);
      guns[1].model.visible=gear===1;guns[2].model.visible=gear===2;
      if (gear) {
        if(lastGear!==gear){carry=1;raisedFor=0;}
        // At rest the prop sits just outside the jacket silhouette. Bring it
        // back to the reticle before sampling the tip for a shot.
        if(fire){raisedFor=.38;carry=0;}
        else {
          raisedFor=Math.max(0,raisedFor-dt);
          carry+=((raisedFor>0 ? 0 : 1)-carry)*(1-Math.exp(-dt*7));
        }
        camera.rotateX(kick);camera.getWorldDirection(forward);
        player.heading=Math.atan2(forward.x,forward.z);
        const f=player.figure;f.root.rotation.y=player.heading;
        const pitch=forward.y;
        const {model,tip}=guns[gear];
        poseWeapon(guns[gear],f,forward,pitch,gear===2);
        if(fire && cooldown===0){
          scenery??=makeSceneryProbe(world,group);
          ray.origin.copy(camera.position);ray.direction.copy(forward);
          scenery.select(ray,70,0,sightCandidates);
          scenery.cast(ray,70,sightCandidates,aim);
          tip.getWorldPosition(muzzle);
          const shot=shots[shotIndex++%shots.length], speed=gear===1?58:75;
          shot.p.copy(muzzle);ray.origin.copy(muzzle);ray.direction.subVectors(aim,muzzle).normalize();
          shot.v.copy(ray.direction).multiplyScalar(speed);
          shot.life=.90;
          // The corridor includes the full drop during flight. Intersection is
          // still checked against the actual mesh on each swept step.
          scenery.select(ray,speed*shot.life,2,shot.items);
          const item=cases[caseIndex++%cases.length];item.life=1.9;item.mesh.visible=true;
          item.mesh.position.copy(model.position);item.mesh.position.y+=.12;
          item.v.set(1.8,2.1,-.25).applyQuaternion(model.quaternion);
          burst=.07;flash.position.copy(muzzle);flash.quaternion.copy(model.quaternion);
          flash.scale.set(.069,.072,.15);flash.translateZ(.065);
          kick=Math.min(.10,kick+(gear===1?.046:.061));cooldown=gear===1?.26:.12;
          world.crowd?.hearShot(player.pos,gear===2);
          sound.shot(gear);
        }
      }
      lastGear=gear;
      advanceShots(dt,sound);advanceCases(world,dt);marks.update(dt);
      flash.visible=burst>0 && !!gear;chip.visible=puff>0;chip.scale.set(1+(.14-puff)*8,waterImpact?2.1:1.1,1.1);chipMat.opacity=puff/.14;
    },
  };
}
