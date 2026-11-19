// Fixed substeps keep thin walls solid at the game's 30 fps and after a slow frame.
// This module is independent of rendering, so jump/collision behavior is testable.
export const MOTION = Object.freeze({walk:1.8,jog:4.2,sprint:8,gravity:18,jumpSpeed:6.4,stepHeight:.32,coyote:.10,buffer:.12});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// The authored gait plants the left foot at a whole cycle, the right halfway through.
export function plantedFoot(player, previousPhase, wasGrounded) {
  if (!wasGrounded || !player.grounded || player.motor.distance <= .001) return null;
  const half = Math.floor(player.phase / Math.PI);
  return half > Math.floor(previousPhase / Math.PI) ? half%2 : null;
}
// Progress from toe-off to touchdown. A higher platform shortens the descent.
export function jumpProgress(verticalSpeed, clearance = Infinity) {
  const progress = clamp((MOTION.jumpSpeed - verticalSpeed) / (2 * MOTION.jumpSpeed), 0, 1);
  if (verticalSpeed > 0 || !Number.isFinite(clearance)) return progress;
  const height = Math.max(0, clearance);
  const impactSpeed = Math.sqrt(verticalSpeed ** 2 + 2 * MOTION.gravity * height);
  const timeLeft = height > 0 ? 2 * height / (impactSpeed - verticalSpeed) : 0;
  return Math.max(progress, 1 - 0.5 * clamp(timeLeft * MOTION.gravity / MOTION.jumpSpeed, 0, 1));
}
export class CharacterMotor {
  constructor(pos,{radius=.35,height=1.8}={}){
    this.pos=pos;this.radius=radius;this.height=height;this.velocity={x:0,y:0,z:0};this.grounded=true;this.supportY=0;this.grace=0;this.jumpBuffer=0;this.jumpHeld=false;this.distance=0;this.desiredHeading=null;this.landed=false;
    this.tookOff = false; this.distanceAtLanding = 0;
  }
  place(x,y,z){Object.assign(this.pos,{x,y,z});Object.assign(this.velocity,{x:0,y:0,z:0});this.grounded=true;this.supportY=y;this.grace=MOTION.coyote;this.jumpBuffer=0;this.jumpHeld=false;this.distance=0;this.landed=false;
    this.tookOff = false; this.distanceAtLanding = 0;
  }
  cancelInput(){this.velocity.x=this.velocity.z=0;this.jumpBuffer=0;this.jumpHeld=false;}
  update(dt,world,axes,yaw){
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);this.distance=0;this.landed=false;
    this.tookOff = false; this.distanceAtLanding = 0;
    const jump=Boolean(axes.jumpPressed)||(Boolean(axes.jump)&&!this.jumpHeld);this.jumpHeld=Boolean(axes.jump);
    if(jump)this.jumpBuffer=MOTION.buffer;
    const ahead=Number(axes.ahead)||0,right=Number(axes.right)||0;
    const wx=Math.cos(yaw)*ahead+Math.sin(yaw)*right,wz=-Math.sin(yaw)*ahead+Math.cos(yaw)*right,len=Math.hypot(wx,wz),want=Math.min(1,len);
    const speed=axes.walk?MOTION.walk:axes.run?MOTION.sprint:MOTION.jog;
    this.desiredHeading=len>.05?Math.atan2(wx,wz):null;
    const targetX=len>.05?wx/len*speed*want:0,targetZ=len>.05?wz/len*speed*want:0;
    const steps=Math.max(1,Math.ceil(dt/(1/120))),h=dt/steps;
    for(let i=0;i<steps;i++){
      this.jumpBuffer=Math.max(0,this.jumpBuffer-h);this.grace=this.grounded?MOTION.coyote:Math.max(0,this.grace-h);
      if(this.jumpBuffer>0&&(this.grounded||this.grace>0)){
        this.velocity.y=MOTION.jumpSpeed;this.grounded=false;this.grace=0;this.jumpBuffer=0;
        // A buffered jump can begin in the same frame as ground contact.
        this.tookOff = true; this.landed = false;
      }
      const response=this.grounded?14:len>.05?4:.7,blend=1-Math.exp(-h*response);
      this.velocity.x+=(targetX-this.velocity.x)*blend;this.velocity.z+=(targetZ-this.velocity.z)*blend;
      const oldX=this.pos.x,oldZ=this.pos.z,oldY=this.pos.y;
      const move=(x,z)=>{
        const ground=world.ground(x,z),allowStep=this.grounded?MOTION.stepHeight:0;
        if(ground>this.pos.y+allowStep+.015)return false;
        // Terrain stairs can raise the capsule; solid colliders require an actual jump.
        const feet=this.grounded?Math.max(this.pos.y,ground):this.pos.y;
        return !world.bodyBlocked(x,z,this.radius,feet,this.height);
      };
      const x=this.pos.x+this.velocity.x*h;
      if(move(x,this.pos.z))this.pos.x=x;else this.velocity.x=0;
      const z=this.pos.z+this.velocity.z*h;
      if(move(this.pos.x,z))this.pos.z=z;else this.velocity.z=0;
      this.distance+=Math.hypot(this.pos.x-oldX,this.pos.z-oldZ);
      const floor=world.supportHeight(this.pos.x,this.pos.z,this.radius,oldY+(this.grounded?MOTION.stepHeight:.015));this.supportY=floor;
      if(this.grounded){
        if(Math.abs(this.pos.y-floor)<=MOTION.stepHeight+.015){this.pos.y=floor;this.velocity.y=0;}
        else this.grounded=false;
      }
      if(!this.grounded){
        this.pos.y+=this.velocity.y*h-.5*MOTION.gravity*h*h;this.velocity.y-=MOTION.gravity*h;
        if(this.velocity.y<=0&&this.pos.y<=floor&&oldY>=floor-.02){
          this.pos.y=floor;this.velocity.y=0;this.grounded=true;this.grace=MOTION.coyote;
          this.landed = true; this.distanceAtLanding = this.distance;
        }
      }
    }
  }
}
