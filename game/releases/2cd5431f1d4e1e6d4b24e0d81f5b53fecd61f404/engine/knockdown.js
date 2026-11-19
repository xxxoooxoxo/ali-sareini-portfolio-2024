// A landed jab buckles the legs, drops the shoulder to the ground, then brings
// one knee and an arm under the body for the push back up. Times start at contact.
import { bodyBlocked } from './character-collision.js';

const BRACE_END = .15, LAND = .50, GET_UP = 1.60, KNEEL = 2.02, RECOVERED = 2.46;
const smooth = t => t * t * (3 - 2 * t);

// A seated guest can start inside the hall's table/bench footprint. Let them
// fall out through its nearest edge and choose a clear stretch of floor beyond it.
function landing(world, root, player, height, ownPost) {
  const { x, y, z } = root.position;
  const away = Math.atan2(x - player.pos.x, z - player.pos.z);
  const radius = .24 * root.scale.y;
  const grounded = world.ground(x, z);
  const startsBlocked = bodyBlocked(world, x, z, radius, Math.max(y, grounded), .5, ownPost);
  let best = null;
  for (const offset of [0, .48, -.48, .95, -.95, 1.55, -1.55, 2.15, -2.15, Math.PI]) {
    const dx = Math.sin(away + offset), dz = Math.cos(away + offset);
    let edge = 0, run = 0, clear = !startsBlocked, prevY = grounded;
    for (let s = .12; s <= height + 1.15; s += .12) {
      const px = x + dx * s, pz = z + dz * s, floor = world.ground(px, pz);
      if (Math.abs(floor - prevY) > .32 || Math.hypot(px - player.pos.x, pz - player.pos.z) < radius + .28) break;
      prevY = floor;
      if (bodyBlocked(world, px, pz, radius, floor, .5, ownPost)) {
        if (clear) break;
        edge = s;
      } else {
        clear = true;
        run = s - edge;
        if (run >= height + .16) break;
      }
    }
    const candidate = { dx, dz, slide: edge + .16, room: run };
    if (run >= height + .16) return candidate;
    if (!best || run > best.room) best = candidate;
  }
  return best;
}

// YC renders the stationary crowd in shared batches. Swap just the struck
// guest to its original rig while it falls. Other guests keep their draw calls.
function wakeGuest(anchor) {
  const root = anchor.userData.frozenRoot;
  if (!root) return { root: anchor, putAway() {} };
  const parts = anchor.userData.frozenRanges.map(({position, first, count}) => {
    const begin = first * 3, end = (first + count) * 3;
    const rest = position.array.slice(begin, end);
    position.array.fill(0, begin, end);
    position.addUpdateRange?.(begin, rest.length);
    position.needsUpdate = true;
    return { position, begin, rest };
  });
  anchor.parent.add(root);
  return { root, putAway() {
    root.removeFromParent();
    for (const {position, begin, rest} of parts) {
      position.array.set(rest, begin);
      position.addUpdateRange?.(begin, rest.length);
      position.needsUpdate = true;
    }
  } };
}

// Skin vertices near the outside of each bone's region make economical terrain
// probes. They include shoe tips and the back of the head on either rig.
const probesByGeometry = new WeakMap();
function contactIndices(geometry) {
  if (probesByGeometry.has(geometry)) return probesByGeometry.get(geometry);
  const {position, skinIndex, skinWeight} = geometry.attributes;
  const directions = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x || y || z) directions.push([x, y, z]);
  }
  const regions = new Map();
  for (let i = 0; i < position.count; i++) {
    let lane = 0;
    for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, lane)) lane = k;
    const bone = skinIndex.getComponent(i, lane);
    if (!regions.has(bone)) regions.set(bone, { scores: directions.map(() => -Infinity), indices: [] });
    const {scores, indices} = regions.get(bone);
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    directions.forEach(([a, b, c], k) => {
      const score = a * x + b * y + c * z;
      if (score > scores[k]) { scores[k] = score; indices[k] = i; }
    });
  }
  const indices = [...new Set([...regions.values()].flatMap(group => group.indices))];
  probesByGeometry.set(geometry, indices);
  return indices;
}

// Build three poses from the person's actual bones. A handful of quaternion
// blends per frame then works for walkers, seated guests and both character rigs.
function fallPose(figure, dx, dz) {
  const { root, spine, head, arms, legs } = figure;
  const joints = [spine, head, ...legs.flatMap(l => [l.hip, l.knee, l.foot]), ...arms.flatMap(a => [a.shoulder, a.elbow])];
  const capture = () => joints.map(joint => joint.quaternion.clone());
  const poses = { rest: capture() };
  const baseQ = root.getWorldQuaternion(root.quaternion.clone());
  const vec = () => root.position.clone();
  const q = () => root.quaternion.clone();
  const ankleTurns = legs.map(({foot}) => {
    const neutral = figure.restWorld?.get(foot);
    return neutral ? baseQ.clone().multiply(neutral) : baseQ.clone();
  });
  const localFall = vec().set(dx, 0, dz).applyQuaternion(baseQ.clone().invert());
  const lateral = localFall.x, forward = localFall.z;
  const seated = figure.seated || root.worldToLocal(figure.pelvis.getWorldPosition(vec())).y < .65;
  const sideOf = joint => Math.sign(root.worldToLocal(joint.getWorldPosition(vec())).x) || 1;

  function aimWorld(joint, tip, goal) {
    const inverse = joint.parent.getWorldQuaternion(q()).invert();
    const present = tip.getWorldPosition(vec()).sub(joint.getWorldPosition(vec())).applyQuaternion(inverse).normalize();
    goal.applyQuaternion(inverse).normalize();
    joint.quaternion.premultiply(q().setFromUnitVectors(present, goal));
  }
  function aim(joint, tip, x, y, z) {
    aimWorld(joint, tip, vec().set(x, y, z).applyQuaternion(baseQ));
  }
  // When lying down, splay the limbs across the ground plane. The offset
  // toward its normal lifts one knee without levering the torso into the air.
  function lay(joint, tip, x, y, z, lift) {
    const towardFloor = lateral * x + forward * z + lift;
    aim(joint, tip, x - towardFloor * lateral, y, z - towardFloor * forward);
  }
  function bend(joint, angle) {
    const axis = vec().set(1, 0, 0).applyQuaternion(baseQ).applyQuaternion(joint.parent.getWorldQuaternion(q()).invert());
    joint.quaternion.premultiply(q().setFromAxisAngle(axis, angle));
  }
  function sample(a, b, blend) {
    joints.forEach((joint, i) => joint.quaternion.slerpQuaternions(poses[a][i], poses[b][i], blend));
    root.updateMatrixWorld(true);
  }
  for (const name of ['brace', 'down', 'kneel']) {
    sample('rest', 'rest', 0);
    const brace = name === 'brace', kneel = name === 'kneel';
    bend(spine, brace ? .28 : kneel ? .57 : forward > .5 ? -.13 : .08);
    bend(head, brace ? .15 : kneel ? -.23 : .04);
    legs.forEach(({hip, knee, foot}, i) => {
      const side = sideOf(hip);
      // One knee gives first. On the ground one leg is bent, the other extended.
      if (name === 'down') {
        lay(hip, knee, side * .23, -.89, .38, i ? .025 : .43);
        lay(knee, foot, side * .10, -.87, -.46, i ? 0 : -.37);
      } else {
        const thigh = brace ? (i ? .45 : .77) : (i ? 1.10 : .68);
        const shin = brace ? (i ? -.44 : -.69) : (i ? -.24 : -1.42);
        aim(hip, knee, side * .15, seated && brace ? -.21 : kneel ? -.47 : -.81, thigh);
        aim(knee, foot, side * .04, -.90, seated && brace ? -.13 : shin);
      }
      foot.quaternion.copy(foot.parent.getWorldQuaternion(q()).invert().multiply(ankleTurns[i]));
      if (name === 'down') bend(foot, .44 + .38 * Math.max(0, forward));
    });
    arms.forEach(({shoulder, elbow, hand}, i) => {
      const side = sideOf(shoulder);
      if (brace) {
        aim(shoulder, elbow, side * .65, -.46, .16);
        aim(elbow, hand, side * .12, .48, .82);
      } else if (kneel) {
        aim(shoulder, elbow, side * .27, -.76, i ? .13 : .63);
        aim(elbow, hand, -side * .06, i ? -.92 : -.64, .42);
      } else {
        // Let the high-side forearm hang down across the torso on a side fall.
        const sideDepth = side * lateral;
        lay(shoulder, elbow, side * .79, -.67, i ? -.09 : .22, -.14 + .36 * sideDepth);
        lay(elbow, hand, side * .38, i ? -.66 : .43, .65, -.07 + .19 * sideDepth);
      }
    });
    poses[name] = capture();
  }
  sample('rest', 'rest', 0);
  let plant = null, plantingArm = null;
  const probes = [], probe = vec();
  root.traverse(mesh => {
    if (mesh.isSkinnedMesh) probes.push({ mesh, indices: contactIndices(mesh.geometry) });
  });
  return {
    sample,
    plantHand(world, weight) {
      root.updateMatrixWorld(true);
      if (!plant) {
        plantingArm = arms[0].shoulder.matrixWorld.elements[13] < arms[1].shoulder.matrixWorld.elements[13] ? arms[0] : arms[1];
        plant = plantingArm.hand.getWorldPosition(vec());
        plant.y = world.ground(plant.x, plant.z) + .09 * root.scale.y;
      }
      const {shoulder, elbow, hand} = plantingArm;
      const start = shoulder.getWorldPosition(vec()), mid = elbow.getWorldPosition(vec()), wrist = hand.getWorldPosition(vec());
      const upper = start.distanceTo(mid), lower = mid.distanceTo(wrist);
      const direction = wrist.lerp(plant, weight).sub(start);
      const distance = Math.max(Math.abs(upper - lower) + .002, Math.min(direction.length(), upper + lower - .002));
      direction.normalize();
      const pole = mid.sub(start); pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
      mid.copy(direction).multiplyScalar(along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
      aimWorld(shoulder, elbow, mid.clone());
      aimWorld(elbow, hand, direction.multiplyScalar(distance).sub(mid));
    },
    clearance(world) {
      let correction = -Infinity;
      for (const {mesh, indices} of probes) {
        mesh.skeleton.update();
        for (const i of indices) {
          mesh.getVertexPosition(i, probe).applyMatrix4(mesh.matrixWorld);
          correction = Math.max(correction, world.ground(probe.x, probe.z) + .025 - probe.y);
        }
      }
      return Number.isFinite(correction) ? correction : 0;
    },
  };
}

export function beginKnockdown(world, anchor, player, ownPost) {
  const { root, putAway } = wakeGuest(anchor);
  const figure = root.userData.figure;
  const height = figure?.look.height ?? 1.75 * root.scale.y;
  const {dx, dz, slide, room} = landing(world, root, player, height, ownPost);
  const origin = root.position.clone(), rest = root.quaternion.clone(), rotation = root.rotation.clone?.();
  const turn = rest.clone(), axis = { x: dz, y: 0, z: -dx };
  const pose = figure && fallPose(figure, dx, dz);
  const limit = Math.min(1.53, Math.asin(Math.min(1, Math.max(.35, room) / height)));
  let alreadyDown = false;
  anchor.userData.recoiling = true;

  function display(a, b, blend, tilt, travel, groundWeight, palm = 0) {
    root.position.set(origin.x + dx * travel * slide, origin.y, origin.z + dz * travel * slide);
    root.quaternion.copy(turn.setFromAxisAngle(axis, tilt).multiply(rest));
    pose?.sample(a, b, blend);
    const floorCorrection = pose ? pose.clearance(world) : world.ground(root.position.x, root.position.z) - origin.y + .16 * Math.sin(tilt);
    root.position.y += floorCorrection * groundWeight;
    if (palm) pose?.plantHand(world, palm);
    figure?._grips();
    root.updateMatrixWorld?.(true);
  }

  function restore() {
    root.position.copy(origin); root.quaternion.copy(rest);
    if (rotation) root.rotation.copy(rotation);
    pose?.sample('rest', 'rest', 0);
    figure?._grips();
    root.updateMatrixWorld?.(true);
    putAway(); anchor.userData.recoiling = false;
  }
  return {
    restore,
    update(age) {
      if (age >= RECOVERED) { restore(); return false; }
      if (age < BRACE_END) {
        const u = smooth(age / BRACE_END);
        display('rest', 'brace', u, limit * .14 * u, .19 * u, u);
      } else if (age < LAND) {
        const u = (age - BRACE_END) / (LAND - BRACE_END);
        display('brace', 'down', smooth(u), limit * (.14 + .86 * u * (.46 + .54 * u)), .19 + .81 * smooth(u), 1);
      } else if (age < GET_UP) {
        // A single small bounce at impact, followed by a completely still body.
        if (!alreadyDown) {
          const u = Math.min(1, (age - LAND) / .16);
          display('down', 'down', 0, limit - .07 * Math.sin(Math.PI * u), 1, 1);
          alreadyDown = u === 1;
        }
      } else if (age < KNEEL) {
        const u = smooth((age - GET_UP) / (KNEEL - GET_UP));
        display('down', 'kneel', u, limit * (1 - .54 * u), 1 - .36 * u, 1, Math.min(1, (age - GET_UP) / .09));
      } else {
        const u = smooth((age - KNEEL) / (RECOVERED - KNEEL));
        display('kneel', 'rest', u, limit * .46 * (1 - u), .64 * (1 - u), 1 - u, Math.max(0, 1 - (age - KNEEL) / .22));
      }
      return true;
    },
  };
}
