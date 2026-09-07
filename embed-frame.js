(() => {
  if (window.parent === window) return;
  let parentOrigin = null;
  let previousHeight = 0;
  const sendHeight = (force = false) => {
    if (!parentOrigin) return;
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (!force && height === previousHeight) return;
    previousHeight = height;
    window.parent.postMessage({ type: 'cis-affordability-height', height }, parentOrigin);
  };
  window.addEventListener('message', (event) => {
    // Only the embedding parent can request layout data; no user data is sent.
    if (event.source !== window.parent || event.data?.type !== 'cis-affordability-resize-request') return;
    if (!/^https?:\/\//.test(event.origin)) return;
    parentOrigin = event.origin;
    document.body.classList.add('cis-auto-height');
    sendHeight(true);
  });
  new ResizeObserver(() => sendHeight()).observe(document.body);
  window.addEventListener('load', () => sendHeight());
})();
