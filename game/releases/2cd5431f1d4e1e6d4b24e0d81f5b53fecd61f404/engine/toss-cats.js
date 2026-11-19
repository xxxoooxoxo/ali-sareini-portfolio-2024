import * as THREE from 'three';
import { drawTex, hash } from './look.js';
import { bindCat, boneIndex, poseCat, tailPath } from './cat-rig.js';
import { catPortraits } from './cat-portraits.js';

const coats=['Tuxedo','Orange tabby'];
const assets=[];
const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smoothPatch=x=>clamp((x-.45)*4);
const blend=(a,b,t)=>a.map((c,k)=>c+(b[k]-c)*clamp(t));
let faces;

function projectPortrait(map,tabby) {
  if(!faces){faces=new Image();faces.src=catPortraits;}
  const paint=()=>{
    const g=map.image.getContext('2d'), x=tabby?256:0;
    g.drawImage(faces,x,0,256,112,0,112,256,112);
    // Each side has its own ear; the face and ears keep their photo orientation.
    g.drawImage(faces,x+128,112,128,32,128,224,128,30);
    map.needsUpdate=true;map.userData.portraitReady=true;
  };
  if(faces.complete && faces.naturalWidth)paint();else faces.addEventListener('load',paint,{once:true});
}

function catAtlas(tabby){
  const map=drawTex(256,256,(g,w,h)=>{
    const image=g.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const face=y>=112 && y<224, u=(x+.5)/w, v=((y%112)+.5)/112;
      const angle=TAU*v, top=Math.cos(angle), side=Math.sin(angle);
      const fuzz=hash(x>>1,y,21)-.5, wave=Math.sin(11*u+3*top);
      let color;
      if(tabby){
        // The ginger coat has broad, muted flank markings and a white bib
        // that rises up the front of the chest.
        const bars=.5+.5*Math.cos(35*u+3*side+4*top+1.3*Math.sin(10*u+top));
        const ink=clamp((bars-.59)*3)*clamp(top+.83)*(.40+.26*Math.sin(14*u)**2);
        color=blend([212,147,89],[148,87,51],clamp(ink+.19*Math.max(0,top)**12));
        const bib=clamp(((u-.68)*2.6-top-.19+.045*wave+fuzz*.035)*5);
        color=blend(color,[235,226,211],bib);
      }else{
        // Black saddle on a white coat, broken by a white notch over the rump.
        const edge=-.14+.14*Math.sin(10*u+side)+.10*side+.12*Math.cos(19*u);
        const saddle=clamp((top-edge+fuzz*.045)*8)*clamp((.78+.05*side+.045*wave-u)*14);
        const notch=Math.exp(-(((u-.27)/.12)**2+((side+.24)/.30)**2))*clamp(top*2);
        const flank=Math.exp(-(((u-.18)/.21)**2+((top+.23)/.49)**2))*clamp(side*4);
        const black=clamp(Math.max(saddle*(1-smoothPatch(notch)),smoothPatch(flank)));
        color=blend([237,232,221],[38,39,41],black);
      }
      if(face){
        const lon=(u-.5)*TAU,lat=v*Math.PI;
        const nx=Math.sin(lon)*Math.sin(lat),ny=Math.cos(lat),nz=Math.cos(lon)*Math.sin(lat);
        if(tabby){
          const mask=clamp((-ny-.35)*2+nz*.22);
          color=blend([211,146,90],[237,226,211],mask);
        }else{
          const crown=clamp((ny-.43+.22*(-nx)-.12*nz)*7);
          const patch=clamp((-nx-.07)*9)*clamp((ny+.35+(1-nz)*.15)*8);
          color=blend([236,231,222],[36,38,41],Math.max(crown,patch));
        }
      }
      const fleck=(hash(x,y,74)-.5)*12+Math.sin(u*125+top*18)*2.8+top*4;
      const i=(y*w+x)*4;
      if(y>=224 && y<254 && x<128){
        const leg=(x%32)/31, limb=Math.floor(x/32), grain=(hash(x,y,58)-.5)*8;
        const ring=clamp((Math.cos(leg*28+1.8*Math.cos((y-224)*TAU/30))-.58)*2.6);
        if(tabby){
          const ginger=blend([213,148,92],[160,102,61],ring*.46);
          color=blend(ginger,[239,231,216],clamp((leg-(limb<2 ? .48 : .54)+fuzz*.025)*13));
        }else{
          const dark=limb===3?clamp((.54-leg+.09*Math.sin((y-224)*TAU/30))*12):0;
          color=blend([236,231,222],[40,41,43],dark);
        }
        for(let k=0;k<3;k++)image.data[i+k]=color[k]+grain;
      }else for(let k=0;k<3;k++)image.data[i+k]=y<224?color[k]+fleck:255;
      image.data[i+3]=255;
    }
    g.putImageData(image,0,0);
    // A small painted eye remains visible while the embedded portrait decodes.
    for(const side of [-1,1]){
      g.fillStyle=tabby?'#92956a':'#b49d60';g.beginPath();
      g.ellipse(128+side*22,161,9,3.3,-side*.20,0,TAU);g.fill();
      g.fillStyle='#252923';g.fillRect(127+side*22,158.5,2,5);
    }
  });
  projectPortrait(map,tabby);
  return map;
}

function sculpt(tabby){
  const pos=[],uv=[],indices=[],skin=[],weights=[],colors=[],seams=[];
  const white=0xffffff;
  function vertex(x,y,z,u,v,color,bone,other=bone,weight=0){
    pos.push(x,y,z);uv.push(u,1-v);skin.push(boneIndex[bone],boneIndex[other],0,0);
    weights.push(1-weight,weight,0,0);colors.push(((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255);
    return pos.length/3-1;
  }
  // Contoured rings give the back, cheeks, legs and paws actual profiles.
  // The first coordinate is the point along the ring path, not a sphere radius.
  function loft(rows,{sides=16,region='',cross=false,legTile=0}={}){
    const start=pos.length/3;
    for(let j=0;j<rows.length;j++){
      const [x,y,z,rx,ry,bone,other=bone,weight=0,color=white]=rows[j];
      let ny=1,nz=0;
      if(cross){
        const a=rows[Math.max(0,j-1)],b=rows[Math.min(rows.length-1,j+1)];
        const dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dy,dz)||1;
        ny=dz/len;nz=-dy/len;
      }
      const along=(z-rows[0][2])/(rows.at(-1)[2]-rows[0][2]||1);
      for(let k=0;k<=sides;k++){
        const a=TAU*k/sides,c=Math.cos(a);
        const u=region==='leg' ? (32*legTile+1+29*j/(rows.length-1))/256 : region ? (.5+254*along)/256 : .5;
        const v=region==='leg' ? (225+27*k/sides)/256 : region ? (1+109*k/sides)/256 : .998;
        vertex(x+rx*Math.sin(a),y+ny*ry*c,z+nz*ry*c,u,v,color,bone,other,weight);
        if(j&&k){const d=pos.length/3-1,b=d-sides-1;indices.push(b-1,d-1,b,b,d-1,d);}
      }
      const first=start+j*(sides+1);seams.push([first,first+sides]);
    }
    const end=start+(rows.length-1)*(sides+1);
    for(let k=1;k<sides-1;k++)indices.push(start,start+k,start+k+1,end,end+k+1,end+k);
  }
  loft([
    [0,.018,-.204,.010,.021,'hips'],[0,.021,-.185,.053,.064,'hips'],
    [0,.017,-.145,.075,.085,'hips'],[0,.013,-.093,.072,.078,'hips','chest',.15],
    [0,.014,-.036,.059,.069,'hips','chest',.40],[0,.016,.024,.064,.077,'hips','chest',.72],
    [0,.022,.076,.071,.084,'chest'],[0,.047,.105,.066,.077,'chest','neck',.62],
    [0,.067,.124,.053,.057,'neck','head',.32]
  ],{region:'body'});
  function skull(lon,lat) {
    const nx=Math.sin(lon)*Math.sin(lat),ny=Math.cos(lat),nz=Math.cos(lon)*Math.sin(lat);
    const front=clamp(nz), cheek=Math.exp(-((Math.abs(nx)-.32)**2/.09+(ny+.23)**2/.11));
    const bridge=Math.exp(-(nx*nx/.045+(ny+.27)**2/.11));
    return [(tabby ? .085:.080)*nx*(1-.17*clamp(-ny)),.097+(tabby ? .075 : .069)*ny-.008*front*front,
      .159+.066*nz+front*front*(.014*cheek+.019*bridge)];
  }
  const headStart=pos.length/3,segments=32,bands=20;
  for(let j=0;j<=bands;j++)for(let i=0;i<=segments;i++){
    const u=i/segments,v=j/bands,p=skull((u-.5)*TAU,v*Math.PI);
    vertex(p[0],p[1],p[2],(.5+254*u)/256,(112+1+109*v)/256,white,'head');
    if(i&&j){const d=pos.length/3-1,b=d-segments-1;indices.push(b-1,d-1,b,b,d-1,d);}
    if(!i)seams.push([headStart+j*(segments+1),headStart+j*(segments+1)+segments]);
  }
  function patch(points,color,bone){
    const start=pos.length/3;
    for(const [x,y,z] of points)vertex(x,y,z,.5,.998,color,bone);
    for(let k=1;k<points.length-1;k++)indices.push(start,start+k,start+k+1);
  }
  for(const s of [-1,1]){
    const bone='ear'+s;
    const outer=[s*.080,.127,.147], inner=[s*.016,.143,.172], tip=[s*(tabby ? .078:.084),tabby ? .214:.204,.128], back=[s*.051,.125,.102];
    const fur=tabby?0xbc8559:0x29292c;
    patch([outer,tip,inner],fur,bone);patch([inner,tip,back],tabby?0x98623f:0x42464b,bone);
    patch([back,tip,outer],fur,bone);
    const earStart=pos.length/3;
    for(const [x,y,z,u,v] of [[s*.074,tabby ? .203:.194,.137,.35,.10],[s*.026,.145,.171,.82,.87],[s*.073,.136,.151,.18,.87]]){
      vertex(x,y,z,(128+(s>0?64:0)+.5+63*u)/256,(224+.5+29*v)/256,white,bone);
    }
    indices.push(earStart,earStart+1,earStart+2);
    for(let i=0;i<3;i++){
      const root=skull(s*(.39+.035*i),Math.PI*(.575+.024*i));
      const mid=[s*.071,root[1]+.002-i*.002,root[2]+.002],tip=[s*(.112+i*.004),root[1]+.008-i*.008,root[2]-.017];
      patch([root,[root[0],root[1]+.0011,root[2]],[mid[0],mid[1]+.0008,mid[2]],mid],0xcac4b8,'head');
      patch([mid,[mid[0],mid[1]+.0008,mid[2]],tip],0xcac4b8,'head');
    }
    for(const front of [true,false]){
      const id=(front?'F':'H')+s, a='upper'+id,b='lower'+id,p='paw'+id,k='hock'+id;
      let leg;
      if(front)leg=[
        [s*.036,.053,.081,.014,.021,'chest',a,.22],[s*.048,.017,.103,.036,.038,a,a,0],
        [s*.049,-.043,.084,.027,.028,a,b,.2],[s*.049,-.080,.073,.020,.022,a,b,.70],
        [s*.049,-.097,.080,.017,.020,b,b,0],[s*.050,-.130,.091,.014,.016,b,b,0],
        [s*.050,-.155,.098,.013,.014,b,p,.25]];
      else leg=[
        [s*.027,.055,-.127,.019,.025,'hips',a,.20],[s*.052,.014,-.133,.043,.056,a,a,0],
        [s*.055,-.034,-.103,.035,.040,a,b,.12],[s*.056,-.064,-.087,.024,.025,a,b,.70],
        [s*.056,-.081,-.117,.021,.030,b,b,0],[s*.056,-.103,-.168,.015,.018,b,k,.72],
        [s*.056,-.123,-.162,.012,.015,k,k,0],[s*.056,-.158,-.149,.013,.015,k,p,.28]];

      const x=s*(front ? .050 : .056),z=front ? .100 : -.147;
      leg.push([x,-.162,z-.001,.016,.014,front?b:k,p,.72],
        [x,-.167,z+.009,.021,.013,p,p,0],[x,-.169,z+.023,.020,.012,p,p,0],
        [x,-.170,z+.034,.015,.009,p,p,0],[x,-.169,z+.039,.005,.004,p,p,0]);
      loft(leg,{cross:true,sides:12,region:'leg',legTile:(front?0:2)+(s>0?1:0)});
    }
  }
  const rings=[];
  for(let j=0;j<=24;j++){
    const t=j/24*(tailPath.length-1),i=Math.min(Math.floor(t),tailPath.length-2),f=t-i;
    const a=tailPath[i],b=tailPath[i+1],r=(tabby ? .024:.021)*(1-.40*j/24-.53*(j/24)**7);
    const c=tabby?(j>=21?0xf3ebdb:j%7<3?0xb57546:0xd59962):0x303033;
    rings.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,r,r,'tail'+i,'tail'+(i+1),f,c]);
  }
  loft(rings,{cross:true,sides:10});
  const geo=new THREE.BufferGeometry();geo.setIndex(indices);
  for(const [name,data,stride] of /** @type {const} */ ([['position',pos,3],['uv',uv,2],['color',colors,3],['skinWeight',weights,4]])){
    geo.setAttribute(name,new THREE.Float32BufferAttribute(data,stride));
  }
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));geo.computeVertexNormals();
  const n=geo.attributes.normal,n1=new THREE.Vector3(),n2=new THREE.Vector3();
  for(const [a,b] of seams){
    n1.fromBufferAttribute(n,a).add(n2.fromBufferAttribute(n,b)).normalize();
    n.setXYZ(a,n1.x,n1.y,n1.z);n.setXYZ(b,n1.x,n1.y,n1.z);
  }
  const material=new THREE.MeshLambertMaterial({map:catAtlas(tabby),vertexColors:true,side:THREE.DoubleSide});
  return {geo,material};
}

export function makeTossCat(index) {
  const {geo,material}=assets[index]??=sculpt(index===1);
  const cat=bindCat(geo,material.clone());cat.name=cat.userData.coat=coats[index];
  cat.material.transparent=true;cat.material.forceSinglePass=true;
  cat.userData.beat=index*1.8;
  poseCat(cat,'carry',0,0);
  return cat;
}
