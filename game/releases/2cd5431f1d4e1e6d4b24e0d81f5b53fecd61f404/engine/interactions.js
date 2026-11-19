// x/y/z marks the object. Measure reach from the player's torso, so an action
// on the ground below a platform doesn't also appear on top of the platform.
/**
 * @template {{ x: number, y: number, z: number, r: number, kind?: string, label: string | null, act(player: object): void }} T
 * @param {T[]} interactions
 * @param {{ x: number, y: number, z: number }} feet
 */
export function nearestInteraction(interactions, feet, extraReach = 0) {
  let nearest = null, best = Infinity;
  for (const action of interactions) {
    if (!action.label) continue;
    const distance = (feet.x - action.x) ** 2 + (feet.y + 1.2 - action.y) ** 2 + (feet.z - action.z) ** 2;
    if (distance < best && distance <= (action.r + extraReach) ** 2) {
      nearest = action;
      best = distance;
    }
  }
  return nearest;
}

// The same object supplies the visible pickup and the map marker. Omit both on revisiting a chapter.
export function addPickup(world, inventory, id, mesh, label) {
  if (!inventory || inventory.has(id)) return;
  mesh.name = id;
  world.scene.add(mesh);
  const { x, y, z } = mesh.position;
  const action = {
    x, y: y + .65, z, r: 2.2, label,
    act() {
      inventory.collect(id);
      mesh.visible = false;
      action.label = null;
    },
  };
  world.interactions.push(action);
}
