import * as THREE from 'three';
import { DriveMotor } from 'life/engine/drive-motor.js';
import { clamp, drawTex, reuse } from 'life/engine/look.js';
import { Trees } from 'life/engine/trees.js';
import { carLensTexture } from 'life/engine/kit-textures.js';

const points = [[0,6.2],[18,6.2],[53,14],[84,26],[109,25],[127,12],[131,0],
  [127,-12],[109,-25],[84,-26],[53,-14],[18,-6.2],[0,-6.2]];

function turnout(edge, direction, height, group, asphalt, grass) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x,z]) =>
    new THREE.Vector3(edge + direction*x, height, direction*z)));
  // A low headland carries the return road beyond the bridge abutment.
  const land = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.45, height + 4, 24), grass);
  land.scale.set(94,1,52); land.position.set(edge + direction*67, height/2-2.2,0); group.add(land);
  const pos = [], uv = [], indices = [], p = new THREE.Vector3(), t = new THREE.Vector3();
  const count = 96, length = curve.getLength();
  function strip(left, right, lift, material) {
    pos.length = uv.length = indices.length = 0;
    for (let i=0;i<=count;i++) {
      const u=i/count; curve.getPointAt(u,p); curve.getTangentAt(u,t);
      for (const offset of [left,right]) {
        pos.push(p.x-t.z*offset,p.y+lift,p.z+t.x*offset); uv.push(offset/7,u*length/7);
      }
      if (i) { const a=i*2; indices.push(a-2,a-1,a,a-1,a+1,a); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(indices); geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo,material));
  }
  const paint = new THREE.MeshBasicMaterial({color:0xd2cbae,side:THREE.DoubleSide});
  strip(-6.2,6.2,0,asphalt); strip(-6,-5.83,.025,paint); strip(5.83,6,.025,paint);
  const postMat = new THREE.MeshLambertMaterial({color:0x877863});
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.94,.16),postMat,48);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.02,3),paint,24);
  const obj = new THREE.Object3D();
  for (let i=0;i<24;i++) {
    const u=(i+.5)/24; curve.getPointAt(u,p); curve.getTangentAt(u,t);
    obj.rotation.y=Math.atan2(t.x,t.z); obj.position.copy(p); obj.position.y+=.035;
    obj.updateMatrix(); dashes.setMatrixAt(i,obj.matrix);
    for (let side=0;side<2;side++) {
      const offset=side ? 6.5 : -6.5;
      obj.position.set(p.x-t.z*offset,p.y+.45,p.z+t.x*offset); obj.updateMatrix();
      posts.setMatrixAt(i*2+side,obj.matrix);
    }
  }
  group.add(posts,dashes);
  const sign = drawTex(128,48,g=>{
    g.fillStyle='#304c43';g.fillRect(0,0,128,48);g.strokeStyle='#ece7ca';g.strokeRect(2,2,124,44);
    g.fillStyle='#ece7ca';g.font='bold 15px sans-serif';g.textAlign='center';
    g.fillText('SCENIC LOOP',64,21);g.font='bold 15px sans-serif';g.fillText('TURNAROUND',64,40);
  });
  const board=new THREE.Mesh(new THREE.PlaneGeometry(4,1.5),new THREE.MeshBasicMaterial({map:sign}));
  board.position.set(edge+direction*18,height+2.4,direction*14);board.rotation.y=-direction*Math.PI/2;
  const pole=new THREE.Mesh(new THREE.BoxGeometry(.14,2.4,.14),postMat);
  pole.position.copy(board.position);pole.position.y=height+1.0;group.add(board,pole);
  return curve;
}

export function makeBridgeDrive(world, car, trafficCars, west, east, y, roadTexture, grassTexture) {
  const scenery=new THREE.Group(); scenery.visible=false; world.scene.add(scenery);
  const asphalt=new THREE.MeshLambertMaterial({map:roadTexture,color:0xa7aaa7,side:THREE.DoubleSide});
  const grass=new THREE.MeshLambertMaterial({map:reuse(grassTexture,18,12),color:0x8d9e79,flatShading:true});
  const eastTurn=turnout(east,1,y,scenery,asphalt,grass), westTurn=turnout(west,-1,y,scenery,asphalt,grass);
  const trees = new Trees({scene:scenery, ground:()=>y-.2}, {bark:[94,84,68]});
  for (const [edge, sign] of [[west,-1],[east,1]]) {
    for (const [dx,z,h] of [[70,1,8],[85,-7,13],[97,6,10],[105,-4,8],[145,1,11],[144,9,7]]) {
      trees.broadleaf(edge+sign*dx,sign*z,h,[100,122,86],{spread:1.15,detail:.45});
    }
  }
  trees.build({shadow:.24});
  // The walking chapter sees the original distant deck. At tyre height its
  // lane markings and asphalt need metre-scale UVs, like the approach roads.
  const straight=east-west, middle=(east+west)/2;
  const deckMaterial=asphalt.clone(); deckMaterial.map=reuse(roadTexture,straight/7,24.8/7);
  const deck=new THREE.Mesh(new THREE.PlaneGeometry(straight,24.8),deckMaterial);
  deck.rotation.x=-Math.PI/2; deck.position.set(middle,y-.012,0); scenery.add(deck);
  const white=new THREE.MeshBasicMaterial({color:0xd2cbae}), yellow=new THREE.MeshBasicMaterial({color:0xcba252});
  for (const z of [-12.1,-.18,.18,12.1]) {
    const line=new THREE.Mesh(new THREE.PlaneGeometry(straight,.14),Math.abs(z)<1?yellow:white);
    line.rotation.x=-Math.PI/2; line.position.set(middle,y+.006,z); scenery.add(line);
  }
  const dashCount=Math.floor(straight/10);
  const stripes=new THREE.InstancedMesh(new THREE.PlaneGeometry(3.8,.16).rotateX(-Math.PI/2),white,2*dashCount);
  const m=new THREE.Matrix4();
  for(let i=0;i<dashCount;i++) for(let side=0;side<2;side++) {
    stripes.setMatrixAt(i*2+side,m.makeTranslation(west+5+i*10,y+.006,side?6.2:-6.2));
  }
  scenery.add(stripes);
  const path=new THREE.CurvePath();
  path.add(new THREE.LineCurve3(westTurn.points.at(-1),eastTurn.points[0]));
  path.add(eastTurn);
  path.add(new THREE.LineCurve3(eastTurn.points.at(-1),westTurn.points[0]));
  path.add(westTurn);
  const length=path.getLength(), parking=car.position.clone(), parkedHeading=car.rotation.y;
  const returnStart=straight+eastTurn.getLength(), returnEnd=returnStart+straight;
  const traffic=trafficCars.map(mesh=>({mesh,distance:0,lane:-2.7,pace:15,
    originalZ:mesh.position.z,originalY:mesh.position.y,heading:mesh.rotation.y}));
  const behind=new THREE.Vector3(), ahead=new THREE.Vector3(), tangent=new THREE.Vector3();
  const pointAt = (s, target) => path.getPoint(((s % length + length) % length) / length,target);
  function pose(s,lane,target) {
    pointAt(s,target);
    pointAt(s+.2,tangent).sub(target).normalize();
    target.x-=tangent.z*lane; target.z+=tangent.x*lane;
    return Math.atan2(tangent.x,tangent.z);
  }
  // Light the existing rear lenses rather than floating new lamps behind the body.
  const lenses=car.children.find(part=>part.material?.map===carLensTexture());
  const rear=lenses.geometry.clone(), positions=rear.attributes.position, rearIndices=[];
  for (let i=0;i<positions.count;i++) if (positions.getZ(i)<0) rearIndices.push(i);
  rear.setIndex(rearIndices);
  const brakeLamps=new THREE.Mesh(rear,new THREE.MeshBasicMaterial({color:0xff4d39,side:THREE.DoubleSide}));
  brakeLamps.name='Brake lights'; brakeLamps.position.z=-.006; brakeLamps.visible=false; car.add(brakeLamps);
  const wheels=car.children.filter(part=>part.userData.tyreRadius);
  let motor = null, orbit = 0, height = 0, zoom = 0, hold = 0;
  function positionCarAndCamera(camera, dt, lookBack) {
    const heading=pose(motor.distance,motor.lane,car.position);
    car.rotation.y=heading-Math.atan2(motor.sideSpeed, Math.max(motor.speed,.5));
    car.rotation.z=motor.sideSpeed*.012;
    const sign=lookBack ? -1 : 1;
    pose(motor.distance-sign*(7.9+motor.speed*.055+zoom),motor.lane,behind);
    pose(motor.distance+sign*(10+motor.speed*.20),motor.lane*.75,ahead);
    const x=behind.x-car.position.x, z=behind.z-car.position.z;
    behind.x=car.position.x+x*Math.cos(orbit)+z*Math.sin(orbit);
    behind.z=car.position.z-x*Math.sin(orbit)+z*Math.cos(orbit);
    ahead.lerp(car.position,Math.min(1,Math.abs(orbit)));
    behind.y+=3.15+height; ahead.y+=1.75;
    if (dt===0) camera.position.copy(behind);
    else camera.position.lerp(behind,1-Math.exp(-dt*12));
    camera.lookAt(ahead);
    for (const npc of traffic) npc.mesh.rotation.y=pose(npc.distance,npc.lane,npc.mesh.position);
  }
  return {
    car, length,
    get motor() { return motor; },
    start(camera) {
      // Set out facing the first tower, with the waterfront still visible on the right.
      motor=new DriveMotor(length,-160-west);
      orbit=height=zoom=hold=0;
      traffic.forEach((npc,i)=>{npc.distance=(i+.4)*length/traffic.length;});
      scenery.visible=true; positionCarAndCamera(camera,0,false);
    },
    update(dt, controls, camera) {
      const s=motor.distance;
      const straightRemaining=s<straight ? straight-s : s>=returnStart && s<returnEnd ? returnEnd-s : 0;
      const speedLimit=Math.min(32,Math.sqrt(16**2+2*5*straightRemaining));
      motor.update(dt,controls.ahead,controls.right,traffic,speedLimit);
      const travelled=(motor.distance-s+length)%length;
      for(const wheel of wheels) {
        wheel.rotation.x=(wheel.rotation.x+travelled/wheel.userData.tyreRadius)%(Math.PI*2);
        if(wheel.userData.frontAxle) wheel.rotation.y-= (wheel.rotation.y+controls.right*.24)*(1-Math.exp(-dt*8));
      }
      brakeLamps.visible=controls.ahead<0;
      zoom=clamp(zoom+(controls.zoom||0),-2.5,5);
      if (controls.lookX || controls.lookY) {
        orbit=clamp(orbit-controls.lookX*.006,-Math.PI,Math.PI);
        height=clamp(height+controls.lookY*.012,-1.4,3.0); hold=1.3;
      } else if (hold>0) hold-=dt;
      else { orbit*=Math.exp(-3*dt); height*=Math.exp(-3*dt); }
      positionCarAndCamera(camera,dt,controls.lookBack);
    },
    park() {
      scenery.visible=false; motor=null; brakeLamps.visible=false;
      for(const wheel of wheels) wheel.rotation.set(0,0,0);
      car.position.copy(parking); car.rotation.set(0,parkedHeading,0);
      for (const npc of traffic) { npc.mesh.position.z=npc.originalZ; npc.mesh.position.y=npc.originalY; npc.mesh.rotation.y=npc.heading; }
    },
  };
}
