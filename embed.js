(() => {
  if (window.__cisAffordabilityEmbedLoaded) return;
  window.__cisAffordabilityEmbedLoaded = true;
  const origin = 'https://sfox2006.github.io';
  const path = '/CIS-Affordability-Index-Barchart/';
  const initialized = new WeakSet();
  const frames = () => [...document.querySelectorAll('iframe[data-cis-affordability-github]')].filter((frame) => {
    try {
      const url = new URL(frame.src);
      return url.origin === origin && [path, path + 'index.html'].includes(url.pathname);
    } catch (error) {
      return false;
    }
  });
  const requestHeight = (frame) => frame.contentWindow?.postMessage({ type: 'cis-affordability-resize-request' }, origin);
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.data?.type !== 'cis-affordability-height') return;
    const height = event.data.height;
    if (!Number.isFinite(height) || height < 200 || height > 100000) return;
    for (const frame of frames()) {
      if (frame.contentWindow !== event.source) continue;
      frame.style.setProperty('height', `${Math.ceil(height) + 2}px`, 'important');
      frame.style.setProperty('max-height', 'none', 'important');
      frame.style.setProperty('min-height', '0', 'important');
    }
  });
  const connect = () => {
    for (const frame of frames()) {
      if (initialized.has(frame)) continue;
      initialized.add(frame);
      frame.addEventListener('load', () => requestHeight(frame));
      // Handles both cached frames and scripts loaded after the iframe.
      requestHeight(frame);
    }
  };
  connect();
  document.addEventListener('DOMContentLoaded', connect);
  new MutationObserver(connect).observe(document.documentElement, { childList: true, subtree: true });
})();
