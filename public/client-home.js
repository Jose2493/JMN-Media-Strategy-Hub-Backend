(() => {
  'use strict';
  const tips = [...document.querySelectorAll('.tip')];
  const ticker = document.querySelector('.ticker');
  const control = document.getElementById('pause-tips');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let paused = motion.matches;
  function renderControl() {
    control.textContent = paused ? 'Play' : 'Pause';
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', (paused ? 'Play' : 'Pause') + ' rotating tips');
  }
  control.addEventListener('click', () => { paused = !paused; renderControl(); });
  motion.addEventListener('change', () => { paused = motion.matches; renderControl(); });
  // Pause while reading, hovering or using a link with the keyboard.
  setInterval(() => {
    if (paused || document.hidden || ticker.matches(':hover') || ticker.contains(document.activeElement)) return;
    tips[index].hidden = true;
    index = (index + 1) % tips.length;
    tips[index].hidden = false;
  }, 8000);
  renderControl();
})();
