// Layout metadata only. Never send session or company data to the parent.
export function observeCockpitHeight(root, origins) {
  if (window.parent === window) return;
  let pending = false;
  const publish = () => {
    pending = false;
    // Measure natural content, not documentElement.scrollHeight: the latter has
    // the iframe viewport as a floor and prevents a tall frame from shrinking.
    const body = document.body;
    const height = Math.ceil(Math.max(
      body.getBoundingClientRect().bottom + window.scrollY,
      root.getBoundingClientRect().bottom + window.scrollY,
      root.getBoundingClientRect().top + window.scrollY + root.scrollHeight
    ));
    if (height > 0) for (const origin of origins) {
      window.parent.postMessage({type:'jmn:cockpit-height', height}, origin);
    }
  };
  const schedule = () => {
    if (!pending) { pending = true; window.requestAnimationFrame(publish); }
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  observer.observe(document.body);
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('load', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.addEventListener('message', event => {
    if (event.source === window.parent && origins.includes(event.origin) &&
        event.data?.type === 'jmn:cockpit-measure') schedule();
  });
  document.fonts?.ready.then(schedule);
  schedule();
}
