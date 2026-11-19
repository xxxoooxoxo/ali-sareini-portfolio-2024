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
