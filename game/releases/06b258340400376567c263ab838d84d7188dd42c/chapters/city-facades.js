// Repeating four-bay facades, painted at the scale of individual windows.
// The separate emission tiles light interiors without brightening the masonry.
import * as THREE from 'three';
import { drawTex, hash } from '../engine/look.js';
import { storefrontAtlas } from './city-storefronts.js';

const finishes = new Map();
export function facadeMaterial(kind) {
  if (finishes.has(kind)) return finishes.get(kind);
  if (kind === 'shop') {
    const map = new THREE.TextureLoader().load(storefrontAtlas);
    map.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({map, emissiveMap:map, emissive:0x79604b, vertexColors:true});
    finishes.set(kind,mat); return mat;
  }
  const glass = kind === 'glass', brick = kind === 'brick';
  function paint(g, glow) {
    g.fillStyle = glow ? '#000' : glass ? '#73888e' : brick ? '#c5a695' : '#dbd2bc';
    g.fillRect(0,0,256,256);
    if (!glow && !glass) {
      for (let y=0;y<256;y+=brick?7:9) {
        g.fillStyle = brick ? '#a88f83' : '#b9b2a5';g.fillRect(0,y,256,1);
        if (brick) for(let x=(y%2)*8;x<256;x+=17) g.fillRect(x,y,1,7);
      }
    }
    const rows = glass ? 8 : 4, cols = glass ? 8 : 4, rowH = 256/rows, colW = 256/cols;
    for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
      const seed=col+cols*row, x=colW*col+(glass?1:10), y=rowH*row+(glass?2:7);
      const w=glass?30:44, h=glass?27:46;
      const lit=hash(seed,9,brick?33:51)>(glass?.79:.57);
      const lamp=['#ecbb75','#d58b52','#c8c59a','#aebfc0'][seed%4];
      if (!glow && !glass) {
        g.fillStyle='#88867c';g.fillRect(x-3,y-2,w+6,h+6);
        g.fillStyle='#ece1c8';g.fillRect(x-3,y-3,w+6,3);
      }
      const grad=g.createLinearGradient(x,y,x+w*.6,y+h);
      grad.addColorStop(0,lit ? (glow?'#976444':'#d8bc91') : (glow?'#000':'#7991a1'));
      grad.addColorStop(.55,lit ? lamp : (glow?'#000':'#4d6471'));
      grad.addColorStop(1,lit ? (glow?'#604334':'#92745f') : (glow?'#000':'#374953'));
      g.fillStyle=grad;g.fillRect(x,y,w,h);
      if (lit && !glass) {
        g.fillStyle=glow?'#4d4037':'#82715d'; g.fillRect(x,y,w,Math.floor(h*(.08+hash(seed,1,3)*.24)));
        for(let k=0;k<2;k++){
          const pw=3+hash(seed,k,13)*9, ph=h*(.06+.18*hash(seed,k,22));
          g.fillStyle=glow?'#211e1c':'#5f5650';g.fillRect(x+hash(seed,k,5)*(w-pw),y+h-ph,pw,ph);
        }
      }
      g.fillStyle=glow?'#100e0c':glass?'#576473':'#554e49';
      g.fillRect(x+w*.48,y,2,h);g.fillRect(x,y+h*.46,w,2);
      if (!glow) {
        g.fillStyle=glass?'#a8b5b5':'#ddd2bd';
        g.fillRect(x-2,y+h+1,w+4,glass?2:4);
      }
    }
  }
  const map=drawTex(256,256,g=>paint(g,false)), emissiveMap=drawTex(256,256,g=>paint(g,true));
  const mat=new THREE.MeshLambertMaterial({map,emissiveMap,emissive:0xffffff,emissiveIntensity:.32,vertexColors:true});
  finishes.set(kind,mat);
  return mat;
}
