// Cast shadows from each chapter's main light, so people, trees, cars and buildings sit on the ground
// and every scene has one clear light direction.
// The game calls castShadows(world) once when a chapter opens, and the function it returns once a frame.
// A chapter can tune this by setting world.shadow before it returns:
//   world.shadow = false                         no cast shadows in this chapter
//   world.shadow = { range: 45, size: 4096 }     range: metres around the player that get shadows. size: shadow map pixels.
//   world.shadow.soft = 5                        how wide the soft edge of a shadow is, in shadow-map pixels. The reference
//                                                 clips have soft shade under things, never a crisp outline.
//   world.shadow.keepPainted = true              leave painted round shadows (Bake.shadow, tree and figure blobs) as they are.
//                                                 By default they are faded, because the real shadows replace them.
import * as THREE from 'three';

const DEFAULTS = { range: 45, size: 4096, soft: 5, keepPainted: false, paintedOpacity: 0.35 };

export function castShadows(world) {
  if (world.shadow === false) return () => {};
  const opt = { ...DEFAULTS, ...(world.shadow || {}) };
  const sun = world.scene.children.find((o) => o.isDirectionalLight);
  if (!sun) return () => {};

  const dir = sun.position.clone().normalize();          // points from the ground toward the light
  sun.castShadow = true;
  sun.shadow.mapSize.set(opt.size, opt.size);
  const cam = sun.shadow.camera;
  cam.left = -opt.range; cam.right = opt.range; cam.top = opt.range; cam.bottom = -opt.range; cam.near = 1; cam.far = 700;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06; sun.shadow.radius = opt.soft;
  world.scene.add(sun.target);

  const inSky = (o) => { for (let p = o; p; p = p.parent) if (p === world.sky) return true; return false; };
  world.scene.traverse((o) => {
    if (!o.isMesh || inSky(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Decals, glows, clouds and painted light never cast or receive.
    const flat = mats.some((m) => !m || m.depthWrite === false || m.blending === THREE.AdditiveBlending || (m.transparent && !m.alphaTest));
    if (flat) {
      // A black decal is a painted shadow. Fade it so it reads as contact shade under the real one.
      const m = mats[0];
      if (!opt.keepPainted && m && m.isMeshBasicMaterial && m.color.getHex() === 0 && m.transparent && !m.vertexColors && !m.userData.fadedForShadows) {
        m.opacity *= opt.paintedOpacity; m.userData.fadedForShadows = true;
      }
      return;
    }
    if (mats.every((m) => m.fog === false)) return;       // unlit backdrops, lamp heads, screens
    o.castShadow = true; o.receiveShadow = true;
  });

  // Keep the shadow map centred on the player, moving it in whole texels so shadow edges do not crawl.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();
  const texel = (opt.range * 2) / opt.size, centre = new THREE.Vector3();
  return (focus) => {
    const r = Math.round(focus.dot(right) / texel) * texel, u = Math.round(focus.dot(up) / texel) * texel, d = focus.dot(dir);
    centre.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(dir, d);
    sun.target.position.copy(centre); sun.target.updateMatrixWorld();
    sun.position.copy(centre).addScaledVector(dir, 300);
  };
}
