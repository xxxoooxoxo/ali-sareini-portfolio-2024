import * as THREE from 'three';
import { drawTex, hash } from './look.js';

// Folded, two-tone leaves. The same leaves that settle into the grass can
// be kicked up again. Their home patches keep gusts from emptying the Lawn.
export function addLooseLeaves(world) {
  const patches = [[0,-24], [4,-30], [-6,-39], [10,-24], [-10,-16], [8,8], [-14,32], [13,47], [-1,-5]];
  const count = patches.length*10, leaf = new THREE.BufferGeometry();
  const positions = [0,0,-.13, -.048,.012,-.035, -.08,.009,.005, -.047,.01,.014, -.054,.018,.064,
    0,.028,.13, .054,.015,.057, .046,.01,.012, .078,.007,0, .049,.01,-.041, 0,.035,0];
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const faces = [];
  for (let i = 0; i < 10; i++) faces.push(i, (i+1)%10, 10);
  leaf.setIndex(faces); leaf.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true }), count);
  mesh.name = 'Loose autumn leaves'; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const colors = [0xc17a38,0xbf6131,0x976034,0xd7a349,0xa84e31];
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), leaves = [];
  function pose(l, i) {
    dummy.position.set(l.x, world.ground(l.x,l.z)+.066+l.height, l.z);
    dummy.rotation.set(Math.sin(l.spin)*.95, l.yaw, Math.sin(2*l.spin)*.7, 'YXZ');
    dummy.scale.setScalar(l.size); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < count; i++) {
    const [cx,cz] = patches[Math.floor(i/10)];
    const x = cx+(hash(i,1,31)-.5)*5, z = cz+(hash(i,2,31)-.5)*5;
    const l = { x, z, homeX:x, homeZ:z, height:0, vx:0, vz:0, vy:0, spin:0,
      yaw:hash(i,3,31)*6.28, size:.82+hash(i,4,31)*.65, rest:hash(i,5,31)*6, kickAt:0 };
    leaves.push(l); pose(l,i);
    mesh.setColorAt(i, tint.setHex(colors[i%colors.length]));
  }
  world.scene.add(mesh);
  let lastX, lastZ;
  world.ticks.push((time, dt) => {
    const p = world.you;
    if (!p || !dt) return;
    const dx = p.x-(lastX ?? p.x), dz = p.z-(lastZ ?? p.z), distance = Math.hypot(dx,dz);
    const moving = distance > dt*.5 && distance < dt*10;
    lastX = p.x; lastZ = p.z;
    let changed = false;
    for (let i = 0; i < count; i++) {
      const l = leaves[i];
      if (l.height <= 0) {
        l.rest -= dt;
        const awayX = l.x-p.x, awayZ = l.z-p.z;
        const kicked = moving && time >= l.kickAt && awayX*awayX+awayZ*awayZ < 1.15 &&
          Math.abs(p.y-world.ground(l.x,l.z)) < .4;
        if (!kicked && l.rest > 0) continue;
        l.vx = kicked ? dx/dt*.36+awayX : Math.sin(time*.43+i*.12)*1.3+(l.homeX-l.x)*.5;
        l.vz = kicked ? dz/dt*.36+awayZ : .58+(l.homeZ-l.z)*.5;
        l.vy = kicked ? 2.8+Math.min(1,distance/dt*.15) : 1.35+l.size*.4;
      }
      l.x += l.vx*dt; l.z += l.vz*dt;
      l.height = Math.max(0, l.height+l.vy*dt);
      l.vy -= dt*5.8; l.yaw += dt*(1.8+l.size); l.spin += dt*(4+l.size);
      if (!l.height) { l.spin = 0; l.rest = 4+hash(i, Math.floor(time),78)*11; l.kickAt = time+.25; }
      pose(l,i); changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });
}

let tread;
function bootTread() {
  return drawTex(32,64,g => {
    // The lighter lip on one edge suggests displaced snow around the depression.
    for (const [dx,dy,color] of [[1,2,'#efe0d8ba'],[0,0,'#564d698c']]) {
      g.save(); g.translate(dx,dy); g.fillStyle = color;
      g.beginPath(); g.ellipse(15,19,10,16,-.08,0,2*Math.PI); g.fill();
      g.beginPath(); g.ellipse(16,45,8,12,.04,0,2*Math.PI); g.fill();
      g.restore();
    }
    g.lineWidth = 2; g.strokeStyle = '#393c537d';
    for (const y of [11,17,23,41,47]) {
      g.beginPath(); g.moveTo(10,y); g.lineTo(15,y+3); g.lineTo(21,y); g.stroke();
    }
  });
}

export function addSnowTracks(world, isSnow) {
  tread ??= bootTread();
  const capacity = 56, life = 18;
  const geo = new THREE.PlaneGeometry(.21,.38).rotateX(-Math.PI/2).rotateY(Math.PI);
  const births = new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
  births.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('plantedAt', births);
  const clock = { value:0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { tread:{value:tread}, clock },
    vertexShader: `attribute float plantedAt; uniform float clock; varying float strength; varying vec2 sole;
      void main() {
        sole = uv;
        strength = 1. - smoothstep(7., 18., clock - plantedAt);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.);
      }`,
    fragmentShader: `uniform sampler2D tread; varying vec2 sole; varying float strength;
      void main() { vec4 ink = texture2D(tread,sole); gl_FragColor = vec4(ink.rgb,ink.a*strength); }`,
    transparent:true, depthWrite:false,
  });
  const tracks = new THREE.InstancedMesh(geo,mat,capacity);
  tracks.name = 'Fresh boot prints'; tracks.frustumCulled = false; tracks.renderOrder = 61;
  tracks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tracks.count = 0; world.scene.add(tracks);
  const shoe = new THREE.Object3D();
  let next = 0, newest = -Infinity;
  world.onFootfall = (player, side) => {
    player.figure.legs[side].foot.getWorldPosition(shoe.position);
    const { x, z } = shoe.position, ground = world.ground(x,z);
    if (player.pos.y-ground > .12 || !isSnow(x,z)) return false;
    shoe.position.x += .045*Math.sin(player.heading); shoe.position.z += .045*Math.cos(player.heading);
    shoe.position.y = ground+.055; shoe.rotation.y = player.heading + (side ? -.045 : .045);
    shoe.updateMatrix(); tracks.setMatrixAt(next,shoe.matrix);
    births.setX(next,clock.value); newest = clock.value;
    tracks.count = Math.min(capacity,tracks.count+1); next = (next+1)%capacity;
    births.needsUpdate = true; tracks.instanceMatrix.needsUpdate = true;
    return true;
  };
  world.ticks.push(time => { clock.value = time; tracks.visible = time-newest < life; });
}
