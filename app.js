const state = {
  dataset: null,
  selectedSeries: null,
  cpiSeries: null,
  sharedPoints: [],
  mode: "single",
  basketRows: [],
  basketRowId: 0,
};

const WPI_START_DATE = window.WPI_DATA?.[0]?.date || "2010-12-01";
const WPI_DATA = window.WPI_DATA || [];

const elements = {
  sourceText: document.getElementById("source-text"),
  modeSelect: document.getElementById("mode-select"),
  seriesSelect: document.getElementById("series-search"),
  startSelect: document.getElementById("start-date-search"),
  endSelect: document.getElementById("end-date-search"),
  horizonSelect: document.getElementById("time-horizon-search"),
  selectionMeta: document.getElementById("selection-meta"),
  basketBuilder: document.getElementById("basket-builder"),
  basketRows: document.getElementById("basket-rows"),
  basketSummary: document.getElementById("basket-summary"),
  addBasketRow: document.getElementById("add-basket-row"),
  gapWpiChange: document.getElementById("gap-wpi-change"),
  gapWpiRange: document.getElementById("gap-wpi-range"),
  wpiChartTitle: document.getElementById("wpi-chart-title"),
  wpiChartSubtitle: document.getElementById("wpi-chart-subtitle"),
  wpiChart: document.getElementById("wpi-chart"),
  emptyState: document.getElementById("empty-state"),
};

const HORIZON_OPTIONS = [
  { value: "custom", label: "Custom range" },
  { value: "1y", label: "Last 1 year" },
  { value: "3y", label: "Last 3 years" },
  { value: "5y", label: "Last 5 years" },
  { value: "10y", label: "Last 10 years" },
  { value: "max", label: "Maximum shared history" },
];

function getAvailableSeries() {
  return state.dataset.series.filter((series) => series.seriesId !== state.dataset.overallCpiSeriesId);
}

function formatQuarter(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setMetricTone(element, value, invert = false) {
  element.classList.remove("metric-positive", "metric-negative", "metric-neutral");
  if (!Number.isFinite(value)) {
    element.classList.add("metric-neutral");
    return;
  }
  if (value === 0) {
    element.classList.add("metric-neutral");
    return;
  }
  const favorable = invert ? value < 0 : value > 0;
  element.classList.add(favorable ? "metric-negative" : "metric-positive");
}

function computePercentChange(startValue, endValue) {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue === 0) {
    return null;
  }
  return ((endValue - startValue) / startValue) * 100;
}

function fillSelect(select, options, formatter = (option) => option.label) {
  select.innerHTML = "";
  options.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = formatter(option);
    select.appendChild(optionEl);
  });
}

function populateSeriesSelect() {
  const options = getAvailableSeries().map((series) => ({
    value: series.seriesId,
    label: `${series.label} (${series.seriesId})`,
  }));
  fillSelect(elements.seriesSelect, options);
}

function getWpiLookup() {
  return new Map(WPI_DATA.map((point) => [point.date, point.value]));
}

function populateHorizonSelect() {
  fillSelect(elements.horizonSelect, HORIZON_OPTIONS);
}

function populateDateSelects(sharedPoints) {
  const options = sharedPoints.map((point) => ({
    value: point.date,
    label: formatQuarter(point.date),
  }));

  fillSelect(elements.startSelect, options);
  fillSelect(elements.endSelect, options);

  if (options.length) {
    elements.startSelect.value = options[0].value;
    elements.endSelect.value = options[options.length - 1].value;
  }
}

function applyQuickRange() {
  if (!state.sharedPoints.length || elements.horizonSelect.value === "custom") {
    return;
  }

  const endIndex = state.sharedPoints.length - 1;
  const quartersByHorizon = {
    "1y": 4,
    "3y": 12,
    "5y": 20,
    "10y": 40,
    max: state.sharedPoints.length,
  };
  const periods = quartersByHorizon[elements.horizonSelect.value] ?? state.sharedPoints.length;
  const startIndex = Math.max(0, endIndex - periods + 1);

  elements.startSelect.value = state.sharedPoints[startIndex].date;
  elements.endSelect.value = state.sharedPoints[endIndex].date;
}

function updateStatCards(filteredPoints) {
  const wpiPoints = filteredPoints.filter((point) => point.date >= WPI_START_DATE && Number.isFinite(point.wpiValue));
  const firstWpiPoint = wpiPoints[0];
  const lastWpiPoint = wpiPoints[wpiPoints.length - 1];
  const wpiAvailable = wpiPoints.length >= 2;
  const selectedWpiWindowChange = wpiAvailable ? computePercentChange(firstWpiPoint.selectedValue, lastWpiPoint.selectedValue) : null;
  const wpiChange = wpiAvailable ? computePercentChange(firstWpiPoint.wpiValue, lastWpiPoint.wpiValue) : null;
  const gapWpi = wpiAvailable && Number.isFinite(selectedWpiWindowChange) && Number.isFinite(wpiChange) ? selectedWpiWindowChange - wpiChange : null;
  const wpiRangeLabel = wpiAvailable ? `${formatQuarter(firstWpiPoint.date)} to ${formatQuarter(lastWpiPoint.date)}` : "";

  elements.gapWpiChange.textContent = wpiAvailable ? formatPercent(gapWpi) : "No data";
  elements.gapWpiRange.textContent = wpiAvailable
    ? `Selected good minus WPI, ${wpiRangeLabel}.`
    : "WPI is unavailable for the chosen range.";
  const heroStat = document.getElementById("hero-stat");
  const heroStatLabel = document.getElementById("hero-stat-label");
  if (heroStat && heroStatLabel) {
    heroStat.textContent = wpiAvailable ? formatPercent(gapWpi) : "--";
    heroStat.classList.remove("metric-positive", "metric-negative", "metric-neutral");
    heroStatLabel.textContent = wpiAvailable
      ? `Relative to wages, ${wpiRangeLabel}`
      : "No wage data available for this range";
  }

  if (wpiAvailable) {
    setMetricTone(elements.gapWpiChange, gapWpi, true);
    if (heroStat) setMetricTone(heroStat, gapWpi, true);
  } else {
    elements.gapWpiChange.classList.remove("metric-positive", "metric-negative", "metric-neutral");
    elements.gapWpiChange.classList.add("metric-neutral");
    if (heroStat) heroStat.classList.add("metric-neutral");
  }

  return { wpiAvailable };
}

function rebasePoints(points, keys) {
  const firstPoint = points[0];
  return points.map((point) => {
    const rebased = { date: point.date };
    keys.forEach((key) => {
      const baseValue = firstPoint[key];
      rebased[key] = Number.isFinite(point[key]) && Number.isFinite(baseValue) && baseValue !== 0
        ? (point[key] / baseValue) * 100
        : null;
    });
    return rebased;
  });
}

function linePath(points, width, height, margin, key, minValue, maxValue) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const range = maxValue - minValue || 1;

  return points
    .map((point, index) => {
      const x = margin.left + xStep * index;
      const y = margin.top + plotHeight - ((point[key] - minValue) / range) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChart(target, filteredPoints, config) {
  const width = 920;
  const height = 420;
  const margin = { top: 24, right: 26, bottom: 48, left: 68 };
  const values = filteredPoints.flatMap((point) => config.keys.map((key) => point[key]).filter(Number.isFinite));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const yTicks = 5;
  const plotHeight = height - margin.top - margin.bottom;
  const plotWidth = width - margin.left - margin.right;

  const paths = config.keys.map((key) => ({
    key,
    className: config.classNames[key],
    d: linePath(filteredPoints, width, height, margin, key, minValue, maxValue),
  }));
  const range = maxValue - minValue || 1;
  const xStep = filteredPoints.length > 1 ? plotWidth / (filteredPoints.length - 1) : 0;
  const pointMarkup = config.keys.map((key) => (
    filteredPoints.map((point, index) => {
      if (!Number.isFinite(point[key])) return "";
      const x = margin.left + xStep * index;
      const y = margin.top + plotHeight - ((point[key] - minValue) / range) * plotHeight;
      return `
        <g class="chart-point-group">
          <circle class="chart-point-hit" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="8">
            <title>${formatQuarter(point.date)}: ${point[key].toFixed(1)}</title>
          </circle>
          <circle class="chart-point ${config.classNames[key]}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.7"></circle>
        </g>
      `;
    }).join("")
  )).join("");

  const gridLines = Array.from({ length: yTicks }, (_, index) => {
    const ratio = index / (yTicks - 1);
    const y = margin.top + plotHeight * ratio;
    const tickValue = maxValue - (maxValue - minValue) * ratio;
    return `
      <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${tickValue.toFixed(1)}</text>
    `;
  }).join("");

  const xTicks = [0, Math.floor((filteredPoints.length - 1) / 2), filteredPoints.length - 1]
    .filter((value, index, array) => array.indexOf(value) === index)
    .map((pointIndex) => {
      const x = margin.left + (filteredPoints.length > 1 ? (plotWidth / (filteredPoints.length - 1)) * pointIndex : plotWidth / 2);
      return `<text class="axis-label" x="${x}" y="${height - 14}" text-anchor="middle">${formatQuarter(filteredPoints[pointIndex].date)}</text>`;
    })
    .join("");

  target.innerHTML = `
    <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
    <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
    ${gridLines}
    ${paths.map((path) => `<path class="series-line ${path.className}" d="${path.d}"></path>`).join("")}
    ${pointMarkup}
    ${xTicks}
  `;
}

function getWpiComparisonRows(filteredPoints) {
  const firstPoint = filteredPoints[0];
  const lastPoint = filteredPoints[filteredPoints.length - 1];
  const wageChange = computePercentChange(firstPoint.wpiValue, lastPoint.wpiValue);
  const withRatio = (row) => ({
    ...row,
    affordabilityRatio: Number.isFinite(row.priceChange) && row.priceChange !== 0 && Number.isFinite(row.wageChange)
      ? row.wageChange / row.priceChange
      : null,
  });

  if (state.mode !== "basket") {
    return [withRatio({
      label: state.selectedSeries?.label || "Selected good",
      priceChange: computePercentChange(firstPoint.selectedValue, lastPoint.selectedValue),
      wageChange,
    })];
  }

  return getBasketSelections().map((item) => {
    const lookup = new Map(item.series.observations.map((point) => [point.date, point.value]));
    return withRatio({
      label: item.series.label,
      priceChange: computePercentChange(lookup.get(firstPoint.date), lookup.get(lastPoint.date)),
      wageChange,
    });
  })
    .filter((row) => Number.isFinite(row.priceChange) && Number.isFinite(row.wageChange))
    .sort((a, b) => {
      if (Number.isFinite(b.affordabilityRatio) && Number.isFinite(a.affordabilityRatio)) {
        return b.affordabilityRatio - a.affordabilityRatio;
      }
      if (Number.isFinite(b.affordabilityRatio)) return 1;
      if (Number.isFinite(a.affordabilityRatio)) return -1;
      return 0;
    });
}

function renderWpiComparisonChart(target, filteredPoints) {
  if (!target) return;
  const rows = getWpiComparisonRows(filteredPoints);
  if (!rows.length) {
    target.innerHTML = '<text class="axis-label" x="40" y="80">No wage comparison is available for this selection.</text>';
    return;
  }

  const width = 920;
  const rowHeight = 70;
  const margin = { top: 78, right: 118, bottom: 36, left: 250 };
  const height = Math.max(220, margin.top + margin.bottom + rows.length * rowHeight);
  const values = rows.flatMap((row) => [row.priceChange, row.wageChange]).filter(Number.isFinite);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue), 1);
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const zeroX = plotLeft + (plotRight - plotLeft) / 2;
  const scale = (plotRight - plotLeft) / 2 / maxAbs;

  target.setAttribute("viewBox", `0 0 ${width} ${height}`);

  function barMarkup(row, value, y, kind, label) {
    const x = value >= 0 ? zeroX : zeroX + value * scale;
    const barWidth = Math.max(2, Math.abs(value * scale));
    const valueX = value >= 0 ? x + barWidth + 8 : x - 8;
    const anchor = value >= 0 ? "start" : "end";
    return `
      <rect class="comparison-bar-${kind}" x="${x.toFixed(2)}" y="${y}" width="${barWidth.toFixed(2)}" height="16" rx="3">
        <title>${escapeHtml(row.label)} ${label.toLowerCase()}: ${formatPercent(value)}. Affordability ratio: ${Number.isFinite(row.affordabilityRatio) ? row.affordabilityRatio.toFixed(2) : "n/a"}</title>
      </rect>
      <text class="comparison-value-label" x="${valueX.toFixed(2)}" y="${y + 13}" text-anchor="${anchor}">${formatPercent(value)}</text>
    `;
  }

  const rowMarkup = rows.map((row, index) => {
    const y = margin.top + index * rowHeight;
    return `
      <line class="comparison-row-rule" x1="22" y1="${y - 20}" x2="${width - 28}" y2="${y - 20}"></line>
      <text class="comparison-row-label" x="${plotLeft - 16}" y="${y + 18}" text-anchor="end">${escapeHtml(row.label)}</text>
      ${barMarkup(row, row.priceChange, y, "price", "Inflation")}
      ${barMarkup(row, row.wageChange, y + 24, "wage", "Wage growth")}
    `;
  }).join("");

  const axisTicks = [-maxAbs, 0, maxAbs].map((value) => {
    const x = zeroX + value * scale;
    return `
      <line class="grid-line" x1="${x.toFixed(2)}" y1="${margin.top - 20}" x2="${x.toFixed(2)}" y2="${height - margin.bottom + 8}"></line>
      <text class="axis-label" x="${x.toFixed(2)}" y="${height - 12}" text-anchor="middle">${formatPercent(value)}</text>
    `;
  }).join("");

  target.innerHTML = `
    <text class="comparison-heading" x="22" y="30">Good</text>
    <text class="comparison-heading" x="${plotLeft}" y="30">Bars for % change</text>
    <g class="comparison-key" transform="translate(${plotLeft}, 50)">
      <rect class="comparison-bar-price" x="0" y="-11" width="16" height="10" rx="2"></rect>
      <text class="comparison-key-label" x="23" y="-2">Inflation</text>
      <rect class="comparison-bar-wage" x="112" y="-11" width="16" height="10" rx="2"></rect>
      <text class="comparison-key-label" x="135" y="-2">Wage growth</text>
    </g>
    <line class="comparison-axis" x1="${zeroX}" y1="${margin.top - 30}" x2="${zeroX}" y2="${height - margin.bottom + 10}"></line>
    ${axisTicks}
    ${rowMarkup}
  `;
}

function resetEmptyState(message) {
  elements.wpiChartTitle.textContent = "Waiting for a selection";
  elements.wpiChartSubtitle.textContent = "Both series are rebased to 100 at the selected start date. Wage data follows the bundled WPI workbook.";
  elements.wpiChart.innerHTML = "";
  elements.emptyState.textContent = message;
  elements.gapWpiChange.textContent = "--";
  elements.gapWpiRange.textContent = "Selected good minus WPI over the chosen window.";
  const heroStat = document.getElementById("hero-stat");
  const heroStatLabel = document.getElementById("hero-stat-label");
  if (heroStat) {
    heroStat.textContent = "--";
    heroStat.classList.remove("metric-positive", "metric-negative");
    heroStat.classList.add("metric-neutral");
  }
  if (heroStatLabel) {
    heroStatLabel.textContent = "Select a good to see its change relative to wages";
  }
  elements.gapWpiChange.classList.remove("metric-positive", "metric-negative");
  elements.gapWpiChange.classList.add("metric-neutral");
}

function getSharedRangePoints(series) {
  const cpiLookup = new Map(state.cpiSeries.observations.map((point) => [point.date, point.value]));
  const wpiLookup = getWpiLookup();
  return series.observations
    .filter((point) => cpiLookup.has(point.date))
    .map((point) => ({
      date: point.date,
      selectedValue: point.value,
      cpiValue: cpiLookup.get(point.date),
      wpiValue: wpiLookup.get(point.date),
    }));
}

function getBasketSelections() {
  return state.basketRows
    .map((row) => {
      const series = state.dataset.series.find((item) => item.seriesId === row.seriesId);
      if (!series) {
        return null;
      }
      return { series, weight: 1 };
    })
    .filter(Boolean);
}

function buildBasketSeries() {
  const selections = getBasketSelections();
  if (selections.length < 2) {
    return { points: [], label: "Custom basket", description: "Add at least two goods." };
  }

  const totalWeight = selections.length;
  const normalized = selections.map((item) => ({
    ...item,
    weight: 1 / totalWeight,
  }));

  const sharedDates = normalized.reduce((dates, item, index) => {
    const itemDates = new Set(item.series.observations.map((point) => point.date));
    if (index === 0) {
      return itemDates;
    }
    return new Set([...dates].filter((date) => itemDates.has(date)));
  }, new Set(state.cpiSeries.observations.map((point) => point.date)));

  const cpiLookup = new Map(state.cpiSeries.observations.map((point) => [point.date, point.value]));
  const wpiLookup = getWpiLookup();
  const seriesLookups = normalized.map((item) => ({
    label: item.series.label,
    weight: item.weight,
    lookup: new Map(item.series.observations.map((point) => [point.date, point.value])),
  }));

  const dates = [...sharedDates].filter((date) => cpiLookup.has(date)).sort();
  const points = dates.map((date) => ({
    date,
    selectedValue: seriesLookups.reduce((sum, item) => sum + item.lookup.get(date) * item.weight, 0),
    cpiValue: cpiLookup.get(date),
    wpiValue: wpiLookup.get(date),
  }));

  return {
    points,
    label: "Custom basket",
    description: `${selections.length} goods combined equally. The wage comparison shows each basket item separately.`,
  };
}

function updateView() {
  if (!state.sharedPoints.length) {
    return;
  }

  const filteredPoints = state.sharedPoints.filter(
    (point) => point.date >= elements.startSelect.value && point.date <= elements.endSelect.value
  );

  if (filteredPoints.length < 2) {
    resetEmptyState("Choose a wider date range. The current range does not have enough observations.");
    return;
  }

  const wpiPoints = filteredPoints.filter((point) => point.date >= WPI_START_DATE && Number.isFinite(point.wpiValue));
  const wpiAvailable = wpiPoints.length >= 2;

  elements.emptyState.textContent = "";
  updateStatCards(filteredPoints);

  if (wpiAvailable) {
    renderWpiComparisonChart(elements.wpiChart, wpiPoints);
    elements.wpiChartSubtitle.textContent = state.mode === "basket"
      ? `Each selected good has two bars over the matched WPI window (${formatQuarter(wpiPoints[0].date)} to ${formatQuarter(wpiPoints[wpiPoints.length - 1].date)}).`
      : `The selected good has two bars over the matched WPI window (${formatQuarter(wpiPoints[0].date)} to ${formatQuarter(wpiPoints[wpiPoints.length - 1].date)}).`;
  } else {
    elements.wpiChart.innerHTML = "";
    elements.wpiChartSubtitle.textContent = "No WPI data is available for this range. Please adjust the dates.";
  }
}

function renderBasketRows() {
  elements.basketRows.innerHTML = "";
  const usedIds = state.basketRows.map((row) => row.seriesId);

  state.basketRows.forEach((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "basket-row";

    // Row number badge
    const numBadge = document.createElement("div");
    numBadge.className = "basket-row-num";
    numBadge.textContent = index + 1;

    const select = document.createElement("select");
    const options = getAvailableSeries().map((series) => ({
      value: series.seriesId,
      label: `${series.label} (${series.seriesId})`,
    }));
    fillSelect(select, options);
    select.value = row.seriesId;
    select.style.cssText = "width:100%;min-height:40px;padding:0 14px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);font:600 0.88rem Manrope,sans-serif;color:var(--ink);appearance:none;cursor:pointer;";
    select.addEventListener("change", () => {
      row.seriesId = select.value;
      refreshModeView();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger-button";
    removeButton.textContent = "Remove";
    removeButton.disabled = state.basketRows.length <= 2;
    removeButton.addEventListener("click", () => {
      state.basketRows = state.basketRows.filter((item) => item.id !== row.id);
      refreshModeView();
    });

    if (usedIds.filter((id) => id === row.seriesId).length > 1) {
      wrapper.classList.add("basket-row-warning");
    }

    wrapper.append(numBadge, select, removeButton);
    elements.basketRows.appendChild(wrapper);
  });

  const duplicateCount = usedIds.length - new Set(usedIds).size;
  let summary = `${getBasketSelections().length} goods selected. Each good is weighted equally in the basket.`;
  if (duplicateCount > 0) {
    summary += " Duplicate goods detected.";
  }
  elements.basketSummary.textContent = summary;
}

function addBasketRow(seriesId = null) {
  const options = getAvailableSeries();
  const fallback = options[state.basketRows.length % options.length];
  state.basketRows.push({
    id: ++state.basketRowId,
    seriesId: seriesId || fallback.seriesId,
  });
}

function updateSingleSeriesView() {
  const series = state.dataset.series.find((item) => item.seriesId === elements.seriesSelect.value);
  state.selectedSeries = series;
  state.sharedPoints = getSharedRangePoints(series);
  elements.selectionMeta.textContent = `${series.description} Available from ${formatQuarter(series.start)} to ${formatQuarter(series.end)}.`;
  populateDateSelects(state.sharedPoints);
  if (elements.horizonSelect.value !== "custom") {
    applyQuickRange();
  }
  elements.wpiChartTitle.textContent = `${series.label}: inflation vs wage growth`;
  elements.wpiChartSubtitle.textContent = "Horizontal bars compare selected inflation with WPI wage growth.";
  updateView();
}

function updateBasketView() {
  renderBasketRows();
  const basket = buildBasketSeries();
  state.sharedPoints = basket.points;
  elements.selectionMeta.textContent = basket.description;

  if (!basket.points.length) {
    resetEmptyState("Add at least two goods to build a basket.");
    return;
  }

  populateDateSelects(state.sharedPoints);
  if (elements.horizonSelect.value !== "custom") {
    applyQuickRange();
  }
  elements.wpiChartTitle.textContent = "Selected goods: inflation vs wage growth";
  elements.wpiChartSubtitle.textContent = "Each selected basket item has one inflation bar and one wage growth bar.";
  updateView();
}

function refreshModeView() {
  const basketMode = state.mode === "basket";
  elements.basketBuilder.classList.toggle("is-hidden", !basketMode);
  elements.seriesSelect.closest(".control-group").classList.toggle("is-hidden", basketMode);

  if (basketMode) {
    updateBasketView();
  } else {
    updateSingleSeriesView();
  }
}

async function init() {
  const dataset = window.CPI_DATA;

  if (!dataset) {
    throw new Error("Bundled CPI dataset is missing.");
  }

  state.dataset = dataset;
  state.cpiSeries = dataset.series.find((series) => series.seriesId === dataset.overallCpiSeriesId);

  populateSeriesSelect();
  populateHorizonSelect();

  elements.sourceText.textContent = `${dataset.source}. ${elements.seriesSelect.options.length} goods and goods-group series available.`;
  elements.horizonSelect.value = "custom";

  const initialSeries =
    dataset.series.find((series) => series.label === "Major household appliances") ||
    dataset.series.find((series) => series.seriesId !== dataset.overallCpiSeriesId);

  elements.seriesSelect.value = initialSeries.seriesId;

  addBasketRow(initialSeries.seriesId);
  addBasketRow(getAvailableSeries().find((series) => series.seriesId !== initialSeries.seriesId)?.seriesId);

  elements.modeSelect.addEventListener("change", () => {
    state.mode = elements.modeSelect.value;
    elements.horizonSelect.value = "custom";
    refreshModeView();
  });

  elements.seriesSelect.addEventListener("change", () => {
    elements.horizonSelect.value = "custom";
    refreshModeView();
  });

  elements.startSelect.addEventListener("change", () => {
    if (elements.startSelect.value > elements.endSelect.value) {
      elements.endSelect.value = elements.startSelect.value;
    }
    elements.horizonSelect.value = "custom";
    updateView();
  });

  elements.endSelect.addEventListener("change", () => {
    if (elements.endSelect.value < elements.startSelect.value) {
      elements.startSelect.value = elements.endSelect.value;
    }
    elements.horizonSelect.value = "custom";
    updateView();
  });

  elements.horizonSelect.addEventListener("change", () => {
    applyQuickRange();
    updateView();
  });

  elements.addBasketRow.addEventListener("click", () => {
    addBasketRow();
    refreshModeView();
  });

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-info-toggle]");
    if (!toggle) {
      document.querySelectorAll(".info-popover.is-open").forEach((popover) => popover.classList.remove("is-open"));
      return;
    }

    const targetId = toggle.getAttribute("data-info-toggle");
    const popover = document.getElementById(targetId);
    const willOpen = !popover.classList.contains("is-open");
    document.querySelectorAll(".info-popover.is-open").forEach((openPopover) => openPopover.classList.remove("is-open"));
    if (willOpen) {
      popover.classList.add("is-open");
    }
  });

  refreshModeView();
}

init().catch((error) => {
  console.error(error);
  elements.sourceText.textContent = "Unable to load the bundled CPI dataset.";
  elements.selectionMeta.textContent = "The static data bundle could not be loaded.";
  resetEmptyState("The application could not load the workbook data.");
});


