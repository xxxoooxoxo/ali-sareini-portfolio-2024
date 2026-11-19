// Pick the visible geometry, rather than the taller, simplified walls used for
// walking. Narrow each shot to a corridor before following its short flight.
import * as THREE from 'three';
import { drawTex } from 'life/engine/look.js';

const corner=new THREE.Vector3(), bounds=new THREE.Box3(), entryPoint=new THREE.Vector3();
const pages=new WeakMap();
const solid=mat=>mat && mat.visible && (mat.depthWrite || mat.userData.shotSurface) && mat.opacity>.05;

// Chapter scenery is often batched by material. A wall at one end of a batch
// shouldn't require intersecting every triangle at the other end of the map.
function parts(geometry) {
  const count=geometry.index?.count ?? geometry.attributes.position.count;
  if(count<4608 || geometry.drawRange.start!==0 || geometry.drawRange.count<count)return null;
  if(pages.has(geometry))return pages.get(geometry);
  const list=[],positions=geometry.attributes.position;
  for(let start=0;start<count;start+=768){
    const part=new THREE.BufferGeometry(), end=Math.min(count,start+768);
    part.setAttribute('position',positions);part.setIndex(geometry.index);
    part.setDrawRange(start,end-start);part.boundingBox=new THREE.Box3();
    for(let i=start;i<end;i++){
      const j=geometry.index ? geometry.index.getX(i) : i;
      part.boundingBox.expandByPoint(corner.fromBufferAttribute(positions,j));
    }
    part.boundingSphere=part.boundingBox.getBoundingSphere(new THREE.Sphere());list.push(part);
  }
  pages.set(geometry,list);return list;
}

function reaches(ray,box,limitSquared) {
  return box.containsPoint(ray.origin) || (ray.intersectBox(box,entryPoint)!==null &&
    entryPoint.distanceToSquared(ray.origin)<=limitSquared);
}

export function makeSceneryProbe(world, effects) {
  const objects=[],caster=new THREE.Raycaster(), hits=[], pageMesh=new THREE.Mesh();
  function visit(o,moving=false) {
    if(o===effects || o===world.sky || o.isSkinnedMesh || o.userData.lookKey!==undefined || o.userData.noShot)return;
    moving ||= !!(o.userData.sfMoving || o.userData.keepAnimated);
    if(o.isMesh && [].concat(o.material).some(solid)){
      const shape=o.isInstancedMesh ? o : o.geometry;
      if(!shape.boundingBox)shape.computeBoundingBox();
      objects.push({o,shape,moving,box:new THREE.Box3()});
    }
    for(const child of o.children)visit(child,moving);
  }
  visit(world.scene);
  return {
    select(ray,length,margin,out){
      out.length=0;
      for(const item of objects){
        const {o,shape,box}=item;
        let parent=o;
        while(parent && parent.visible)parent=parent.parent;
        if(parent)continue;
        o.updateWorldMatrix(true,false);
        box.copy(shape.boundingBox).applyMatrix4(o.matrixWorld);
        if((margin>0 && item.moving) || reaches(ray,bounds.copy(box).expandByScalar(margin),(length+margin)**2))out.push(item);
      }
    },
    cast(ray,length,items,end) {
      caster.ray.copy(ray);caster.near=0;caster.far=length;
      let first=null;
      for(const {o,box,shape,moving} of items){
        if(moving){
          o.updateWorldMatrix(true,false);
          box.copy(shape.boundingBox).applyMatrix4(o.matrixWorld);
        }
        if(!reaches(ray,box,caster.far**2))continue;
        hits.length=0;
        const slices=!o.isInstancedMesh && !Array.isArray(o.material) && parts(o.geometry);
        if(slices){
          pageMesh.material=o.material;pageMesh.matrixWorld.copy(o.matrixWorld);
          for(const part of slices){
            if(!reaches(ray,bounds.copy(part.boundingBox).applyMatrix4(o.matrixWorld),caster.far**2))continue;
            pageMesh.geometry=part;pageMesh.raycast(caster,hits);
          }
        } else o.raycast(caster,hits);
        for(const hit of hits){
          if(hit.distance>caster.far || !solid(Array.isArray(o.material)?o.material[hit.face.materialIndex]:o.material))continue;
          hit.object=o;first=hit;caster.far=hit.distance;
        }
      }
      ray.at(caster.far,end);return first;
    },
  };
}

export function makeImpactMarks(group) {
  const geo=new THREE.PlaneGeometry(1,1);
  const scuff=drawTex(32,32,g=>{
    g.fillStyle='#b8afa3';g.beginPath();g.moveTo(3,14);g.lineTo(11,7);g.lineTo(20,4);g.lineTo(27,15);
    g.lineTo(23,23);g.lineTo(13,27);g.lineTo(6,22);g.closePath();g.fill();
    g.fillStyle='#3d3b3e';g.beginPath();g.ellipse(15,15,9,7,-.5,0,Math.PI*2);g.fill();
    g.fillStyle='#6b625b';g.fillRect(21,17,3,3);g.fillRect(4,9,3,2);
  });
  const ripple=drawTex(32,32,g=>{
    g.strokeStyle='#e8f5ed';g.lineWidth=2;g.beginPath();g.arc(16,16,13,0,Math.PI*2);g.stroke();
  });
  const marks=Array.from({length:18},()=>{
    const mat=new THREE.MeshBasicMaterial({map:scuff,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
    const mesh=new THREE.Mesh(geo,mat);mesh.name='Scenery impact';mesh.renderOrder=66;mesh.visible=false;group.add(mesh);
    return {mesh,local:new THREE.Vector3(),normal:new THREE.Vector3(),anchor:null,instance:undefined,age:0,water:false};
  });
  const matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),inverse=new THREE.Matrix4();
  const normalMatrix=new THREE.Matrix3(), normal=new THREE.Vector3(), front=new THREE.Vector3(0,0,1);
  function transform(m){
    m.anchor.updateWorldMatrix(true,false);matrix.copy(m.anchor.matrixWorld);
    if(m.instance!==undefined){m.anchor.getMatrixAt(m.instance,instance);matrix.multiply(instance);}
  }
  let next=0;
  function clear(){for(const m of marks){m.anchor=null;m.mesh.visible=false;}}
  return {
    clear,
    add(hit,ray,sound){
      const m=marks[next];next=(next+1)%marks.length;
      m.anchor=hit.object;m.instance=hit.instanceId;m.age=0;transform(m);
      m.local.copy(hit.point).applyMatrix4(inverse.copy(matrix).invert());
      m.normal.copy(hit.face.normal);
      if(normal.copy(m.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(matrix)).dot(ray.direction)>0)m.normal.negate();
      const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      m.water=material.userData.shotSurface==='water';
      m.mesh.userData.surface=m.water?'water':'solid';
      m.mesh.material.map=m.water?ripple:scuff;
      if(m.water)sound.splash(1);
      return m.water;
    },
    update(dt){
      for(const m of marks){
        if(!m.anchor)continue;
        m.age+=dt;const life=m.water ? .65 : 8;
        if(m.age>life){m.anchor=null;m.mesh.visible=false;continue;}
        transform(m);normal.copy(m.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(matrix));
        m.mesh.visible=true;m.mesh.position.copy(m.local).applyMatrix4(matrix).addScaledVector(normal,.015);
        m.mesh.quaternion.setFromUnitVectors(front,normal);
        m.mesh.scale.setScalar(m.water ? .16+m.age*1.8 : .17);
        m.mesh.material.opacity=m.water?1-m.age/life:Math.min(.92,life-m.age);
      }
    },
  };
}
