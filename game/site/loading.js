export function makeLoadingScreen(stage) {
  const screen = document.getElementById('loading-screen');
  const art = document.getElementById('loading-art');
  const artDirectory = new URL('.', art.src);
  let restoreFocus = false;

  return {
    get active() { return !screen.hidden; },
    async show(chapter, index) {
      restoreFocus = stage.contains(document.activeElement);
      stage.inert = true;
      screen.hidden = false;
      screen.dataset.chapter = chapter.id;
      screen.style.setProperty('--ink', chapter.ink);
      const url = new URL(chapter.id + '.webp', artDirectory).href;
      if (art.src !== url) art.src = url;
      document.getElementById('loading-place').textContent =
        'Chapter ' + String(index + 1).padStart(2, '0') + ' / ' + chapter.name;
      document.getElementById('loading-title').textContent = chapter.title;
      document.getElementById('loading-status').textContent = 'Preparing scene';
      // Give the browser a paint before the synchronous scene and texture work.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    finish() {
      screen.hidden = true;
      stage.inert = false;
      if (restoreFocus) stage.focus({ preventScroll: true });
    },
    fail(error) {
      screen.dataset.state = 'error';
      screen.hidden = false;
      stage.inert = true;
      console.error('Could not load the game scene', error);
    },
    warm(chapters) {
      for (const chapter of chapters) {
        const url = new URL(chapter.id + '.webp', artDirectory).href;
        if (url !== art.src) {
          const next = new Image();
          next.fetchPriority = 'low';
          next.src = url;
        }
      }
    },
  };
}
