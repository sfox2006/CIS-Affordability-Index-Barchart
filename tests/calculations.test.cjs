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

test('starts with one placeholder and only charts explicitly selected goods', () => {
  const { run, nodes } = app();
  assert.equal(run('state.basketRows.length'), 1);
  assert.equal(run('getBasketSelections().length'), 0);
  const picker = nodes.get('basket-rows').children[0].children[1];
  assert.equal(picker.children[0].textContent, 'Select good');
  assert.equal(picker.children[1].hidden, true);
  assert.ok(picker.children[1].children.every(option => option.textContent !== 'Select good'));
  assert.equal(nodes.get('wpi-chart').innerHTML, '');
  assert.ok(nodes.get('start-date-search').value);
  run('addBasketRow(); renderBasketRows()');
  assert.equal(run('getBasketSelections().length'), 0);
  assert.ok(!nodes.get('basket-summary').textContent.includes('Duplicate'));
  run('state.basketRows[0].seriesId = getAvailableSeries()[0].seriesId; refreshModeView()');
  assert.equal(run('getBasketSelections().length'), 1);
  assert.ok(nodes.get('wpi-chart').innerHTML.length > 0);
});

test('ratio uses growth factors and is independent of index reference bases', () => {
  const { run } = app();
  close(run('computeAffordabilityChange(100, 120, 100, 110)'), -8.333333333333);
  close(run('computeAffordabilityChange(100, 80, 100, 200)'), 150);
  close(run('computeAffordabilityChange(100, 200, 100, 200)'), 0);
  close(run('computeAffordabilityChange(25, 30, 300, 330)'), -8.333333333333);
  // Reference document examples: milk and bread.
  close(run('computeAffordabilityChange(100, 160, 100, 130)'), -18.75);
  close(run('computeAffordabilityChange(100, 120, 100, 150)'), 25);
  for (const value of ['0', '-1', 'null', 'undefined', 'NaN', 'Infinity']) {
    for (let position = 0; position < 4; position++) {
      const args = ['100', '120', '100', '110'];
      args[position] = value;
      assert.equal(run(`computeAffordabilityChange(${args.join(',')})`), null);
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
          const expected = ((wages.get(last.date) / last.selectedValue) /
            (wages.get(first.date) / first.selectedValue) - 1) * 100;
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
  run('state.basketRows[0].seriesId = getAvailableSeries()[0].seriesId; refreshModeView()');
  for (const years of [1, 3, 5, 10]) {
    nodes.get('time-horizon-search').value = `${years}y`;
    run('applyQuickRange()');
    assert.equal(nodes.get('start-date-search').value, `${2026 - years}-06-01`);
    assert.equal(nodes.get('end-date-search').value, '2026-06-01');
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
  run('state.basketRows[0].seriesId = getAvailableSeries()[0].seriesId; refreshModeView()');
  run(`WPI_DATA.pop(); updateBasketView()`);
  assert.equal(nodes.get('end-date-search').value, '2026-03-01');
  nodes.get('end-date-search').value = '2026-06-01';
  run('updateView()');
  assert.equal(nodes.get('wpi-chart').innerHTML, '');
  run(`state.basketRows = [{id: 1, seriesId: getAvailableSeries()[0].seriesId}];
    getBasketSelections()[0].series.observations = getBasketSelections()[0].series.observations.filter(p => p.date >= '2020-03-01');
    updateBasketView()`);
  assert.equal(nodes.get('start-date-search').value, '2020-03-01');
});

test('same quarter is zero and chart labels stay correct across time zones', () => {
  const { run, nodes } = app();
  run('state.basketRows[0].seriesId = getAvailableSeries()[0].seriesId; refreshModeView()');
  nodes.get('start-date-search').value = '2020-03-01';
  nodes.get('end-date-search').value = '2020-03-01';
  run('updateView()');
  assert.match(nodes.get('ranking-list').innerHTML, /0.0% \(unchanged\)/);
  assert.equal(run('formatQuarter("2020-03-01")'), 'Q1 2020');
  assert.equal(run('formatQuarter("2020-12-01")'), 'Q4 2020');
});

test('affordability gains rank first and gains/losses use green/red bars', () => {
  const { run, nodes } = app();
  run(`getWpiComparisonRows = () => [
    {label: 'Milk', priceChange: 60, wageChange: 30, relativeChange: -18.75},
    {label: 'Bread', priceChange: 20, wageChange: 50, relativeChange: 25}
  ]; renderWpiComparisonChart(elements.wpiChart, []);`);
  const ranking = nodes.get('ranking-list').innerHTML;
  assert.ok(ranking.indexOf('Bread') < ranking.indexOf('Milk'));
  assert.match(ranking, /ranking-value more[^>]*>\+25.0% \(more affordable\)/);
  assert.match(ranking, /ranking-value less[^>]*>-18.8% \(less affordable\)/);
  const chart = nodes.get('wpi-chart').innerHTML;
  assert.match(chart, /<rect class="comparison-bar-price"[^>]*>\s*<title>Milk:/);
  assert.match(chart, /<rect class="comparison-bar-wage"[^>]*>\s*<title>Bread:/);
  assert.match(chart, /change in affordability \(wages buy more\)/);
});
