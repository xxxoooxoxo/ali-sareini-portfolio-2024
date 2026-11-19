// Inlined with the game so the single-file pages also carry their own HUD.
export const hudStyle = `
  .gear-key { position:absolute; right:12px; top:64px; z-index:3; display:flex; align-items:center;
    gap:7px; min-height:44px; padding:3px 9px; border:1px solid #b5ada1; border-bottom-width:3px; border-radius:4px;
    color:#f8ebd4; background:#202724e8; cursor:pointer; font:500 15px 'Pixelify Sans',monospace; }
  .gear-key i { color:#f4ca80; font:18px/1 sans-serif; }
  .gear-key kbd { font:11px monospace; border:1px solid #9b9e8d; border-radius:2px; padding:2px; }
  #stage.armed .gear-key { color:#ffdd91; border-color:#f3c36c; }
  #stage .gear-key[hidden] { display:none; }
  #stage.armed .game-actions { opacity:1;visibility:visible;pointer-events:auto; }
  #stage.armed::after { content:''; position:absolute; z-index:1; pointer-events:none;
    top:50%; left:50%; width:10px; height:10px; transform:translate(-50%,-50%);
    border:2px solid #fff8d8; border-radius:50%; box-shadow:0 0 0 1px #252420, inset 0 0 0 1px #252420; }
  #stage .game-actions [data-action="fire"] { color:#ffdc94; border-color:#e9c888; }
  #stage.cat-toss .gear-key, #stage.cat-toss .game-actions [data-action="fire"] { color:#bdfff0; border-color:#64ccba; }
  #stage.cat-toss::after { border-color:#b4f5df; }
  #stage.driving .gear-key { display:none; }
  @media(pointer:coarse) { .gear-key kbd { display:none; } }
  @media(max-height:420px) { .gear-key { top:57px; } }
  #stage :is(#title,#caption) {
    top: auto; left: auto; right: 4%; max-width: 87%; padding: 0;
    text-align: right; color: var(--chapter-ink,#ffd288); line-height: 1;
    transition: opacity .55s ease-out, transform .55s ease-out;
  }
  #stage #title { bottom: 23%; }
  #stage #caption { bottom: max(100px,14%); }
  #stage :is(#title,#caption).off { transform: translateY(5px); }
  #stage #title-main, #stage #caption span {
    display: block; padding: 0 .08em .08em 0;
    font: italic 900 clamp(36px,calc(54 * var(--u,1px)),88px)/.98 Georgia,'Times New Roman',serif;
    letter-spacing: -.055em; -webkit-text-stroke: .082em #211d20; paint-order: stroke fill;
    text-shadow: .045em .065em 0 #211d20,.06em .095em 0 #211d20,0 .11em .14em #140e146b;
  }
  #stage #caption span { font-size: clamp(25px,calc(36 * var(--u,1px)),57px); }
  #stage :is(#title-top,#caption small) {
    display: flex; align-items: center; justify-content: flex-end; gap: .65em; margin-bottom: .45em;
    color: #fff3d7; font: bold clamp(10px,calc(11 * var(--u,1px)),17px)/1.1 'Pixelify Sans',monospace;
    text-transform: uppercase; letter-spacing: .16em;
  }
  #stage :is(#title-top,#caption small)::before { content: ''; width: 2.1em; height: 2px; background: var(--chapter-ink); box-shadow: 1px 1px #211d20; }
  #stage :is(#title-top,#caption small):empty { display: none; }
  #stage #title-sub { margin-top: .35em; color: #fff3db; font-size: clamp(12px,calc(15 * var(--u,1px)),23px); }
  #stage #hint { text-align: left; font-size: clamp(10px,calc(12 * var(--u,1px)),15px); }
  #stage[data-shape="wide"]:has(.life-radar:not([hidden])) #hint { left: clamp(94px,11vw,130px); }
  #stage .game-actions:not(.touch) button:not([data-action="interact"]) {
    width: auto; height: 28px; padding: 0 8px; border-radius: 3px; font-size: 10px; background: #151b1cbf;
  }
  #stage:not(.driving) .game-actions:not(.touch) { bottom: 10px; }
  #stage:has(.game-actions.touch) #caption { bottom: max(150px,24%); }
  #stage.driving #caption { bottom: max(130px,24%); }
  @media (prefers-reduced-motion: reduce) {
    #stage :is(#title,#caption) { transition: none; }
    #stage :is(#title,#caption).off { transform: none; }
  }
  .life-ident, .life-radar, .life-shortcuts, .inventory-pickup {
    --ink: #171c1e; --cream: #fff2c8; position: absolute; z-index: 1;
    font-family: 'Pixelify Sans', ui-monospace, monospace;
  }
  .life-ident { top: 16px; left: 17px; pointer-events: none; color: #fff9e7; line-height: 1; }
  .life-ident h1 { margin: 0; font-size: clamp(20px, 2.3vw, 32px); font-weight: 600;
    text-shadow: -2px -1px var(--ink), 2px -1px var(--ink), -2px 2px var(--ink), 2px 2px var(--ink), 0 3px var(--ink); }
  .life-location { display: flex; align-items: center; gap: 7px; width: max-content; margin-top: 5px;
    padding: 3px 9px 3px 6px; background: linear-gradient(100deg,#11191be8,#11191bae);
    border-left: 3px solid #f3c36c; color: var(--cream); font-size: 13px; }
  .life-location b { color: #f3c36c; font-size: 11px; font-weight: 500; }
  .life-radar { left: 17px; bottom: 19px; width: clamp(78px, 9vw, 116px); aspect-ratio: 1;
    border-radius: 50%; padding: 3px; box-sizing: border-box; background: #171e1e; border: 2px solid #e3e3ce;
    box-shadow: 0 0 0 2px #222725, 1px 4px 4px #0009; pointer-events: none; }
  #stage .life-radar canvas { width: 100%; height: 100%; border-radius: 50%; image-rendering: pixelated; }
  .life-radar span { position: absolute; left: 50%; top: -8px; transform: translateX(-50%); background: #1b2423;
    color: var(--cream); padding: 0 3px; font: 600 12px 'Pixelify Sans',monospace; line-height: 1; }
  .life-shortcuts { top: 12px; right: 12px; z-index: 3; display: flex; gap: 7px; }
  .life-shortcuts button { min-height: 44px; padding: 5px 10px; cursor: pointer; touch-action: manipulation;
    display: flex; align-items: center; gap: 7px; border: 1px solid #efe1af; border-bottom-width: 3px;
    border-radius: 5px; color: #fff5d5; background: linear-gradient(#333c39eb,#151d1bef);
    box-shadow: 0 0 0 2px #12191a, 0 3px 4px #0008; font: inherit; font-size: 17px; line-height: 1; }
  #stage:has(#full) .life-shortcuts { right: calc(max(28px, 30 * var(--u, 1px)) + max(10px, 10 * var(--u, 1px)) + 10px); }
  .life-shortcuts kbd { font: 12px ui-monospace, monospace; padding: 2px 3px; border: 1px solid #9b9e8d; border-radius: 2px; }
  .phone-icon { display: inline-block; width: 10px; height: 17px; border-radius: 2px; border: 1px solid #b7b59f;
    box-sizing: border-box; background: linear-gradient(to bottom,#535c53 14%,#b9d39a 15% 49%,#556454 50% 59%,#bebdab 60% 66%,#536054 67% 75%,#bebdab 76% 83%,#536054 84%); }
  .bag-icon { position: relative; width: 13px; height: 13px; box-sizing: border-box; margin-top: 3px;
    border: 1px solid #c6b48d; border-radius: 3px 3px 2px 2px; background: linear-gradient(#897653 45%,#d3bf90 46% 55%,#685a45 56%); }
  .bag-icon::before { content: ''; position: absolute; left: 2px; top: -5px; width: 5px; height: 3px;
    border: 1px solid #c6b48d; border-radius: 2px 2px 0 0; }
  .life-shortcuts button:hover, .life-shortcuts button:focus-visible { outline: 2px solid #ffdb8e; outline-offset: 3px; }
  .life-shortcuts button:disabled { opacity: .55; cursor: default; }
  .inventory-pickup { left: 17px; top: 80px; max-width: min(260px,calc(100% - 36px)); pointer-events: none;
    color: #fff3cb; font-size: 15px; line-height: 1.25; }
  .inventory-pickup:not(:empty) { padding: 5px 9px; background: #17201ee8; border-left: 3px solid #f3c36c; }
  .drive-gauges { position: absolute; left: 16px; top: 78px; z-index: 1; color: #fff2c8; background: #17201ee8;
    padding: 3px 8px; border-left: 3px solid #8ed2bf; font-size: 13px; line-height: 1.2; pointer-events: none; }
  .drive-gauges strong { font-size: 20px; } .drive-gauges span { margin-left: 9px; color: #f3c36c; }
  #stage[data-shape="tall"] .drive-gauges { left: 12px; top: 63px; }
  .drive-controls:not([hidden]) { display: flex; justify-content: space-between; position: absolute; z-index: 3;
    bottom: 17px; left: 12px; right: 12px; pointer-events: none; }
  .drive-controls div { display: flex; gap: 5px; }
  .drive-controls button { touch-action: none; pointer-events: auto; min-width: 44px; height: 49px; padding: 5px 8px; border-radius: 5px;
    border: 1px solid #e8deba; border-bottom-width: 3px; color: #fff6d5; background: #202a27da; cursor: pointer; font: 500 15px 'Pixelify Sans',monospace; }
  .drive-controls button:active { background: #655c3d; } .drive-controls button:focus-visible { outline: 2px solid #ffd58e; }
  .drive-controls kbd { font: 11px ui-monospace,monospace; color: #e8d491; }
  @media(pointer:coarse), (max-width:450px) { .drive-controls kbd { display: none; } }
  #stage.driving .game-actions { bottom: 78px; }
  #stage.driving .game-actions [data-action="interact"] { bottom: 0; }
  #stage.driving .game-actions button:not([data-action="interact"]), #stage.driving #hint { display: none; }
  .life-phone { box-sizing: border-box; width: min(336px,calc(100vw - 26px)); max-height: calc(100dvh - 20px);
    margin: auto; padding: 16px 17px 18px; overflow: auto; overscroll-behavior: contain; touch-action: pan-y;
    border: 3px solid #424a4b; border-radius: 38px 38px 31px 31px;
    background: linear-gradient(105deg,#374044 0%,#657070 6%,#424b4e 15%,#293135 65%,#465053 94%,#252c2e 100%);
    box-shadow: inset 1px 2px 0 #a5abaa,inset -2px -3px 0 #171b1d,0 0 0 2px #111718,4px 10px 0 #161d1eb0,0 18px 48px #07101388;
    font-family: 'Pixelify Sans', ui-monospace, monospace; color: #202e23; }
  .life-phone::backdrop { background: #0b1519a8; }
  .life-phone[open] { display: flex; flex-direction: column; }
  .phone-speaker, .phone-softkeys { flex-shrink: 0; }
  .phone-screen { min-height: 0; overflow-y: auto; }
  .phone-speaker { width: 60px; height: 6px; margin: 1px auto 14px; border-radius: 8px; border: 1px solid #202729;
    background: repeating-linear-gradient(90deg,#111718 0 3px,#475153 3px 5px); box-shadow: 0 1px #7d8585; }
  .phone-screen { padding: 12px 13px 13px; border: 5px solid #1a2223; border-radius: 11px; color: #1d3228;
    background: repeating-linear-gradient(0deg,transparent 0 2px,#4056380c 2px 3px),linear-gradient(120deg,#d5dfa9,#b0c393);
    box-shadow: 0 1px 0 #88918d,inset 2px 2px 8px #586a4f62; }
  .phone-status { display: flex; justify-content: space-between; align-items: center; padding-bottom: 5px;
    border-bottom: 2px solid #405440; font: 600 12px 'Pixelify Sans',monospace; text-transform: uppercase; letter-spacing: .06em; }
  .phone-contact { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .phone-photo { display: block; flex: none; width: 59px; height: 59px; border: 2px solid #41523e;
    mix-blend-mode: multiply; image-rendering: pixelated; }
  .life-phone h2 { margin: 0; font-size: 27px; font-weight: 600; line-height: 1; }
  .life-phone h2:focus { outline: none; }
  .phone-role { display: block; margin-top: 4px; font-size: 15px; }
  .phone-bio { margin: 12px 0; font: 14px/1.42 system-ui,sans-serif; }
  .phone-list { display: grid; border-top: 1px solid #718469; }
  .phone-list > * { display: flex; justify-content: space-between; align-items: center; gap: 7px;
    width: 100%; min-height: 44px; padding: 5px 4px; box-sizing: border-box; border: 0; border-bottom: 1px solid #718469;
    background: none; color: inherit; font: 500 18px 'Pixelify Sans',monospace; text-align: left; text-decoration: none; cursor: pointer; }
  .phone-list > :is(a,button):is(:hover,:focus-visible) { outline: 0; background: #263d30; color: #dfebbc; }
  .phone-list button:disabled { opacity: .55; cursor: default; }
  .phone-audio { border-top: 0; }
  .phone-drive[hidden] { display: none; }
  .phone-drive button { grid-column: 1 / -1; font-weight: 600; }
  .phone-bag button { grid-column: 1 / -1; }
  .phone-drive:not([hidden]) + .phone-list, .phone-bag + .phone-list { border-top: 0; }
  .phone-audio button { grid-column: 1 / -1; }
  .phone-audio span { border: 1px solid currentColor; padding: 1px 5px; font-size: 14px; }
  .phone-list small { display: block; font: 12px/1.3 system-ui,sans-serif; }
  .phone-list .phone-number { font: 13px ui-monospace,monospace; }
  .phone-list .chapter-name { flex: 1; }
  .phone-list [aria-current="location"] { font-weight: 600; }
  .phone-chapters h2, .phone-inventory h2 { margin: 14px 0 10px; }
  .bag-empty, .bag-items p { font: 14px/1.45 system-ui,sans-serif; }
  .bag-empty { margin: 0; }
  .bag-items details { border-bottom: 1px solid #718469; }
  .bag-items details:first-child { border-top: 1px solid #718469; }
  .bag-items summary { display: grid; grid-template-columns: 1fr auto; column-gap: 8px; align-content: center;
    min-height: 44px; padding: 3px 4px; box-sizing: border-box; list-style: none; cursor: pointer; }
  .bag-items summary::-webkit-details-marker { display: none; }
  .bag-items summary strong { font-weight: 600; font-size: 18px; }
  .bag-items summary small { grid-column: 1; font: 12px/1.3 system-ui,sans-serif; }
  .bag-items summary::after { content: '›'; grid-column: 2; grid-row: 1 / 3; align-self: center; font-size: 20px; }
  .bag-items details[open] summary::after { transform: rotate(90deg); }
  .bag-items summary:hover, .bag-items summary:focus-visible { outline: 0; color: #dfebbc; background: #263d30; }
  .bag-items p { margin: 0; padding: 3px 4px 8px; }
  .phone-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 12px 0 0; font: 12px system-ui,sans-serif; }
  .phone-softkeys { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin: 12px 9px 0; }
  .phone-softkeys button { cursor: pointer; min-height: 44px; color: #182022; background: linear-gradient(#e0e0d5,#adb4ac 76%,#919b94);
    border: 1px solid #252e2f; border-bottom-width: 3px; border-radius: 9px 9px 17px 17px;
    box-shadow: inset 0 1px 0 #faf9e8,0 1px #919a96; font: 600 16px 'Pixelify Sans',monospace; }
  .phone-softkeys button:active { background: #a9b4a5; }
  .phone-softkeys button:focus-visible { outline: 2px solid #ffd686; outline-offset: 2px; }
  #stage[data-shape="tall"] .life-ident { top: 12px; left: 12px; }
  #stage[data-shape="tall"] .life-radar { left: 13px; bottom: 18px; width: 75px; }
  #stage[data-shape="tall"] .life-shortcuts { flex-direction: column; align-items: flex-end; }
  #stage[data-shape="tall"] .inventory-pickup { left: 12px; top: 63px; max-width: calc(100% - 168px); }
  @media(pointer:coarse) { .life-shortcuts kbd { display: none; } }
  #stage[data-shape="tall"]:has(.life-radar:not([hidden])) #hint { bottom: 104px; }
  @media(max-height:480px) {
    .life-phone { width: min(440px,calc(100vw - 26px)); padding: 9px 13px 10px; border-radius: 26px; }
    .phone-speaker { margin-bottom: 6px; }
    .phone-contact, .phone-chapters h2, .phone-inventory h2 { margin-top: 7px; }
    .phone-photo { width: 43px; height: 43px; }
    .phone-profile .phone-list { grid-template-columns: 1fr 1fr; }
    .phone-profile .phone-list a + a { border-left: 1px solid #718469; padding-left: 9px; }
    .phone-bio { margin: 7px 0; } .phone-softkeys { margin-top: 6px; }
  }
`;
