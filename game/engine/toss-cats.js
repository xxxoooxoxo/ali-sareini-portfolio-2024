// Two low-poly coats on the same tucked and leaping silhouettes. Both poses
// share one atlas and one mesh per cat, including the ears, paws and tail.
import * as THREE from 'three';
import { drawTex, hash } from 'life/engine/look.js';
import { mergeKitMeshes } from 'life/engine/kit-textures.js';

const coats = ['Tuxedo', 'Orange tabby'];
const models = [];
const oval = new THREE.SphereGeometry(1, 14, 10);
const detail = new THREE.SphereGeometry(1, 8, 6);
const tint = color => new THREE.MeshLambertMaterial({color});
const cream = tint(0xffefd8), pink = tint(0xcb898a), dark = tint(0x24262b);
const whisker = tint(0xd2c8bb), glint = tint(0xfff5cf);

function fur(tabby,face) {
  const map=drawTex(128,64,(g,w,h)=>{
    const image=g.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const a=(x+.5)/w*Math.PI*2,b=(y+.5)/h*Math.PI;
      const side=-Math.cos(a)*Math.sin(b),up=Math.cos(b),front=Math.sin(a)*Math.sin(b);
      let color;
      if(tabby){
        const creamPatch=up < -.55 || (front>.57 && up < -.23);
        const band=face ? Math.cos(14*side+3*up) : Math.cos(20*front+3*up+Math.sin(6*side));
        const striped=face ? up>.27 || (Math.abs(side)>.59 && front>.1) : up>-.40;
        color=creamPatch?[246,210,156]:striped && band>.54?[150,74,33]:[226,143,65];
      } else {
        const white=face ? front>.20 && (up<-.26 || Math.abs(side)<.21-.32*up) :
          up<-.49 || (front>.44 && Math.abs(side)<.68-.18*up);
        color=white?[244,239,224]:[43,46,53];
      }
      const noise=(hash(x,y,37)-.5)*10+up*5, i=(y*w+x)*4;
      for(let k=0;k<3;k++)image.data[i+k]=color[k]+noise;
      image.data[i+3]=255;
    }
    g.putImageData(image,0,0);
  });
  return new THREE.MeshLambertMaterial({map});
}

function ear(side,inner) {
  const s=side,tip=[s*.103,.247,.157],left=[s*.035,.166,.203],right=[s*.124,.159,.168];
  const back=[s*.084,.155,.108];
  let pts=[tip,left,right,tip,right,back,tip,back,left,left,back,right];
  if(inner)pts=[[s*.101,.226,.167],[s*.055,.174,.199],[s*.112,.170,.176]];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts.flat(),3));
  geo.computeVertexNormals();return geo;
}

function tail(tabby,leap){
  const points=leap?[[0,.01,-.15],[.01,.04,-.23],[.035,.07,-.34],[.04,.11,-.43],[.012,.13,-.49]]:
    [[0,.01,-.15],[.012,.035,-.23],[.03,.12,-.27],[.048,.205,-.25],[.065,.23,-.185]];
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geo=new THREE.TubeGeometry(curve,16,.022,7,false);
  const pos=geo.attributes.position,v=new THREE.Vector3(),mid=new THREE.Vector3(),colors=[];
  for(let i=0;i<pos.count;i++){
    const row=Math.floor(i/8), t=row/16;
    curve.getPointAt(t,mid);v.fromBufferAttribute(pos,i).sub(mid).multiplyScalar(1.04-.82*t**5).add(mid);
    pos.setXYZ(i,v.x,v.y,v.z);
    const c=new THREE.Color(tabby ? (row%5<2 || row===16 ? 0x98502b : 0xe39449) : (row>13?0xf2eee1:0x303139));
    colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geo;
}

function sculpt(tabby) {
  const root=new THREE.Group(), air=[],airNormals=[];
  const origin=[0,0,0], unit=[1,1,1];
  const body=fur(tabby,false),head=fur(tabby,true),coat=tint(tabby?0xd68a43:0x303139);
  const eye=tint(tabby?0xa4bc78:0xd3bb68),foot=tabby?tint(0xf3c994):cream;
  function piece(geometry,material,at=origin,size=unit,flight=at,stretch=size,other=geometry) {
    const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(at);mesh.scale.fromArray(size);root.add(mesh);
    const g=other.index?other.toNonIndexed():other.clone();
    g.scale(...stretch);g.translate(...flight);
    air.push(...g.attributes.position.array);airNormals.push(...g.attributes.normal.array);g.dispose();
  }
  piece(oval,body,[0,0,-.018],[.114,.117,.179],[0,0,-.035],[.11,.096,.202]);
  piece(oval,head,[0,.103,.134],[.12,.105,.101]);
  for(const s of [-1,1]){
    piece(ear(s,false),coat);piece(ear(s,true),pink);
    piece(oval,cream,[s*.034,.078,.219],[.044,.031,.031]);
    piece(detail,dark,[s*.059,.121,.214],[.030,.022,.014]);
    piece(detail,eye,[s*.059,.122,.221],[.024,.018,.010]);
    piece(detail,dark,[s*.059,.122,.229],[.007,.014,.005]);
    piece(detail,glint,[s*.059-.005,.129,.233],[.005,.005,.003]);
    for(const j of [-1,1]){
      const vertices=[s*.057,.080+j*.010,.235,s*.060,.083+j*.010,.234,s*.153,.077+j*.020,.201];
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();piece(g,whisker);
    }
    // White socks show under the tuxedo coat. The tabby's hind legs fold
    // against its belly in the hand, then stretch behind it in flight.
    piece(oval,coat,[s*.069,-.066,.089],[.041,.067,.046],[s*.073,-.046,.125],[.038,.037,.09]);
    piece(oval,foot,[s*.069,-.119,.114],[.043,.027,.050],[s*.074,-.050,.209],[.042,.030,.053]);
    piece(oval,body,[s*.075,-.046,-.100],[.055,.083,.077],[s*.073,-.042,-.139],[.05,.055,.094]);
    piece(oval,foot,[s*.076,-.118,-.087],[.046,.029,.059],[s*.076,-.062,-.235],[.044,.032,.065]);
  }
  piece(detail,pink,[0,.093,.245],[.020,.013,.012]);
  piece(tail(tabby,false),tint(0xffffff),origin,unit,origin,unit,tail(tabby,true));
  piece(detail,tabby?coat:cream,[.065,.23,-.185],[.008,.008,.008],[.012,.13,-.49]);
  const mesh=mergeKitMeshes(root);
  mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(air,3)];
  mesh.geometry.morphAttributes.normal=[new THREE.Float32BufferAttribute(airNormals,3)];
  mesh.geometry.computeBoundingSphere();mesh.updateMorphTargets();
  mesh.name=coats[Number(tabby)];return mesh;
}

export function makeTossCat(index) {
  models[index]??=sculpt(index===1);
  const cat=models[index].clone();
  cat.userData.coat=coats[index];
  return cat;
}
