// The bike faces +Z at heading zero. The rider's right is local -X.
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const HUB = .53;
const PROBES = [-HUB, 0, HUB];
const MAX_STEP = .32;

function clearBody(world, x, z, radius, height) {
  const y = world.ground(x, z);
  if (world.bodyBlocked(x, z, radius, y, height)) return false;
  for (const walker of world.walkers ?? []) {
    if (Math.abs(walker.root.position.y - y) < height &&
        (walker.x - x) ** 2 + (walker.z - z) ** 2 < (radius + .3) ** 2) return false;
  }
  return true;
}

export class BicycleMotor {
  constructor(world, x, z, heading, scale = 1) {
    this.world = world;
    this.x = x; this.z = z; this.heading = heading; this.scale = scale;
    this.speed = 0; this.steer = 0; this.wheelAngle = 0; this.crankAngle = 0;
    this.followGround();
  }

  followGround() {
    const dx = Math.sin(this.heading) * HUB * this.scale, dz = Math.cos(this.heading) * HUB * this.scale;
    const front = this.world.ground(this.x + dx, this.z + dz), rear = this.world.ground(this.x - dx, this.z - dz);
    this.y = (front + rear) / 2;
    this.pitch = -Math.atan2(front - rear, 2 * HUB * this.scale);
  }

  // Test both hubs and the rider, including when turning in place against a wall.
  fits(x, z, heading) {
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const oldSin = Math.sin(this.heading), oldCos = Math.cos(this.heading);
    for (const probe of PROBES) {
      const offset = probe * this.scale;
      const px = x + offset * sin, pz = z + offset * cos;
      const oldFloor = this.world.ground(this.x + offset * oldSin, this.z + offset * oldCos);
      if (Math.abs(this.world.ground(px, pz) - oldFloor) > MAX_STEP ||
          !clearBody(this.world, px, pz, (probe === 0 ? .34 : .24) * this.scale, probe === 0 ? 1.95 : 1.1)) return false;
    }
    return true;
  }

  update(dt, { ahead = 0, right = 0 }) {
    dt = clamp(dt, 0, .1);
    const pedal = clamp(ahead, -1, 1), turn = clamp(right, -1, 1);
    const steps = Math.max(1, Math.ceil(dt * 60)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acceleration = pedal < 0 ? 8.5 * pedal : 4.6 * pedal - .72 - .15 * this.speed;
      this.speed = clamp(this.speed + acceleration * h, 0, 9);
      this.steer += (turn - this.steer) * (1 - Math.exp(-10 * h));
      const heading = this.heading - this.steer * Math.min(2.25, 1.1 + this.speed * .18) * h;
      const distance = this.speed * h;
      const x = this.x + Math.sin(heading) * distance, z = this.z + Math.cos(heading) * distance;
      if (!this.fits(x, z, heading)) {
        // Release the pedals and turn away, even with the front tyre against the obstacle.
        this.speed = 0;
        if (this.fits(this.x, this.z, heading)) this.heading = heading;
        continue;
      }
      this.x = x; this.z = z; this.heading = heading;
      this.wheelAngle = (this.wheelAngle + distance / (.34 * this.scale)) % (2 * Math.PI);
      if (pedal > 0) this.crankAngle = (this.crankAngle + distance / (1.08 * this.scale)) % (2 * Math.PI);
    }
    this.followGround();
  }

  // World walls use an axis-aligned footprint and height above the local terrain.
  parkedBounds() {
    const cos = Math.abs(Math.cos(this.heading)), sin = Math.abs(Math.sin(this.heading));
    const w = (.3 * cos + .88 * sin) * this.scale, d = (.88 * cos + .3 * sin) * this.scale;
    return [this.x - w, this.x + w, this.z - d, this.z + d, 1.1 * this.scale];
  }

  // Try either side before stepping off beyond a wheel. Check the short path
  // from the saddle too: dismounting beside a fence cannot cross it.
  standingRoom(radius, height) {
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    const [x0, x1, z0, z1] = this.parkedBounds();
    for (const [side, along] of [[1,0],[-1,0],[0,-1],[0,1]]) {
      for (const extra of [.10,.40,.75]) {
        const reach = radius + (side ? .30 : .88) * this.scale + extra;
        const dx = (side * cos + along * sin) * reach, dz = (-side * sin + along * cos) * reach;
        const x = this.x + dx, z = this.z + dz;
        const gapX = x - clamp(x, x0, x1), gapZ = z - clamp(z, z0, z1);
        if (gapX * gapX + gapZ * gapZ <= radius * radius) continue;
        let clear = true;
        for (let i = 1; i <= 5 && clear; i++) {
          const px = this.x + dx * i / 5, pz = this.z + dz * i / 5;
          clear = Math.abs(this.world.ground(px, pz) - this.y) <= MAX_STEP && clearBody(this.world, px, pz, radius, height);
        }
        if (clear) return { x, z, heading: this.heading };
      }
    }
    return null;
  }
}
