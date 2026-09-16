(() => {
'use strict';

const portalUrls = Object.freeze({
  strategist: 'https://portal.jmnmedia.com/portal/dashboard/view/173775',
  social: 'https://portal.jmnmedia.com/portal/dashboard/view/174976',
});

function openPortal(destination) {
  const url = portalUrls[destination];
  if (!url) return;
  window.top.location.assign(url);
}

function setProgress() {
  const items = [...document.querySelectorAll('[data-onboarding-step]')];
  const complete = items.filter((item) => item.classList.contains('complete')).length;
  document.querySelector('[data-progress-count]').textContent = complete + ' of ' + items.length + ' complete';
  document.querySelector('[data-progress-bar]').style.setProperty('--progress', ((complete / items.length) * 100) + '%');
}

document.querySelectorAll('[data-onboarding-step]').forEach((step) => {
  step.addEventListener('click', () => {
    if (!step.dataset.action) {
      step.classList.toggle('complete');
      step.querySelector('.step-state').textContent = step.classList.contains('complete') ? 'Done' : 'Mark complete';
      setProgress();
      return;
    }
    openPortal(step.dataset.action);
  });
});

document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => openPortal(button.dataset.open));
});

setProgress();
})();
