import * as THREE from 'three';

// Draw the world once, then composite its low-resolution picture. Highlights bleed a few
// picture pixels, while HUD lettering stays at the display's native resolution.
export function makeConsoleFrame(renderer) {
  const picture = new THREE.WebGLRenderTarget(1,1,{ depthBuffer:true, stencilBuffer:false });
  picture.samples = Math.min(renderer.capabilities.maxSamples ?? 0,4);
  const uniforms = {
    picture:{ value:picture.texture }, texel:{ value:new THREE.Vector2() },
    multiply:{ value:new THREE.Vector3(1,1,1) }, lift:{ value:new THREE.Vector3() },
  };
  const composite = new THREE.ShaderMaterial({
    uniforms, depthTest:false, depthWrite:false,
    vertexShader: `varying vec2 at;
      void main() { at = uv; gl_Position = vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform sampler2D picture; uniform vec2 texel; uniform vec3 multiply, lift;
      varying vec2 at;
      const vec3 luma = vec3(.299,.587,.114);
      vec3 hot(vec2 offset) {
        vec3 c = texture2D(picture,at + offset*texel).rgb;
        return c * smoothstep(.65,.93,dot(c,luma));
      }
      float bayer2(vec2 p) { vec2 q = mod(floor(p),2.); return 2.*q.x+3.*q.y-4.*q.x*q.y; }
      void main() {
        vec3 c = texture2D(picture,at).rgb * multiply + lift;
        vec3 halo = hot(vec2(-2.5,-1.5)) + hot(vec2(1.5,-2.5))
                  + hot(vec2(2.5,1.5)) + hot(vec2(-1.5,2.5));
        c += halo*.055*(1.-clamp(c,0.,1.));
        c = mix(vec3(dot(c,luma)),c,1.075);
        vec2 edge = at*2.-1.;
        c *= 1.-.085*smoothstep(.22,1.8,dot(edge,edge));
        // Static ordered dithering in picture pixels, including on a resized portrait screen.
        float d = (4.*bayer2(gl_FragCoord.xy)+bayer2(floor(gl_FragCoord.xy*.5))+.5)/16.;
        c = clamp(c,0.,1.);
        gl_FragColor = vec4(mix(c,floor(c*63.+d)/63.,.60),1.);
      }`,
  });
  const output = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2),composite);
  quad.frustumCulled = false; output.add(quad);
  const camera = new THREE.Camera();
  return (world, view) => {
    const { width, height } = renderer.domElement;
    if (picture.width !== width || picture.height !== height) {
      picture.setSize(width,height); uniforms.texel.value.set(1/width,1/height);
    }
    // The bay's grade changes as the camera leaves the fog on the rocks.
    const grade = typeof world.grade === 'function' ? world.grade(view.position) : world.grade;
    const tint = uniforms.multiply.value.fromArray(grade?.multiply ?? [255,255,255]).divideScalar(255);
    const lift = uniforms.lift.value.fromArray(grade?.add ?? [0,0,0]).divideScalar(255);
    if (world.gradeNow) { world.gradeNow.multiply.copy(tint); world.gradeNow.add.copy(lift); }
    renderer.setRenderTarget(picture); renderer.render(world.scene,view);
    renderer.setRenderTarget(null); renderer.render(output,camera);
  };
}
