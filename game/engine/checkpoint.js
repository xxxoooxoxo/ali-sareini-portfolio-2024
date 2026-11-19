import * as THREE from 'three';
import { drawTex } from 'life/engine/look.js';

let lightMap;
const beaconGeometry = new THREE.OctahedronGeometry(.38);
const beaconMaterial = new THREE.MeshLambertMaterial({ color: 0xffc750, emissive: 0xa97627, flatShading:true, fog:false });
const column = new THREE.CylinderGeometry(1,1,1,32,1,true);

// The edge of the light is the actual walk-in trigger. On the last chapter
// it sits at the driver's door and the beacon hangs above the car.
export function addCheckpoint(world) {
  if (!world.exit) return;
  lightMap ??= drawTex(4,64,g => {
    const glow = g.createLinearGradient(0,64,0,0);
    glow.addColorStop(0,'#ffcd63cc'); glow.addColorStop(.045,'#ffbc4bba');
    glow.addColorStop(.08,'#ffa63a5c'); glow.addColorStop(.50,'#ffbd4d25'); glow.addColorStop(1,'#ffcc6900');
    g.fillStyle = glow; g.fillRect(0,0,4,64);
  });
  lightMap.wrapT = THREE.ClampToEdgeWrapping;
  const { x,z,r } = world.exit, base = world.ground(x,z);
  const mat = new THREE.MeshBasicMaterial({ map:lightMap, transparent:true, depthWrite:false,
    side:THREE.DoubleSide, fog:false });
  mat.forceSinglePass = true;
  const group = new THREE.Group(), ring = new THREE.Mesh(column,mat);
  group.name = 'Chapter checkpoint'; group.userData.noShot=true;
  ring.position.set(x,base+.68,z); ring.scale.set(r,1.28,r); ring.renderOrder = 62;
  const beacon = new THREE.Mesh(beaconGeometry,beaconMaterial);
  const car = world.drive?.car;
  beacon.position.set(car?.position.x ?? x, car ? car.position.y+2.4 : base+2.1, car?.position.z ?? z);
  const height = beacon.position.y;
  group.add(ring,beacon); world.scene.add(group);
  world.ticks.push(time => {
    group.visible = !world.drive?.motor;
    beacon.position.y = height+.13*Math.sin(time*2.1);
    beacon.rotation.y = time*1.55;
    mat.opacity = .81+.13*Math.sin(time*2.1);
  });
}
