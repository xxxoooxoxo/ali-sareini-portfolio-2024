// The game itself: one renderer, one player, and whichever chapter is open.
// boot() takes one builder per playable chapter, so a test page can run a single chapter on its own.
import * as THREE from 'three';
import { RENDER_W, RENDER_H, makeRenderer, drawTex } from './engine/look.js';
import { makeInput, Player, FollowCamera } from './engine/player.js';
import { nearestInteraction } from './engine/interactions.js';
import { plantedFoot } from './engine/movement.js';
import { addCheckpoint } from './engine/checkpoint.js';
import { makeConsoleFrame } from './engine/console-frame.js';
import { makeWeapons, weaponNames } from './engine/blasters.js';
import { makeCrowdReactions } from './engine/crowd-reactions.js';
import { makeCatToss } from './engine/cat-toss.js';
import { CAT_TOSS } from './engine/weapon-models.js';
import { createCombat } from './engine/combat.js';
import { makeInventory } from './engine/inventory.js';
import { makeSiteHud } from './site/hud.js';
import { makeLoadingScreen } from './site/loading.js';
import { makeWorldAudio } from './engine/world-audio.js';
import { castShadows } from './engine/shadows.js';
import { chapters, you, wardrobe, souvenirs } from './story.js';

// BUILDERS: { chapterId: buildFunction }. A chapter without one shows a "not built yet" card.
export async function boot(BUILDERS) {
  const first = Math.max(0, chapters.findIndex(chapter => BUILDERS[chapter.id]));
  const loading = makeLoadingScreen(document.getElementById('stage'));
  try {
    await loading.show(chapters[first], first);
    startGame(BUILDERS, first, loading);
  } catch (error) {
    loading.fail(error);
  }
}

function startGame(BUILDERS, first, loading) {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const renderer = makeRenderer(stage);
  const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const softwareRenderer=debugRenderer&&/swiftshader|llvmpipe|software/i.test(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL));
  renderer.shadowMap.enabled = !softwareRenderer; renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(60, RENDER_W / RENDER_H, 0.25, 4000);
  // Match the viewport's aspect while keeping the original low-resolution pixel budget.
  // An establishing shot can ask for its own zoom in the wide picture (world.opening.wideZoom; 1 keeps the tall
  // picture's full height in view, for a shot built around something tall).
  const WIDE_ZOOM = 1.2;
  let wide = false;
  const zoomFor = (z = WIDE_ZOOM) => (wide ? z : 1);
  function fit() {
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    wide = width > height;
    const scale = Math.min(1, Math.sqrt(RENDER_W * RENDER_H / (width * height)));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    stage.dataset.shape = wide ? 'wide' : 'tall';
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false);
    camera.aspect = width / height; camera.zoom = zoomFor(); camera.updateProjectionMatrix();
    stage.style.setProperty('--u', height / h + 'px');
  }
  fit();
  // The fullscreen button also removes the browser chrome.
  const toggleFull = () => {
    const root = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root)?.catch?.(() => {});
  };
  let weapons = null;
  const input = makeInput(stage, () => $('hint').classList.add('off'), weaponNames, (enabled, wasArmed) => {
    if (!weapons || !world) return;
    if (enabled) weapons.attach(world.scene);
    else {
      weapons.detach();
      if (wasArmed) player.sync(0);
      draw();
    }
  });
  let catToss=null;
  const sound = makeWorldAudio(stage);
  if (matchMedia('(pointer: coarse)').matches) $('hint').innerHTML = 'Drag left to move · drag right to look<br>Tap a marked action or Punch';
  const chapterHint=$('hint').innerHTML;
  const player = new Player(you), rig = new FollowCamera(camera);
  const caption = $('caption'), band = document.createElement('small'), captionText = document.createElement('span');
  caption.replaceChildren(band, captionText); caption.setAttribute('role','status');
  let captionUntil = 0, lastSpot = null;

  let world = null, current = -1, time = 0, atExit = false, cardTimer = 0, moveShadows = (_position) => {}, driving = null;
  let riding = null, combat = null;
  let dismountHintUntil = 0;
  const parkAction = { label: 'Park car' };
  const dismountAction = { label: 'Get off bike' };
  const inventory = makeInventory(souvenirs);
  const hud = makeSiteHud(stage, {
    firearms:input.firearms,
    sound, inventory,
    playable: id => Boolean(BUILDERS[id]),
    visit: index => travel(index),
    drive: driveFromPhone,
    pause: paused => {
      sound.setPaused(paused);
      input.suspended = paused;
      input.reset();
      input.offerInteraction(null);
    },
  });

  // A small pixel bubble above the object catches your eye on approach.
  // The action button appears within reach. The gold diamond still marks the exit.
  const bubble = drawTex(24, 16, (g) => {
    g.fillStyle = '#252625'; g.fillRect(1, 1, 22, 10); g.fillRect(9, 11, 6, 2); g.fillRect(11, 13, 2, 2);
    g.fillStyle = '#fff2d2';
    for (const x of [5, 11, 17]) g.fillRect(x, 5, 2, 2);
  });
  bubble.magFilter = THREE.NearestFilter;
  const musicMark = drawTex(24,16,g => {
    g.fillStyle = '#272529'; g.fillRect(3,0,18,14); g.fillRect(9,14,5,2);
    g.fillStyle = '#ffce82'; g.fillRect(9,3,8,2); g.fillRect(9,4,2,6); g.fillRect(15,4,2,5);
    g.fillRect(6,9,5,2); g.fillRect(12,8,5,2);
  });
  musicMark.magFilter = THREE.NearestFilter;
  const actionMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubble, depthWrite: false, fog: false }));
  actionMark.scale.set(.68, .45, 1);

  const composeFrame = makeConsoleFrame(renderer);
  // The city circuit is its own scene, drawn through the same console frame.
  const draw = () => composeFrame(driving ? { scene: driving.scene } : world, camera);

  // Keeps textures sharp where a surface runs away from the camera: paths, roads, lawns, long walls.
  // world.sharpness sets how far it goes (1 is off, 16 the most). It does not add detail up close.
  function sharpen(level = world.sharpness ?? 8) {
    const n = Math.min(level, renderer.capabilities.getMaxAnisotropy());
    world.scene.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) for (const key of ['map', 'emissiveMap', 'alphaMap']) {
        const t = m[key];
        if (t && !t.userData.soft && t.anisotropy !== n) { t.anisotropy = n; t.needsUpdate = true; }   // a texture marked soft is meant to blur with distance
      }
    });
  }

  // A tight dark shadow under every person, the way consoles of that era grounded their characters. It follows walkers.
  // world.contact sets its strength (0 to 1, default 0.5; 0 turns it off). A chapter that bakes people into plain
  // meshes lists them in world.contacts as [x, y, z, size] to get the same shadow. All of them are one draw call.
  const contactGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const contactTex = drawTex(64, 64, (g) => {
    const fade = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(0.4, 'rgba(255,255,255,0.7)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, 64, 64); g.fillStyle = fade; g.fillRect(0, 0, 64, 64);
  });
  function groundPeople() {
    const strength = world.contact ?? 0.34, people = [], fixed = world.contacts ?? [];
    world.scene.traverse((o) => { if (o.userData.lookKey !== undefined) people.push(o); });
    if (!strength || !(people.length + fixed.length)) return;
    const mat = new THREE.MeshBasicMaterial({ map: contactTex, color: 0x000000, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.userData.fadedForShadows = true;   // cast shadows leave it at full strength
    const blobs = new THREE.InstancedMesh(contactGeo, mat, people.length + fixed.length);
    blobs.frustumCulled = false; blobs.renderOrder = 60; world.scene.add(blobs);   // after every painted ground overlay, or a light pool or snow wash drawn later covers the shadow
    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    fixed.forEach(([x, y, z, s = 1], i) => blobs.setMatrixAt(people.length + i, m4.compose(pos.set(x, y + 0.09, z), turn.identity(), size.set(1.0 * s, 1, 0.75 * s))));
    const follow = () => {
      people.forEach((root, i) => {
        const lift=root===player.figure.root?Math.max(0,player.pos.y-player.supportY):0;
        const s = root.visible && root.parent ? root.scale.y/(1+lift*.4) : 0;
        pos.setFromMatrixPosition(root.matrixWorld);
        if(root===player.figure.root)pos.y=player.supportY;
        pos.y += 0.09;   // above path, leaf and snow overlays, which lie up to eight centimetres over the ground
        blobs.setMatrixAt(i, m4.compose(pos, turn.setFromAxisAngle(UP, root.rotation.y), size.set(1.0 * s, 1, 0.75 * s)));
      });
      blobs.instanceMatrix.needsUpdate = true;
    };
    world.scene.updateMatrixWorld(); follow(); world.ticks.push(follow);
  }

  // Nobody can be walked through. A chapter gives most bystanders an obstacle; this covers the ones it missed.
  function blockPeople() {
    const walking = new Set((world.walkers ?? []).map((w) => w.root)), at = new THREE.Vector3();
    world.scene.updateMatrixWorld();
    world.scene.traverse((o) => {
      if (o.userData.lookKey === undefined || o === player.figure.root || walking.has(o)) return;
      at.setFromMatrixPosition(o.matrixWorld);
      if (!world.blocked(at.x, at.z, 0.05, 0.5)) world.post(at.x, at.z, 0.3, 1.9);
    });
  }

  // A fill light for people only. world.peopleFill = [r, g, b] (0 to 255) adds that much of each person's own colours
  // back in, so that at night they read as people in coats and not as black shapes. It leaves the scenery alone.
  function fillPeople() {
    const fill = world.peopleFill;
    world.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m.emissive) continue;
        m.emissive.setRGB(...(fill ?? [0, 0, 0]).map((v) => v / 255)); m.emissiveMap = fill ? m.map : null; m.needsUpdate = true;
      }
    });
  }

  // The establishing shot. A chapter may set world.opening = { pos: [x, y, z], look: [x, y, z], drift: [dx, dy, dz],
  // lookDrift: [dx, dy, dz], seconds: 5, fov: 50 } (drift moves the camera over the shot, lookDrift moves what it looks at): the chapter then opens on that fixed view, drifting slowly, the way the reference clips
  // frame a place. It ends when you move or look, or after `seconds`, and eases into the camera behind you.
  const shot = { on: false, held: false, t: 0, blend: 1, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
  const from = new THREE.Vector3(), aim = new THREE.Vector3();
  function startOpening(hold = false) {
    shot.on = !!world.opening; shot.held = hold; shot.t = 0; shot.blend = shot.on ? 0 : 1;
    input.lookX = input.lookY = 0;
  }
  function frameOpening(dt) {
    const o = world.opening, seconds = o.seconds ?? 5, drift = o.drift ?? [0, 0, 0], turn = o.lookDrift ?? [0, 0, 0];
    if (shot.on) {
      if (!shot.held) shot.t += dt;
      const { ahead, right } = input.axes();
      if (!shot.held && (shot.t > seconds || ahead || right || input.lookX || input.lookY)) shot.on = false;
      const k = Math.min(1, shot.t / seconds);
      from.set(o.pos[0] + drift[0] * k, o.pos[1] + drift[1] * k, o.pos[2] + drift[2] * k);
      camera.position.copy(from); camera.lookAt(aim.set(o.look[0] + turn[0] * k, o.look[1] + turn[1] * k, o.look[2] + turn[2] * k));
      shot.pos.copy(camera.position); shot.quat.copy(camera.quaternion); shot.fov = o.fov ?? world.fov;
      const zoom = zoomFor(o.wideZoom);
      if (camera.fov !== shot.fov || camera.zoom !== zoom) { camera.fov = shot.fov; camera.zoom = zoom; camera.updateProjectionMatrix(); }
      input.lookX = input.lookY = 0;
      return;
    }
    // Ease from where the shot ended to the camera behind the player, which rig.update has just placed.
    shot.blend = Math.min(1, shot.blend + dt / 1.4);
    const e = shot.blend * shot.blend * (3 - 2 * shot.blend);
    camera.position.lerpVectors(shot.pos, camera.position, e);
    camera.quaternion.slerpQuaternions(shot.quat, camera.quaternion, e);
    camera.fov = shot.fov + (world.fov - shot.fov) * e;
    camera.zoom = zoomFor(o.wideZoom) + (zoomFor() - zoomFor(o.wideZoom)) * e; camera.updateProjectionMatrix();
  }

  // While the shot holds you stroll ahead, so the frame has someone walking in it and not a figure standing to attention.
  // world.opening.stroll is the speed in metres a second (default 1.2; 0 keeps you still).
  function stroll(dt) {
    const speed = world.opening.stroll ?? 1.2;
    if (!speed) return;
    player.moving = 0.55; player.speed = speed; player.running = false;
    if (shot.held) { player.phase = 1.2; return; }   // a held frame catches you mid-stride
    const x = player.pos.x + Math.sin(player.heading) * speed * dt, z = player.pos.z + Math.cos(player.heading) * speed * dt;
    if (world.blocked(x, z, 0.35)) { player.moving = 0; player.speed = 0; return; }
    player.pos.set(x, world.ground(x, z), z);player.motor.supportY=player.pos.y;
    player.phase += speed * dt * player.phaseRate(speed);
  }

  // The title card: a small line, a big line, a small line.
  function card(top, main, sub, seconds = 4) {
    $('title-top').textContent = top; $('title-main').textContent = main; $('title-sub').textContent = sub;
    $('title').classList.remove('off');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => $('title').classList.add('off'), seconds * 1000);
  }

  function showCaption(text, overline = '') {
    captionText.textContent = text; band.textContent = overline;
    caption.classList.remove('off'); captionUntil = time+3.2;
  }
  function tuneRadio() {
    sound.tune();
    const station = sound.station;
    world.radio.setStation(station);
    input.setFrequency(station);
    if (driving) $('title').classList.add('off');
    showCaption(station?.name ?? 'Radio off', station ? station.frequency.toFixed(1)+' FM' : '');
  }

  function open(index) {
    catToss?.dispose();catToss=null;
    $('hint').innerHTML=chapterHint;
    const chapter = chapters[index];
    if (riding) leaveBike(true);
    if (driving) leaveCar();
    combat?.reset();
    input.consumePunch();
    world = BUILDERS[chapter.id]({ onStoneImpact: sound.splash, onDrive: enterCar, inventory }); current = index; atExit = false;
    world.onRideBike = mountBike;
    input.selectGear(0);
    if (input.firearms.enabled) weapons?.attach(world.scene);
    sound.enter(chapter.id, world.radio?.position);
    if (world.radio) {
      const { x,y,z } = world.radio.position;
      world.radio.setStation(sound.station);
      input.setFrequency(sound.station);
      world.interactions.push({ x, y:y+.85, z, r:2.35, kind:'radio',
        get label() { return sound.station ? 'Tune radio · '+sound.station.frequency.toFixed(1) : 'Switch on radio'; },
        act:tuneRadio });
    }
    addCheckpoint(world);
    lastSpot = null; captionUntil = 0; caption.classList.add('off');
    stage.style.setProperty('--chapter-ink', chapter.ink);
    hud.setChapter(index);
    input.offerInteraction(null);
    actionMark.visible = false;
    world.scene.add(actionMark);
    player.dress({ ...you, ...wardrobe[chapter.id] });
    world.scene.add(player.figure.root);
    moveShadows = castShadows(world);
    fillPeople();
    groundPeople();
    blockPeople();
    world.scene.traverse((o) => o.userData.figure?.settleFeet?.(world.ground));   // people who sit on steps or slopes rest their feet on them
    world.crowd=makeCrowdReactions(world,player.figure.root);
    const crowd=world.crowd;
    world.ticks.unshift((_t,dt)=>crowd.update(dt));
    sharpen();
    world.you = player.pos;
    camera.fov = world.fov; camera.zoom = zoomFor(); camera.far = world.far; camera.updateProjectionMatrix();
    player.place(world.start, world);player.motor.jumpHeld=Boolean(input.axes().jump);input.consumeJump();
    combat = createCombat(world, player);
    rig.yaw = world.start.camYaw; rig.pitch = world.start.camPitch;rig.reset(player);
    startOpening();
    card(`Chapter ${String(index+1).padStart(2,'0')} / ${chapter.name}`, chapter.title, chapter.sub, 5);
  }

  async function fadeTo(change, chapterIndex) {
    if ($('fade').classList.contains('on')) return;
    input.selectGear(0); weapons?.clear();catToss?.clear();
    combat?.reset();
    input.consumePunch();
    input.offerInteraction(null);
    actionMark.visible = false;
    caption.classList.add('off'); captionUntil = 0;
    $('fade').classList.add('on');
    hud.setTraveling(true);
    try {
      if (chapterIndex === undefined) {
        await new Promise(resolve => setTimeout(resolve, 550));
        change();
      } else {
        input.reset();
        input.suspended = true;
        await loading.show(chapters[chapterIndex], chapterIndex);
        change();
        update(0);
        draw();
        loading.finish();
        input.suspended = false;
      }
      $('fade').classList.remove('on');
      hud.setTraveling(false);
    } catch (error) {
      loading.fail(error);
    }
  }

  function mountBike(bike) {
    if (riding || driving || !bike.mount(player)) return;
    combat.reset();
    input.selectGear(0); weapons?.clear(); catToss?.clear();
    riding = bike;
    input.setVehicle('bike');
    rig.yaw = player.heading - Math.PI / 2;
    rig.reset(player);
  }

  function leaveBike(force = false) {
    if (!riding.dismount(force)) {
      dismountAction.label = 'Ride to a clear spot';
      dismountHintUntil = time + 1.5;
      return;
    }
    riding = null;
    dismountAction.label = 'Get off bike';
    input.setVehicle(null);
    rig.reset(player);
  }

  function startDrive() {
    driving = world.drive;
    shot.on = false; shot.blend = 1;
    player.figure.root.visible = false;
    input.setVehicle('car'); hud.setDriving(true); sound.setDriving(true);
    camera.fov = 65; camera.zoom = zoomFor(); camera.updateProjectionMatrix();
    driving.start(camera); hud.updateDrive(0, 1);
    const help = input.touch ? 'Hold Gas to drive · arrows to steer' : 'W / S gas and brake · A / D steer';
    card('1970 mustang', 'San Francisco City Drive', help, 3);
  }

  function enterCar() {
    if (!driving && world.drive) fadeTo(startDrive);
  }

  function driveFromPhone() {
    if (driving) return; // Closing the phone resumes the same lap.
    const index = chapters.findIndex(chapter => chapter.id === 'sf');
    if (!BUILDERS.sf) return;
    fadeTo(() => {
      if (riding) leaveBike(true);
      if (current !== index) open(index);
      const { x, z } = world.exit, car = world.drive.car;
      const heading = Math.atan2(car.position.x-x, car.position.z-z);
      player.place({x,z,heading},world);
      rig.yaw = heading-Math.PI/2; rig.pitch = -.12;
      startDrive();
    });
  }

  function leaveCar() {
    driving.park(); driving = null;
    player.figure.root.visible = true;
    input.setVehicle(null); hud.setDriving(false); sound.setDriving(false);
    player.place({x:player.pos.x, z:player.pos.z, heading:player.heading},world);
    rig.reset(player); camera.fov = world.fov; camera.zoom = zoomFor(); camera.updateProjectionMatrix();
    clearTimeout(cardTimer); $('title').classList.add('off');
  }

  function travel(index) {
    if ($('fade').classList.contains('on')) return;
    const chapter = chapters[index];
    if (!chapter) { card('', 'the end', 'so far'); return; }
    if (!BUILDERS[chapter.id]) { card(`chapter ${index + 1}`, chapter.title, 'not built yet'); return; }
    fadeTo(() => open(index), index);
  }

  addEventListener('keydown', (e) => {
    const n = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
    if (!hud.isOpen && n >= 1 && n <= chapters.length) travel(n - 1);
  });
  stage.addEventListener('dblclick', toggleFull);
  addEventListener('keydown', (e) => { if (!hud.isOpen && e.code === 'KeyF' && !e.repeat && !e.metaKey && !e.ctrlKey) toggleFull(); });
  const fullButton = $('full');
  if (fullButton) {
    fullButton.addEventListener('pointerdown', (e) => e.stopPropagation());   // not a drag on the game
    fullButton.addEventListener('click', (e) => { e.stopPropagation(); toggleFull(); fullButton.blur(); stage.focus(); });
    fullButton.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  function update(dt) {
    if (captionUntil && time >= captionUntil) { caption.classList.add('off'); captionUntil = 0; }
    if (driving) {
      const controls = input.driveAxes();
      if (controls.tune && !$('fade').classList.contains('on')) tuneRadio();
      driving.update(dt, controls, camera);
      sound.driveSpeed(driving.motor.speed, controls.ahead);
      hud.updateDrive(driving.motor.speed, driving.motor.lap);
      if (input.consumeInteraction() === parkAction) fadeTo(leaveCar);
      input.offerInteraction($('fade').classList.contains('on') ? null : parkAction);
      return;
    }
    const previousPhase = player.phase, wasGrounded = player.grounded;
    const control=input.consumeControl(),axes=input.axes();
    if(shot.on&&(control||axes.ahead||axes.right||axes.jump||axes.run||axes.walk||axes.lookBack)){shot.on=false;shot.blend=1;$('title').classList.add('off');camera.zoom=zoomFor();camera.fov=world.fov;camera.updateProjectionMatrix();}
    if (riding) riding.update(dt, input.pedalAxes());
    else if (shot.on) { stroll(dt); player.sync(dt); }
    else player.update(dt, world, input, rig.yaw);
    sound.update(player, previousPhase, wasGrounded, !shot.on && !riding, rig.yaw);
    if (world.onFootfall && !shot.on && !riding) {
      const side = plantedFoot(player, previousPhase, wasGrounded);
      if (side !== null && world.onFootfall(player,side)) sound.snowStep(side,player.running);
    }
    rig.update(dt, player, world, input);
    if (world.opening && (shot.on || shot.blend < 1)) frameOpening(dt);
    const action=input.consumeFire(),tagging=input.gear===CAT_TOSS;
    if (input.firearms.enabled) {
      if (input.gear && !tagging && !weapons) {
        weapons = makeWeapons();
        weapons.attach(world.scene);
      }
      weapons?.update(world,player,camera,tagging?0:input.gear,action && !tagging,dt,sound);
    }
    if(tagging)catToss??=makeCatToss(world,player);
    catToss?.update(dt,camera,tagging,action && tagging,sound);
    world.sky?.position.copy(camera.position);
    moveShadows(player.pos);
    const near = (s) => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r;
    // Announce a district once on entry. A little margin stops the title
    // retriggering when a player hovers on the edge of two places.
    if (lastSpot && Math.hypot(player.pos.x-lastSpot.x,player.pos.z-lastSpot.z) > lastSpot.r+1) lastSpot = null;
    if (!lastSpot && !captionUntil && !shot.on && $('title').classList.contains('off') && !$('fade').classList.contains('on')) {
      lastSpot = world.spots.find(near);
      if (lastSpot) showCaption(lastSpot.text);
    }

    const inside = world.exit && !world.drive ? player.grounded && near(world.exit) : false;
    if (inside && !atExit) travel(current + 1);
    atExit = inside;

    const pressed = input.consumeInteraction();
    const exploring = !shot.on && !inside && $('title').classList.contains('off') && !$('fade').classList.contains('on');
    const punchPressed = input.consumePunch();
    if (!riding) combat.update(dt, exploring && punchPressed);
    for (const tick of world.ticks) tick(time, dt);
    if (riding) {
      actionMark.visible = false;
      if (time >= dismountHintUntil) dismountAction.label = 'Get off bike';
      if (exploring && pressed === dismountAction) leaveBike();
      input.offerInteraction(exploring && riding ? dismountAction : null);
      hud.updateMap(world, player, time, shot.on);
      return;
    }
    const target = exploring && player.grounded ? nearestInteraction(world.interactions, player.pos) : null;
    if (target && pressed === target) target.act(player);
    input.offerInteraction(riding ? dismountAction : target?.label && !$('fade').classList.contains('on') ? target : null);
    const mark = exploring && !riding && nearestInteraction(world.interactions, player.pos, 16);
    actionMark.visible = Boolean(mark && mark !== world.drive?.boarding);
    if (mark) {
      actionMark.material.map = mark.kind === 'radio' ? musicMark : bubble;
      actionMark.position.set(mark.x, mark.y, mark.z);
    }
    hud.updateMap(world, player, time, shot.on);
  }

  open(first);
  if(['cats','foam'].includes(new URLSearchParams(location.search).get('gear'))){
    input.selectGear(CAT_TOSS);shot.on=false;shot.blend=1;
    $('hint').innerHTML=input.touch ? 'Drag right to aim · tap Toss to send a cat' : 'Drag to aim · click or J to toss a cat';
  }
  update(0);
  draw();
  loading.finish();
  requestAnimationFrame(() => loading.warm(chapters.filter(chapter => BUILDERS[chapter.id])));
  function resize() {
    fit();
    // Resizing clears the WebGL buffer. Keep the frozen scene behind the phone
    // when the visitor rotates their device, without advancing the simulation.
    if (hud.isOpen) {
      if (shot.on) frameOpening(0);
      draw();
    }
  }
  for (const type of ['resize', 'orientationchange']) addEventListener(type, resize);
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, resize);
  new ResizeObserver(resize).observe(stage);

  // Capped at 30 frames a second, like the hardware this imitates.
  const clock = new THREE.Clock();
  let pending = 0;
  function step(dt, frames = 1) {
    if (hud.isOpen || loading.active) return;
    for (let i = 0; i < frames; i++) { time += dt; update(dt); }
    draw();
  }
  (function frame() {
    requestAnimationFrame(frame);
    pending += clock.getDelta();
    if (pending < 1 / 30) return;
    const dt = Math.min(pending, 0.1);
    pending = 0;
    step(dt);
  })();

  // For poking at the game from the browser console.
  globalThis.game = { player, rig, input, inventory, travel, open, renderer, camera, get world() { return world; },
    // Replays the chapter's establishing shot. hold = true keeps it on its first frame, for taking stills.
    opening: (hold = false) => startOpening(hold),
    draw, sharpen,
    // Advances the game by `frames` steps of dt seconds, then draws once. For tests that cannot wait for real frames.
    step,
    // Ends the establishing shot at once and hands the camera back to the player.
    endOpening: () => { shot.on = false; shot.blend = 1; camera.fov = world.fov; camera.zoom = zoomFor(); camera.updateProjectionMatrix(); } };
}
