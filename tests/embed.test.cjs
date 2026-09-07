const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const origin = 'https://sfox2006.github.io';

function parentHarness() {
  const events = {};
  const sent = [];
  const frames = [];
  let scan;
  const window = { addEventListener: (type, fn) => { events[type] = fn; } };
  const document = { querySelectorAll: () => frames, addEventListener() {}, documentElement: {} };
  const makeFrame = (src = origin + '/CIS-Affordability-Index-Barchart/') => {
    const frame = {
      src, events: {}, styles: {},
      contentWindow: { postMessage: (data, target) => sent.push({ data, target }) },
      addEventListener(type, fn) { this.events[type] = fn; },
    };
    frame.style = { setProperty: (name, value) => { frame.styles[name] = value; } };
    frames.push(frame);
    return frame;
  };
  const context = vm.createContext({ window, document, URL, WeakSet,
    MutationObserver: class { constructor(fn) { scan = fn; } observe() {} },
  });
  const run = () => vm.runInContext(source('embed.js'), context);
  return { events, sent, makeFrame, run, scan: () => scan() };
}

test('host handles loaded, late and reloaded frames and both growth and shrinkage', () => {
  const h = parentHarness();
  const a = h.makeFrame();
  h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].target, origin);
  a.events.load();
  assert.equal(h.sent.length, 2);
  const b = h.makeFrame();
  h.scan();
  assert.equal(h.sent.length, 3);
  const resize = (frame, height) => h.events.message({ origin, source: frame.contentWindow, data: { type: 'cis-affordability-height', height } });
  resize(a, 2500.2);
  assert.equal(a.styles.height, '2503px');
  assert.equal(b.styles.height, undefined);
  resize(a, 850);
  assert.equal(a.styles.height, '852px');
  resize(b, 4000);
  assert.equal(b.styles.height, '4002px');
  h.run();
  assert.equal(h.sent.length, 3, 'duplicate script must not register again');
});

test('host rejects unrelated senders, URLs and malformed heights', () => {
  const h = parentHarness();
  const a = h.makeFrame();
  h.makeFrame('https://untrusted.example/');
  h.makeFrame(origin + '/unrelated/');
  h.run();
  assert.equal(h.sent.length, 1);
  const message = { origin, source: a.contentWindow, data: { type: 'cis-affordability-height', height: 2000 } };
  h.events.message({ ...message, origin: 'https://untrusted.example' });
  h.events.message({ ...message, source: {} });
  for (const height of [null, '2000', NaN, Infinity, -1, 199, 100001]) {
    h.events.message({ ...message, data: { type: 'cis-affordability-height', height } });
  }
  assert.equal(a.styles.height, undefined);
});

test('calculator negotiates only with its parent and reports content changes', () => {
  const events = {};
  const sent = [];
  const classes = [];
  let height = 1600;
  let resized;
  const parent = { postMessage: (data, target) => sent.push({ data, target }) };
  const window = { parent, addEventListener: (type, fn) => { events[type] = fn; } };
  const document = { body: { getBoundingClientRect: () => ({ height }), classList: { add: (name) => classes.push(name) } } };
  vm.runInNewContext(source('embed-frame.js'), { window, document,
    ResizeObserver: class { constructor(fn) { resized = fn; } observe() {} },
  });
  resized();
  const message = { origin: 'https://www.cis.org.au', source: parent, data: { type: 'cis-affordability-resize-request' } };
  events.message({ ...message, source: {} });
  events.message({ ...message, origin: 'null' });
  assert.equal(sent.length, 0);
  events.message(message);
  assert.equal(classes[0], 'cis-auto-height');
  assert.equal(sent[0].target, 'https://www.cis.org.au');
  assert.equal(sent[0].data.height, 1600);
  resized();
  assert.equal(sent.length, 1, 'unchanged layout must not cause resize loops');
  height = 2800;
  resized();
  height = 900;
  resized();
  assert.deepEqual(sent.map((entry) => entry.data.height), [1600, 2800, 900]);
  events.message(message);
  assert.equal(sent.length, 4, 'late parent request must get a fresh response');
  assert.match(source('index.html'), /body\.cis-auto-height\s*\{\s*min-height: 0;/);
});

test('standalone page does not activate the embedding protocol', () => {
  const window = {};
  window.parent = window;
  vm.runInNewContext(source('embed-frame.js'), { window });
});
