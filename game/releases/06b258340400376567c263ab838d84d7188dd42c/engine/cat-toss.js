// Cat toss on the regular maps. A direct tag starts the bystander’s playful tumble.
import * as THREE from 'three';
import { makeSceneryProbe } from './scenery-hits.js';
import { makeBracePose, foamFloorPoints } from './crowd-reactions.js';
import { drawTex } from './look.js';
import { makeTossCat } from './toss-cats.js';
import { CAT_SCALE, SOLE, poseCat } from './cat-rig.js';

const RADIUS=.16*CAT_SCALE, UP=new THREE.Vector3(0,1,0);
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
  const balls=Array.from({length:8},(_,i)=>{
    const mesh=makeTossCat(i%2);mesh.visible=false;mesh.name='Tossed '+mesh.userData.coat;group.add(mesh);
    return {mesh,v:new THREE.Vector3(),items:[],life:0,airtime:0,landAge:-1,dropTime:0,dropSpeed:0,floorY:0,landYaw:0,water:false,landing:new THREE.Vector3()};
  });
  const turns=new Set(),ray=new THREE.Ray(),end=new THREE.Vector3(),move=new THREE.Vector3();
  const head=new THREE.Vector3(),forward=new THREE.Vector3(),aim=new THREE.Vector3(),sight=[];
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),inst=new THREE.Matrix4(),normal=new THREE.Matrix3();
  const facing=new THREE.Quaternion(),turn=new THREE.Euler(0,0,0,'YXZ');
  let probe=null,cooldown=0,next=0,clock=0,windup=-1;

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
    // Keep the height of first contact. A wall brush can be above the
    // pavement; a floor contact goes directly into the forepaw landing.
    ball.landing.copy(ball.mesh.position);
    ray.origin.copy(point).addScaledVector(n,RADIUS+.01);ray.direction.set(0,-1,0);
    probe.select(ray,24,0,sight);
    const floor=probe.cast(ray,24,sight,end);
    const surface=floor && (Array.isArray(floor.object.material)?floor.object.material[floor.face.materialIndex]:floor.object.material);
    ball.water=surface?.userData.shotSurface==='water';
    ball.floorY=(floor ? floor.point.y : world.ground(ball.landing.x,ball.landing.z))+(ball.water ? .036 : SOLE)*CAT_SCALE;
    const height=Math.max(0,ball.landing.y-ball.floorY);
    ball.dropSpeed=Math.max(0,-ball.v.y);
    ball.dropTime=height<.025 ? 0 : (Math.sqrt(ball.dropSpeed**2+20*height)-ball.dropSpeed)/10;
    ball.landYaw=Math.abs(n.y)<.65 ? Math.atan2(n.x,n.z) : ball.mesh.rotation.y;
    ball.landAge=0;ball.life=0;
  }
  function advanceBalls(dt,sound){
    for(const ball of balls){
      if(ball.landAge>=0){
        ball.landAge+=dt;
        const t=ball.landAge,grounded=t-ball.dropTime;
        ball.mesh.rotation.x*=Math.exp(-dt*(grounded<0?9:18));
        const yawGap=ball.landYaw-ball.mesh.rotation.y;
        ball.mesh.rotation.y+=Math.atan2(Math.sin(yawGap),Math.cos(yawGap))*(1-Math.exp(-dt*7));
        if(grounded<0){
          ball.mesh.position.y=ball.landing.y-ball.dropSpeed*t-5*t*t;
          poseCat(ball.mesh,'drop',t,clock,1,dt);
        }else{
          ball.mesh.position.y=ball.floorY;
          poseCat(ball.mesh,ball.water?'paddle':'land',grounded,clock,0,dt);
          if(grounded>.85){
            ball.mesh.material.opacity=clamp(1-(grounded-.85)/.26,0,1);
            if(!ball.mesh.material.opacity){ball.mesh.visible=false;ball.landAge=-1;}
          }
        }
        continue;
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
        turn.set(clamp(-.48*Math.atan2(ball.v.y,Math.hypot(ball.v.x,ball.v.z)),-.36,.35),Math.atan2(ball.v.x,ball.v.z),0,'YXZ');
        ball.mesh.quaternion.slerp(facing.setFromEuler(turn),1-Math.exp(-h*13));
        ball.airtime+=h;
        const p=touched(ball);
        if(p){land(ball,ball.mesh.position,UP);startTurn(p,ball.v);sound.catToss(true);break;}
      }
      if(ball.life>0){
        poseCat(ball.mesh,'flight',ball.airtime,clock,clamp(-ball.v.y/4,0,1),dt);
        ball.life=Math.max(0,ball.life-dt);
        if(!ball.life)land(ball,ball.mesh.position,UP);
      }
    }
  }
  function clear(){
    for(const t of turns)finish(t);
    for(const ball of balls){ball.life=0;ball.landAge=-1;ball.items.length=0;ball.mesh.visible=false;}
    for(const cat of pair)cat.visible=false;cooldown=next=0;windup=-1;
  }
  return {
    clear,
    update(dt,camera,selected,toss,sound){
      clock+=dt;cooldown=Math.max(0,cooldown-dt);
      const held=pair[next%2];
      if(!selected)windup=-1;
      if(selected && toss && !cooldown && windup<0)windup=0;
      if(windup>=0)windup+=dt;
      const preload=windup<0?0:ease(clamp(windup/.10,0,1));
      for(const cat of pair)cat.visible=selected && cat===held && cooldown<.31;
      if(selected){
        const f=player.figure;camera.getWorldDirection(forward);
        player.heading=Math.atan2(forward.x,forward.z);f.root.rotation.y=player.heading;
        const swing=clamp((cooldown-.28)/.29,0,1);
        const rigged=f.bones?.RightArm?.isBone===true;
        if(rigged){
          const shoulder=f.localJoint('RightArm');
          f.reach('Right',[shoulder.x-.13+.05*swing,shoulder.y-.13-.014*preload+.06*swing,shoulder.z+.23+.10*swing]);
        }
        held.rotation.set(.035*preload,player.heading-1.22+.78*preload,-.025,'YXZ');
        f.arms[1].hand.getWorldPosition(held.position);
        if(f.bones?.RightHandIndex1?.isBone===true)held.position.lerp(f.bones.RightHandIndex1.getWorldPosition(move),.55);
        held.position.sub(move.set(0,-.108,-.022).multiplyScalar(CAT_SCALE).applyQuaternion(held.quaternion));
        if(rigged && held.visible){
          held.localToWorld(move.set(.035,-.090,-.134));
          f.reach('Left',f.root.worldToLocal(move).toArray());
        }
        poseCat(held,windup<0?'carry':'coil',Math.max(windup,0),clock,0,dt);
        if(windup>=.10){
          windup=-1;
          probe??=makeSceneryProbe(world,group);
          ray.origin.copy(camera.position);ray.direction.copy(forward);probe.select(ray,17,0,sight);
          probe.cast(ray,Math.min(17,camera.position.distanceTo(held.position)+5.8),sight,aim);
          const ball=balls[next++%balls.length];
          ball.mesh.quaternion.copy(held.quaternion);poseCat(ball.mesh,'coil',.10,clock);
          ball.mesh.position.copy(held.position);ball.mesh.material.opacity=1;ball.mesh.visible=true;
          ball.v.subVectors(aim,held.position).normalize().multiplyScalar(9.1);ball.v.y+=2.15;
          ray.origin.copy(held.position);ray.direction.copy(ball.v).normalize();
          probe.select(ray,ball.v.length()*1.7,15,ball.items);
          ball.life=1.7;ball.landAge=-1;ball.airtime=0;cooldown=.57;held.visible=false;sound.catToss(false);
        }
      }
      advanceBalls(dt,sound);animateTurns(dt);
    },
    dispose(){
      clear();group.removeFromParent();
      for(const cat of [...pair,...balls.map(b=>b.mesh)]){cat.skeleton.dispose();cat.material.dispose();}
    },
  };
}
