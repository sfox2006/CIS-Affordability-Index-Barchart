const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

function app() {
  const nodes = new Map();
  const makeNode = () => ({
    value: '', innerHTML: '', textContent: '', style: {}, children: [],
    classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    addEventListener() {}, setAttribute() {},
  });
  const context = vm.createContext({ window: {}, console, document: {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); },
    createElement: makeNode, addEventListener() {},
  } });
  vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  return { run: (code) => vm.runInContext(code, context), nodes };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test('ratio uses growth factors and is independent of index reference bases', () => {
  const { run } = app();
  close(run('computeRelativePriceChange(100, 120, 100, 110)'), 9.090909090909);
  close(run('computeRelativePriceChange(100, 80, 100, 200)'), -60);
  close(run('computeRelativePriceChange(100, 200, 100, 200)'), 0);
  close(run('computeRelativePriceChange(25, 30, 300, 330)'), 9.090909090909);
  for (const value of ['0', '-1', 'null', 'undefined', 'NaN', 'Infinity']) {
    for (let position = 0; position < 4; position++) {
      const args = ['100', '120', '100', '110'];
      args[position] = value;
      assert.equal(run(`computeRelativePriceChange(${args.join(',')})`), null);
    }
  }
});

test('all bundled goods and endpoint pairs agree with independently computed price/wage levels', () => {
  const { run } = app();
  const count = run(`(() => {
    const wages = getWpiLookup();
    let count = 0;
    for (const series of getAvailableSeries()) {
      state.basketRows = [{ id: 1, seriesId: series.seriesId }];
      const points = buildBasketSeries().points;
      for (let i = 0; i < points.length; i++) {
        for (let j = i; j < points.length; j++) {
          const first = points[i], last = points[j];
          const expected = ((last.selectedValue / wages.get(last.date)) /
            (first.selectedValue / wages.get(first.date)) - 1) * 100;
          const result = getWpiComparisonRows([first, last])[0];
          if (!result || Math.abs(result.relativeChange - expected) > 1e-9) {
            throw new Error(series.label + ': ' + first.date + ' to ' + last.date);
          }
          count++;
        }
      }
    }
    return count;
  })()`);
  assert.ok(count > 500000);
  console.log(`Verified ${count} good/period comparisons`);
});

test('quick ranges cover full calendar years and selections preserve custom dates', () => {
  const { run, nodes } = app();
  for (const years of [1, 3, 5, 10]) {
    nodes.get('time-horizon-search').value = `${years}y`;
    run('applyQuickRange()');
    assert.equal(nodes.get('start-date-search').value, `${2025 - years}-12-01`);
    assert.equal(nodes.get('end-date-search').value, '2025-12-01');
  }
  nodes.get('time-horizon-search').value = 'custom';
  nodes.get('start-date-search').value = '2015-06-01';
  nodes.get('end-date-search').value = '2020-09-01';
  run('addBasketRow(); refreshModeView()');
  assert.equal(nodes.get('start-date-search').value, '2015-06-01');
  assert.equal(nodes.get('end-date-search').value, '2020-09-01');
  assert.match(nodes.get('wpi-chart-subtitle').textContent, /Q2 2015 to Q3 2020/);
});

test('missing wages and shorter goods histories cannot silently change chart endpoints', () => {
  const { run, nodes } = app();
  run(`WPI_DATA.pop(); updateBasketView()`);
  assert.equal(nodes.get('end-date-search').value, '2025-09-01');
  nodes.get('end-date-search').value = '2025-12-01';
  run('updateView()');
  assert.equal(nodes.get('wpi-chart').innerHTML, '');
  run(`state.basketRows = [{id: 1, seriesId: getAvailableSeries()[0].seriesId}];
    getBasketSelections()[0].series.observations = getBasketSelections()[0].series.observations.filter(p => p.date >= '2020-03-01');
    updateBasketView()`);
  assert.equal(nodes.get('start-date-search').value, '2020-03-01');
});

test('same quarter is zero and chart labels stay correct across time zones', () => {
  const { run, nodes } = app();
  nodes.get('start-date-search').value = '2020-03-01';
  nodes.get('end-date-search').value = '2020-03-01';
  run('updateView()');
  assert.match(nodes.get('ranking-list').innerHTML, /0.0% \(unchanged\)/);
  assert.equal(run('formatQuarter("2020-03-01")'), 'Q1 2020');
  assert.equal(run('formatQuarter("2020-12-01")'), 'Q4 2020');
});
