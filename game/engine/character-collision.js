// Player collision uses obstacle heights relative to their local terrain. The old
// World.blocked API remains unchanged for chapter layout, NPCs, and camera probes.
const EPS = .015;
function overlapsRect(x,z,r,[x0,x1,z0,z1]){const nx=Math.max(x0,Math.min(x1,x)),nz=Math.max(z0,Math.min(z1,z));return (x-nx)**2+(z-nz)**2<r*r;}
function overlapsCircle(x,z,r,[cx,cz,cr]){return (x-cx)**2+(z-cz)**2<(r+cr)**2;}
export function bodyBlocked(world,x,z,r,feet,height){
  if(world.fence?.(x,z))return true;
  for(const rect of world.rects){if(!overlapsRect(x,z,r,rect))continue;const [x0,x1,z0,z1,h]=rect,base=world.ground((x0+x1)/2,(z0+z1)/2);if(feet<base+h-EPS&&feet+height>base+EPS)return true;}
  for(const circle of world.circles){if(!overlapsCircle(x,z,r,circle))continue;const [cx,cz,,h]=circle,base=world.ground(cx,cz);if(feet<base+h-EPS&&feet+height>base+EPS)return true;}
  return false;
}
export function supportHeight(world,x,z,r,ceiling){
  let floor=world.ground(x,z);
  for(const rect of world.rects){const [x0,x1,z0,z1,h]=rect;if(!Number.isFinite(h)||!overlapsRect(x,z,r,rect))continue;const top=world.ground((x0+x1)/2,(z0+z1)/2)+h;if(top<=ceiling+EPS)floor=Math.max(floor,top);}
  for(const c of world.circles){const [cx,cz,,h]=c;if(!Number.isFinite(h)||!overlapsCircle(x,z,r,c))continue;const top=world.ground(cx,cz)+h;if(top<=ceiling+EPS)floor=Math.max(floor,top);}
  return floor;
}
