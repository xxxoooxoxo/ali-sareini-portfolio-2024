// Exterior game props. +Z points down the silhouette and the origin sits in
// the right palm. Faces share a painted atlas after the parts are assembled.
import * as THREE from 'three';
import { drawTex, hash } from './look.js';
import { mergeKitMeshes } from './kit-textures.js';

export const CAT_TOSS=3;
export const weaponNames=['Gear','Pistol','AK rifle','Cat toss'];

function paintFinishes() {
  const metal=drawTex(96,64,g=>{
    const sheen=g.createLinearGradient(0,0,0,64);
    sheen.addColorStop(0,'#d8e0e1');sheen.addColorStop(.23,'#b4c2ca');
    sheen.addColorStop(.65,'#cad0d0');sheen.addColorStop(1,'#8f9ba5');
    g.fillStyle=sheen;g.fillRect(0,0,96,64);
    for(let i=0;i<135;i++){
      g.fillStyle=i%3?'#eef1dd27':'#283b4d23';
      g.fillRect(hash(i,0,18)*96,hash(i,1,18)*64,2+hash(i,2,18)*14,1);
    }
  });
  const walnut=drawTex(128,64,(g,w,h)=>{
    const pixels=g.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      // Growth rings narrow around a knot; long fibres cross the rings.
      const knot=3.7*Math.exp(-(((x-49)/24)**2+((y-30)/12)**2));
      const flow=y*.68+Math.sin(x*.047+y*.052)*1.9+knot;
      const grain=9*Math.sin(flow)+4*Math.sin(flow*3.27)-20*Math.max(0,Math.cos(flow))**12;
      const value=grain+5*Math.sin(x*.056+y*.14)+hash(x,y,6)*8-y*.16;
      const i=(y*w+x)*4;
      pixels.data[i]=193+value;pixels.data[i+1]=124+value*.82;pixels.data[i+2]=81+value*.57;pixels.data[i+3]=255;
    }
    g.putImageData(pixels,0,0);
    for(let i=0;i<25;i++){
      g.fillStyle='#ffda9a55';g.fillRect(hash(i,0,2)*119,hash(i,4,5)*60,1+i%5,1);
    }
  });
  const checkering=drawTex(64,64,g=>{
    g.fillStyle='#b0a39c';g.fillRect(0,0,64,64);
    for(const slope of [-1,1])for(let x=-64;x<130;x+=7){
      g.beginPath();g.moveTo(x,0);g.lineTo(x+slope*64,64);g.strokeStyle='#473d3a';g.lineWidth=2;g.stroke();
      g.beginPath();g.moveTo(x+2,0);g.lineTo(x+2+slope*64,64);g.strokeStyle='#c7beb181';g.lineWidth=1;g.stroke();
    }
  });
  const coat=(color,map=metal)=>new THREE.MeshLambertMaterial({color,map});
  const pressed=drawTex(128,64,(g,w,h)=>{
    g.drawImage(metal.image,0,0,w,h);
    g.fillStyle='#2a374950';g.fillRect(5,6,118,4);
    g.fillStyle='#e1e6df9c';g.fillRect(6,10,117,1.5);
    g.fillStyle='#41505e72';g.beginPath();g.moveTo(45,30);g.lineTo(95,30);
    g.lineTo(91,37);g.lineTo(49,38);g.closePath();g.fill();
    g.fillStyle='#d4dadd';g.fillRect(50,38,41,1.6);
    for(const [x,y] of [[8,47],[19,48],[106,19]]){
      g.fillStyle='#697682';g.fillRect(x,y,3,3);g.fillStyle='#dde2da';g.fillRect(x,y,2,1);
    }
  });
  return {
    steel:coat(0x627888), bright:coat(0xc6ced1), edge:coat(0x99acb4),
    pressed:coat(0x76848e,pressed), dark:coat(0x37424d), rubber:coat(0x34343a,checkering),
    grip:coat(0x74564a,checkering), wood:coat(0xe2bb9f,walnut), redwood:coat(0xcb9d88,walnut),
    brass:coat(0xd1b395),
  };
}

let finishes;
export function makeWeaponModel(rifle) {
  finishes ??= paintFinishes();
  const m=finishes, model=new THREE.Group();
  model.name=weaponNames[rifle?2:1];

  function part(geometry,material,x=0,y=0,z=0) {
    // Normalize each face to its swatch. Stock grain runs lengthwise on the
    // sides and crown, including the sloped facets near the butt.
    geometry.computeBoundingBox();
    const {min}=geometry.boundingBox, size=geometry.boundingBox.getSize(new THREE.Vector3());
    const p=geometry.attributes.position, n=geometry.attributes.normal, uv=[];
    for(let i=0;i<p.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      const u=nz>nx && nz>ny ? (p.getX(i)-min.x)/(size.x||1) : (p.getZ(i)-min.z)/(size.z||1);
      const v=ny>nx && ny>nz ? (p.getX(i)-min.x)/(size.x||1) : (p.getY(i)-min.y)/(size.y||1);
      uv.push(u,v);
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);model.add(mesh);return mesh;
  }

  // Eight-sided sections provide a broad face, a thin highlight and a proper
  // end cap even when the camera looks almost straight down the prop.
  function shell(sections,material) {
    const perimeter=[[-.72,-1],[.72,-1],[1,-.58],[1,.58],[.72,1],[-.72,1],[-1,.58],[-1,-.58]];
    const vertices=[],faces=[];
    sections.forEach(([z,y,w,h],j)=>{
      for(const [sx,sy] of perimeter)vertices.push(sx*w/2,y+sy*h/2,z);
      const first=j*8;
      if(j)for(let i=0;i<8;i++){
        const a=first-8+i,b=first-8+(i+1)%8;
        faces.push(a,b,b+8,a,b+8,a+8);
      }
    });
    const last=vertices.length/3-8;
    for(let i=1;i<7;i++)faces.push(0,i+1,i,last,last+i,last+i+1);
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(faces);
    const flat=geo.toNonIndexed();geo.dispose();flat.computeVertexNormals();return part(flat,material);
  }
  function profile(points,width,mat,bevel=.004,hole=null) {
    const contour=points.map(([z,y])=>new THREE.Vector2(z,y));
    const shape=new THREE.Shape(contour);
    if(hole)shape.holes.push(new THREE.Path(hole.map(([z,y])=>new THREE.Vector2(z,y))));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:bevel>0,
      bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:1});
    return part(geo.rotateY(-Math.PI/2).translate(width/2,0,0),mat);
  }
  function collar(z0,z1,y,r0,r1,mat) {
    return part(new THREE.CylinderGeometry(r1,r0,z1-z0,10).rotateX(Math.PI/2),mat,0,y,(z0+z1)/2);
  }
  function pin(y,z,width,radius,mat) {
    part(new THREE.CylinderGeometry(radius,radius,width,8).rotateZ(Math.PI/2),mat,0,y,z);
  }

  let tipZ,tipY;
  if(rifle){
    shell([[-.388,.081,.112,.192],[-.36,.080,.126,.189],[-.291,.089,.118,.159],
      [-.214,.106,.096,.111],[-.166,.106,.084,.080],[-.112,.117,.088,.085]],m.wood);
    shell([[-.40,.081,.108,.189],[-.388,.081,.118,.197],[-.377,.081,.126,.192]],m.rubber);
    shell([[-.379,.081,.127,.191],[-.373,.081,.128,.191]],m.edge);
    profile([[-.112,.163],[.16,.158],[.177,.100],[.132,.060],[-.060,.061],[-.117,.086]],.111,m.pressed);
    shell([[-.134,.158,.089,.044],[-.108,.172,.107,.076],[-.076,.178,.103,.089],
      [.063,.178,.099,.079],[.099,.174,.097,.073],[.151,.155,.084,.047]],m.dark);
    shell([[-.087,.214,.040,.011],[.063,.211,.035,.010]],m.steel);
    shell([[.089,.20,.067,.026],[.14,.213,.069,.032],[.16,.199,.059,.019]],m.steel);
    profile([[-.110,.163],[-.073,.177],[.080,.170],[.105,.158],[-.073,.164]],.111,m.edge,.001);
    profile([[-.102,.070],[-.032,.067],[-.043,.019],[-.070,-.105],[-.129,-.091]],.075,m.redwood,.007);
    profile([[-.053,.067],[.082,.067],[.068,-.012],[.041,-.027],[-.036,-.025]],.031,m.dark,.0015,
      [[-.034,.049],[.061,.050],[.050,.001],[.032,-.010],[-.028,-.010]]);
    profile([[.012,.059],[.027,.058],[.021,.020],[.005,.002],[-.004,.002],[.010,.022]],.017,m.steel,.001);
    profile([[.047,.068],[.147,.068],[.157,-.027],[.181,-.097],[.247,-.165],
      [.173,-.219],[.111,-.157],[.077,-.086],[.055,-.013]],.081,m.dark,.005);
    for(const z of [.065,.091,.116]){
      profile([[z,.035],[z+.008,.035],[z+.026,-.059],[z+.051,-.120],[z+.10,-.169],
        [z+.095,-.173],[z+.045,-.123],[z+.019,-.065]],.090,m.steel,.001);
    }
    profile([[.155,-.203],[.229,-.152],[.248,-.166],[.171,-.222]],.092,m.edge,.001);
    shell([[.15,.116,.087,.080],[.17,.118,.130,.112],[.24,.116,.142,.119],
      [.31,.118,.134,.107],[.355,.134,.098,.078]],m.wood);
    shell([[.164,.184,.078,.034],[.193,.184,.108,.065],[.290,.184,.104,.062],[.339,.174,.079,.040]],m.redwood);
    for(const z of [.195,.247,.296]){
      profile([[z-.013,.151],[z+.014,.150],[z+.008,.162],[z-.011,.165]],.124,m.dark,.001);
    }
    shell([[.345,.147,.105,.107],[.365,.149,.098,.098]],m.dark);
    collar(.35,.573,.133,.032,.023,m.steel);
    collar(.37,.399,.133,.042,.038,m.dark);
    collar(.537,.583,.133,.030,.035,m.edge);
    collar(.325,.404,.182,.027,.020,m.steel);
    profile([[.376,.151],[.398,.200],[.421,.194],[.412,.148]],.038,m.dark);
    profile([[.486,.144],[.504,.172],[.512,.226],[.537,.226],[.535,.145]],.037,m.steel,.002,
      [[.508,.162],[.520,.201],[.526,.199],[.524,.162]]);
    collar(.583,.585,.133,.018,.018,m.dark);
    pin(.114,-.075,.119,.012,m.edge);pin(.10,.045,.119,.010,m.edge);
    tipZ=.586;tipY=.133;
  } else {
    profile([[-.058,.117],[.057,.089],[.036,.044],[.011,-.092],[.016,-.114],
      [-.070,-.123],[-.094,-.102],[-.061,.013],[-.084,.079]],.082,m.dark,.008);
    profile([[-.052,.067],[.028,.047],[.004,-.093],[-.067,-.102],[-.080,-.079]],.094,m.dark,.004);
    profile([[-.049,.060],[.024,.044],[.001,-.088],[-.065,-.096],[-.075,-.078]],.102,m.grip,.004);
    profile([[-.087,-.098],[.011,-.092],[.021,-.114],[-.070,-.133],[-.094,-.122]],.095,m.dark,.003);
    profile([[.010,.102],[.166,.102],[.166,.044],[.147,.006],[.109,-.002],[.024,.001]],.049,m.steel,.0025,
      [[.040,.076],[.143,.076],[.144,.046],[.129,.027],[.105,.019],[.039,.019]]);
    profile([[.068,.091],[.090,.093],[.085,.061],[.081,.040],[.067,.027],[.054,.030],[.068,.051]],.027,m.bright,.002);
    shell([[-.092,.116,.085,.051],[-.061,.108,.110,.066],[.139,.111,.104,.056],[.231,.122,.082,.033]],m.pressed);
    shell([[-.087,.173,.087,.060],[-.067,.173,.109,.078],[.150,.171,.109,.074],
      [.237,.164,.099,.058],[.250,.159,.083,.048]],m.bright);
    for(let j=0;j<5;j++){
      const z=-.066+j*.013;
      profile([[z,.144],[z+.005,.144],[z+.021,.190],[z+.015,.190]],.110,m.steel,.0006);
    }
    // A cut-back crown over the dark side panel breaks up the long silver face.
    profile([[.042,.165],[.108,.166],[.120,.183],[.053,.189]],.110,m.dark,.001);
    profile([[.056,.175],[.104,.174],[.109,.180],[.061,.184]],.114,m.edge,.0007);
    profile([[-.083,.168],[-.100,.196],[-.093,.205],[-.072,.196],[-.061,.166]],.040,m.dark,.002);
    profile([[-.050,.122],[-.043,.130],[.013,.130],[.025,.121],[.019,.115],[-.035,.115]],.115,m.dark,.001);
    shell([[.226,.159,.080,.045],[.252,.158,.086,.049]],m.steel);
    collar(.250,.257,.158,.024,.025,m.edge);
    collar(.257,.258,.158,.014,.014,m.dark);
    shell([[-.072,.212,.060,.017],[-.046,.212,.060,.017]],m.dark);
    shell([[.177,.208,.019,.013],[.200,.208,.019,.013]],m.dark);
    pin(.032,-.021,.113,.0065,m.brass);pin(-.073,-.034,.113,.006,m.brass);
    profile([[-.048,-.020],[-.030,-.008],[-.015,-.025],[-.035,-.037]],.111,m.dark,.0007);
    tipZ=.259;tipY=.158;
  }
  const shellMesh=mergeKitMeshes(model);
  shellMesh.name=model.name+' finish';shellMesh.material.emissive.setHex(0x0b0b0d);
  const tip=new THREE.Object3D();tip.name='Flash anchor';tip.position.set(0,tipY,tipZ);
  model.add(tip);
  const support=new THREE.Object3D(),stock=new THREE.Object3D();
  if(rifle){
    support.name='Support hand';support.position.set(.042,.071,.188);
    stock.name='Shoulder pad';stock.position.set(0,.081,-.40);
    model.add(support,stock);
  }
  // Scale the complete held prop, including its grip, stock and effect anchors.
  model.scale.setScalar(rifle ? .68 : .58);
  const handle=new THREE.Vector3(0,-.012,rifle ? -.078 : -.033);
  return {model,tip,support,stock,handle};
}
