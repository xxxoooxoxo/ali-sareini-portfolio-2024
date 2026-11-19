import * as THREE from 'three';
import { BicycleMotor } from './bicycle-motion.js';

// The classic-script figure uses simple hinges. Bend a two-link limb toward a
// grip or pedal in rider space, with the elbow outward or the knee forward.
function bendHinges(figure, upper, lower, tip, target, bend) {
  const start = figure.root.worldToLocal(upper.getWorldPosition(new THREE.Vector3()));
  const dir = target.clone().sub(start), first = lower.position.length(), second = tip.position.length();
  const distance = THREE.MathUtils.clamp(dir.length(), Math.abs(first - second) + .001, first + second - .001);
  dir.normalize();
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  const middle = dir.clone().multiplyScalar(along)
    .addScaledVector(bend.addScaledVector(dir, -bend.dot(dir)).normalize(), Math.sqrt(Math.max(0, first * first - along * along)));
  const rootTurn = figure.root.getWorldQuaternion(new THREE.Quaternion());
  const aim = (joint, child, direction) => {
    direction.applyQuaternion(rootTurn).applyQuaternion(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    joint.quaternion.setFromUnitVectors(child.position.clone().normalize(), direction.normalize());
  };
  aim(upper, lower, middle.clone());
  aim(lower, tip, dir.multiplyScalar(distance).sub(middle));
  tip.quaternion.copy(tip.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rootTurn));
}

// Keep the ball of each shoe over its spindle. Measure the authored sole in
// its neutral orientation, before adding the small ankle pitch of each stroke.
function pedalShoe(figure, foot, side, authored) {
  const neutral = new THREE.Quaternion();
  const contact = new THREE.Vector3(0, -.08, .115); // dimensions of the classic shoe
  if (authored) {
    neutral.copy(figure.restWorld.get(foot));
    const toe = figure.bones[side + 'ToeBase'].position.clone().applyQuaternion(neutral);
    neutral.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(toe.x, toe.z)));
    const marks = figure.footMarks?.[side];
    if (marks?.length) {
      const scale = foot.getWorldScale(new THREE.Vector3()).divide(figure.root.getWorldScale(new THREE.Vector3()));
      const bounds = new THREE.Box3();
      for (const [mark] of marks) bounds.expandByPoint(mark.clone().multiply(scale).applyQuaternion(neutral));
      contact.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y, THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, .7));
    } else contact.y = -figure.ankleHeight;
  }
  return { neutral, contact };
}

function seatRider(figure, bike) {
  const scale = bike.scale.y / figure.root.scale.y;
  figure.sitOn(.95 * bike.scale.y, true);
  const authored = 'moveAnkle' in figure;
  if (authored) {
    figure.rig.position.z += -.26 * scale - figure.localJoint('Hips').z;
    // Ali's hip joint sits above the underside of the leather trousers.
    figure.setHipHeight(.95 * scale + .15);
    figure.spine.rotateX(.90);
    figure.head.rotateX(-.40);
  } else {
    figure.pelvis.position.z = -.26 * scale;
    figure.spine.rotation.x = .72;
    figure.head.rotation.x = -.30;
  }
  const forward = new THREE.Vector3(), target = new THREE.Vector3();
  const sides = authored ? ['Left', 'Right'] : ['Right', 'Left'];
  const grips = sides.map(side => bike.getObjectByName(side + ' grip'));
  const pedals = sides.map(side => bike.getObjectByName(side + ' pedal'));
  const legs = figure.legs.map(({hip, knee, foot}, i) => {
    if (authored) {
      // Reset the chair pose's outward thigh roll before bending in the plane of the crank.
      for (const bone of [hip, knee, foot, figure.bones[sides[i] + 'ToeBase']]) figure.restOrientation(bone);
    }
    return { hip, knee, foot, rest: [hip.quaternion.clone(), knee.quaternion.clone()],
      pole: new THREE.Vector3(sides[i] === 'Left' ? .06 : -.06, 0, 1), shoe: pedalShoe(figure, foot, sides[i], authored) };
  });
  const pitchAxis = new THREE.Vector3(1, 0, 0), offset = new THREE.Vector3(), kneePole = new THREE.Vector3();
  const footPitch = new THREE.Quaternion(), rootTurn = new THREE.Quaternion(), parentTurn = new THREE.Quaternion();
  let lastFork = Infinity;
  return (forkAngle, crankAngle) => {
    if (!authored || Math.abs(forkAngle - lastFork) > .01) {
      lastFork = forkAngle;
      figure.arms.forEach(({shoulder, elbow, hand}, i) => {
        figure.root.worldToLocal(grips[i].getWorldPosition(target));
        target.y += .035 * scale;
        if (authored) figure.reach(sides[i], target.toArray());
        else bendHinges(figure, shoulder, elbow, hand, target, new THREE.Vector3(Math.sign(shoulder.position.x) * .45, -1, -.3));
      });
    }
    forward.set(0, 0, 1).applyQuaternion(bike.quaternion);
    figure.root.getWorldQuaternion(rootTurn);
    legs.forEach(({hip, knee, foot, rest, pole, shoe}, i) => {
      const pedal = pedals[i], { y, z } = pedal.position;
      const height = (y * Math.cos(crankAngle) - z * Math.sin(crankAngle)) / Math.hypot(y, z);
      const pitch = .08 - .12 * height;
      pedal.rotation.x = pitch - crankAngle;
      footPitch.setFromAxisAngle(pitchAxis, pitch);
      figure.root.worldToLocal(pedal.localToWorld(target.set(0, .01, 0)));
      target.sub(offset.copy(shoe.contact).applyQuaternion(footPitch));
      if (authored) {
        hip.quaternion.copy(rest[0]); knee.quaternion.copy(rest[1]);
        figure.root.updateMatrixWorld(true);
        figure.moveAnkle(sides[i], figure.root.localToWorld(target), forward, kneePole.copy(pole).applyQuaternion(rootTurn));
      } else bendHinges(figure, hip, knee, foot, target, kneePole.copy(pole));
      foot.quaternion.copy(foot.parent.getWorldQuaternion(parentTurn).invert()).multiply(rootTurn).multiply(footPitch).multiply(shoe.neutral);
    });
    figure.root.updateMatrixWorld(true);
  };
}

class Bicycle {
  constructor(world, root, solid) {
    this.world = world; this.root = root; this.solid = solid;
    this.motor = new BicycleMotor(world, root.position.x, root.position.z, root.rotation.y, root.scale.y);
    this.rider = null;
    this.fork = root.getObjectByName('Fork');
    this.crank = root.getObjectByName('Crank');
    this.spokes = [root.getObjectByName('Front spokes'), root.getObjectByName('Rear spokes')];
    this.kickstand = root.getObjectByName('Kickstand');
    this.addCollider();
    const bike = this;
    this.action = {
      get x() { return root.position.x; },
      get y() { return root.position.y + 1.45 * root.scale.y; },
      get z() { return root.position.z; },
      get label() { return bike.rider ? null : 'Ride bike'; },
      r: 2.1,
      act() { world.onRideBike?.(bike); },
    };
  }

  addCollider() {
    if (!this.solid) return;
    this.obstacle = this.motor.parkedBounds();
    this.world.rects.push(this.obstacle);
  }

  mount(player) {
    const {x, y, z, r} = this.action;
    if (this.rider || !player.grounded || Math.hypot(x - player.pos.x, y - player.pos.y - 1.2, z - player.pos.z) > r) return false;
    if (this.obstacle) {
      const index = this.world.rects.indexOf(this.obstacle);
      if (index >= 0) this.world.rects.splice(index, 1);
      this.obstacle = null;
    }
    const m = this.motor;
    if (!m.fits(m.x, m.z, m.heading)) { this.addCollider(); return false; }
    this.rider = player;
    player.motor.place(m.x, m.y, m.z);
    player.running = false; player.landing = 0;
    this.pose = seatRider(player.figure, this.root);
    this.kickstand.visible = false;
    this.sync();
    return true;
  }

  update(dt, controls) {
    if (!this.rider) return;
    this.motor.update(dt, controls);
    this.sync();
  }

  sync() {
    const m = this.motor, rider = this.rider;
    this.root.position.set(m.x, m.y, m.z);
    this.root.rotation.set(m.pitch, m.heading, m.steer * Math.min(.19, m.speed * .025), 'YXZ');
    this.fork.rotation.y = -m.steer * .48;
    this.crank.rotation.x = m.crankAngle;
    for (const disk of this.spokes) disk.rotation.z = m.wheelAngle;
    rider.pos.copy(this.root.position);
    rider.motor.supportY = this.world.ground(m.x, m.z);
    rider.heading = m.heading; rider.speed = m.speed; rider.moving = Math.min(1, m.speed / 2);
    rider.figure.root.position.copy(this.root.position);
    rider.figure.root.quaternion.copy(this.root.quaternion);
    this.pose(this.fork.rotation.y, m.crankAngle);
  }

  dismount(leaving = false) {
    const player = this.rider;
    if (!player) return true;
    const spot = leaving ? null : this.motor.standingRoom(player.motor.radius, player.motor.height);
    if (!spot && !leaving) return false;
    this.motor.speed = this.motor.steer = 0;
    this.root.rotation.set(this.motor.pitch, this.motor.heading, 0, 'YXZ');
    this.fork.rotation.y = 0; this.kickstand.visible = true;
    this.addCollider();
    player.figure.root.rotation.set(0, this.motor.heading, 0);
    if (spot) player.place(spot, this.world);
    if (!('locomote' in player.figure)) player.figure.walk(0, 0);
    this.rider = this.pose = null;
    return true;
  }
}

export function registerBicycle(world, root, {solid = false, occupied = false}) {
  const bike = new Bicycle(world, root, solid);
  if (occupied) return;
  world.bikes.push(bike);
  world.interactions.push(bike.action);
}
