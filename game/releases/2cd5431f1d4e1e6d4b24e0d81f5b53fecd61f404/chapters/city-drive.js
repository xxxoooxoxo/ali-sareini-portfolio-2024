import * as THREE from 'three';
import { DriveMotor } from '../engine/drive-motor.js';
import { clamp } from '../engine/look.js';
import { carLensTexture } from '../engine/kit-textures.js';
import { makeCityscape, streetLevel } from './cityscape.js';

const cities = new WeakMap(); // Reuse the static city when this game revisits SF.
export function makeCityDrive(world, car, trafficCars) {
  const parking = car.position.clone(), parkedRotation = car.rotation.clone();
  let city = null;
  const traffic=trafficCars.map(mesh=>({mesh,distance:0,lane:-2.7,pace:15,
    original:mesh.position.clone(),rotation:mesh.rotation.clone()}));
  const behind=new THREE.Vector3(), ahead=new THREE.Vector3(), tangent=new THREE.Vector3();
  const pointAt = (s, target) => city.path.getPoint(((s % city.length + city.length) % city.length) / city.length,target);
  function pose(s,lane,target) {
    pointAt(s,target);
    pointAt(s+.2,tangent).sub(target).normalize();
    target.x-=tangent.z*lane; target.z+=tangent.x*lane;
    target.y = streetLevel(target.x) + .035;
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
    car.rotation.x=-Math.atan((streetLevel(car.position.x+tangent.x)-streetLevel(car.position.x-tangent.x))*.5);
    car.rotation.z=motor.sideSpeed*.012;
    const sign=lookBack ? -1 : 1;
    pose(motor.distance-sign*(7.2+motor.speed*.055+zoom),motor.lane,behind);
    pose(motor.distance+sign*(10+motor.speed*.20),motor.lane*.75,ahead);
    const x=behind.x-car.position.x, z=behind.z-car.position.z;
    behind.x=car.position.x+x*Math.cos(orbit)+z*Math.sin(orbit);
    behind.z=car.position.z-x*Math.sin(orbit)+z*Math.cos(orbit);
    // Keep the fastback in frame as the camera follows it around city corners.
    const carFocus=camera.aspect<1 ? .82 : .58;
    ahead.lerp(car.position,Math.min(1,carFocus+Math.abs(orbit)*.5));
    behind.y+=3.0+height; ahead.y+=1.35;
    if (dt===0) camera.position.copy(behind);
    else camera.position.lerp(behind,1-Math.exp(-dt*12));
    city.keepCameraClear(car.position,camera.position);
    camera.lookAt(ahead);
    for (const npc of traffic) {
      npc.mesh.rotation.y=pose(npc.distance,npc.lane,npc.mesh.position);
      npc.mesh.rotation.x=-Math.atan((streetLevel(npc.mesh.position.x+tangent.x)-streetLevel(npc.mesh.position.x-tangent.x))*.5);
    }
    city.lightAt(car.position);
  }
  return {
    car,
    get scene() { return city?.scene; },
    get length() { return city?.length ?? 0; },
    get motor() { return motor; },
    start(camera) {
      if (!city) {
        city=cities.get(camera) ?? makeCityscape();
        cities.set(camera,city);
      }
      city.scene.add(car);
      car.rotation.order='YXZ';
      motor=new DriveMotor(city.length,18);
      orbit=height=zoom=hold=0;
      traffic.forEach((npc,i)=>{
        npc.original.copy(npc.mesh.position);npc.rotation.copy(npc.mesh.rotation);
        npc.distance=(i+.4)*city.length/traffic.length;
        city.scene.add(npc.mesh);npc.mesh.rotation.order='YXZ';
      });
      positionCarAndCamera(camera,0,false);
    },
    update(dt, controls, camera) {
      city.tick(dt);
      const s=motor.distance;
      motor.update(dt,controls.ahead,controls.right,traffic,city.speedLimit(s));
      const travelled=(motor.distance-s+city.length)%city.length;
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
      motor=null; brakeLamps.visible=false;
      for(const wheel of wheels) wheel.rotation.set(0,0,0);
      world.scene.add(car); car.position.copy(parking); car.rotation.copy(parkedRotation);
      for (const npc of traffic) { world.scene.add(npc.mesh); npc.mesh.position.copy(npc.original); npc.mesh.rotation.copy(npc.rotation); }
    },
  };
}
