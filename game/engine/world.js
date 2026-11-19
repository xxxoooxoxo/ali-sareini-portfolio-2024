// A chapter's world: its scene, the ground height, and simple colliders (walls and round posts).
import * as THREE from 'three';
import { bodyBlocked, supportHeight } from 'life/engine/character-collision.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_POST = new THREE.CylinderGeometry(1, 1, 1, 8);

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.rects = [];    // [x0, x1, z0, z1, height] areas you cannot enter
    this.circles = [];  // [x, z, radius, height]
    this.ticks = [];    // (time, dt) => void, run every frame
    this.spots = [];    // { x, z, r, text } captions that show when you stand close
    this.interactions = []; // { x, y, z, r, label, act(player) }. A null label hides an action until it is ready.
    this.exit = null;   // { x, z, r } walking here ends the chapter
    this.drive = null;  // the SF car and its closed scenic circuit
    this.crowd = null;
    this.bakedBystanders = [];
    this.radio = null;  // portable set and its tuning dial
    this.onFootfall = null; // (player, foot index) => true when a step leaves a print
    this.sky = null;
    this.you = null;    // the player's position, set when the chapter opens
    this.fence = null;  // (x, z) => true where you may not walk, for edges that are not a box or a circle
    this.fov = 60; this.far = 4000;   // camera settings for this chapter
    this.opening = null;   // an establishing shot: { pos: [x, y, z], look: [x, y, z], drift: [dx, dy, dz], lookDrift: [dx, dy, dz], seconds: 5, fov: 50 }
    this.shadow = null;    // cast-shadow options, see shadows.js
    this.grade = null;     // a colour filter over the whole frame: { multiply: [r, g, b], add: [r, g, b] }, 0 to 255, see game.js
    this.peopleFill = null; // a fill light for people only: [r, g, b], 0 to 255, see game.js
    this.sharpness = 8;     // texture sharpness on surfaces seen at a shallow angle, 1 (off) to 16, see game.js
    this.contact = 0.34;     // strength of the dark contact shadow under each person, 0 (off) to 1, see game.js
    this.contacts = [];     // extra contact shadows for people baked into plain meshes: [x, y, z, size]
    this.ground = () => 0;
    this.start = { x: 0, z: 0, heading: 0, camYaw: 0, camPitch: -0.04 };
  }

  // A box given by its size and the position of its centre.
  box(sx, sy, sz, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  // Player obstacle heights are measured above local terrain. Finite tops support landing;
  // Infinity stays impassable. The legacy blocked() query remains available for layout and cameras.
  wall(xa, xb, za, zb, height = Infinity) { this.rects.push([Math.min(xa, xb), Math.max(xa, xb), Math.min(za, zb), Math.max(za, zb), height]); }
  post(x, z, r, height = Infinity) { this.circles.push([x, z, r, height]); }

  blocked(x, z, r, y = 0) {
    if (y === 0 && this.fence?.(x, z)) return true;   // the fence stops you, not the camera
    for (const [x0, x1, z0, z1, h] of this.rects) if (y < h && x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    for (const [cx, cz, cr, h] of this.circles) if (y < h && (x - cx) ** 2 + (z - cz) ** 2 < (r + cr) ** 2) return true;
    return false;
  }

  bodyBlocked(x,z,r,feet,height){return bodyBlocked(this,x,z,r,feet,height);}
  supportHeight(x,z,r,ceiling){return supportHeight(this,x,z,r,ceiling);}

  // Many copies of one shape in a single draw call. Each item: size x, y, z, then centre x, y, z.
  instances(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    items.forEach(([sx, sy, sz, x, y, z], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }
  // A bystander who walks back and forth between two points, and waits when you stand in the way.
  // They step around posts and standing people on the route, and around each other.
  walker(figure, ax, az, bx, bz, normalPace, headStart = 0) {
    this.scene.add(figure.root);
    const span = Math.hypot(bx - ax, bz - az), heading = Math.atan2(bx - ax, bz - az);
    const ux = (bx - ax) / span, uz = (bz - az) / span, rx = -uz, rz = ux;   // along the route, and to its right
    const BODY = 0.3, ROOM = 0.45, REACH = 4;   // a walker's radius, the metres kept clear of a post, and how far before it the step aside begins
    let gone = headStart % (span * 2);
    const me = { x: ax, z: az, dir: 1, hx: ux, hz: uz, root: figure.root, alarm:0,tagPaused:false,
      fleeFrom(source) {
        const away=(me.x-source.x)*ux+(me.z-source.z)*uz;
        if(away*(gone<span ? 1 : -1)<0)gone=(2*span-gone)%(2*span);
      },
    };
    me.n = (this.walkers ||= []).push(me);   // when two walkers cannot both pass, the later one waits
    let stride = headStart, pace = 1, aside = 0, drift = 0, posts = null, beside = [], last = null, facing = heading, giveWay = false, keep = 1;   // keep: the share of full speed to go at
    // Posts on the route, as [first metre along, last metre along, metres to step aside]. Posts that follow each other
    // closely are passed as one group, on one side. Chapters add posts after their walkers, so this waits for the first frame.
    const findPosts = () => {
      const near = this.circles.flatMap(([cx, cz, cr, h]) => {
        const along = (cx - ax) * ux + (cz - az) * uz, off = (cx - ax) * rx + (cz - az) * rz;
        return h < 0.5 || along < -1 || along > span + 1 || Math.abs(off) > cr + 2.5 ? [] : [{ along, off, clear: cr + ROOM, hit: Math.abs(off) < cr + BODY }];
      }).sort((p, q) => p.along - q.along), groups = [];
      // Only a post the walker's body would touch starts a step aside.
      for (const p of near.filter((p) => p.hit)) {
        const g = groups.at(-1);
        if (g && p.along - g.to < 2.5) g.to = p.along; else groups.push({ from: p.along, to: p.along });
      }
      const free = (along, shift) => !this.blocked(ax + ux * along + rx * shift, az + uz * along + rz * shift, 0.25);
      beside = near;
      return groups.flatMap((g) => {
        // The step has to clear every post beside this stretch too, or it only trades one collision for another.
        const close = near.filter((p) => p.along > g.from - 1.5 && p.along < g.to + 1.5);
        const sides = [-1, 1].map((side) => {
          let shift = 0;
          for (let pass = 0; pass < 6; pass++) for (const p of close) if (Math.abs(p.off - shift) < p.clear - 0.01) shift = p.off + side * p.clear;
          return shift;
        }).filter((shift) => Math.abs(shift) < 2.2 && free(g.from, shift) && free(g.to, shift)).sort((p, q) => Math.abs(p) - Math.abs(q));
        return sides.length ? [[g.from, g.to, sides[0]]] : [];   // no room on either side: walk on as before
      });
    };
    this.ticks.push((t, dt) => {
      if(me.tagPaused)return;
      const speed=normalPace+(Math.max(3.8,normalPace)-normalPace)*me.alarm;
      const SEEN=3.2+speed; // runners notice oncoming traffic earlier
      posts ||= findPosts();
      const lap = gone / span, k = lap < 1 ? lap : 2 - lap, along = k * span;
      me.dir = lap < 1 ? 1 : -1; me.hx = ux * me.dir; me.hz = uz * me.dir;
      // Slowing to a stop takes about a second, so a jogger starts sooner than a walker.
      const inTheWay = this.you && Math.hypot(this.you.x - me.x, this.you.z - me.z) < 1.3 + 0.35 * speed &&
        (!me.alarm || (this.you.x-me.x)*me.hx+(this.you.z-me.z)*me.hz>0);
      pace += ((inTheWay ? 0 : keep) - pace) * Math.min(1, dt * 3);
      me.v = speed * pace;
      gone = (gone + speed * pace * dt) % (span * 2);
      // The furthest step aside any post asks for, to each side, eased in and out along the route.
      let left = 0, right = 0;
      for (const [from, to, shift] of posts) {
        const d = Math.max(from - along, along - to, 0); if (d >= REACH) continue;
        const want = shift * 0.5 * (1 + Math.cos(Math.PI * d / REACH));
        if (want < left) left = want; else if (want > right) right = want;
      }
      let want = left + right, push = 0, oncoming = null;
      // Another walker close by: move apart sideways. Two who meet head on each keep to their own right,
      // and someone catching up passes on the left.
      for (const other of this.walkers) {
        if (other === me) continue;
        const dx = other.x - me.x, dz = other.z - me.z, d = Math.hypot(dx, dz);
        if (d > SEEN) continue;
        const ahead = dx * me.hx + dz * me.hz, off = dx * rx + dz * rz, sameWay = other.hx * me.hx + other.hz * me.hz > 0;
        if (ahead < -0.4 && !(sameWay && d < 0.9)) continue;   // someone behind is theirs to avoid
        const side = Math.abs(off) > 0.08 ? -Math.sign(off) : me.dir * (sameWay ? -1 : 1);
        push += side * 0.55 * Math.min(1, (SEEN - d) / (SEEN / 2));
        if (ahead > 0.2 && d < 2.6 + 0.35 * speed && (sameWay || other.n < me.n) && !(oncoming && oncoming.d < d)) oncoming = { d, sameWay, v: other.v || 0 };
      }
      // Moving away from a walker must not mean walking into a post. Where there is no room, someone behind a slower
      // walker follows at that walker's speed until there is room to pass. Of two who meet head on, the later one
      // waits until the other has passed, and the earlier one tries the other side or holds the line.
      const touches = (shift) => beside.some((p) => Math.abs(p.along - along) < 1.2 && Math.abs(p.off - shift) < p.clear - 0.15);
      const squeezed = push !== 0 && touches(want + push);
      giveWay = Boolean(oncoming) && (squeezed || (giveWay && !oncoming.sameWay));
      keep = !giveWay ? 1 : oncoming.sameWay ? Math.max(0, Math.min(1, oncoming.v / speed + (oncoming.d - 1.6) * 0.5)) : 0;
      if (squeezed) push = giveWay || touches(want - push) ? 0 : -push;
      want += push;
      // Step aside at up to 0.6 of the speed being walked, and change that sideways speed gradually. The body then has
      // time to turn and face the way it is going. Someone who moves sideways faster than they turn slides their feet.
      const most = 0.6 * speed * pace, swerve = Math.max(-most, Math.min(most, (want - aside) * 4));
      drift += Math.max(-2 * speed * dt, Math.min(2 * speed * dt, swerve - drift));
      const step = last ? drift * dt : want - aside;
      aside += step;
      const x = ax + ux * along + rx * aside, z = az + uz * along + rz * aside;
      // Face the way the feet are going. Turning round at an end is at once, as before. Any other turn takes a moment,
      // and someone who has slowed or stopped keeps facing along the route.
      const forward = me.dir * Math.max(pace, 0.6) * speed, sideways = dt > 0 && last ? step / dt : 0;
      const toward = Math.atan2(ux * forward + rx * sideways, uz * forward + rz * sideways);
      const turn = Math.atan2(Math.sin(toward - facing), Math.cos(toward - facing));
      facing = !last || me.dir !== last[2] ? toward : facing + Math.max(-3 * dt, Math.min(3 * dt, turn));
      const moved = last ? Math.hypot(x - last[0], z - last[1]) : speed * pace * dt;
      last = [x, z, me.dir]; me.x = x; me.z = z;
      figure.place(x, this.ground(x, z), z, facing);
      if (!(dt > 0)) return;
      // A model with authored gaits steps in time with the distance it covers, so its feet do not slide.
      const going = moved / dt;
      // dt lets the figure ease a change of speed, as it does for the player.
      if (figure.locomote) { figure.dt = dt; stride += moved * figure.phasePerMetre(going); figure.locomote(stride, going, t); }
      else { stride += moved * 2.1; figure.walk(stride, pace); }
    });
  }

  boxes(mat, items) { return this.instances(UNIT_BOX, mat, items); }
  posts(mat, items) { return this.instances(UNIT_POST, mat, items); } // size is radius, height, radius
}

// A ground strip that follows a height profile along z. rows: [[z, height], ...]. The texture repeats every `tile` metres.
export function strip(xa, xb, rows, mat, tile, lift = 0) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), pos = [], uv = [], idx = []; // rows must run from high z to low z, so the faces point up
  rows.forEach(([z, h], i) => {
    pos.push(x0, h + lift, z, x1, h + lift, z);
    uv.push(x0 / tile, z / tile, x1 / tile, z / tile);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// A pediment: a triangular front and back with a pitched roof between them. The front faces +Z.
export function gable(width, height, depth, faceMat, roofMat) {
  const w = width / 2, d = depth / 2, group = new THREE.Group();
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, d, w, 0, d, 0, height, d, w, 0, -d, -w, 0, -d, 0, height, -d], 3));
  face.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1], 2));
  face.computeVertexNormals();
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute([
    -w, 0, d, 0, height, d, 0, height, -d, -w, 0, d, 0, height, -d, -w, 0, -d,
    w, 0, d, 0, height, -d, 0, height, d, w, 0, d, w, 0, -d, 0, height, -d], 3));
  roof.computeVertexNormals();
  group.add(new THREE.Mesh(face, faceMat), new THREE.Mesh(roof, roofMat));
  return group;
}
