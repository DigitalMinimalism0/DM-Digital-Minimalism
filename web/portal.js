// One native scroll journey; existing product nodes move between panels without being recreated.
import { renderHalftone } from './halftone.js';

export function initPortal({ admin = false } = {}) {
  if (admin) return;
  const landingHeader = document.querySelector('.site-header');
  const hero = document.getElementById('home');
  const image = hero?.querySelector('.ocean-window');
  if (!hero || !image || typeof IntersectionObserver !== 'function') return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const journey = document.createElement('div');
  journey.id = 'portal-journey';
  const landing = document.createElement('div');
  landing.id = 'portal-landing';
  landingHeader.before(journey);
  journey.append(landing);
  landing.append(landingHeader, hero);
  const endMarker = document.createElement('span');
  endMarker.id = 'portal-end';
  endMarker.setAttribute('aria-hidden', 'true');
  journey.append(endMarker);

  const parking = document.createElement('div');
  parking.hidden = true;
  parking.id = 'portal-parking';
  const views = {
    offline: { label: 'Participate', nodes: [document.getElementById('participate')] },
    rewards: {
      label: 'Rewards & funding',
      nodes: [document.getElementById('leaderboard'), document.getElementById('transparency')],
    },
    guide: {
      label: 'About digital minimalism',
      nodes: [
        document.getElementById('how'),
        document.querySelector('.faq-section'),
        document.getElementById('idea'),
        document.querySelector('.site-footer'),
      ],
    },
  };
  for (const view of Object.values(views))
    for (const node of view.nodes) if (node) parking.append(node);
  document.getElementById('admin').hidden = true;
  document.body.append(parking);

  const world = document.createElement('section');
  world.id = 'world';
  world.className = 'world';
  world.setAttribute('aria-label', 'digital minimalism participation');
  world.inert = true;
  world.innerHTML = `
    <div class="world-backdrop" aria-hidden="true"><img src="/images/ocean.jpg" alt="" width="1800" height="1800"><canvas id="world-halftone"></canvas></div>
    <div class="world-shade" aria-hidden="true"></div>
    <div class="world-ui">
      <header class="world-header"><a id="world-brand" class="wordmark" href="#home" aria-label="digital minimalism, return to the entrance">digital minimalism</a>
        <nav class="world-nav" aria-label="Participation navigation"><a href="#offline-space" data-view="offline">Participate</a><a href="#leaderboard" data-view="rewards">Rewards</a><a href="#how" data-view="guide">About</a></nav>
        <button class="wallet-button" data-connect>Connect wallet ↗</button>
      </header>
      <section id="world-panel" class="world-panel" aria-labelledby="world-panel-title" hidden><div class="world-panel-bar"><h2 id="world-panel-title" class="sr-only" tabindex="-1">Participate</h2><a id="world-panel-close" href="#offline-space">← Back to participation</a></div><div id="world-content" class="world-content"></div></section>
    </div><p id="world-status" class="sr-only" role="status"></p>`;
  document.body.append(world);
  document.documentElement.classList.add('portal-enabled');

  const backdrop = world.querySelector('.world-backdrop');
  const panel = document.getElementById('world-panel');
  const content = document.getElementById('world-content');
  const title = document.getElementById('world-panel-title');
  const shade = world.querySelector('.world-shade');
  const ui = world.querySelector('.world-ui');
  const routes = {
    'offline-space': 'offline',
    participate: 'offline',
    leaderboard: 'rewards',
    transparency: 'rewards',
    idea: 'guide',
    how: 'guide',
    faq: 'guide',
  };
  let activeView,
    requestedView,
    arrived = false,
    animations = [],
    fallbackFrame = 0;
  let resizeFrame = 0,
    lastProgress = -1,
    fullImage,
    observer,
    opening,
    textureImage,
    routeArrival = false;
  const nativeTimeline = typeof ScrollTimeline === 'function';
  history.scrollRestoration = 'manual';
  const endScroll = () => Math.max(0, journey.offsetTop + journey.offsetHeight - innerHeight);
  const setHash = (hash, replace = false) => {
    if (location.hash !== '#' + hash)
      history[replace ? 'replaceState' : 'pushState'](null, '', '#' + hash);
  };
  function parkActive() {
    if (activeView) for (const node of views[activeView].nodes) if (node) parking.append(node);
    activeView = undefined;
  }
  function openView(name, { focus = true } = {}) {
    if (!views[name]) return;
    if (activeView !== name) {
      parkActive();
      for (const node of views[name].nodes) if (node) content.append(node);
      activeView = name;
      content.scrollTop = 0;
    }
    panel.hidden = false;
    world.dataset.view = name;
    document.getElementById('world-panel-close').hidden = name === 'offline';
    title.textContent = views[name].label;
    for (const a of world.querySelectorAll('[data-view]')) {
      if (a.dataset.view === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    if (focus) title.focus({ preventScroll: true });
  }
  function syncArrival(inside) {
    if (!inside && routeArrival) {
      window.scrollTo({ top: endScroll(), behavior: 'instant' });
      return;
    }
    if (arrived === inside) return;
    arrived = inside;
    world.inert = !inside;
    landing.inert = inside;
    world.classList.toggle('is-ready', inside);
    document.body.classList.toggle('world-open', inside);
    if (inside) {
      prepareImage();
      document.getElementById('world-status').textContent = 'You are in the offline space.';
      openView(requestedView || 'offline');
      if (!location.hash || location.hash === '#home') setHash('world', true);
    } else {
      requestedView = undefined;
      parkActive();
      panel.hidden = true;
      world.removeAttribute('data-view');
      if (location.hash && location.hash !== '#home') setHash('home', true);
    }
  }
  function prepareImage() {
    if (fullImage) return;
    fullImage = new Image();
    fullImage.fetchPriority = 'low';
    fullImage.src = '/images/ocean-world.jpg';
    fullImage
      .decode()
      .then(() => {
        backdrop.querySelector('img').src = fullImage.src;
        drawTexture(fullImage);
      })
      .catch(() => {
        fullImage = undefined;
      });
  }
  hero.addEventListener('pointerenter', prepareImage, { once: true });
  function drawTexture(source) {
    textureImage = source;
    const ready = renderHalftone(document.getElementById('world-halftone'), source);
    world.dataset.renderer = ready ? 'halftone' : 'photograph';
  }
  function fallbackTick() {
    fallbackFrame = 0;
    if (document.hidden) return;
    const progress = Math.min(1, Math.max(0, scrollY / Math.max(1, endScroll())));
    if (progress !== lastProgress) {
      for (const a of animations) a.currentTime = progress * 1000;
      lastProgress = progress;
    }
    fallbackFrame = requestAnimationFrame(fallbackTick);
  }
  function buildEffects() {
    for (const a of animations) a.cancel();
    animations = [];
    lastProgress = -1;
    // Remove transform while measuring the original entrance image, including when resized inside.
    landing.style.transform = 'none';
    landing.style.opacity = '1';
    opening = image.getBoundingClientRect();
    landing.style.removeProperty('transform');
    landing.style.removeProperty('opacity');
    const size = Math.max(innerWidth, innerHeight);
    const x = opening.left + opening.width / 2 - innerWidth / 2;
    const y = opening.top + opening.height / 2 - innerHeight / 2;
    const from = `translate(${x}px,${y}px) scale(${opening.width / size})`;
    const timeline = nativeTimeline
      ? new ScrollTimeline({ source: document.scrollingElement, axis: 'block' })
      : null;
    const bind = (element, keyframes) => {
      const a = element.animate(
        keyframes,
        timeline ? { timeline, fill: 'both' } : { duration: 1000, fill: 'both' },
      );
      if (!timeline) a.pause();
      animations.push(a);
    };
    if (reduced.matches) {
      bind(backdrop, [
        { opacity: 0, transform: 'none' },
        { offset: 0.995, opacity: 0, transform: 'none' },
        { opacity: 1, transform: 'none' },
      ]);
      bind(landing, [{ opacity: 1 }, { offset: 0.995, opacity: 1 }, { opacity: 0 }]);
    } else {
      bind(backdrop, [
        { transform: from },
        { offset: 0.86, transform: 'translate(0,0) scale(1)' },
        { transform: 'translate(0,0) scale(1)' },
      ]);
      bind(landing, [
        { opacity: 1, transform: 'scale(1)' },
        { offset: 0.45, opacity: 0, transform: 'scale(1.04)' },
        { opacity: 0, transform: 'scale(1.04)' },
      ]);
    }
    const reveal = reduced.matches ? 0.995 : 0.8;
    bind(shade, [{ opacity: 0 }, { offset: 0.45, opacity: 0 }, { opacity: 1 }]);
    bind(ui, [{ opacity: 0 }, { offset: reveal, opacity: 0 }, { opacity: 1 }]);
    const textureReveal = reduced.matches ? 0.995 : 0.22;
    bind(document.getElementById('world-halftone'), [
      { opacity: 0 },
      { offset: textureReveal, opacity: 0 },
      { offset: reduced.matches ? 1 : 0.86, opacity: 1 },
      { opacity: 1 },
    ]);
    bind(backdrop.querySelector('img'), [
      { opacity: 1 },
      { offset: textureReveal, opacity: 1 },
      { offset: reduced.matches ? 1 : 0.86, opacity: 0.18 },
      { opacity: 0.18 },
    ]);
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        syncArrival(entry.isIntersecting);
      },
      { rootMargin: '0px 0px 8px 0px', threshold: 0 },
    );
    observer.observe(endMarker);
    if (!nativeTimeline && !fallbackFrame) fallbackFrame = requestAnimationFrame(fallbackTick);
  }
  function enter(view, { instant = false } = {}) {
    requestedView = view;
    if (arrived) {
      openView(view || 'offline');
      return;
    }
    prepareImage();
    // A direct route wins over inertia from an earlier wheel gesture until the next
    // scrolling input. Native wheel/touch scrolling itself remains uninterrupted.
    routeArrival = instant;
    window.scrollTo({
      top: endScroll(),
      behavior: instant || reduced.matches ? 'instant' : 'smooth',
    });
  }
  function leave({ instant = false, focus = false } = {}) {
    routeArrival = false;
    requestedView = undefined;
    setHash('home');
    window.scrollTo({ top: 0, behavior: instant || reduced.matches ? 'instant' : 'smooth' });
    if (focus)
      requestAnimationFrame(() => hero.querySelector('.identity').focus({ preventScroll: true }));
  }
  function routeHash({ instant = false } = {}) {
    const hash = location.hash.slice(1);
    if (routes[hash]) enter(routes[hash], { instant });
    else if (hash === 'world') enter(undefined, { instant });
    else if (hash === 'home' || !hash) leave({ instant });
  }
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href').slice(1);
    if (!routes[hash] && hash !== 'world' && hash !== 'home') return;
    event.preventDefault();
    setHash(hash);
    if (hash === 'home') leave({ focus: true });
    else enter(routes[hash]);
  });
  document.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
      routeArrival = false;
    if (event.key !== 'Escape' || document.querySelector('dialog[open]') || !arrived) return;
    event.preventDefault();
    if (activeView !== 'offline') {
      requestedView = 'offline';
      setHash('offline-space');
      openView('offline');
    } else leave({ focus: true });
  });
  for (const event of ['wheel', 'touchstart'])
    window.addEventListener(
      event,
      () => {
        routeArrival = false;
      },
      { passive: true },
    );
  window.addEventListener(
    'scroll',
    () => {
      if (routeArrival && Math.abs(scrollY - endScroll()) > 1)
        window.scrollTo({ top: endScroll(), behavior: 'instant' });
    },
    { passive: true },
  );
  // Let native fragment positioning finish before restoring our document-scroll entrance.
  window.addEventListener('hashchange', () =>
    requestAnimationFrame(() => routeHash({ instant: true })),
  );
  window.addEventListener('resize', () => {
    const keepInside = arrived;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      buildEffects();
      if (textureImage) drawTexture(textureImage);
      if (keepInside) window.scrollTo({ top: endScroll(), behavior: 'instant' });
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(fallbackFrame);
      fallbackFrame = 0;
    } else if (!nativeTimeline && !fallbackFrame)
      fallbackFrame = requestAnimationFrame(fallbackTick);
  });
  reduced.addEventListener('change', buildEffects);
  world.dataset.renderer = 'photograph';
  const initialImage = backdrop.querySelector('img');
  initialImage
    .decode()
    .then(() => {
      if (!textureImage) drawTexture(initialImage);
    })
    .catch(() => {});
  buildEffects();
  requestAnimationFrame(() => routeHash({ instant: true }));
}
