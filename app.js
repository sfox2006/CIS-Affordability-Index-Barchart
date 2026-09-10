const state = {
  dataset: null,
  cpiSeries: null,
  sharedPoints: [],
  basketRows: [],
  basketRowId: 0,
};

const WPI_START_DATE = window.WPI_DATA?.[0]?.date || "2010-12-01";
const WPI_DATA = window.WPI_DATA || [];

const elements = {
  startSelect: document.getElementById("start-date-search"),
  endSelect: document.getElementById("end-date-search"),
  horizonSelect: document.getElementById("time-horizon-search"),
  basketBuilder: document.getElementById("basket-builder"),
  basketRows: document.getElementById("basket-rows"),
  basketSummary: document.getElementById("basket-summary"),
  addBasketRow: document.getElementById("add-basket-row"),
  wpiChartTitle: document.getElementById("wpi-chart-title"),
  wpiChartSubtitle: document.getElementById("wpi-chart-subtitle"),
  wpiChart: document.getElementById("wpi-chart"),
  rankingList: document.getElementById("ranking-list"),
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
  const date = new Date(`${dateString}T00:00:00Z`);
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

function computeAffordabilityChange(priceStart, priceEnd, wageStart, wageEnd) {
  if (![priceStart, priceEnd, wageStart, wageEnd].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  return ((wageEnd / wageStart) / (priceEnd / priceStart) - 1) * 100;
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

function getWpiLookup() {
  return new Map(WPI_DATA.map((point) => [point.date, point.value]));
}

function populateHorizonSelect() {
  fillSelect(elements.horizonSelect, HORIZON_OPTIONS);
}

function populateDateSelects(sharedPoints) {
  const previousStart = elements.startSelect.value;
  const previousEnd = elements.endSelect.value;
  const options = sharedPoints.map((point) => ({
    value: point.date,
    label: formatQuarter(point.date),
  }));

  fillSelect(elements.startSelect, options);
  fillSelect(elements.endSelect, options);

  if (options.length) {
    elements.startSelect.value = options.find((option) => option.value >= previousStart)?.value || options[options.length - 1].value;
    elements.endSelect.value = previousEnd
      ? (options.filter((option) => option.value <= previousEnd).at(-1)?.value || options[0].value)
      : options[options.length - 1].value;
    if (elements.startSelect.value > elements.endSelect.value) {
      elements.endSelect.value = elements.startSelect.value;
    }
  }
}

function applyQuickRange() {
  if (!state.sharedPoints.length || elements.horizonSelect.value === "custom") {
    return;
  }

  const endIndex = state.sharedPoints.length - 1;
  const years = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[elements.horizonSelect.value];
  const endDate = state.sharedPoints[endIndex].date;
  const targetStart = years ? `${Number(endDate.slice(0, 4)) - years}${endDate.slice(4)}` : state.sharedPoints[0].date;
  const startIndex = state.sharedPoints.findIndex((point) => point.date >= targetStart);

  elements.startSelect.value = state.sharedPoints[startIndex].date;
  elements.endSelect.value = state.sharedPoints[endIndex].date;
}

function updateStatCards(filteredPoints) {
  const wpiPoints = filteredPoints.filter((point) => point.date >= WPI_START_DATE && Number.isFinite(point.wpiValue));
  const firstWpiPoint = wpiPoints[0];
  const lastWpiPoint = wpiPoints[wpiPoints.length - 1];
  const wpiAvailable = wpiPoints.length >= 2;
  const gapWpi = wpiAvailable ? computeAffordabilityChange(firstWpiPoint.selectedValue, lastWpiPoint.selectedValue, firstWpiPoint.wpiValue, lastWpiPoint.wpiValue) : null;
  const wpiRangeLabel = wpiAvailable ? `${formatQuarter(firstWpiPoint.date)} to ${formatQuarter(lastWpiPoint.date)}` : "";

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
    if (heroStat) setMetricTone(heroStat, gapWpi);
  } else {
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
  return getBasketSelections().map((item) => {
    const lookup = new Map(item.series.observations.map((point) => [point.date, point.value]));
    return {
      label: item.series.label,
      priceChange: computePercentChange(lookup.get(firstPoint.date), lookup.get(lastPoint.date)),
      wageChange,
      relativeChange: computeAffordabilityChange(lookup.get(firstPoint.date), lookup.get(lastPoint.date), firstPoint.wpiValue, lastPoint.wpiValue),
    };
  })
    .filter((row) => Number.isFinite(row.relativeChange));
}

function renderRankingList(rows) {
  if (!elements.rankingList) return;
  if (!rows.length) {
    elements.rankingList.innerHTML = '<p class="empty-state">Add at least one good to see the ranking.</p>';
    return;
  }

  const rankedRows = [...rows].sort((a, b) => b.relativeChange - a.relativeChange);
  elements.rankingList.innerHTML = rankedRows.map((row, index) => {
    const tone = row.relativeChange >= 0 ? "more" : "less";
    const label = row.relativeChange === 0 ? "unchanged" : row.relativeChange > 0 ? "more affordable" : "less affordable";
    return `
      <div class="ranking-row">
        <span class="ranking-index">${index + 1}</span>
        <span class="ranking-label">${escapeHtml(row.label)}</span>
        <span class="ranking-value ${tone}">${formatPercent(row.relativeChange)} (${label})</span>
      </div>
    `;
  }).join("");
}

function renderWpiComparisonChart(target, filteredPoints) {
  if (!target) return;
  const rows = getWpiComparisonRows(filteredPoints);
  if (!rows.length) {
    target.innerHTML = '<text class="axis-label" x="40" y="80">No wage comparison is available for this selection.</text>';
    renderRankingList([]);
    return;
  }

  const width = 1120;
  const rowHeight = 64;
  const margin = { top: 88, right: 140, bottom: 54, left: 360 };
  const height = Math.max(260, margin.top + margin.bottom + rows.length * rowHeight);
  const values = rows.map((row) => row.relativeChange).filter(Number.isFinite);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue), 1);
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const zeroX = plotLeft + (plotRight - plotLeft) / 2;
  const halfPlotWidth = (plotRight - plotLeft) / 2;
  const scale = halfPlotWidth / maxAbs;

  target.setAttribute("viewBox", `0 0 ${width} ${height}`);

  function barMarkup(row, value, y) {
    const x = value >= 0 ? zeroX : zeroX + value * scale;
    const barWidth = value === 0 ? 0 : Math.max(2, Math.abs(value * scale));
    const hasRoomInside = barWidth > 54;
    const valueX = value >= 0
      ? (hasRoomInside ? x + barWidth - 10 : x + barWidth + 8)
      : (hasRoomInside ? x + 10 : x - 8);
    const anchor = value >= 0
      ? (hasRoomInside ? "end" : "start")
      : (hasRoomInside ? "start" : "end");
    const valueClass = hasRoomInside ? "comparison-value-label comparison-value-label-inside" : "comparison-value-label";
    const verdict = value > 0
      ? "wages buy more"
      : value < 0
        ? "wages buy less"
        : "unchanged relative to wages";
    return `
      <rect class="${value < 0 ? "comparison-bar-price" : "comparison-bar-wage"}" x="${x.toFixed(2)}" y="${y}" width="${barWidth.toFixed(2)}" height="24" rx="5">
        <title>${escapeHtml(row.label)}: ${formatPercent(value)} change in affordability (${verdict}). Price change: ${formatPercent(row.priceChange)}. Wage growth: ${formatPercent(row.wageChange)}.</title>
      </rect>
      <text class="${valueClass}" x="${valueX.toFixed(2)}" y="${y + 17}" text-anchor="${anchor}">${formatPercent(value)}</text>
    `;
  }

  const rowMarkup = rows.map((row, index) => {
    const y = margin.top + index * rowHeight;
    return `
      <line class="comparison-row-rule" x1="28" y1="${y - 18}" x2="${width - 28}" y2="${y - 18}"></line>
      <text class="comparison-row-label" x="${plotLeft - 24}" y="${y + 18}" text-anchor="end">${escapeHtml(row.label)}</text>
      ${barMarkup(row, row.relativeChange, y - 2)}
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
    <text class="comparison-heading" x="28" y="30">Good</text>
    <text class="comparison-heading" x="${plotLeft}" y="30">Change in affordability (%)</text>
    <g class="comparison-key" transform="translate(${plotLeft}, 50)">
      <rect class="comparison-bar-wage" x="0" y="-11" width="16" height="10" rx="2"></rect>
      <text class="comparison-key-label" x="23" y="-2">More affordable</text>
      <rect class="comparison-bar-price" x="150" y="-11" width="16" height="10" rx="2"></rect>
      <text class="comparison-key-label" x="173" y="-2">Less affordable</text>
    </g>
    <line class="comparison-axis" x1="${zeroX}" y1="${margin.top - 30}" x2="${zeroX}" y2="${height - margin.bottom + 10}"></line>
    ${axisTicks}
    ${rowMarkup}
  `;
  renderRankingList(rows);
}

function resetEmptyState(message) {
  elements.wpiChartTitle.textContent = "Waiting for a selection";
  elements.wpiChartSubtitle.textContent = "Select a period with price and wage data.";
  elements.wpiChart.innerHTML = "";
  renderRankingList([]);
  elements.emptyState.textContent = message;
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
  if (!selections.length) {
    return { points: [], label: "Selected goods", description: "Add at least one good." };
  }

  const totalWeight = selections.length;
  const normalized = selections.map((item) => ({
    ...item,
    weight: 1 / totalWeight,
  }));

  const sharedDates = normalized.reduce((dates, item, index) => {
    const itemDates = new Set(item.series.observations.filter((point) => Number.isFinite(point.value) && point.value > 0).map((point) => point.date));
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

  const dates = [...sharedDates].filter((date) => cpiLookup.has(date) && Number.isFinite(wpiLookup.get(date)) && wpiLookup.get(date) > 0).sort();
  const points = dates.map((date) => ({
    date,
    selectedValue: seriesLookups.reduce((sum, item) => sum + item.lookup.get(date) * item.weight, 0),
    cpiValue: cpiLookup.get(date),
    wpiValue: wpiLookup.get(date),
  }));

  return {
    points,
    label: "Selected goods",
    description: `${selections.length} ${selections.length === 1 ? "good" : "goods"} selected. The wage comparison shows each item separately.`,
  };
}

function updateView() {
  if (!getBasketSelections().length) {
    resetEmptyState("Select a good to build a chart.");
    return;
  }
  if (!state.sharedPoints.length) {
    return;
  }

  const filteredPoints = state.sharedPoints.filter(
    (point) => point.date >= elements.startSelect.value && point.date <= elements.endSelect.value
  );

  if (!filteredPoints.length) {
    resetEmptyState("Choose a wider date range. The current range does not have enough observations.");
    return;
  }

  const wpiPoints = filteredPoints.filter((point) => point.date >= WPI_START_DATE && Number.isFinite(point.wpiValue));
  const wpiAvailable = wpiPoints.length === filteredPoints.length && wpiPoints[0]?.date === elements.startSelect.value && wpiPoints.at(-1)?.date === elements.endSelect.value;

  elements.emptyState.textContent = "";
  updateStatCards(filteredPoints);

  if (wpiAvailable) {
    elements.wpiChartTitle.textContent = "Selected goods: change in affordability";
    renderWpiComparisonChart(elements.wpiChart, wpiPoints);
    elements.wpiChartSubtitle.textContent = `Change in how much wages can buy (${formatQuarter(wpiPoints[0].date)} to ${formatQuarter(wpiPoints[wpiPoints.length - 1].date)}).`;
  } else {
    elements.wpiChart.innerHTML = "";
    renderRankingList([]);
    elements.wpiChartSubtitle.textContent = "No WPI data is available for this range. Please adjust the dates.";
  }
}

function createGoodPicker(row, index) {
  const picker = document.createElement("div");
  picker.className = "good-picker";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "good-picker-trigger";
  trigger.id = `good-picker-${row.id}`;
  trigger.setAttribute("aria-label", `Select good ${index + 1}`);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", `good-options-${row.id}`);
  const options = getAvailableSeries();
  trigger.textContent = options.find((item) => item.seriesId === row.seriesId)?.label || "Select good";

  const list = document.createElement("div");
  list.className = "good-picker-options";
  list.id = `good-options-${row.id}`;
  list.hidden = true;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", `Goods for item ${index + 1}`);
  const close = () => {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const buttons = options.map((series) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "good-picker-option";
    option.textContent = series.label;
    option.tabIndex = -1;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(series.seriesId === row.seriesId));
    option.addEventListener("click", () => {
      row.seriesId = series.seriesId;
      refreshModeView();
      document.getElementById(trigger.id)?.focus();
    });
    list.appendChild(option);
    return option;
  });
  const focusOption = (position) => {
    const option = buttons[(position + buttons.length) % buttons.length];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "nearest" });
  };
  const open = (last = false) => {
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const selected = options.findIndex((item) => item.seriesId === row.seriesId);
    focusOption(selected >= 0 ? selected : last ? buttons.length - 1 : 0);
  };
  trigger.addEventListener("click", () => list.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowUp");
    }
  });
  let search = "";
  let lastTyped = 0;
  list.addEventListener("keydown", (event) => {
    const current = buttons.indexOf(document.activeElement);
    const positions = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: buttons.length - 1 };
    if (event.key in positions) {
      event.preventDefault();
      focusOption(positions[event.key]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.focus();
    } else if (event.key === "Tab") {
      close();
      trigger.focus();
    } else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search = (Date.now() - lastTyped > 700 ? "" : search) + event.key.toLowerCase();
      lastTyped = Date.now();
      const match = options.findIndex((item) => item.label.toLowerCase().startsWith(search));
      if (match >= 0) focusOption(match);
    }
  });
  picker.addEventListener("focusout", (event) => {
    if (!picker.contains(event.relatedTarget)) close();
  });
  picker.append(trigger, list);
  return picker;
}

function renderBasketRows() {
  elements.basketRows.innerHTML = "";
  const usedIds = state.basketRows.map((row) => row.seriesId).filter(Boolean);

  state.basketRows.forEach((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "basket-row";

    // Row number badge
    const numBadge = document.createElement("div");
    numBadge.className = "basket-row-num";
    numBadge.textContent = index + 1;

    const picker = createGoodPicker(row, index);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger-button";
    removeButton.textContent = "Remove";
    removeButton.disabled = state.basketRows.length <= 1;
    removeButton.addEventListener("click", () => {
      state.basketRows = state.basketRows.filter((item) => item.id !== row.id);
      refreshModeView();
    });

    if (usedIds.filter((id) => id === row.seriesId).length > 1) {
      wrapper.classList.add("basket-row-warning");
    }

    wrapper.append(numBadge, picker, removeButton);
    elements.basketRows.appendChild(wrapper);
  });

  const duplicateCount = usedIds.length - new Set(usedIds).size;
  const selectionCount = getBasketSelections().length;
  let summary = `${selectionCount} ${selectionCount === 1 ? "good" : "goods"} selected. Add more goods to compare them side by side.`;
  if (duplicateCount > 0) {
    summary += " Duplicate goods detected.";
  }
  elements.basketSummary.textContent = summary;
}

function addBasketRow(seriesId = null) {
  state.basketRows.push({
    id: ++state.basketRowId,
    seriesId: seriesId || "",
  });
}

function updateBasketView() {
  renderBasketRows();
  const basket = buildBasketSeries();
  state.sharedPoints = basket.points;

  if (!basket.points.length) {
    if (!getBasketSelections().length) {
      state.sharedPoints = getSharedRangePoints(state.cpiSeries)
        .filter((point) => Number.isFinite(point.wpiValue) && point.wpiValue > 0);
      populateDateSelects(state.sharedPoints);
      applyQuickRange();
    }
    resetEmptyState("Select a good to build a chart.");
    return;
  }

  populateDateSelects(state.sharedPoints);
  if (elements.horizonSelect.value !== "custom") {
    applyQuickRange();
  }
  elements.wpiChartTitle.textContent = "Selected goods: change in affordability";
  elements.wpiChartSubtitle.textContent = "Percentage change in how much wages can buy.";
  updateView();
}

function refreshModeView() {
  updateBasketView();
}

async function init() {
  const dataset = window.CPI_DATA;

  if (!dataset) {
    throw new Error("Bundled CPI dataset is missing.");
  }

  state.dataset = dataset;
  state.cpiSeries = dataset.series.find((series) => series.seriesId === dataset.overallCpiSeriesId);

  populateHorizonSelect();

  elements.horizonSelect.value = "custom";

  addBasketRow();

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
  resetEmptyState("The application could not load the workbook data.");
});


