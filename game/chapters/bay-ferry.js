import * as THREE from 'three';
import { drawTex, hash } from 'life/engine/look.js';

// The hull, two passenger decks, dark window bands and red stack are one
// vertex-coloured mesh. Local +Z points towards the bow.
export function addBayFerry(world, nearCam) {
  const positions = [], colors = [], tint = new THREE.Color();
  function face(a,b,c,d,color) {
    tint.setHex(color);
    for (const p of [a,b,c,a,c,d]) { positions.push(...p); colors.push(tint.r,tint.g,tint.b); }
  }
  function cabin(width, bottom, top, stern, bow, color, roof) {
    const w = width/2;
    face([-w,bottom,bow],[w,bottom,bow],[w,top,bow],[-w,top,bow],color);
    face([w,bottom,stern],[-w,bottom,stern],[-w,top,stern],[w,top,stern],color);
    for (const side of [-w,w]) face([side,bottom,stern],[side,bottom,bow],[side,top,bow],[side,top,stern],color);
    face([-w,top,stern],[-w,top,bow],[w,top,bow],[w,top,stern],roof);
  }
  const rim = [[-2.3,-9.4],[-2.85,-6],[-2.85,4.9],[-1.8,8.1],[0,10.3],[1.8,8.1],[2.85,4.9],[2.85,-6],[2.3,-9.4]];
  rim.forEach(([x,z],i) => {
    const [nx,nz] = rim[(i+1)%rim.length];
    face([x*.82,-.18,z*.94],[nx*.82,-.18,nz*.94],[nx,1.18,nz],[x,1.18,z],0x344a4e);
    face([x,1.18,z],[nx,1.18,nz],[nx,1.46,nz],[x,1.46,z],0xb55740);
    face([0,1.46,0],[x,1.46,z],[nx,1.46,nz],[0,1.46,0],0xc9bc99);
  });
  cabin(4.85,1.46,3.15,-7.8,6.7,0xeae4cd,0x647269);
  cabin(3.9,3.15,4.47,-4.9,5.5,0xdfd9bf,0x596c64);
  cabin(1.15,4.47,5.65,-2.6,-1.4,0xa94d34,0x443e36);
  cabin(1.16,5.55,5.86,-2.61,-1.39,0x443e36,0x443e36);
  for (const [width,low,high,stern,bow] of [[4.85,1.96,2.82,-7.3,6.3],[3.9,3.48,4.18,-4.6,5.1]]) {
    for (let z = stern; z < bow-.8; z += 1.26) for (const side of [-1,1]) {
      const x = side*(width/2+.012);
      face([x,low,z],[x,low,z+1.00],[x,high,z+1.00],[x,high,z],0x3d5959);
    }
  }
  // The wheelhouse windshield reads even from the rocks.
  for (const x of [-1.77,-.54,.69]) face([x,3.48,5.52],[x+1.04,3.48,5.52],[x+1.04,4.19,5.52],[x,4.19,5.52],0x3d5959);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geo.computeVertexNormals();
  const hull = new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
  const boat = new THREE.Group(); boat.name = 'Bay ferry'; boat.userData.sfMoving = true; boat.add(hull); world.scene.add(boat);
  const foam = drawTex(96,128,g => {
    for (let i = 0; i < 1600; i++) {
      const u = hash(i,1,265), side = i%2 ? -1 : 1;
      const x = 48+side*(8+u*32+(hash(i,2,265)-.5)*(4+u*12));
      g.fillStyle = 'rgba(220,232,213,'+((1-u)**1.4*.55)+')';
      g.fillRect(x,u*127,1+hash(i,3,265)*4,1.6);
    }
  });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(18,28).rotateX(-Math.PI/2).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({map:foam,transparent:true,depthWrite:false}));
  wake.position.set(0,.10,-21.5); wake.renderOrder = 4; boat.add(wake);
  // A broad turn at each end lets it sail through the same view in both
  // directions without teleporting or backing up.
  const center = nearCam(105,-20,0), along = nearCam(106,-20,0).sub(center), across = nearCam(105,-19,0).sub(center);
  world.ticks.push(time => {
    const a = time*.037+.18, c = Math.cos(a), s = Math.sin(a);
    boat.position.copy(center).addScaledVector(along,22*c).addScaledVector(across,165*s);
    boat.rotation.y = Math.atan2(-22*s*along.x+165*c*across.x,-22*s*along.z+165*c*across.z);
    hull.position.y = Math.sin(time*1.25)*.09; hull.rotation.z = Math.sin(time*.73)*.015;
    wake.scale.x = .97+.05*Math.sin(time*2);
  });
}
