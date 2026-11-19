import { bodyBlocked } from './character-collision.js';
import { beginKnockdown } from './knockdown.js';

const REACH = 1.25;
const IMPACT = .18;
const SWING_END = .42;
const COOLDOWN = .54;
const smooth = t => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

// The same rig can be standing, seated on the ground, or seated at a table.
// Cache this offset in the authored pose, before a chapter freezes its meshes.
export function chestHeight(root) {
  const figure = root.userData.figure;
  if (!figure) return root.userData.chestHeight ?? 1.25 * root.scale.y;
  const { head, pelvis } = figure;
  head.updateWorldMatrix(true, false);
  pelvis.updateWorldMatrix(true, false);
  const headY = head.matrixWorld.elements[13], hipY = pelvis.matrixWorld.elements[13];
  return hipY + (headY - hipY) * .70 - root.matrixWorld.elements[13];
}

function inReach(world, targets, player) {
  const { pos, heading } = player;
  const forwardX = Math.sin(heading), forwardZ = Math.cos(heading);
  const fistY = pos.y + player.motor.height * .74;
  let nearest = null, best = REACH;
  for (const target of targets) {
    const { root, chest } = target;
    if (!root.visible || !root.parent || root.userData.recoiling) continue;
    const dx = root.position.x - pos.x, dz = root.position.z - pos.z;
    const distance = Math.hypot(dx, dz), ahead = dx * forwardX + dz * forwardZ;
    if (distance > best || ahead <= 0 || ahead < distance * .65) continue;
    if (Math.abs(dx * forwardZ - dz * forwardX) > .57) continue;
    const chestY = root.position.y + chest;
    if (Math.abs(chestY - fistY) > .95) continue;
    // A desk can cover a seated person's torso while their upper body is in reach.
    const contactY = Math.max(chestY, Math.min(fistY, chestY + .34 * root.scale.y));
    const dy = contactY - fistY;

    // Static people have their own movement collider. Check everything between
    // the fist and the person, including thin walls and posts on raised terrain.
    const ownPost = world.circles.find(([x, z, radius]) =>
      radius <= .40 && Math.abs(x - root.position.x) < .001 && Math.abs(z - root.position.z) < .001);
    const steps = Math.max(1, Math.ceil(Math.hypot(distance, dy) / .08));
    let blocked = false;
    for (let i = 1; i <= steps && !blocked; i++) {
      const t = i / steps;
      const x = pos.x + dx * t, z = pos.z + dz * t, y = fistY + dy * t;
      blocked = y < world.ground(x, z) ||
        bodyBlocked(world, x, z, .055, y - .055, .11, ownPost);
    }
    if (!blocked) { nearest = { root, height: contactY - pos.y, distance, ownPost }; best = distance; }
  }
  return nearest;
}

// The game samples the walking pose first, then applies the swing to that pose.
// Input, pause and chapter/vehicle changes belong to the game loop.
export function createCombat(world, player) {
  const targets = [];
  world.scene.traverse(root => {
    if (root !== player.figure.root && (root.userData.lookKey !== undefined || root.userData.frozenRanges)) {
      targets.push({ root, chest: chestHeight(root) });
    }
  });
  const falls = new Map();
  let swing = null, cooldown = 0;

  function endSwing() {
    if (swing) player.figure.punchPose(0, 0, swing.height, swing.distance);
    swing = null;
  }
  function reset() {
    endSwing();
    for (const fall of falls.values()) fall.animation.restore();
    falls.clear();
    cooldown = 0;
  }
  function update(dt, pressed) {
    cooldown = Math.max(0, cooldown - dt);
    for (const [root, fall] of falls) {
      fall.age += dt;
      if (!fall.animation.update(fall.age)) falls.delete(root);
    }
    if (!player.grounded) endSwing();
    if (pressed && player.grounded && cooldown === 0) {
      const target = inReach(world, targets, player);
      swing = { age: 0, height: target?.height ?? player.motor.height * .74, distance: target?.distance };
      cooldown = COOLDOWN;
    }
    let hit = null;
    if (swing) {
      const previous = swing.age;
      swing.age += dt;
      if (previous < IMPACT && swing.age >= IMPACT) {
        const target = inReach(world, targets, player);
        if (target) {
          hit = target.root;
          swing.height = target.height;
          swing.distance = target.distance;
          const animation = beginKnockdown(world, hit, player, target.ownPost);
          const age = swing.age - IMPACT;
          if (animation.update(age)) falls.set(hit, { age, animation });
        }
      }
      if (swing.age < SWING_END) {
        const lift = smooth(Math.min(swing.age / .08, (SWING_END - swing.age) / .13));
        const reach = smooth(swing.age <= IMPACT ? (swing.age - .08) / (IMPACT - .08) : (SWING_END - swing.age) / (SWING_END - IMPACT));
        player.figure.punchPose(lift, reach, swing.height, swing.distance);
      } else endSwing();
    }
    return hit;
  }
  return { update, reset };
}
