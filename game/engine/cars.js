// const cars = new Cars(world,{night:false,snow:null}); snow is RGB, or per-add override.
// add(type,x,z,heading=0,paint=null,{solid:false,lights:true,snow,shadow:true}) returns a +Z-facing Group.
// Types: sedan, hatch, mustang, suv, pickup, van, bus, taxi, police; paint is RGB or positional default.
// park(x0,z0,x1,z1,{types,gap:1.1,flip:false,solid:true}) returns cars with lamps off.
// drive(type,x0,z0,x1,z1,speed=9,headStart=0,paint=null) returns animated car; world.ticks moves it.
// All cars carry a neutral atlas tinted by paint, detailed glass/trim, plates and ten-sided wheels.
import * as THREE from 'three';
import { hash } from 'life/engine/look.js';
import {carAtlas,carLensTexture,carShadowTexture,kitTexture,softTexture} from 'life/engine/kit-textures.js';

// Each body is a row of cross-sections from nose to tail: [z, top, half-width scale, roof half-width or 0, side, roof].
// `side` and `roof` say what the panel from this section to the next one is made of: 'b' body, 'g' glass.
const BODIES = {
  // 1970 SportsRoof: the cabin sits aft of a long bonnet, with wide rear
  // quarters framing the sloping glass and a short, slightly upswept deck lid.
  mustang: { width: 1.88, floor: .24, belt: .81, wheel: .345, axles: [1.32,-1.42], sections: [
    [2.39,.76,.91,0,'b','b'],[2.30,.81,.97,0,'b','b'],[1.98,.865,.99,0,'b','b'],
    [1.32,.905,1,0,'b','b'],[.63,.875,.975,.755,'g','g'],[.055,1.265,.96,.65,'g','b'],
    [-.61,1.30,.98,.64,'g','b'],[-.90,1.265,1,.61,'b','g'],[-1.76,.925,1,.68,'b','b'],
    [-2.13,.895,.99,0,'b','b'],[-2.38,.915,.94,0,'b','b']] },
  sedan: { width: 1.78, floor: 0.3, belt: 0.98, wheel: 0.32, axles: [1.42, -1.38], sections: [
    [2.3, 0.83, 0.90, 0, 'b', 'b'], [2.12, 0.84, 0.95, 0, 'b', 'b'], [0.95, 0.99, 1, 0, 'b', 'g'], [0.3, 1.43, 1, 0.7, 'g', 'b'], [-0.3, 1.45, 1, 0.71, 'b', 'b'],
    [-0.4, 1.45, 1, 0.71, 'g', 'b'], [-1.1, 1.41, 1, 0.69, 'b', 'g'], [-1.72, 1.03, 1, 0, 'b', 'b'], [-2.2, 0.99, 0.95, 0, 'b', 'b'], [-2.32, 0.88, 0.90, 0, 'b', 'b']] },
  hatch: { width: 1.7, floor: 0.3, belt: 0.96, wheel: 0.31, axles: [1.22, -1.2], sections: [
    [1.95, 0.82, 0.90, 0, 'b', 'b'], [1.8, 0.83, 0.95, 0, 'b', 'b'], [0.85, 0.97, 1, 0, 'b', 'g'], [0.25, 1.45, 1, 0.69, 'g', 'b'], [-0.35, 1.47, 1, 0.7, 'b', 'b'],
    [-0.45, 1.47, 1, 0.7, 'g', 'b'], [-1.50, 1.46, 1, 0.68, 'b', 'g'], [-1.88, 1.10, 0.98, 0, 'b', 'b'], [-1.97, 0.94, 0.92, 0, 'b', 'b']] },
  suv: { width: 1.9, floor: 0.38, belt: 1.12, wheel: 0.37, axles: [1.45, -1.4], sections: [
    [2.35, 0.72, 0.88, 0, 'b', 'b'], [2.2, 1.0, 0.96, 0, 'b', 'b'], [1.05, 1.13, 1, 0, 'b', 'g'], [0.55, 1.72, 1, 0.76, 'g', 'b'], [-0.2, 1.75, 1, 0.77, 'b', 'b'],
    [-0.32, 1.75, 1, 0.77, 'g', 'b'], [-1.3, 1.74, 1, 0.77, 'b', 'b'], [-1.42, 1.74, 1, 0.77, 'g', 'b'], [-2.15, 1.7, 1, 0.75, 'b', 'g'], [-2.36, 1.14, 0.97, 0, 'b', 'b'], [-2.4, 0.74, 0.88, 0, 'b', 'b']] },
  pickup: { width: 1.92, floor: 0.4, belt: 1.14, wheel: 0.38, axles: [1.6, -1.6], sections: [
    [2.7, 0.74, 0.88, 0, 'b', 'b'], [2.55, 1.02, 0.96, 0, 'b', 'b'], [1.4, 1.15, 1, 0, 'b', 'g'], [0.9, 1.74, 1, 0.76, 'g', 'b'], [0.1, 1.76, 1, 0.77, 'b', 'g'],
    [-0.05, 1.16, 1, 0, 'b', 'b'], [-2.6, 1.16, 1, 0, 'b', 'b'], [-2.7, 0.76, 0.9, 0, 'b', 'b']] },
  van: { width: 1.95, floor: 0.36, belt: 1.2, wheel: 0.36, axles: [1.75, -1.5], sections: [
    [2.55, 0.74, 0.9, 0, 'b', 'b'], [2.45, 1.08, 0.97, 0, 'b', 'b'], [1.95, 1.22, 1, 0, 'b', 'g'], [1.35, 2.02, 1, 0.84, 'g', 'b'], [0.6, 2.05, 1, 0.85, 'b', 'b'],
    [-2.5, 2.05, 1, 0.85, 'b', 'b'], [-2.58, 0.78, 0.92, 0, 'b', 'b']] },
  bus: { width: 2.5, floor: 0.42, belt: 1.5, wheel: 0.48, axles: [3.4, -3.0], sections: [
    [5.3, 0.9, 0.94, 0, 'b', 'b'], [5.22, 2.95, 0.98, 1.15, 'g', 'b'], [4.0, 3.0, 1, 1.18, 'b', 'b'], [3.82, 3.0, 1, 1.18, 'g', 'b'], [2.45, 3.0, 1, 1.18, 'b', 'b'],
    [2.27, 3.0, 1, 1.18, 'g', 'b'], [0.9, 3.0, 1, 1.18, 'b', 'b'], [0.72, 3.0, 1, 1.18, 'g', 'b'], [-0.65, 3.0, 1, 1.18, 'b', 'b'], [-0.83, 3.0, 1, 1.18, 'g', 'b'],
    [-2.2, 3.0, 1, 1.18, 'b', 'b'], [-2.38, 3.0, 1, 1.18, 'g', 'b'], [-3.75, 3.0, 1, 1.18, 'b', 'b'], [-5.2, 2.95, 0.98, 1.15, 'b', 'b'], [-5.28, 0.95, 0.94, 0, 'b', 'b']] },
};
BODIES.taxi=BODIES.sedan; BODIES.police=BODIES.sedan;
const GLASS_LOW = [255, 255, 255], GLASS_HIGH = [255, 255, 255], TYRE = [26, 26, 28], HUB = [150, 152, 156], TRIM = [34, 34, 38];

// The six corners of one cross-section, going left sill, left belt, left roof, right roof, right belt, right sill.
function ring([z, top, scale, roof], body) {
  const hw = (body.width / 2) * scale;
  if (roof) return [[-hw, body.floor, z], [-hw, body.belt, z], [-roof, top, z], [roof, top, z], [hw, body.belt, z], [hw, body.floor, z]];
  const shoulder = Math.max(body.floor + 0.05, top - 0.13);
  return [[-hw, body.floor, z], [-hw, shoulder, z], [-hw * 0.86, top, z], [hw * 0.86, top, z], [hw, shoulder, z], [hw, body.floor, z]];
}

function buildGeometry(type, paint, snow) {
  const body = BODIES[type], pos = [], col = [], uvs = [], lightPos = [], lightCol = [], lampUV = [];
  const fastback = type === 'mustang';
  const tint = (c, k) => c.map(v=>v*k/255);
  // Every triangle is turned to face away from `inside`, a point within the part it belongs to,
  // so the order its corners are given in does not matter.
  let inside = [0, 0.75, 0], tile=2, endFace=false, explicitUV=null;
  const uvFor=(p)=>{let u,v;const L=body.sections[0][0]-body.sections.at(-1)[0];
    if(tile===0){u=(p[2]-body.sections.at(-1)[0])/L;v=(p[1]-body.floor)/(body.belt-body.floor);}
    else if(tile===1){u=endFace?p[0]/body.width+.5:(p[2]-body.sections.at(-1)[0])/L;v=(p[1]-body.belt)/Math.max(.3,Math.max(...body.sections.map(s=>s[1]))-body.belt);}
    else if(tile===5){u=p[0]/body.width+.5;v=(p[1]-body.floor)/(body.belt-body.floor);}
    else if(tile===4){u=.5+(p[2]-inside[2])/(body.wheel*1.1);v=.5+(p[1]-body.wheel)/(body.wheel*1.1);}
    else {u=(p[2]-body.sections.at(-1)[0])/L;v=p[0]/body.width+.5;}
    return [(tile%4*64+2+Math.max(0,Math.min(1,u))*60)/256,1-(Math.floor(tile/4)*64+2+(1-Math.max(0,Math.min(1,v)))*60)/128];};
  const tri = (a, b, c, ca, cb = ca, cc = ca) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * ((a[0] + b[0] + c[0]) / 3 - inside[0]) + ny * ((a[1] + b[1] + c[1]) / 3 - inside[1]) + nz * ((a[2] + b[2] + c[2]) / 3 - inside[2]);
    endFace=Math.abs(nz)>Math.abs(nx);
    for(const p of (out>=0?[a,b,c]:[a,c,b]))uvs.push(...(explicitUV?.get(p)??uvFor(p)));
    if (out >= 0) { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); } else { pos.push(...a, ...c, ...b); col.push(...ca, ...cc, ...cb); }
  };
  const quad = (a, b, c, d, ca, cb = ca, cc = ca, cd = ca) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  const rings = body.sections.map((s) => ring(s, body));
  const top = snow===true?[230,233,235]:snow??null;
  for (let i = 0; i < rings.length - 1; i++) {
    const f = rings[i], r = rings[i + 1], [, , , , side, roof] = body.sections[i];
    inside = [0, 0.75, (f[0][2] + r[0][2]) / 2];
    const flat = Math.abs(f[2][1] - r[2][1]) < 0.22;   // a level panel: bonnet, roof or boot, where snow would lie
    const sill = tint(paint, 0.62), flank = tint(paint, 0.92), lid = top && flat ? tint(top, 1) : tint(paint, 1.12);
    const glassLo = tint(GLASS_LOW, fastback ? .54 : 1), glassHi = tint(GLASS_HIGH, fastback ? .78 : 1);
    // Split the flank at the arch polygon vertices. No body triangles span an opening.
    const cuts=[f[0][2],r[0][2]];
    for(const axle of body.axles)for(let k=0;k<=8;k++){
      const z=axle+Math.cos(k*Math.PI/8)*(body.wheel+.065);
      if(z<cuts[0]&&z>cuts[1])cuts.push(z);
    }
    cuts.sort((a,b)=>b-a);
    const edge=(z,side)=>{
      const t=(f[0][2]-z)/(f[0][2]-r[0][2]), j=side<0?0:5, h=side<0?1:4;
      const x=f[j][0]+(r[j][0]-f[j][0])*t, y=f[h][1]+(r[h][1]-f[h][1])*t;
      let low=body.floor;
      for(const az of body.axles){const d=Math.abs(z-az),R=body.wheel+.065;if(d<R+.00001)low=Math.max(low,body.wheel+Math.sqrt(Math.max(0,R*R-d*d)));}
      return [[x*.96,low,z],[x,y-.045,z],[x,y,z]];
    };
    for(const side of [-1,1])for(let k=0;k<cuts.length-1;k++){
      const a=edge(cuts[k],side),b=edge(cuts[k+1],side);
      tile=0;quad(a[0],b[0],b[1],a[1],sill,sill,flank,flank);
      tile=2;quad(a[1],b[1],b[2],a[2],fastback ? tint(paint,1.55) : tint(paint.map(v=>Math.min(255,v*.7+76)),1));
      // Recessed wheel-well return, joining the opening to a dark inner liner.
      const ia=[a[0][0]-side*.16,a[0][1],a[0][2]],ib=[b[0][0]-side*.16,b[0][1],b[0][2]];
      tile=3;quad(a[0],ia,ib,b[0],tint(TRIM,.7));
    }
    for (const [a, b] of [[1, 2], [4, 3]]) { // upper sides: window or pillar
      const q = a === 1 ? [f[a], r[a], r[b], f[b]] : [r[a], f[a], f[b], r[b]];
      tile=side==='g'?1:2; if (side === 'g') {
        const center=q.reduce((c,p)=>c.map((v,j)=>v+p[j]/4),[0,0,0]);
        const edge=fastback ? .065 : .12;
        const inset=q.map(p=>p.map((v,j)=>v*(1-edge)+center[j]*edge));
        tile=2;for(let k=0;k<4;k++)quad(q[k],q[(k+1)%4],inset[(k+1)%4],inset[k],tint(paint,.83));
        tile=1;quad(...inset,glassLo,glassLo,glassHi,glassHi);
      } else quad(...q, flank, flank, tint(paint, 1), tint(paint, 1));
    }
    tile=roof==='g'?1:2; if (roof === 'g') quad(f[2], r[2], r[3], f[3], f[2][1] < r[2][1] ? glassLo : glassHi, f[2][1] < r[2][1] ? glassHi : glassLo, f[2][1] < r[2][1] ? glassHi : glassLo, f[2][1] < r[2][1] ? glassLo : glassHi);
    else {
      // Narrow chamfers along roof/bonnet edges catch light independently of the lid.
      const bevel=(p,sign)=>[p[0]+sign*.045,p[1]+.025,p[2]];
      const fl=bevel(f[2],1),rl=bevel(r[2],1),fr=bevel(f[3],-1),rr=bevel(r[3],-1);
      quad(f[2],r[2],rl,fl,tint(top&&flat?top:paint,1.26));
      quad(fl,rl,rr,fr,lid);
      quad(fr,rr,r[3],f[3],tint(top&&flat?top:paint,.84));
      if(!fastback&&!(top&&flat)&&flat)for(const side of [-1,1]){
        const strip=(rg,t)=>[rg[2][0]+(rg[3][0]-rg[2][0])*t,rg[2][1]+.003,rg[2][2]];
        const a=side<0?.07:.89,b=a+.04;
        quad(strip(f,a),strip(r,a),strip(r,b),strip(f,b),tint(paint.map(v=>v*.78+54),1));
      }
    }
  }
  tile=2;
  // Nose and tail panels, each with a dark bumper strip along the bottom.
  for (const [rg, front] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    inside = [0, 0.75, 0];
    const order = front ? [0, 5, 4, 3, 2, 1] : [0, 1, 2, 3, 4, 5], p = order.map((k) => rg[k]), c = tint(paint, front ? 0.9 : 0.8);
    tile=2;
    for (let k = 1; k < 5; k++) tri(p[0], p[k], p[k + 1], c);
    const z = rg[0][2] + (front ? 0.02 : -0.02), hw = Math.abs(rg[0][0]), y0 = body.floor, y1 = body.floor + 0.2, t = tint(TRIM, 1);
    if (front) quad([-hw, y0, z], [hw, y0, z], [hw, y1, z], [-hw, y1, z], t); else quad([hw, y0, z], [-hw, y0, z], [-hw, y1, z], [hw, y1, z], t);
    // Eight-sided bevelled lamp housings; lens UVs carry ribbing and amber indicators.
    const lampY=fastback ? (front ? .62 : .67) : body.floor+.43, zz=z+(front?.014:-.014);
    const w=fastback ? (front ? .235 : .102) : hw*.39, ht=fastback ? (front ? w : .23) : .18;
    const outlines=[[-.5,-.30],[-.40,-.5],[.40,-.5],[.5,-.30],[.5,.30],[.40,.5],[-.40,.5],[-.5,.30]];
    const outline=fastback && front ? Array.from({length:16},(_,i)=>[.5*Math.cos(i*Math.PI/8),.5*Math.sin(i*Math.PI/8)]) : outlines;
    const centres=fastback && !front ? [.47,.62,.77] : [hw*(fastback ? .81 : .70)];
    for(const side of [-1,1]) for (const centre of centres) {
      const cx=side*centre;
      const outer=outline.map(([u,v])=>[cx+u*(w+.045),lampY+v*(ht+.045),zz]);
      const inner=outline.map(([u,v])=>[cx+u*w,lampY+v*ht,zz+(front?.008:-.008)]);
      tile=2;inside=[0,.7,0];for(let k=0;k<outline.length;k++){
        const next=(k+1)%outline.length;
        quad(outer[k],outer[next],inner[next],inner[k],tint(fastback ? [42,45,47] : [100,108,112],1));
      }
      for(let k=1;k<outline.length-1;k++)for(const j of [0,k,k+1]){
        lightPos.push(...inner[j]);lightCol.push(1,1,1);
        const [u,v]=outline[j];lampUV.push((front?0:.5)+(.02+(side*u+.5)*(fastback?.32:.46)),.08+(v+.5)*.84);
      }
    }
  }
  if(type==='bus'){tile=1;inside=[0,1.9,4.8];quad([-1.13,1.65,5.325],[1.13,1.65,5.325],[1.13,2.66,5.325],[-1.13,2.66,5.325],[1,1,1]);}
  // The underside, so nothing shows through from a low camera.
  const first = rings[0], last = rings[rings.length - 1], dark = tint(TRIM, 0.6);
  inside = [0, 0.75, 0];
  tile=3;quad(...[first[0],first[5],last[5],last[0]].map(p=>[p[0]*.72,p[1],p[2]]),dark);
  // Wheels: a ten-sided tyre with a paler hub on the outside face.
  const R = body.wheel, hwid = body.width / 2;
  const wheels = [];
  for (const az of body.axles) for (const s of [-1, 1]) {
    const wheelStart=pos.length;
    const xo = s * (hwid - 0.015), xi = s * (hwid - 0.24), n = fastback ? 18 : 12, tyre = tint(TYRE, 1), hub = tint(fastback ? [49,51,52] : HUB, 1);
    inside = [xi, R, az];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * 6.2832, a1 = ((k + 1) / n) * 6.2832, p0 = [Math.cos(a0) * R, R + Math.sin(a0) * R], p1 = [Math.cos(a1) * R, R + Math.sin(a1) * R];
      const o0 = [xo, p0[1], az + p0[0]], o1 = [xo, p1[1], az + p1[0]], i0 = [xi, p0[1], az + p0[0]], i1 = [xi, p1[1], az + p1[0]], c = [xo, R, az];
      tile=3; quad(i0, i1, o1, o0, tyre);
      const rim0=[xo+s*.015,R+Math.sin(a0)*R*.72,az+Math.cos(a0)*R*.72],rim1=[xo+s*.015,R+Math.sin(a1)*R*.72,az+Math.cos(a1)*R*.72];
      quad(o0,o1,rim1,rim0,tint(TYRE,1.2));tri(c,rim0,rim1,tyre);
      const h0 = [xo + s * 0.023, R + Math.sin(a0) * R * 0.65, az + Math.cos(a0) * R * 0.65], h1 = [xo + s * 0.023, R + Math.sin(a1) * R * 0.65, az + Math.cos(a1) * R * 0.65], hc = [xo + s * 0.023, R, az];
      tile=4; tri(hc, h0, h1, hub);
    }
    if (fastback) {
      // The hero's five-spoke wheels use the kit mesh, but turn on their own axles.
      const x=(xi+xo)/2, geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos.splice(wheelStart),3));
      geo.setAttribute('color',new THREE.Float32BufferAttribute(col.splice(wheelStart),3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs.splice(wheelStart/3*2),2));
      geo.translate(-x,-R,-az);geo.computeVertexNormals();
      wheels.push({geo,x,y:R,z:az,front:az>0});
      // Dark backing behind the tyre prevents bright lane paint showing through the arch.
      const back=s*(hwid-.27), well=R+.07;
      tile=3;inside=[0,R,az];
      for(let k=0;k<10;k++){
        const a=k*Math.PI/10,b=(k+1)*Math.PI/10;
        tri([back,R,az],[back,R+well*Math.sin(a),az+well*Math.cos(a)],
          [back,R+well*Math.sin(b),az+well*Math.cos(b)],tint([13,14,15],1));
      }
    }
  }
  // All fittings share the body atlas and are emitted directly into its one mesh.
  const box=(w,h,d,x,y,z,color,t=2)=>{
    tile=t;inside=[x,y,z];const c=tint(color,1),v=[];
    for(const zz of [-1,1])for(const yy of [-1,1])for(const xx of [-1,1])v.push([x+xx*w/2,y+yy*h/2,z+zz*d/2]);
    for(const q of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])quad(...q.map(i=>v[i]),c);
  };
  const decal=(q,t,color=[255,255,255])=>{
    tile=t;explicitUV=new Map(q.map((p,i)=>[p,[(t%4*64+2+[0,60,60,0][i])/256,1-(Math.floor(t/4)*64+2+[60,60,0,0][i])/128]]));
    quad(...q,tint(color,1));explicitUV=null;
  };
  for(const front of [true,false]){
    const z=(front?body.sections[0][0]:body.sections.at(-1)[0])+(front?.025:-.025),y=body.floor+.22;
    box(body.width*.91,.13,.12,0,y-.06,z,TRIM);
    inside=[0,.7,0];
    decal([[-.24,y,z+(front?.07:-.07)],[.24,y,z+(front?.07:-.07)],[.24,y+.12,z+(front?.07:-.07)],[-.24,y+.12,z+(front?.07:-.07)]],6);
    if(front&&!fastback)decal([[-.27,y+.14,z+.015],[.27,y+.14,z+.015],[.27,y+.34,z+.015],[-.27,y+.34,z+.015]],5);
  }
  // Thin aerodynamic mirrors sit at the A pillars, not on the bonnet.
  const cab=body.sections.find(s=>s[3]>0), mirrorZ=cab[0]+.12;
  for(const side of [-1,1]){
    box(.12,.035,.06,side*body.width*.51,body.belt+.12,mirrorZ,TRIM);
    box(.21,.09,.16,side*body.width*.55,body.belt+.15,mirrorZ,paint);
    box(.15,.018,.035,side*.35,body.belt+.07,body.sections[2][0],TRIM);
  }
  // Door handles, silver bumper beads and a small fictional badge share the opaque draw.
  for(const side of [-1,1])for(const z of fastback ? [-.62] : [.05,-.88])box(.045,.035,.19,side*body.width*.503,body.belt-.13,z,fastback ? [37,39,40] : [190,195,194]);
  for(const front of [true,false]){
    const z=(front?body.sections[0][0]:body.sections.at(-1)[0])+(front?.09:-.09);
    box(body.width*.88,.035,.018,0,body.floor+.22,z,fastback ? [42,44,46] : [168,177,180]);
    if(!fastback)box(.085,.065,.02,0,body.floor+.57,z,[204,211,210]);
  }
  if (fastback) {
    const satin=[31,33,34], recess=[12,13,14], lip=[45,47,48];
    // Recessed grille and low chin spoiler between the round sealed-beam lamps.
    box(1.17,.245,.034,0,.62,2.397,recess);
    for (let j=0;j<6;j++) box(1.12,.011,.024,0,.525+j*.038,2.422,lip);
    for (const side of [-1,1]) {
      box(.185,.076,.028,side*.40,.63,2.438,satin);
      box(.151,.053,.012,side*.40,.63,2.456,[86,88,86]);
      for (const level of [.602,.68]) box(.018,.034,.18,side*.914,level,2.17,recess);
    }
    box(1.68,.047,.20,0,.235,2.365,satin);
    // The black tail panel has the round fuel cap between the two banks of lenses.
    box(1.66,.29,.02,0,.67,-2.397,recess);
    for (const {radius,z,colour} of [{radius:.098,z:-2.415,colour:lip},{radius:.079,z:-2.419,colour:satin}]) {
      inside=[0,.68,0];tile=2;
      for (let k=0;k<12;k++) {
        const a=k*Math.PI/6,b=(k+1)*Math.PI/6;
        tri([0,.68,z],[radius*Math.cos(a),.68+radius*Math.sin(a),z],[radius*Math.cos(b),.68+radius*Math.sin(b),z],tint(colour,1));
      }
    }
    // The black shaker rises through the bonnet, with its intake facing forward.
    inside=[0,.95,1.16];tile=2;
    const a=[-.29,.902,1.48], b=[.29,.902,1.48], c=[.24,1.035,1.425], d=[-.24,1.035,1.425];
    const e=[-.245,.9,.84], f=[.245,.9,.84], h=[-.225,.97,.865], j=[.225,.97,.865];
    quad(a,b,c,d,tint(satin,1));quad(d,c,j,h,tint(lip,1));quad(a,d,h,e,tint(satin,1));quad(b,f,j,c,tint(satin,1));quad(e,h,j,f,tint(satin,1));
    box(.415,.04,.012,0,.987,1.452,recess);
    // Seven separate louvers follow the pitch of the backlight. The wing sits
    // clear of the short trunk, on two black pedestals.
    for (let k=0;k<7;k++) {
      const u=(k+.6)/7.4;
      box(1.18+u*.12,.021,.076,0,1.29-.34*u,-.90-.86*u,satin);
    }
    for(const side of [-1,1]) box(.075,.12,.12,side*.48,.962,-2.12,satin);
    box(1.68,.041,.205,0,1.035,-2.14,paint);
    for(const side of [-1,1]) {
      box(.055,.09,1.68,side*.908,.345,-.02,satin);
      box(.145,.075,.155,side*.59,.30,-2.39,recess);
    }
  }
  if(type==='suv'||type==='van')for(const side of [-1,1])box(.045,.06,1.65,side*.63,Math.max(...body.sections.map(s=>s[1]))+.065,-.55,TRIM);
  if(type==='pickup')box(body.width*.77,.05,2.4,0,body.belt+.01,-1.30,[55,56,55],3);
  if(type==='bus'){
    inside=[0,1.8,0];decal([[-.9,2.68,5.34],[.9,2.68,5.34],[.9,2.94,5.34],[-.9,2.94,5.34]],7);
    // Folding passenger doors and a continuous raised roof gutter.
    for(const z of [4.55,.05])for(const dz of [-.24,.24]){
      box(.035,1.75,.44,1.25,1.4,z+dz,[37,45,48]);
      inside=[0,1.4,z];decal([[1.272,1.35,z+dz-.19],[1.272,1.35,z+dz+.19],[1.272,2.2,z+dz+.19],[1.272,2.2,z+dz-.19]],1);
    }
    for(const side of [-1,1])box(.06,.09,10.25,side*1.19,2.89,0,paint);
  }
  if(type==='taxi'||type==='police')box(.62,.16,.26,0,1.55,0,type==='taxi'?[230,193,94]:[75,99,152]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Soften the body: corners that sit in the same place share one normal, unless the panels meet at a hard edge.
  const nrm = geo.attributes.normal, groups = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${Math.round(pos[i * 3] * 200)},${Math.round(pos[i * 3 + 1] * 200)},${Math.round(pos[i * 3 + 2] * 200)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const out = new Float32Array(nrm.array.length), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const list of groups.values()) for (const i of list) {
    a.fromBufferAttribute(nrm, i); const sum = a.clone();
    for (const j of list) { if (j !== i && b.fromBufferAttribute(nrm, j).dot(a) > 0.35) sum.add(b); }
    sum.normalize(); out.set([sum.x, sum.y, sum.z], i * 3);
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('uv',new THREE.Float32BufferAttribute(lampUV,2));
  lights.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
  lights.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
  lights.computeVertexNormals();
  const length = first[0][2] - last[0][2];
  return { geo, lights, wheels, length, width: body.width, noseZ: first[0][2], lampY: body.floor + .415 };
}

export const PAINTS = [[185,28,25], [22,43,85], [238,237,226], [19,80,47], [151,160,171], [236,173,18], [120,19,32], [20,37,62]];

export class Cars {
  // night: headlamps and tail lamps glow. snow: a colour, if snow lies on bonnets and roofs.
  constructor(world, { night = false, snow = null } = {}) {
    this.world = world; this.night = night; this.snow = snow;
    this.lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, map:carLensTexture(), fog: false, side: THREE.DoubleSide });
    this.cache = new Map();
  }

  // paint: [r, g, b], or leave it out for a colour picked from PAINTS by position.
  // solid: you cannot walk through it. lights: false switches the lamps off at night (a parked car).
  add(type, x, z, heading = 0, paint = null, { solid = false, lights = true, snow = this.snow, shadow = true } = {}) {
    paint ??= type==='mustang'?[25,26,27]:type==='taxi'?[240,180,16]:type==='police'?[235,235,235]:null;
    paint ??= PAINTS[Math.floor(hash(Math.round(x * 7), Math.round(z * 7), 3) * PAINTS.length)];
    const key = `${type}|${paint}|${snow}`;
    if (!this.cache.has(key)) this.cache.set(key, buildGeometry(type, paint, snow));
    const part = this.cache.get(key), car = new THREE.Group();
    const finish = {vertexColors:true,map:carAtlas(type),emissive:this.night?0x20232a:0x000000,emissiveIntensity:.4};
    const material = type==='mustang' ? new THREE.MeshPhongMaterial({...finish,specular:0x282c31,shininess:62}) : new THREE.MeshLambertMaterial(finish);
    car.add(new THREE.Mesh(part.geo, material), new THREE.Mesh(part.lights, this.night&&lights?this.lampMat:new THREE.MeshLambertMaterial({vertexColors:true,map:carLensTexture(),side:THREE.DoubleSide})));
    if (part.wheels.length) {
      const satin = new THREE.MeshPhongMaterial({...finish,specular:0x202223,shininess:25});
      for (const wheel of part.wheels) {
        const mesh=new THREE.Mesh(wheel.geo,satin);
        mesh.position.set(wheel.x,wheel.y,wheel.z);mesh.rotation.order='YXZ';
        mesh.userData.tyreRadius=wheel.y;mesh.userData.frontAxle=wheel.front;car.add(mesh);
      }
    }
    if(shadow){
      const patch=new THREE.Mesh(new THREE.PlaneGeometry(part.width+.9,part.length+.9),new THREE.MeshBasicMaterial({map:carShadowTexture(),color:0x000000,transparent:true,opacity:.78,depthWrite:false,fog:false}));
      // The kit contact is required even when the engine attenuates optional painted shadows.
      patch.material.userData.fadedForShadows=true;
      patch.rotation.x=-Math.PI/2;patch.position.set(0,.03,part.noseZ-part.length/2);patch.renderOrder=55;car.add(patch);
    }
    // Night effects are batched: one lens-halo mesh and one road pool, never per-lamp sprites.
    if(this.night&&lights){
      const p=[],c=[],uv=[];
      for(const front of [true,false])for(const side of [-1,1]){
        const x=side*part.width*.36,y=part.lampY,z=front?part.noseZ+.08:part.noseZ-part.length-.08,r=front?.25:.17;
        const q=[[x-r,y-r,z],[x+r,y-r,z],[x+r,y+r,z],[x-r,y+r,z]];
        for(const i of [0,1,2,0,2,3]){p.push(...q[i]);c.push(...(front?[1,.85,.58]:[1,.045,.015]));uv.push(...[[0,0],[1,0],[1,1],[0,1]][i]);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      car.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:softTexture(),vertexColors:true,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide})));
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(part.width*1.9,6),new THREE.MeshBasicMaterial({map:softTexture(),color:0xe6d4a3,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(0,.035,part.noseZ+2.5);car.add(pool);
    }
    car.position.set(x, this.world.ground(x, z), z); car.rotation.y = heading;
    car.userData = { type, length: part.length, width: part.width };
    this.world.scene.add(car);
    if (solid) {
      const c = Math.abs(Math.cos(heading)), s = Math.abs(Math.sin(heading)), hx = (part.width * c + part.length * s) / 2, hz = (part.width * s + part.length * c) / 2;
      this.world.wall(x - hx, x + hx, z - hz, z + hz, 1.6);
    }
    return car;
  }

  // A row of parked cars from (x0, z0) to (x1, z1), all facing along the row, with small gaps and mixed types.
  park(x0, z0, x1, z1, { types = ['sedan', 'hatch', 'suv', 'sedan', 'pickup', 'hatch', 'van'], gap = 1.1, flip = false, solid = true } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0); if(len<.001)return []; const ux = (x1 - x0) / len, uz = (z1 - z0) / len, heading = Math.atan2(ux, uz) + (flip ? Math.PI : 0), made = [];
    for (let d = 0, i = 0; d < len; i++) {
      const type = types[Math.floor(hash(i, Math.round(x0 + z0), 9) * types.length)], L = BODIES[type].sections[0][0] - BODIES[type].sections.at(-1)[0];
      if (d + L > len) break;
      if (hash(i, Math.round(x0 * 3 + z0), 11) > 0.18) made.push(this.add(type, x0 + ux * (d + L / 2), z0 + uz * (d + L / 2), heading, null, { solid, lights: false })); // now and then an empty space
      d += L + gap + hash(i, 5, 13) * 0.6;
    }
    return made;
  }

  // Traffic that drives back and forth along a line and turns round at each end.
  drive(type, x0, z0, x1, z1, speed = 9, headStart = 0, paint = null) {
    const car = this.add(type, x0, z0, 0, paint), len = Math.hypot(x1 - x0, z1 - z0), heading = Math.atan2(x1 - x0, z1 - z0);
    if (len < 0.001) return car;
    this.world.ticks.push((t) => {
      const lap = ((t * speed + headStart) % (len * 2)) / len, k = lap < 1 ? lap : 2 - lap, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
      car.position.set(x, this.world.ground(x, z), z); car.rotation.y = lap < 1 ? heading : heading + Math.PI;
    });
    return car;
  }
}
