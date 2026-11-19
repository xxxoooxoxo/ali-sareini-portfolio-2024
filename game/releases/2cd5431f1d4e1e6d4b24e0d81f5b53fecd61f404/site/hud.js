import { chapters, profile } from '../story.js';
import { drawRadar } from './radar.js';
import { hudStyle } from './hud-style.js';
import { portrait } from './phone-portrait.js';

/** @param {HTMLElement} stage
 * @param {{playable: (id:string)=>boolean, visit: (index:number)=>void, drive: ()=>void, pause: (paused:boolean)=>void,
 * inventory: ReturnType<typeof import('../engine/inventory.js').makeInventory>,
 * firearms: {enabled:boolean, setEnabled:(value:boolean)=>void},
 * sound: {muted: boolean, setMuted: (value:boolean)=>void}}} controls */
export function makeSiteHud(stage, { playable, visit, drive, pause, sound, inventory, firearms }) {
  const style = document.createElement('style');
  style.textContent = hudStyle;
  document.head.append(style);
  const hud = document.createElement('div');
  hud.innerHTML = `
    <div class="life-ident"><h1></h1><div class="life-location" role="status" aria-label="Current chapter"><b></b><span></span></div></div>
    <div class="drive-gauges" hidden><strong></strong> mph <span></span></div>
    <div class="life-radar" hidden><canvas width="112" height="112" role="img" aria-label="Radar. The arrow is you, dots are interactions, a note is a radio, and the diamond is the exit."></canvas><span aria-hidden="true">N</span></div>
    <div class="life-shortcuts">
      <button class="life-phone-key" type="button" aria-haspopup="dialog" aria-controls="life-phone" aria-expanded="false" aria-keyshortcuts="P"><i class="phone-icon" aria-hidden="true"></i>Phone <kbd aria-hidden="true">P</kbd></button>
      <button class="life-inventory-key" type="button" aria-haspopup="dialog" aria-controls="life-phone" aria-expanded="false" aria-keyshortcuts="I"><i class="bag-icon" aria-hidden="true"></i>Inventory <kbd aria-hidden="true">I</kbd></button>
    </div>
    <div class="inventory-pickup" role="status"></div>`;
  stage.append(hud);
  hud.querySelector('h1').textContent = profile.name;
  const chapterNumber = hud.querySelector('.life-location b'), location = hud.querySelector('.life-location span');
  const canvas = hud.querySelector('canvas'), radar = canvas.parentElement;
  const [launcher, bagLauncher] = hud.querySelectorAll('button');
  const pickup = hud.querySelector('.inventory-pickup');
  const gauges = hud.querySelector('.drive-gauges');
  const reading = gauges.querySelector('strong'), counter = gauges.querySelector('span');

  // A native modal keeps Tab and touch inside the handset. Outside the stage,
  // its links and scrolling never reach the game's drag/zoom handlers.
  const phone = document.createElement('dialog');
  phone.id = 'life-phone';
  phone.className = 'life-phone';
  phone.setAttribute('aria-label', profile.name + '’s phone');
  phone.innerHTML = `
    <div class="phone-speaker" aria-hidden="true"></div>
    <div class="phone-screen">
      <div class="phone-status"><span>Phonebook</span><time></time></div>
      <section class="phone-profile">
        <div class="phone-contact"><img class="phone-photo" alt=""><div><h2 tabindex="-1"></h2><span class="phone-role"></span></div></div>
        <p class="phone-bio"></p>
        <div class="phone-list phone-drive"><button type="button"><span>Drive the Mustang</span><span aria-hidden="true">›</span></button></div>
        <div class="phone-list phone-bag"><button type="button">Inventory <span aria-hidden="true">›</span></button></div>
        <nav class="phone-list" aria-label="Profile links">
          <a target="_blank" rel="noopener noreferrer">Nautilus <span aria-hidden="true">↗</span></a>
          <a target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
        </nav>
        <div class="phone-list phone-audio"><button type="button" role="switch" aria-label="Game sound">Game sound <span aria-hidden="true"></span></button>
          <button type="button" role="switch" aria-label="Firearms">Firearms <span aria-hidden="true"></span></button></div>
      </section>
      <section class="phone-chapters" hidden><h2 tabindex="-1">Chapters</h2><nav class="phone-list" aria-label="Visit a chapter"></nav>
        <p class="phone-legend"><span>◆ Exit</span><span>● Interaction</span><span>♪ Radio</span><span>▲ You</span></p></section>
      <section id="life-inventory" class="phone-inventory" hidden><h2 tabindex="-1">Inventory</h2>
        <p class="bag-empty">Your bag is empty. Look for souvenirs at marked spots.</p>
        <div class="bag-items"></div></section>
    </div>
    <div class="phone-softkeys"><button type="button">Chapters</button><button type="button">Close</button></div>`;
  document.body.append(phone);
  const [about, directory, bag] = phone.querySelectorAll('section');
  const itemList = bag.querySelector('.bag-items'), emptyBag = bag.querySelector('p');
  const status = phone.querySelector('.phone-status span'), clock = phone.querySelector('time');
  const [menuKey, closeKey] = phone.querySelectorAll('.phone-softkeys button');
  phone.querySelector('img').src = portrait;
  about.querySelector('h2').textContent = profile.name;
  about.querySelector('.phone-role').textContent = profile.role;
  about.querySelector('.phone-bio').textContent = profile.bio;
  const [work, linkedin] = about.querySelectorAll('a');
  work.href = profile.work; linkedin.href = profile.linkedin;
  const driveRow = about.querySelector('.phone-drive'), driveButton = driveRow.querySelector('button');
  driveRow.toggleAttribute('hidden', !playable('sf'));
  driveButton.addEventListener('click', () => { closePhone(); drive(); });
  about.querySelector('.phone-bag button').addEventListener('click', () => openPage(bag));
  const soundSwitch = about.querySelector('[aria-label="Game sound"]');
  function showSoundSetting() {
    soundSwitch.setAttribute('aria-checked', String(!sound.muted));
    soundSwitch.querySelector('span').textContent = sound.muted ? 'Off' : 'On';
  }
  showSoundSetting();
  soundSwitch.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    showSoundSetting();
  });
  let current = -1, lastMapTime = -Infinity, clockTimer = 0, pickupTimer = 0;
  const firearmsSwitch=about.querySelector('[aria-label="Firearms"]');
  function showFirearmsSetting(){
    firearmsSwitch.setAttribute('aria-checked',String(firearms.enabled));
    firearmsSwitch.querySelector('span').textContent=firearms.enabled?'On':'Off';
  }
  showFirearmsSetting();
  firearmsSwitch.addEventListener('click',()=>{
    firearms.setEnabled(!firearms.enabled);
    showFirearmsSetting();
  });
  const chapterButtons = chapters.map((chapter, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.innerHTML = '<span class="phone-number"></span><span class="chapter-name"></span><span class="chapter-state"></span>';
    row.querySelector('.phone-number').textContent = String(index + 1).padStart(2, '0');
    const name = row.querySelector('.chapter-name'), detail = document.createElement('small');
    name.textContent = chapter.name; detail.textContent = chapter.sub; name.append(detail);
    row.disabled = !playable(chapter.id);
    row.addEventListener('click', () => {
      closePhone();
      if (index !== current) visit(index);
    });
    directory.querySelector('nav').append(row);
    return row;
  });

  function renderBag() {
    const items = inventory.items();
    status.textContent = items.length === 1 ? '1 item' : `${items.length} items`;
    emptyBag.hidden = items.length > 0;
    itemList.replaceChildren(...items.map(item => {
      const row = document.createElement('details'), summary = document.createElement('summary');
      const name = document.createElement('strong'), place = document.createElement('small');
      name.textContent = item.name;
      place.textContent = chapters.find(chapter => chapter.id === item.chapter)?.name ?? item.chapter;
      summary.append(name, place);
      const description = document.createElement('p');
      description.textContent = item.description;
      row.append(summary, description);
      return row;
    }));
  }
  inventory.onCollect(item => {
    pickup.textContent = 'Picked up ' + item.name;
    clearTimeout(pickupTimer);
    pickupTimer = window.setTimeout(() => { pickup.textContent = ''; }, 3000);
  });

  function openPage(page) {
    if (launcher.disabled) return;
    if (page === directory) directory.insertBefore(driveRow,directory.querySelector('.phone-legend'));
    else if (driveRow.parentElement !== about) about.insertBefore(driveRow,about.querySelector('.phone-bag') ?? about.querySelector('nav'));
    about.hidden = page !== about;
    directory.hidden = page !== directory;
    bag.hidden = page !== bag;
    if (page === bag) renderBag();
    else status.textContent = page === about ? 'Phonebook' : 'Navigation';
    menuKey.textContent = page === about ? 'Chapters' : 'Back';
    phone.setAttribute('aria-label', page === bag ? 'Inventory' : profile.name + '’s phone');
    launcher.setAttribute('aria-expanded', String(page !== bag));
    bagLauncher.setAttribute('aria-expanded', String(page === bag));
    if (!phone.open) {
      const refreshClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
      refreshClock();
      clockTimer = window.setInterval(refreshClock, 15000);
      if (document.pointerLockElement) document.exitPointerLock();
      pause(true);
      phone.showModal();
    }
    const first = page === directory ? chapterButtons[current] : page.querySelector('h2');
    first?.focus();
  }
  function closePhone() {
    if (!phone.open) return;
    phone.close();
    clearInterval(clockTimer);
    pause(false);
    launcher.setAttribute('aria-expanded', 'false');
    bagLauncher.setAttribute('aria-expanded', 'false');
    stage.focus({ preventScroll: true });
  }
  function connectLauncher(button, page) {
    button.addEventListener('pointerdown', e => e.stopPropagation());
    button.addEventListener('dblclick', e => e.stopPropagation());
    button.addEventListener('click', e => { e.stopPropagation(); openPage(page); });
  }
  connectLauncher(launcher, about);
  connectLauncher(bagLauncher, bag);
  menuKey.addEventListener('click', () => openPage(about.hidden ? about : directory));
  closeKey.addEventListener('click', closePhone);
  phone.addEventListener('cancel', e => { e.preventDefault(); closePhone(); });
  phone.addEventListener('click', e => {
    if (e.target !== phone) return;
    const r = phone.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePhone();
  });
  addEventListener('keydown', e => {
    if ((e.code !== 'KeyP' && e.code !== 'KeyI') || e.repeat || e.ctrlKey || e.metaKey || e.altKey ||
        (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    e.preventDefault();
    const closeShortcut = bag.hidden ? 'KeyP' : 'KeyI';
    if (phone.open && e.code === closeShortcut) closePhone();
    else openPage(e.code === 'KeyI' ? bag : about);
  });
  phone.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...phone.querySelectorAll('a, button:not(:disabled), summary')].filter(b => b.getClientRects().length);
    const index = buttons.indexOf(document.activeElement);
    const next = index < 0 ? 0 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    const control = buttons[next];
    if (control instanceof HTMLElement) control.focus();
  });

  return {
    get isOpen() { return phone.open; },
    setTraveling(traveling) { launcher.disabled = bagLauncher.disabled = traveling; },
    setDriving(driving) {
      gauges.toggleAttribute('hidden', !driving);
      if (driving) radar.hidden = true;
      driveButton.querySelector('span').textContent = driving ? 'Resume drive' : 'Drive the Mustang';
      if (current >= 0) location.textContent = driving ? 'City Drive' : chapters[current].name;
    },
    updateDrive(speed, lap) {
      const mph = String(Math.round(speed * 2.23694)), lapText = 'Lap ' + lap;
      if (reading.textContent !== mph) reading.textContent = mph;
      if (counter.textContent !== lapText) counter.textContent = lapText;
    },
    setChapter(index) {
      current = index; lastMapTime = -Infinity;
      pickup.textContent = '';
      chapterNumber.textContent = `${String(index+1).padStart(2,'0')} / ${String(chapters.length).padStart(2,'0')}`;
      location.textContent = chapters[index].name;
      chapterButtons.forEach((row, i) => {
        if (i === index) row.setAttribute('aria-current','location'); else row.removeAttribute('aria-current');
        row.querySelector('.chapter-state').textContent = i === index ? 'Here' : row.disabled ? '—' : '›';
      });
    },
    updateMap(world, player, time, opening) {
      if (radar.hidden !== opening) radar.hidden = opening;
      if (opening || time - lastMapTime < .09) return;
      lastMapTime = time;
      drawRadar(canvas, world, player, chapters[current].id === 'yc' ? 13 : 32);
    },
  };
}
