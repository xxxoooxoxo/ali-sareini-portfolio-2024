// Input, the character you walk as, and the camera that follows behind.
import * as THREE from 'three';
import { clamp } from 'life/engine/look.js';
import { Figure } from 'life/engine/figure.js';
import { AliPlayer } from 'life/engine/ali-player.js';
const makePlayerFigure = look => look.portrait === 'ali' ? new AliPlayer(look) : new Figure(look);
import { CharacterMotor, MOTION } from 'life/engine/movement.js';
import { CAT_TOSS } from 'life/engine/weapon-models.js';

const GAME_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','AltLeft','AltRight','Space','KeyC','KeyE','KeyR','KeyQ','KeyJ']);
const turnToward = (from,to,share) => from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*share;

export function makeInput(stage,onFirstUse,gearNames){
  const keys=new Set(),drags=new Map();let jumpPending=false,touchSprint=false,takeControl=false,lastPointer='mouse',dragged=false,dragDistance=0;
  let offeredAction = null, pressedAction = null;
  let tunePending = false;
  let firePending=false, fireHeld=false;
  const gearButton=document.createElement('button');
  gearButton.type='button'; gearButton.className='gear-key'; gearButton.setAttribute('aria-keyshortcuts','Q');
  gearButton.innerHTML='<kbd aria-hidden="true">Q</kbd><span>Gear</span><i aria-hidden="true">↻</i>';
  stage.append(gearButton);
  const actions = document.createElement('div');
  actions.className = 'game-actions';
  actions.innerHTML = `
    <button type="button" data-action="interact" aria-keyshortcuts="E" hidden><kbd aria-hidden="true">E</kbd><span></span></button>
    <button type="button" data-action="fire" aria-label="Fire weapon" aria-keyshortcuts="J" hidden>FIRE</button>
    <button type="button" data-action="sprint" aria-label="Sprint" aria-pressed="false">SPRINT</button>
    <button type="button" data-action="jump" aria-label="Jump">JUMP</button>`;
  stage.appendChild(actions);
  const pedals = document.createElement('div');
  pedals.className = 'drive-controls'; pedals.hidden = true;
  pedals.innerHTML = `<div><button type="button" data-drive="left" aria-label="Steer left"><kbd>A</kbd> ◀</button>
    <button type="button" data-drive="right" aria-label="Steer right"><kbd>D</kbd> ▶</button></div>
    <button type="button" data-tune aria-label="Tune car radio" aria-keyshortcuts="R" title="Tune car radio (R)"><kbd>R</kbd> <span>FM</span></button>
    <div><button type="button" data-drive="brake"><kbd>S</kbd> Brake</button><button type="button" data-drive="gas"><kbd>W</kbd> Gas</button></div>`;
  stage.append(pedals);
  const heldPedals = new Map();
  const interact = /** @type {HTMLButtonElement} */ (actions.querySelector('[data-action="interact"]'));
  const label = interact.querySelector('span');
  const sprint = actions.querySelector('[data-action="sprint"]'), jump = actions.querySelector('[data-action="jump"]');
  actions.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  const input={keys,stick:{x:0,y:0},lookX:0,lookY:0,zoom:0,used:false,suspended:false,resetVersion:0,gear:0,get touch(){return actions.classList.contains('touch');}};
  const use=()=>{takeControl=true;actions.classList.add('active');if(!input.used){input.used=true;onFirstUse?.();}};
  const rememberPointer = (e) => {
    lastPointer = e.pointerType || 'mouse';
    actions.classList.toggle('touch', lastPointer === 'touch');
  };
  const focus=()=>stage.focus({preventScroll:true});
  const active=()=>!input.suspended && (document.pointerLockElement===stage||stage.contains(document.activeElement));
  const held=(...codes)=>codes.some(c=>keys.has(c));
  const fireButton=/** @type {HTMLButtonElement} */ (actions.querySelector('[data-action="fire"]'));
  input.selectGear = index => {
    input.gear=index; firePending=fireHeld=false;
    gearButton.querySelector('span').textContent=gearNames[index];
    const next=gearNames[(index+1)%gearNames.length];
    gearButton.setAttribute('aria-label',(index ? gearNames[index] : 'Unarmed')+' · '+(index===gearNames.length-1 ? 'Holster' : 'Equip '+next));
    const cats=index===CAT_TOSS;
    stage.classList.toggle('cat-toss',cats);
    gearButton.title=cats?'Switch gear (Q) · Toss cat (J or click)':'Switch gear (Q) · Fire (J or click)';
    fireButton.textContent=cats?'TOSS':'FIRE';
    fireButton.setAttribute('aria-label',cats?'Toss cat':'Fire weapon');
    fireButton.hidden=!index; stage.classList.toggle('armed',Boolean(index));
  };
  input.selectGear(0);
  const canEquip=()=>!input.suspended && pedals.hidden && !stage.querySelector('#fade.on');
  const cycleGear=()=>{
    if(!canEquip() || gearButton.hidden)return;
    focus();use();
    input.selectGear((input.gear+1)%gearNames.length);
  };
  gearButton.addEventListener('pointerdown',e=>{e.stopPropagation();rememberPointer(e);});
  gearButton.addEventListener('dblclick',e=>e.stopPropagation());
  gearButton.addEventListener('click',e=>{e.stopPropagation();cycleGear();});
  input.consumeFire=()=>{
    const fire=firePending || (input.gear===2 && (fireHeld || keys.has('KeyJ')));
    firePending=false; return fire;
  };
  input.axes=()=>({ahead:Number(held('KeyW','ArrowUp'))-Number(held('KeyS','ArrowDown'))-input.stick.y,right:Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft'))+input.stick.x,run:held('ShiftLeft','ShiftRight')||touchSprint,walk:held('AltLeft','AltRight'),jump:held('Space'),lookBack:held('KeyC')});
  input.consumeJump=()=>{const value=jumpPending;jumpPending=false;return value;};
  input.consumeControl=()=>{const value=takeControl;takeControl=false;return value;};
  input.consumeInteraction = () => {
    const action = pressedAction;
    pressedAction = null;
    return action;
  };
  input.reset=()=>{keys.clear();drags.clear();heldPedals.clear();input.stick.x=input.stick.y=0;input.lookX=input.lookY=input.zoom=0;jumpPending=false;touchSprint=false;takeControl=false;tunePending=false;firePending=fireHeld=false;pressedAction=null;input.resetVersion++;sprint.setAttribute('aria-pressed','false');};
  input.setDriving = driving => {
    input.reset(); input.offerInteraction(null);
    pedals.hidden = !driving;
    stage.classList.toggle('driving', driving);
  };
  input.driveAxes = () => {
    const {right, lookBack} = input.axes(), down = new Set(heldPedals.values());
    const brake = down.has('brake') || held('KeyS','ArrowDown');
    const gas = down.has('gas') || held('KeyW','ArrowUp');
    const {lookX,lookY,zoom} = input;
    input.lookX = input.lookY = input.zoom = 0;
    const tune = tunePending; tunePending = false;
    return { ahead: brake ? -1 : gas ? 1 : clamp(-input.stick.y,-1,1),
      right: clamp(right + Number(down.has('right')) - Number(down.has('left')),-1,1), lookBack, lookX, lookY, zoom, tune };
  };
  addEventListener('keydown',e=>{
    const onActionButton = e.code === 'KeyE' && e.target === interact;
    const formControl = ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target?.tagName);
    if (!active() || !GAME_KEYS.has(e.code) || (formControl && !onActionButton)) return;
    if (e.code==='KeyQ' || e.code==='KeyJ') {
      if (e.metaKey || e.ctrlKey || e.altKey || !canEquip()) return;
      if (!e.repeat && !keys.has(e.code)) {
        if(e.code==='KeyQ') cycleGear(); else if(input.gear) firePending=true;
      }
    }
    if (e.code === 'KeyR') {
      if (pedals.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.repeat && !keys.has(e.code)) tunePending = true;
    }
    if (e.code === 'KeyE') {
      if (e.metaKey || e.ctrlKey) return;
      if (onActionButton) focus();
      if (!e.repeat && !keys.has(e.code)) pressedAction = offeredAction;
    }
    actions.classList.remove('touch');
    e.preventDefault();if(e.code==='Space'&&!keys.has('Space')&&!e.repeat)jumpPending=true;keys.add(e.code);use();
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  addEventListener('blur',()=>input.reset());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)input.reset();});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==stage)input.reset();});
  document.addEventListener('mousemove',e=>{if(!input.suspended&&document.pointerLockElement===stage){input.lookX+=e.movementX;input.lookY+=e.movementY;use();}});
  stage.addEventListener('pointerdown',e=>{
    if(input.suspended||e.target.closest?.('.game-actions,.drive-controls'))return;
    focus();use();rememberPointer(e);dragged=false;dragDistance=0;
    if(document.pointerLockElement===stage){
      if(e.button===0 && input.gear) fireHeld=firePending=true;
      return;
    }
    try{stage.setPointerCapture(e.pointerId);}catch{}
    const r=stage.getBoundingClientRect();drags.set(e.pointerId,{x:e.clientX,y:e.clientY,look:e.pointerType!=='touch'||e.clientX-r.left>r.width/2});
  });
  stage.addEventListener('pointermove',e=>{
    if(document.pointerLockElement===stage)return;
    const d=drags.get(e.pointerId);if(!d)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!dx&&!dy)return;dragDistance+=Math.hypot(dx,dy);if(dragDistance>4)dragged=true;use();
    if(d.look){input.lookX+=dx;input.lookY+=dy;d.x=e.clientX;d.y=e.clientY;}
    else{input.stick.x=clamp(dx/50,-1,1);input.stick.y=clamp(dy/50,-1,1);}
  });
  const release=e=>{const d=drags.get(e.pointerId);if(d&&!d.look)input.stick.x=input.stick.y=0;drags.delete(e.pointerId);};
  stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
  stage.addEventListener('click',e=>{
    if(input.suspended||e.target.closest?.('.game-actions,.drive-controls')||lastPointer!=='mouse'||dragged||document.pointerLockElement===stage)return;
    if(input.gear && e.button===0) firePending=true;
    try{const request=stage.requestPointerLock?.();request?.catch(()=>{});}catch{} // Drag-look remains available in restricted iframes.
  });
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  stage.addEventListener('wheel',e=>{e.preventDefault();input.zoom+=Math.sign(e.deltaY)*.45;use();},{passive:false});
  input.offerInteraction = (action) => {
    const text = action?.label ?? '';
    if (offeredAction === action && label.textContent === text) return;
    if (offeredAction !== action) pressedAction = null;
    offeredAction = action;
    interact.hidden = !action;
    label.textContent = text;
    actions.classList.toggle('nearby', Boolean(action));
  };
  const press = (button, fn) => button.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    rememberPointer(e); focus(); use();
    try { button.setPointerCapture(e.pointerId); } catch {}
    fn(e);
  });
  const tuner = pedals.querySelector('[data-tune]');
  input.setFrequency = station => {
    tuner.querySelector('span').textContent = station ? station.frequency.toFixed(1)+' FM' : 'Radio off';
    tuner.setAttribute('aria-label','Tune car radio, '+(station?.name ?? 'off'));
  };
  tuner.addEventListener('dblclick', e => e.stopPropagation());
  tuner.addEventListener('click', e => {
    e.stopPropagation();
    if (!pedals.hidden && !input.suspended) { tunePending = true; focus(); }
  });
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (pedals.querySelectorAll('[data-drive]'))) {
    press(button, e => heldPedals.set(e.pointerId,button.dataset.drive));
    for (const type of /** @type {const} */ (['pointerup','pointercancel','lostpointercapture'])) {
      button.addEventListener(type,e => heldPedals.delete(e.pointerId));
    }
    // Native keyboard activation also operates a pedal while its button has focus.
    button.addEventListener('keydown',e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); heldPedals.set('keyboard',button.dataset.drive); }
    });
    button.addEventListener('keyup',e => { if (e.key === ' ' || e.key === 'Enter') heldPedals.delete('keyboard'); });
    button.addEventListener('blur',() => heldPedals.delete('keyboard'));
  }
  pedals.addEventListener('dblclick',e => e.stopPropagation());
  press(interact, () => { pressedAction = offeredAction; });
  interact.addEventListener('click', e => {
    if (e.detail === 0) { focus(); use(); pressedAction = offeredAction; }
  });
  actions.addEventListener('dblclick',e=>e.stopPropagation());
  press(fireButton,()=>{if(input.gear && canEquip()) fireHeld=firePending=true;});
  fireButton.addEventListener('click',e=>{if(!e.detail && input.gear && canEquip()){focus();use();firePending=true;}});
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    fireButton.addEventListener(type,()=>{fireHeld=false;});
  }
  stage.addEventListener('pointerup',e=>{if(e.pointerType==='mouse') fireHeld=false;});
  press(jump,()=>jumpPending=true);press(sprint,()=>{touchSprint=true;sprint.setAttribute('aria-pressed','true');});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])sprint.addEventListener(type,()=>{touchSprint=false;sprint.setAttribute('aria-pressed','false');});
  jump.addEventListener('click',e=>{if(e.detail===0){focus();use();jumpPending=true;}});
  sprint.addEventListener('click',e=>{if(e.detail===0){touchSprint=!touchSprint;sprint.setAttribute('aria-pressed',String(touchSprint));focus();use();}});
  if(!document.getElementById('game-action-style')){const style=document.createElement('style');style.id='game-action-style';style.textContent=`
    .game-actions{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .15s;position:absolute;right:12px;bottom:70px;z-index:3;display:flex;gap:8px}
    .game-actions.active{visibility:visible;opacity:1;pointer-events:auto}
    .game-actions.nearby{visibility:visible;opacity:1}
    .game-actions.nearby [data-action="interact"]{pointer-events:auto}
    .game-actions.nearby:not(.active) button:not([data-action="interact"]){visibility:hidden}
    .game-actions button{touch-action:none;border:1px solid #ffffff80;border-radius:50%;width:56px;height:56px;background:#17202799;color:white;font:11px ui-monospace,monospace;text-shadow:0 1px 2px #000;cursor:pointer}
    .game-actions button:active,.game-actions button[aria-pressed=true]{background:#ffffff55}
    .game-actions button:focus-visible{outline:2px solid white;outline-offset:3px}
    .game-actions [data-action="interact"]{position:absolute;right:0;bottom:calc(100% + 8px);width:max-content;height:auto;min-height:44px;padding:6px 12px;border-radius:4px;background:#172027db;font:500 clamp(15px,calc(16 * var(--u, 1px)),22px) 'Pixelify Sans',monospace}
    .game-actions kbd{font:inherit;border:1px solid currentColor;padding:0 4px;margin-right:8px}
    .game-actions.touch kbd{display:none}
    @media(pointer:coarse){.game-actions{bottom:24px}.game-actions button{width:64px;height:64px}}
  `;document.head.appendChild(style);}
  return input;
}

const BODY_RADIUS = 0.35;
const LANDING_SECONDS = 0.30;

export class Player {
  constructor(look){
    this.figure=makePlayerFigure(look);this.pos=new THREE.Vector3();this.motor=new CharacterMotor(this.pos,{radius:BODY_RADIUS,height:look.height||1.8});
    this.heading=0;this.phase=0;this.moving=0;this.speed=0;this.running=false;this.landing=0;this.inputVersion=0;this.turnLean=0;
  }
  get grounded(){return this.motor.grounded;}
  get verticalVelocity(){return this.motor.velocity.y;}
  get supportY(){return this.motor.supportY;}
  dress(look){this.figure.dispose?.();this.figure.root.removeFromParent();this.figure=makePlayerFigure(look);this.motor.height=this.figure.look.height;}
  place({x,z,heading},world){this.motor.place(x,world.ground(x,z),z);this.heading=heading;this.moving=0;this.speed=0;this.running=false;this.landing=0;this.turnLean=0;this.sync();}
  update(dt,world,input,camYaw){
    if(input.resetVersion!==undefined&&input.resetVersion!==this.inputVersion){this.motor.cancelInput();this.inputVersion=input.resetVersion;}
    const axes=input.axes();this.running=Boolean(axes.run&&!axes.walk);
    const beforeX = this.motor.velocity.x, beforeZ = this.motor.velocity.z;
    this.motor.update(dt,world,{...axes,jumpPressed:input.consumeJump?.()||false},camYaw);
    this.landing=this.motor.landed ? LANDING_SECONDS : Math.max(0,this.landing-dt);
    // Resume on the leading foot, counting only travel after the touchdown substep.
    const strideLanding = this.motor.landed && this.speed > 1.5 && this.figure.airborne && this.figure.landingPhase;
    if (strideLanding) this.phase = this.figure.landingPhase();
    if(this.motor.desiredHeading!==null)this.heading=turnToward(this.heading,this.motor.desiredHeading,1-Math.exp(-dt*12));
    const actual=dt>0?this.motor.distance/dt:0,want=clamp(actual/(this.running?MOTION.sprint:MOTION.jog),0,1);
    // Bank toward the acceleration across the runner's path. A straight start, stop or reversal has no side force.
    const beforeSpeed = Math.hypot(beforeX, beforeZ);
    const lateral = this.grounded && beforeSpeed > MOTION.walk && dt > 0
      ? (beforeZ * this.motor.velocity.x - beforeX * this.motor.velocity.z) / (beforeSpeed * dt) : 0;
    const runShare = clamp((actual - MOTION.walk) / (MOTION.jog - MOTION.walk), 0, 1);
    const lean = runShare * clamp(Math.atan2(lateral, MOTION.gravity), -0.22, 0.22);
    this.turnLean += (lean - this.turnLean) * (1 - Math.exp(-dt * 9));
    this.moving+=(want-this.moving)*(1-Math.exp(-dt*14));
    // The gait follows the speed actually made good, eased so a step does not snap between walk and run.
    this.speed+=(actual-this.speed)*(1-Math.exp(-dt*10));if(this.speed<.02&&actual===0)this.speed=0;
    // A first step from standing starts where the walk is closest to standing, so the feet do not jump apart.
    if(this.grounded&&this.motor.distance>0&&this.figure.standing>=.999&&this.figure.startPhase)this.phase=this.figure.startPhase(axes.walk);
    const strideDistance = this.motor.distance - (strideLanding ? this.motor.distanceAtLanding : 0);
    this.phase+=strideDistance*this.phaseRate(Math.max(this.speed,actual));this.sync(dt,this.motor.tookOff);
  }
  // Radians of walk cycle for each metre travelled. A model with authored gaits sets it from its stride, so planted feet do not slide.
  phaseRate(speed){return this.figure.phasePerMetre?this.figure.phasePerMetre(speed):this.running?1.5:2.1;}
  // dt is the time since the last frame in play. Without it the figure is posed at once, as for a still or a new place.
  sync(dt=0,tookOff=false){
    this.figure.dt=dt;
    this.figure.place(this.pos.x,this.pos.y,this.pos.z,this.heading);
    const speed=this.grounded?this.speed:Math.hypot(this.motor.velocity.x,this.motor.velocity.z);
    if(!this.grounded)this.figure.jump(this.verticalVelocity,speed,this.pos.y-this.supportY,tookOff);
    else if(this.landing>0)this.figure.land(this.phase,this.moving*(this.running?1.4:1),this.landing/LANDING_SECONDS,speed,this.turnLean);
    else if(this.figure.locomote)this.figure.locomote(this.phase,speed,undefined,this.turnLean);
    else this.figure.walk(this.phase,this.moving*(this.running?1.4:1));
  }
}

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = -0.04; this.dist = 6;
    this.shoulder = 0.8; // metres the camera sits to your right, so you stand left of centre and the view ahead stays open
    this.focusY = null; this.groundY = null; this.aimMix=0;
    this.hold = 0;  // seconds left before the camera drifts back behind you after a drag
  }

  reset(player){this.groundY=player.pos.y;this.focusY=player.pos.y+2.15;this.hold=0;this.aimMix=0;}

  update(dt, player, world, input) {
    if(input.zoom){this.dist=clamp(this.dist+input.zoom,2.3,9);input.zoom=0;}
    if (input.lookX || input.lookY) {
      this.yaw -= input.lookX * 0.005;
      this.pitch = clamp(this.pitch - input.lookY * 0.005, -0.7, 0.9);
      input.lookX = input.lookY = 0; this.hold = 1.5;
    }
    this.hold = Math.max(0, this.hold - dt);
    // While you walk, the camera swings round to sit behind you. It does not when you walk toward it.
    if (player.moving > 0.3 && !this.hold && !input.gear) {
      const behind = player.heading - Math.PI / 2;
      this.yaw = turnToward(this.yaw, behind, (1 - Math.exp(-dt * 1.6)) * clamp(0.5 + 0.5 * Math.cos(behind - this.yaw)));
    }
    const viewYaw=this.yaw+(input.axes().lookBack?Math.PI:0);
    const cp = Math.cos(this.pitch), dx = cp * Math.cos(viewYaw), dy = Math.sin(this.pitch), dz = -cp * Math.sin(viewYaw);
    // The pivot sits above your head, so you stand in the lower part of the frame and the view stays open.
    if (player.grounded || this.groundY === null) this.groundY = player.pos.y;
    const rise = Math.max(0, player.pos.y - this.groundY);
    this.aimMix+=((input.gear ? 1 : 0)-this.aimMix)*(1-Math.exp(-dt*9));
    const targetY=player.pos.y+2.15-.54*this.aimMix-0.65*rise;this.focusY=this.focusY===null?targetY:this.focusY+(targetY-this.focusY)*(1-Math.exp(-dt*12));
    const px = player.pos.x, py = this.focusY, pz = player.pos.z;
    const followDist=this.dist+(Math.min(this.dist,3.15)-this.dist)*this.aimMix;
    let dist = followDist;
    for (let s = 0.4; s <= followDist; s += 0.3) {
      if (world.blocked(px - dx * s, pz - dz * s, 0.25, py - dy * s)) { dist = Math.max(0.6, s - 0.3); break; } // pull in when a wall is in the way
    }
    let cx = px - dx * dist, cz = pz - dz * dist;
    const side = this.shoulder * (dist / followDist) ** 2; // in a tight spot the camera moves back in line with you
    const sx = cx + Math.sin(viewYaw) * side, sz = cz + Math.cos(viewYaw) * side;
    if (!world.blocked(sx, sz, 0.25, py - dy * dist)) { cx = sx; cz = sz; }
    const cy = Math.max(py - dy * dist, world.ground(cx, cz) + 0.35);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(cx + dx, cy + dy, cz + dz);
  }
}
