import * as THREE from 'three';
import { drawTex, hash } from './look.js';

// One painted front panel shared by all the sets. The tuning needle sits just
// in front of the glass, so changing frequency also moves the physical dial.
function paintFace(g) {
  g.fillStyle = '#706f65'; g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 2) {
    g.fillStyle = y%6 ? '#79776b' : '#66675f'; g.fillRect(0, y, 256, 1);
  }
  for (const x of [44, 212]) {
    for (const [radius, color] of [[39,'#b4afa0'],[37,'#262927'],[32,'#494b43'],[25,'#393c36'],[13,'#222723']]) {
      g.fillStyle = color; g.beginPath(); g.arc(x, 75, radius, 0, 2*Math.PI); g.fill();
    }
    g.save(); g.beginPath(); g.arc(x, 75, 35, 0, 2*Math.PI); g.clip();
    g.fillStyle = '#171d1b';
    for (let y = 40; y <= 111; y += 4) for (let j = -36; j < 36; j += 4) g.fillRect(x+j+(y%8 ? 2 : 0), y, 2, 2);
    g.restore();
  }
  g.fillStyle = '#252b28'; g.fillRect(71, 9, 114, 24);
  g.fillStyle = '#d1b779'; g.fillRect(77, 24, 102, 1);
  for (let j = 0; j <= 40; j++) g.fillRect(77+j*2.5, j%4 ? 21 : 18, 1, j%4 ? 3 : 6);
  g.font = 'bold 7px monospace'; g.fillText('88     FM STEREO    108', 78, 16);
  g.fillStyle = '#262a28'; g.fillRect(84, 49, 88, 61);
  g.fillStyle = '#9e9d88'; g.fillRect(87, 52, 82, 54);
  g.fillStyle = '#d8c997'; g.fillRect(93, 58, 70, 15);
  g.fillStyle = '#a35a39'; g.fillRect(93, 68, 70, 3);
  g.fillStyle = '#383932'; g.font = 'italic bold 9px serif'; g.fillText('Side A', 98, 66);
  g.fillRect(95, 78, 66, 17);
  for (const x of [107, 149]) {
    g.fillStyle = '#b6b4a2'; g.beginPath(); g.arc(x, 86, 6, 0, 2*Math.PI); g.fill();
    g.fillStyle = '#42433a'; g.fillRect(x-2, 83, 4, 6);
  }
  for (let x = 90; x < 165; x += 12) {
    g.fillStyle = '#d4cfc1'; g.fillRect(x, 115, 10, 5);
    g.fillStyle = '#393c36'; g.fillRect(x, 120, 10, 2);
  }
  for (const x of [21, 236]) {
    g.fillStyle = '#30342e'; g.beginPath(); g.arc(x, 18, 10, 0, 2*Math.PI); g.fill();
    g.fillStyle = '#d1cdbc'; g.fillRect(x-1, 10, 2, 8);
  }
  for (let i = 0; i < 48; i++) {
    g.fillStyle = i%2 ? '#252a253d' : '#e2ddc144';
    g.fillRect(hash(i,1,8)*256, hash(i,2,8)*128, 1+hash(i,3,8)*6, 1);
  }
}

let faceMaterial;
const caseMaterial = new THREE.MeshLambertMaterial({ color: 0x424942 });
const chrome = new THREE.MeshLambertMaterial({ color: 0xb9b9aa, emissive: 0x33342e });
const unitBox = new THREE.BoxGeometry();
const antennaGeometry = new THREE.CylinderGeometry(.006, .011, 1, 6);

export function placeRadio(world, x, y, z, heading) {
  if (!faceMaterial) {
    const map = drawTex(256, 128, paintFace);
    faceMaterial = new THREE.MeshLambertMaterial({ map, emissive: 0x48463c, emissiveMap: map });
  }
  const set = new THREE.Group();
  set.name = 'Portable radio'; set.rotation.y = heading; set.position.set(x, y, z);
  function box(w, h, d, x, y, z, mat) {
    const part = new THREE.Mesh(unitBox, mat);
    part.position.set(x,y,z); part.scale.set(w,h,d); set.add(part);
    return part;
  }
  box(.94, .48, .27, 0, .24, 0, caseMaterial);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(.91, .45), faceMaterial);
  front.position.set(0, .24, .137); set.add(front);
  for (const x of [-.28,.28]) box(.037, .12, .05, x,.54,-.025,chrome);
  box(.60,.042,.055,0,.602,-.025,caseMaterial);
  const aerial = new THREE.Mesh(antennaGeometry, chrome);
  aerial.scale.y = .58; aerial.rotation.z = -.39; aerial.position.set(.43,.74,-.09); set.add(aerial);
  const needle = box(.009,.055,.004,0,.24+(.5-21/128)*.45,.140,
    new THREE.MeshBasicMaterial({ color: 0xff984e }));
  world.scene.add(set);
  if (y < world.ground(x,z)+.15) world.post(x,z,.41,.5);
  world.radio = {
    position: set.position,
    setStation(station) {
      needle.visible = Boolean(station);
      if (station) needle.position.x = ((77 + (station.frequency-88)/20*102)/256-.5)*.91;
    },
  };
}
