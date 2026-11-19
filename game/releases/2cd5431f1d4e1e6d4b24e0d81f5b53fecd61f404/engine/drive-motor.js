// Distances are metres along the closed road. Lane offset is positive to the
// driver's right, including on the return leg and through the two turnarounds.
/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** @param {number} from @param {number} to @param {number} length */
const gap = (from, to, length) => (to - from + length) % length;
const clearance = 8.5, sideClearance = 2.85;

export class DriveMotor {
  /** @param {number} length */
  constructor(length, start = 0) {
    this.length = length;
    this.distance = start % length;
    this.lapDistance = 0; this.lap = 1;
    this.speed = 0; this.lane = 2.7; this.sideSpeed = 0;
  }

  /** @param {number} dt @param {number} pedal @param {number} steer
   * @param {{distance:number,lane:number,pace:number}[]} traffic */
  update(dt, pedal, steer, traffic, speedLimit = 32) {
    // Cars travel in order in the passing lane. A queue also wraps across the lap seam.
    for (let i = 0; i < traffic.length; i++) {
      const car = traffic[i], next = traffic[(i+1) % traffic.length];
      const room = next === car ? Infinity : gap(car.distance, next.distance, this.length) - clearance;
      const playerRoom = Math.abs(car.lane - this.lane) < sideClearance
        ? gap(car.distance, this.distance, this.length) - clearance : Infinity;
      const advance = Math.max(0, Math.min(car.pace * dt, room, playerRoom));
      car.distance = (car.distance + advance) % this.length;
    }
    const acceleration = pedal < 0 ? 13 * pedal : pedal * 8.2 - (1.2 + .004 * this.speed ** 2);
    this.speed = clamp(this.speed + acceleration * dt, 0, speedLimit);
    const wantSide = steer * Math.min(5.8, this.speed * .49);
    this.sideSpeed += (wantSide - this.sideSpeed) * (1 - Math.exp(-6 * dt));
    let lane = clamp(this.lane + this.sideSpeed * dt, -4.55, 4.55);
    let advance = this.speed * dt;
    for (const car of traffic) {
      const ahead = gap(this.distance, car.distance, this.length);
      if (Math.min(ahead, this.length - ahead) < clearance && Math.abs(lane-car.lane) < sideClearance) {
        lane = car.lane + (this.lane >= car.lane ? sideClearance : -sideClearance);
        lane = clamp(lane, -4.55, 4.55);
      }
      if (Math.abs(lane-car.lane) < sideClearance && ahead < advance + clearance) {
        advance = Math.max(0, ahead - clearance);
        if (dt > 0) this.speed = advance / dt;
      }
    }
    this.sideSpeed = this.speed > .1 && dt > 0 ? (lane-this.lane) / dt : 0;
    if (this.speed > .1) this.lane = lane;
    this.distance = (this.distance + advance) % this.length;
    this.lapDistance += advance;
    this.lap += Math.floor(this.lapDistance / this.length);
    this.lapDistance %= this.length;
  }
}
