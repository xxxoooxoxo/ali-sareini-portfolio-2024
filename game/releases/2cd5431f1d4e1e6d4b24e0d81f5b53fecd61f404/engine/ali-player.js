// The player: the Blender-authored character in its leather outfit. It is the same Figure the bystanders use, so it
// shares their skeleton, clips and poses.
import { Figure } from './figure-blender.js';

export class AliPlayer extends Figure {
  constructor(look = {}) { super({ ...look, portrait: 'ali', height: look.height || 1.8 }); }
}
