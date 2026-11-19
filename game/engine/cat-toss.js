// Cat toss on the regular maps. A direct tag starts the bystander’s playful tumble.
import * as THREE from 'three';
import { makeSceneryProbe } from 'life/engine/scenery-hits.js';
import { makeBracePose, foamFloorPoints } from 'life/engine/crowd-reactions.js';
import { drawTex } from 'life/engine/look.js';
import { makeTossCat } from 'life/engine/toss-cats.js';

const RADIUS=.16, UP=new THREE.Vector3(0,1,0);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const ease=t=>t*t*(3-2*t);
let badge;
function tagBadge(){
  const map=drawTex(64,32,g=>{
    g.fillStyle='#244345';g.fillRect(4,4,56,22);g.fillRect(30,25,6,4);
    g.fillStyle='#ffe093';g.font='bold italic 19px sans-serif';g.textAlign='center';g.fillText('TAG!',32,22);
  });
  return new THREE.SpriteMaterial({map,transparent:true,depthWrite:false});
}
function headOf(p,target){
  if(p.figure)return p.figure.head.getWorldPosition(target);
  const head=p.baked.floorPoints[0];
  return target.lerpVectors(head.rest,head.tuck,ease(p.amount));
}

export function makeCatToss(world,player){
  badge??=tagBadge();
  const group=new THREE.Group();group.name='Cat toss';group.userData.noShot=true;world.scene.add(group);
  const pair=[makeTossCat(0),makeTossCat(1)];
  for(const cat of pair){cat.name='Held '+cat.userData.coat;cat.visible=false;group.add(cat);}
  const balls=Array.from({length:4},(_,i)=>{
    const mesh=makeTossCat(i%2);mesh.visible=false;mesh.name='Tossed '+mesh.userData.coat;group.add(mesh);
    return {mesh,v:new THREE.Vector3(),items:[],life:0,bounce:0,fallTime:0,floorY:0,landing:new THREE.Vector3()};
  });
  const turns=new Set(),ray=new THREE.Ray(),end=new THREE.Vector3(),move=new THREE.Vector3();
  const head=new THREE.Vector3(),forward=new THREE.Vector3(),aim=new THREE.Vector3(),sight=[];
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),inst=new THREE.Matrix4(),normal=new THREE.Matrix3();
  const facing=new THREE.Quaternion(),turn=new THREE.Euler(0,0,0,'YXZ');
  let probe=null,cooldown=0,next=0;

  function finish(turn){
    const p=turn.person;
    if(turn.wrapper){
      turn.parent.add(p.figure.root);turn.wrapper.removeFromParent();
      turn.pose(0);
    } else p.baked.apply(0);
    turn.sign.removeFromParent();
    p.tagged=false;if(p.walker)p.walker.tagPaused=false;
    turns.delete(turn);
  }
  function startTurn(person,velocity){
    const origin=person.position.clone(), height=clamp(headOf(person,head).y-origin.y+.15,.6,2.1);
    // Pick room for the pratfall. A seat, parapet or wall can shorten the roll.
    const away=new THREE.Vector3(velocity.x,0,velocity.z);
    if(away.lengthSq()<.01)away.set(0,0,1);else away.normalize();
    let room=0; const dir=away.clone(),items=[];
    for(const a of [0,Math.PI/2,-Math.PI/2,Math.PI]){
      ray.direction.copy(away).applyAxisAngle(UP,a);
      let free=height;
      for(const y of [.32,.70]){
        ray.origin.copy(origin);ray.origin.y+=height*y;
        probe.select(ray,free,0,items);
        const hit=probe.cast(ray,free,items,end);
        if(hit)free=Math.max(0,hit.distance-.17);
      }
      if(free>room){room=free;dir.copy(ray.direction);}
      if(room>=height-.01)break;
    }
    world.crowd.pauseForTag(person);
    const t={person,origin,dir,height,axis:new THREE.Vector3().crossVectors(UP,dir),
      limit:Math.min(1.53,Math.asin(clamp(room/height,0,1))),age:0,angle:0,spin:2.9,
      wrapper:null,parent:null,pose:null,floorPoints:person.baked?.floorPoints,sign:new THREE.Sprite(badge)};
    if(person.figure){
      const root=person.figure.root;
      t.pose=person.walker?makeBracePose(person.figure):person.apply;
      t.floorPoints=foamFloorPoints(person.figure,t.pose);
      t.parent=root.parent;t.wrapper=new THREE.Group();t.wrapper.matrixAutoUpdate=false;
      t.parent.add(t.wrapper);t.wrapper.add(root);
    }
    t.sign.name='Cat tag!';t.sign.scale.set(.72,.36,1);group.add(t.sign);turns.add(t);
  }
  function animateTurns(dt){
    for(const t of turns){
      t.age+=dt;
      if(t.age>=2.35){finish(t);continue;}
      let tilt, tuck;
      if(t.age<1.28){
        for(let left=dt;left>1e-7;){
          const h=Math.min(left,1/90);left-=h;
          t.spin+=(3+7*Math.sin(t.angle))*h;t.angle+=t.spin*h;
          if(t.angle>=t.limit){t.angle=t.limit;t.spin=Math.abs(t.spin)>.8?-Math.abs(t.spin)*.22:0;}
        }
        tilt=t.angle;tuck=.64*ease(Math.min(1,t.age/.24));
      } else {
        const rise=ease(clamp((t.age-1.28)/1.07,0,1));
        tilt=t.angle*(1-rise);tuck=.64*(1-rise);
      }
      const reach=t.height*Math.sin(tilt);
      matrix.makeRotationAxis(t.axis,tilt);
      move.copy(t.origin).applyMatrix4(matrix).negate().add(t.origin);
      matrix.setPosition(move);
      let lift=0;
      for(const point of t.floorPoints){
        move.lerpVectors(point.rest,point.tuck,tuck).applyMatrix4(matrix);
        lift=Math.max(lift,world.ground(move.x,move.z)+point.r-move.y);
      }
      matrix.elements[13]+=lift*ease(Math.min(1,tilt/.18));
      if(t.wrapper){
        t.pose(tuck);
        t.parent.updateWorldMatrix(true,false);
        t.wrapper.matrix.copy(t.parent.matrixWorld).invert().multiply(matrix).multiply(t.parent.matrixWorld);
        t.wrapper.matrixWorldNeedsUpdate=true;t.wrapper.updateMatrixWorld(true);
      } else t.person.baked.apply(tuck,matrix);
      t.sign.position.copy(t.origin).addScaledVector(t.dir,reach*.62);
      t.sign.position.y+=.46+t.height*Math.cos(tilt)+.045*Math.sin(t.age*8);
      t.sign.visible=t.age<1.6;
    }
  }
  function touched(ball){
    const pos=ball.mesh.position;
    for(const p of world.crowd.bystanders){
      if(p.tagged || Math.abs(p.position.x-pos.x)>1 || Math.abs(p.position.z-pos.z)>1)continue;
      headOf(p,head);
      const foot=p.position.y;
      if(pos.y<foot || pos.y>head.y+RADIUS+.12)continue;
      const blend=clamp((pos.y-foot)/Math.max(.4,head.y-foot),0,1);
      const x=p.position.x+(head.x-p.position.x)*blend,z=p.position.z+(head.z-p.position.z)*blend;
      if((pos.x-x)**2+(pos.z-z)**2 >= (RADIUS+.22)**2)continue;
      // A tossed cat can brush a wall while travelling parallel to it. Check
      // the short gap as well, so it can't tag a shirt through that wall.
      move.set(x,clamp(pos.y,foot,head.y),z).sub(pos);
      const gap=move.length();
      if(gap<.001)return p;
      ray.origin.copy(pos);ray.direction.copy(move).normalize();
      if(!probe.cast(ray,gap,ball.items,end))return p;
    }
    return null;
  }
  function land(ball,point,n){
    ball.landing.copy(point).addScaledVector(n,RADIUS);
    ray.origin.copy(ball.landing);ray.direction.set(0,-1,0);
    probe.select(ray,18,0,sight);
    const floor=probe.cast(ray,18,sight,end);
    ball.floorY=floor ? floor.point.y : world.ground(ball.landing.x,ball.landing.z);
    ball.fallTime=clamp(.26+Math.sqrt(Math.max(0,ball.landing.y-ball.floorY-RADIUS)*.18),.26,.90);
    ball.bounce=ball.fallTime+.34;ball.life=0;
    if(Math.abs(n.y)<.65)ball.mesh.rotation.y=Math.atan2(n.x,n.z);
  }
  function advanceBalls(dt,sound){
    for(const ball of balls){
      if(ball.bounce>0){
        ball.bounce=Math.max(0,ball.bounce-dt);
        const phase=clamp((ball.fallTime+.34-ball.bounce)/ball.fallTime,0,1);
        ball.mesh.morphTargetInfluences[0]=1-ease(phase);
        ball.mesh.rotation.x*=Math.exp(-dt*16);
        const scale=clamp(ball.bounce/.14,0,1), paws=ball.floorY+.146*scale;
        ball.mesh.position.copy(ball.landing);
        ball.mesh.position.y+=(paws-ball.landing.y)*phase**2+.12*Math.sin(Math.PI*phase);
        ball.mesh.scale.setScalar(scale);ball.mesh.visible=ball.bounce>0;continue;
      }
      if(!ball.life)continue;
      for(let left=Math.min(dt,ball.life);left>1e-7;){
        const h=Math.min(left,1/90);left-=h;
        move.copy(ball.v).multiplyScalar(h);move.y-=5*h*h;ball.v.y-=10*h;
        ray.origin.copy(ball.mesh.position);ray.direction.copy(move).normalize();
        const hit=probe.cast(ray,move.length()+RADIUS,ball.items,end);
        if(hit){
          basis.copy(hit.object.matrixWorld);
          if(hit.instanceId!==undefined){hit.object.getMatrixAt(hit.instanceId,inst);basis.multiply(inst);}
          move.copy(hit.face.normal).applyNormalMatrix(normal.getNormalMatrix(basis));
          if(move.dot(ray.direction)>0)move.negate();
          land(ball,hit.point,move);break;
        }
        ball.mesh.position.add(move);
        turn.set(-Math.atan2(ball.v.y,Math.hypot(ball.v.x,ball.v.z)),Math.atan2(ball.v.x,ball.v.z),0,'YXZ');
        ball.mesh.quaternion.slerp(facing.setFromEuler(turn),1-Math.exp(-h*22));
        ball.mesh.morphTargetInfluences[0]=Math.min(1,ball.mesh.morphTargetInfluences[0]+h*10);
        const p=touched(ball);
        if(p){land(ball,ball.mesh.position,UP);startTurn(p,ball.v);sound.catToss(true);break;}
      }
      if(ball.life>0){ball.life=Math.max(0,ball.life-dt);ball.mesh.visible=ball.life>0;}
    }
  }
  function clear(){
    for(const t of turns)finish(t);
    for(const ball of balls){ball.life=ball.bounce=0;ball.items.length=0;ball.mesh.visible=false;}
    for(const cat of pair)cat.visible=false;cooldown=next=0;
  }
  return {
    clear,
    update(dt,camera,selected,toss,sound){
      cooldown=Math.max(0,cooldown-dt);
      const held=pair[next%2];
      for(const cat of pair)cat.visible=selected && cat===held && cooldown<.34;
      if(selected){
        const f=player.figure;camera.getWorldDirection(forward);
        player.heading=Math.atan2(forward.x,forward.z);f.root.rotation.y=player.heading;
        const swing=clamp((cooldown-.30)/.27,0,1);
        if(f.bones?.RightArm?.isBone===true){
          f.aim(f.bones.RightArm,[-.45,-.85, .33+swing*.48]);
          f.aim(f.bones.RightForeArm,[.12,.33+swing*.35,.91]);
        }
        f.arms[1].hand.getWorldPosition(held.position);held.position.addScaledVector(forward,.09);held.position.y+=.080;
        held.rotation.set(-.05,player.heading+2.48,.045,'YXZ');
        if(toss && !cooldown){
          probe??=makeSceneryProbe(world,group);
          ray.origin.copy(camera.position);ray.direction.copy(forward);probe.select(ray,17,0,sight);
          probe.cast(ray,Math.min(17,camera.position.distanceTo(held.position)+5.8),sight,aim);
          const ball=balls[next++%balls.length];
          ball.mesh.morphTargetInfluences[0]=0;ball.mesh.quaternion.copy(held.quaternion);
          ball.mesh.position.copy(held.position);ball.mesh.scale.setScalar(1);ball.mesh.visible=true;
          ball.v.subVectors(aim,held.position).normalize().multiplyScalar(12);ball.v.y+=1.75;
          ray.origin.copy(held.position);ray.direction.copy(ball.v).normalize();
          probe.select(ray,24,12,ball.items);
          ball.life=1.7;ball.bounce=0;cooldown=.57;held.visible=false;sound.catToss(false);
        }
      }
      advanceBalls(dt,sound);animateTurns(dt);
    },
    dispose(){clear();group.removeFromParent();},
  };
}
