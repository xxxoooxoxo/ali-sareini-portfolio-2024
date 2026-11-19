/** @typedef {{ id: string, name: string, chapter: string, description: string }} Souvenir */

const keyFor = id => 'life-game.inventory.' + id;

/** @param {Souvenir[]} souvenirs */
export function makeInventory(souvenirs) {
  const catalog = new Map(souvenirs.map(item => [item.id, item]));
  const collected = new Set();
  const listeners = new Set();

  // Each pickup has its own save key, so collecting on another chapter page
  // can't overwrite the rest of the bag. Blocked storage still permits play.
  function restore(id) {
    if (collected.has(id)) return;
    try {
      if (localStorage.getItem(keyFor(id)) === '1') collected.add(id);
    } catch { /* Use this session's bag. */ }
  }
  for (const id of catalog.keys()) restore(id);

  return {
    has(id) { return collected.has(id); },
    collect(id) {
      const item = catalog.get(id);
      if (!item) return false;
      restore(id);
      if (collected.has(id)) return false;
      collected.add(id);
      try { localStorage.setItem(keyFor(id), '1'); } catch { /* Keep the pickup in memory. */ }
      for (const notify of listeners) notify(item);
      return true;
    },
    items() {
      for (const id of catalog.keys()) restore(id);
      return [...catalog.values()].filter(item => collected.has(item.id));
    },
    /** @param {(item: Souvenir) => void} notify */
    onCollect(notify) { listeners.add(notify); },
  };
}
