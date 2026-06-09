const groupChartState = {
  selectedIds: new Set(),
  mode: "price",
  activePreset: "",
  playTimer: null,
};

const GROUP_EXCLUDED_DEFAULTS = new Set(["A2332596F"]);
const GROUP_PALETTE = [
  "#9b1c31",
  "#c24a63",
  "#df7f95",
  "#efb2bf",
  "#263238",
  "#57b565",
  "#2f7f42",
  "#78c579",
  "#4f9a59",
  "#1e7036",
  "#0e6b5c",
  "#0b6ea8",
];

const GROUP_MODE_COPY = {
  price: {
    title: "Cumulative change by CPI group",
    note: "All selected groups, CPI and WPI start at 0% in the chosen start quarter.",
    rankingTitle: "Biggest cumulative changes",
    rankingNote: "Sorted by price change over the selected range.",
  },
  cpi: {
    title: "CPI groups relative to overall CPI",
    note: "Values show how far each selected group moved above or below overall inflation.",
    rankingTitle: "Furthest from overall CPI",
    rankingNote: "Positive values rose faster than overall CPI.",
  },
  wages: {
    title: "CPI groups relative to wages",
    note: "Values show whether category prices rose faster or slower than the Wage Price Index.",
    rankingTitle: "Furthest from wage growth",
    rankingNote: "Positive values mean prices rose faster than wages.",
  },
  abundance: {
    title: "Abundance relative to wages",
    note: "Positive values mean wages grew faster than the category price index.",
    rankingTitle: "Most abundant relative to wages",
    rankingNote: "Positive values mean the category became more abundant.",
  },
};

const GROUP_PRESETS = {
  essentials: ["Food and non-alcoholic beverages", "Housing", "Health", "Transport", "Education"],
  services: ["Housing", "Health", "Education", "Insurance and financial services", "Recreation and culture", "Communication"],
  goods: ["Food and non-alcoholic beverages", "Alcohol and tobacco", "Clothing and footwear", "Furnishings, household equipment and services"],
  pressure: ["Alcohol and tobacco", "Education", "Health", "Housing"],
  improvement: ["Communication", "Clothing and footwear", "Furnishings, household equipment and services", "Recreation and culture", "Transport"],
};

function groupFormatQuarter(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}

function groupFormatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function groupFormatAbsPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.abs(value).toFixed(1)}%`;
}

function groupShortLabel(label, maxLength = 28) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

function groupPointVerdict(line, value, mode = groupChartState.mode) {
  if (!Number.isFinite(value)) return "No reading is available for this point.";
  if (mode === "abundance") {
    if (line.id === "wpi") return "Wages are the benchmark for abundance in this view.";
    if (value > 0) return `${line.label} became ${groupFormatAbsPercent(value)} more abundant relative to wages.`;
    if (value < 0) return `${line.label} became ${groupFormatAbsPercent(value)} less abundant relative to wages.`;
    return `${line.label} is unchanged relative to wages.`;
  }
  if (mode === "wages") {
    if (line.id === "wpi") return "Wages are the 0% benchmark in this view.";
    if (value > 0) return `${line.label} rose ${groupFormatAbsPercent(value)} faster than wages.`;
    if (value < 0) return `${line.label} rose ${groupFormatAbsPercent(value)} slower than wages.`;
    return `${line.label} moved in line with wages.`;
  }
  if (mode === "cpi") {
    if (line.id === "cpi") return "Overall CPI is the 0% benchmark in this view.";
    if (value > 0) return `${line.label} rose ${groupFormatAbsPercent(value)} faster than overall CPI.`;
    if (value < 0) return `${line.label} rose ${groupFormatAbsPercent(value)} slower than overall CPI.`;
    return `${line.label} moved in line with overall CPI.`;
  }
  if (line.id === "wpi") {
    if (value > 0) return `Wages are ${groupFormatAbsPercent(value)} higher than at the start quarter.`;
    if (value < 0) return `Wages are ${groupFormatAbsPercent(value)} lower than at the start quarter.`;
    return "Wages are unchanged from the start quarter.";
  }
  if (value > 0) return `${line.label} is ${groupFormatAbsPercent(value)} more expensive than at the start quarter.`;
  if (value < 0) return `${line.label} is ${groupFormatAbsPercent(value)} less expensive than at the start quarter.`;
  return `${line.label} is unchanged from the start quarter.`;
}

function escapeGroupAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function groupSeries() {
  const data = window.CPI_DATA;
  if (!data) return [];
  return data.series.filter((series) => series.seriesId !== data.overallCpiSeriesId);
}

function groupOverallCpi() {
  return window.CPI_DATA?.series.find((series) => series.seriesId === window.CPI_DATA.overallCpiSeriesId);
}

function groupWpiLookup() {
  return new Map((window.WPI_DATA || []).map((point) => [point.date, point.value]));
}

function pointLookup(series) {
  return new Map(series.observations.map((point) => [point.date, point.value]));
}

function sharedGroupDates(includeAllSelected = false) {
  const wpiDates = new Set((window.WPI_DATA || []).map((point) => point.date));
  const cpiDates = new Set((groupOverallCpi()?.observations || []).map((point) => point.date));
  const selected = includeAllSelected
    ? groupSeries().filter((series) => groupChartState.selectedIds.has(series.seriesId))
    : [];

  return [...wpiDates]
    .filter((date) => cpiDates.has(date))
    .filter((date) => selected.every((series) => pointLookup(series).has(date)))
    .sort();
}

function fillGroupDateSelects() {
  const dates = sharedGroupDates(true);
  const startSelect = document.getElementById("group-start-date");
  const endSelect = document.getElementById("group-end-date");
  if (!startSelect || !endSelect) return;
  const previousStart = startSelect.value;
  const previousEnd = endSelect.value;

  const options = dates.map((date) => `<option value="${date}">${groupFormatQuarter(date)}</option>`).join("");
  startSelect.innerHTML = options;
  endSelect.innerHTML = options;

  if (dates.includes(previousStart)) {
    startSelect.value = previousStart;
  } else if (dates.includes("1997-09-01")) {
    startSelect.value = "1997-09-01";
  } else if (dates.length) {
    startSelect.value = dates[0];
  }

  if (dates.includes(previousEnd)) {
    endSelect.value = previousEnd;
  } else if (dates.length) {
    endSelect.value = dates[dates.length - 1];
  }
  syncGroupTimeline();
}

function syncGroupTimeline() {
  const dates = sharedGroupDates(true);
  const slider = document.getElementById("group-end-slider");
  const label = document.getElementById("group-slider-label");
  const endSelect = document.getElementById("group-end-date");
  if (!slider || !endSelect) return;
  const currentIndex = Math.max(0, dates.indexOf(endSelect.value));
  slider.max = String(Math.max(0, dates.length - 1));
  slider.value = String(currentIndex);
  slider.disabled = dates.length < 2;
  if (label) {
    label.textContent = dates[currentIndex] ? groupFormatQuarter(dates[currentIndex]) : "End quarter";
  }
}

function stopGroupPlayback() {
  if (groupChartState.playTimer) {
    window.clearInterval(groupChartState.playTimer);
    groupChartState.playTimer = null;
  }
  const playButton = document.getElementById("group-play");
  if (playButton) playButton.textContent = "Play";
}

function stepGroupTimeline() {
  const dates = sharedGroupDates(true);
  const slider = document.getElementById("group-end-slider");
  const endSelect = document.getElementById("group-end-date");
  if (!slider || !endSelect || dates.length < 2) return false;
  const nextIndex = Math.min(Number(slider.value || 0) + 1, dates.length - 1);
  slider.value = String(nextIndex);
  endSelect.value = dates[nextIndex];
  syncGroupTimeline();
  renderGroupCharts({ keepPlayback: true });
  return nextIndex < dates.length - 1;
}

function toggleGroupPlayback() {
  if (groupChartState.playTimer) {
    stopGroupPlayback();
    return;
  }
  const dates = sharedGroupDates(true);
  const slider = document.getElementById("group-end-slider");
  if (!slider || dates.length < 2) return;
  if (Number(slider.value) >= dates.length - 1) {
    slider.value = "0";
    document.getElementById("group-end-date").value = dates[0];
  }
  const playButton = document.getElementById("group-play");
  if (playButton) playButton.textContent = "Pause";
  groupChartState.playTimer = window.setInterval(() => {
    if (!stepGroupTimeline()) stopGroupPlayback();
  }, 450);
}

function createGroupToggles() {
  const target = document.getElementById("group-category-toggles");
  if (!target) return;

  const series = groupSeries();
  groupChartState.selectedIds = new Set(
    series
      .filter((item) => !GROUP_EXCLUDED_DEFAULTS.has(item.seriesId))
      .map((item) => item.seriesId)
  );

  target.innerHTML = series.map((item, index) => `
    <label class="category-toggle">
      <input type="checkbox" value="${item.seriesId}" ${groupChartState.selectedIds.has(item.seriesId) ? "checked" : ""}>
      <span class="category-swatch" style="--category-color:${GROUP_PALETTE[index % GROUP_PALETTE.length]}"></span>
      <span>${item.label}</span>
    </label>
  `).join("");

  target.replaceWith(target.cloneNode(true));
  const refreshedTarget = document.getElementById("group-category-toggles");
  refreshedTarget.addEventListener("click", (event) => {
    const tile = event.target.closest(".category-toggle");
    if (!tile || event.target.matches("input")) return;
    event.preventDefault();
    const input = tile.querySelector("input");
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  refreshedTarget.addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox']");
    if (!input) return;
    if (input.checked) {
      groupChartState.selectedIds.add(input.value);
    } else {
      groupChartState.selectedIds.delete(input.value);
    }
    groupChartState.activePreset = "";
    updatePresetButtons();
    fillGroupDateSelects();
    renderGroupCharts();
  });
}

function setSelectedGroups(mode) {
  const series = groupSeries();
  if (mode === "all") {
    groupChartState.selectedIds = new Set(series.map((item) => item.seriesId));
  } else if (mode === "none") {
    groupChartState.selectedIds = new Set();
  } else {
    groupChartState.selectedIds = new Set(
      series.filter((item) => !GROUP_EXCLUDED_DEFAULTS.has(item.seriesId)).map((item) => item.seriesId)
    );
  }
  groupChartState.activePreset = "";

  document.querySelectorAll("#group-category-toggles input[type='checkbox']").forEach((input) => {
    input.checked = groupChartState.selectedIds.has(input.value);
  });
  updatePresetButtons();
  fillGroupDateSelects();
  renderGroupCharts();
}

function updatePresetButtons() {
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === groupChartState.activePreset);
  });
}

function applyGroupPreset(preset) {
  const labels = GROUP_PRESETS[preset] || [];
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  groupChartState.selectedIds = new Set(
    groupSeries()
      .filter((series) => wanted.has(series.label.toLowerCase()))
      .map((series) => series.seriesId)
  );
  groupChartState.activePreset = preset;
  document.querySelectorAll("#group-category-toggles input[type='checkbox']").forEach((input) => {
    input.checked = groupChartState.selectedIds.has(input.value);
  });
  updatePresetButtons();
  fillGroupDateSelects();
  renderGroupCharts();
}

function getRangeDates() {
  const start = document.getElementById("group-start-date")?.value;
  const end = document.getElementById("group-end-date")?.value;
  return { start, end };
}

function valueAt(series, date) {
  return pointLookup(series).get(date);
}

function percentChange(startValue, endValue) {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue === 0) return null;
  return ((endValue - startValue) / startValue) * 100;
}

function ratioChange(ratio) {
  if (!Number.isFinite(ratio)) return null;
  return (ratio - 1) * 100;
}

function metricValue(priceStart, priceEnd, cpiStart, cpiEnd, wageStart, wageEnd, mode = groupChartState.mode) {
  if (![priceStart, priceEnd].every(Number.isFinite) || priceStart === 0) return null;
  const priceRatio = priceEnd / priceStart;
  const cpiRatio = Number.isFinite(cpiStart) && Number.isFinite(cpiEnd) && cpiStart !== 0 ? cpiEnd / cpiStart : null;
  const wageRatio = Number.isFinite(wageStart) && Number.isFinite(wageEnd) && wageStart !== 0 ? wageEnd / wageStart : null;

  if (mode === "cpi") return ratioChange(priceRatio / cpiRatio);
  if (mode === "wages") return ratioChange(priceRatio / wageRatio);
  if (mode === "abundance") return ratioChange(wageRatio / priceRatio);
  return ratioChange(priceRatio);
}

function buildLineSeries(start, end) {
  const selected = groupSeries().filter((series) => groupChartState.selectedIds.has(series.seriesId));
  const cpi = groupOverallCpi();
  const wpiLookup = groupWpiLookup();
  const selectedLookups = selected.map((series) => ({ series, lookup: pointLookup(series) }));
  const cpiLookup = pointLookup(cpi);
  const dates = sharedGroupDates(true).filter((date) => date >= start && date <= end);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  if (!startDate || !endDate) return { dates: [], lines: [] };

  const cpiStart = cpiLookup.get(startDate);
  const wageStart = wpiLookup.get(startDate);
  const lines = selectedLookups.map((item, index) => {
    const base = item.lookup.get(startDate);
    return {
      id: item.series.seriesId,
      label: item.series.label,
      color: GROUP_PALETTE[index % GROUP_PALETTE.length],
      values: dates
        .filter((date) => item.lookup.has(date))
        .map((date) => ({
          date,
          value: metricValue(base, item.lookup.get(date), cpiStart, cpiLookup.get(date), wageStart, wpiLookup.get(date)),
        })),
    };
  });

  lines.push({
    id: "cpi",
    label: "Overall inflation (CPI)",
    color: "#2436b7",
    strokeDasharray: "8 8",
    values: dates.map((date) => ({
      date,
      value: metricValue(cpiStart, cpiLookup.get(date), cpiStart, cpiLookup.get(date), wageStart, wpiLookup.get(date)),
    })),
  });

  lines.push({
    id: "wpi",
    label: "Wage Price Index",
    color: "#222222",
    strokeWidth: 4,
    values: dates.map((date) => ({
      date,
      value: metricValue(wageStart, wpiLookup.get(date), cpiStart, cpiLookup.get(date), wageStart, wpiLookup.get(date)),
    })),
  });

  return { dates, lines };
}

function svgPath(values, width, height, margin, minValue, maxValue) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const range = maxValue - minValue || 1;
  const step = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;

  return values
    .map((point, index) => {
      const x = margin.left + step * index;
      const y = margin.top + plotHeight - ((point.value - minValue) / range) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderGroupLineChart(start, end) {
  const svg = document.getElementById("group-line-chart");
  if (!svg) return;

  const copy = GROUP_MODE_COPY[groupChartState.mode] || GROUP_MODE_COPY.price;
  const title = svg.closest(".chart-card")?.querySelector(".chart-title");
  const note = document.getElementById("group-mode-note");
  if (title) title.textContent = copy.title;
  if (note) note.textContent = copy.note;

  const { dates, lines } = buildLineSeries(start, end);
  const values = lines.flatMap((line) => line.values.map((point) => point.value).filter(Number.isFinite));
  if (dates.length < 2 || values.length < 2) {
    svg.innerHTML = '<text class="axis-label" x="40" y="80">Select at least one category and a wider shared date range.</text>';
    return;
  }

  const width = 980;
  const height = 520;
  const margin = { top: 34, right: 250, bottom: 58, left: 74 };
  const rawMin = Math.min(0, Math.min(...values));
  const rawMax = Math.max(0, Math.max(...values));
  const minValue = rawMin < 0 ? rawMin * 1.08 : 0;
  const maxValue = rawMax > 0 ? rawMax * 1.08 : 1;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const tickCount = 6;

  const grid = Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1);
    const y = margin.top + plotHeight * ratio;
    const tickValue = maxValue - (maxValue - minValue) * ratio;
    return `
      <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${tickValue.toFixed(0)}%</text>
    `;
  }).join("");

  const xTickIndexes = [0, Math.floor((dates.length - 1) / 2), dates.length - 1]
    .filter((item, index, array) => array.indexOf(item) === index);
  const xTicks = xTickIndexes.map((index) => {
    const x = margin.left + (dates.length > 1 ? (plotWidth / (dates.length - 1)) * index : plotWidth / 2);
    return `<text class="axis-label" x="${x}" y="${height - 20}" text-anchor="middle">${groupFormatQuarter(dates[index])}</text>`;
  }).join("");

  const labelItems = lines.map((line) => {
    const last = line.values[line.values.length - 1];
    const y = margin.top + plotHeight - ((last.value - minValue) / (maxValue - minValue || 1)) * plotHeight;
    return { line, last, y };
  }).sort((a, b) => a.y - b.y);

  const minLabelGap = 18;
  labelItems.forEach((item, index) => {
    if (index === 0) {
      item.labelY = Math.max(margin.top + 12, item.y);
      return;
    }
    item.labelY = Math.max(item.y, labelItems[index - 1].labelY + minLabelGap);
  });
  for (let index = labelItems.length - 1; index >= 0; index -= 1) {
    const maxY = height - margin.bottom - 8 - (labelItems.length - 1 - index) * minLabelGap;
    labelItems[index].labelY = Math.min(labelItems[index].labelY, maxY);
    if (index < labelItems.length - 1) {
      labelItems[index].labelY = Math.min(labelItems[index].labelY, labelItems[index + 1].labelY - minLabelGap);
    }
  }

  const labelYById = new Map(labelItems.map((item) => [item.line.id, item.labelY]));

  const lineMarkup = lines.map((line) => {
    const last = line.values[line.values.length - 1];
    const x = width - margin.right + 14;
    const y = labelYById.get(line.id) ?? margin.top;
    const pathD = svgPath(line.values, width, height, margin, minValue, maxValue);
    const points = line.values.map((point, pointIndex) => {
      if (!Number.isFinite(point.value)) return "";
      const isFiveYearPoint = (pointIndex > 0 && pointIndex % 20 === 0) || pointIndex === line.values.length - 1;
      if (!isFiveYearPoint) return "";
      const pointX = margin.left + (line.values.length > 1 ? (plotWidth / (line.values.length - 1)) * pointIndex : plotWidth / 2);
      const pointY = margin.top + plotHeight - ((point.value - minValue) / (maxValue - minValue || 1)) * plotHeight;
      const verdict = groupPointVerdict(line, point.value, groupChartState.mode);
      const title = `${groupFormatQuarter(point.date)}\n${line.label}: ${groupFormatPercent(point.value)} since start quarter\n${verdict}`;
      return `
        <g class="group-point-group"
          data-date="${escapeGroupAttribute(point.date)}"
          data-date-label="${escapeGroupAttribute(groupFormatQuarter(point.date))}"
          data-series="${escapeGroupAttribute(line.label)}"
          data-change="${escapeGroupAttribute(groupFormatPercent(point.value))}"
          data-verdict="${escapeGroupAttribute(verdict)}"
          data-color="${escapeGroupAttribute(line.color)}"
          data-x="${pointX.toFixed(2)}"
          data-y="${pointY.toFixed(2)}">
          <circle class="group-point-hit" cx="${pointX.toFixed(2)}" cy="${pointY.toFixed(2)}" r="8">
            <title>${escapeGroupAttribute(title)}</title>
          </circle>
          <circle class="group-point" cx="${pointX.toFixed(2)}" cy="${pointY.toFixed(2)}" r="2.8" fill="${line.color}"></circle>
        </g>
      `;
    }).join("");
    return `
      <path class="group-series-line" d="${pathD}"
        stroke="${line.color}" stroke-width="${line.strokeWidth || 2.2}" ${line.strokeDasharray ? `stroke-dasharray="${line.strokeDasharray}"` : ""}>
        <title>${line.label}: ${groupFormatPercent(last.value)} by ${groupFormatQuarter(last.date)}</title>
      </path>
      ${points}
      <text class="group-line-label" x="${x}" y="${y + 4}" fill="${line.color}">${groupShortLabel(line.label)} (${groupFormatPercent(last.value)})</text>
    `;
  }).join("");

  svg.innerHTML = `
    <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
    <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
    ${grid}
    ${lineMarkup}
    ${xTicks}
  `;
}

function hideGroupLineTooltip() {
  const svg = document.getElementById("group-line-chart");
  const tooltip = document.getElementById("group-line-tooltip");
  tooltip?.classList.remove("visible");
  svg?.querySelectorAll(".group-point-group.is-active").forEach((item) => item.classList.remove("is-active"));
}

function findNearestGroupPoint(event, svg) {
  const rect = svg.getBoundingClientRect();
  const svgX = ((event.clientX - rect.left) / rect.width) * 980;
  const svgY = ((event.clientY - rect.top) / rect.height) * 520;
  let best = null;
  let bestDistance = Infinity;

  svg.querySelectorAll(".group-point-group").forEach((group) => {
    const pointX = Number(group.dataset.x || 0);
    const pointY = Number(group.dataset.y || 0);
    const dx = pointX - svgX;
    const dy = pointY - svgY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      best = group;
      bestDistance = distance;
    }
  });

  return bestDistance <= 18 ? best : null;
}

function showGroupLineTooltip(group) {
  const svg = document.getElementById("group-line-chart");
  const tooltip = document.getElementById("group-line-tooltip");
  const frame = svg?.closest(".chart-frame");
  if (!svg || !tooltip || !frame || !group) return;

  const x = Number(group.dataset.x || 0);
  const y = Number(group.dataset.y || 0);
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const leftPx = (x / 980) * frameWidth;
  const topPx = (y / 520) * frameHeight;
  const tooltipWidth = 230;
  let tooltipLeft = leftPx + 16;
  if (tooltipLeft + tooltipWidth > frameWidth - 10) {
    tooltipLeft = leftPx - tooltipWidth - 16;
  }
  tooltipLeft = Math.max(10, tooltipLeft);

  tooltip.innerHTML = `
    <div class="tooltip-date">${group.dataset.dateLabel || ""}</div>
    <div class="tooltip-row">
      <span class="tooltip-dot" style="background:${group.dataset.color || "#0e6b5c"}"></span>
      <span>${group.dataset.series || "Series"}</span>
      <span class="tooltip-val">${group.dataset.change || "--"}</span>
    </div>
    <div class="tooltip-verdict">${group.dataset.verdict || "Cumulative change since the selected start quarter."}</div>
    <div class="tooltip-note">Five-year marker. ${GROUP_MODE_COPY[groupChartState.mode]?.note || "Cumulative change since the selected start quarter."}</div>
  `;
  tooltip.style.left = `${tooltipLeft}px`;
  tooltip.style.top = `${Math.max(10, topPx - 48)}px`;
  tooltip.classList.add("visible");
}

function wireGroupLineHover() {
  const svg = document.getElementById("group-line-chart");
  if (!svg || svg.dataset.groupHoverWired === "true") return;
  svg.dataset.groupHoverWired = "true";

  svg.addEventListener("mousemove", (event) => {
    const group = event.target.closest(".group-point-group") || findNearestGroupPoint(event, svg);
    if (!group) {
      hideGroupLineTooltip();
      return;
    }
    svg.querySelectorAll(".group-point-group.is-active").forEach((item) => {
      if (item !== group) item.classList.remove("is-active");
    });
    group.classList.add("is-active");
    showGroupLineTooltip(group);
  });

  svg.addEventListener("mouseleave", hideGroupLineTooltip);
}

function buildAbundanceRows(start, end) {
  const wpi = groupWpiLookup();
  const groups = groupSeries().filter((series) => groupChartState.selectedIds.has(series.seriesId));
  const cpi = groupOverallCpi();
  const rows = [...groups, cpi].map((series) => {
    const lookup = pointLookup(series);
    const startValue = lookup.get(start);
    const endValue = lookup.get(end);
    const wageStart = wpi.get(start);
    const wageEnd = wpi.get(end);
    const priceRatio = endValue / startValue;
    const wageRatio = wageEnd / wageStart;
    return {
      label: series.seriesId === window.CPI_DATA.overallCpiSeriesId ? "Overall products and services" : series.label,
      value: Number.isFinite(priceRatio) && Number.isFinite(wageRatio) ? (wageRatio / priceRatio - 1) * 100 : null,
    };
  });
  return rows.filter((row) => Number.isFinite(row.value)).sort((a, b) => b.value - a.value);
}

function renderAbundanceChart(start, end) {
  const svg = document.getElementById("group-abundance-chart");
  if (!svg) return;

  const rows = buildAbundanceRows(start, end);
  const width = 980;
  const rowHeight = 42;
  const margin = { top: 28, right: 140, bottom: 28, left: 280 };
  const height = Math.max(420, margin.top + margin.bottom + rows.length * rowHeight);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!rows.length) {
    svg.innerHTML = '<text class="axis-label" x="40" y="80">Select categories to compare against wages.</text>';
    return;
  }

  const values = rows.map((row) => row.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue)) || 1;
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const zeroX = plotLeft + (plotRight - plotLeft) / 2;
  const scale = (plotRight - plotLeft) / 2 / maxAbs;

  const bars = rows.map((row, index) => {
    const y = margin.top + index * rowHeight;
    const barY = y + 7;
    const barHeight = 24;
    const x = row.value >= 0 ? zeroX : zeroX + row.value * scale;
    const barWidth = Math.abs(row.value * scale);
    const labelX = row.value >= 0 ? x + barWidth + 8 : x - 8;
    const labelAnchor = row.value >= 0 ? "start" : "end";
    const rowLabelX = row.value >= 0 ? zeroX - 12 : zeroX + 12;
    const rowLabelAnchor = row.value >= 0 ? "end" : "start";
    return `
      <text class="bar-row-label" x="${rowLabelX}" y="${y + 25}" text-anchor="${rowLabelAnchor}">${row.label}</text>
      <rect class="${row.value >= 0 ? "abundance-positive" : "abundance-negative"}" x="${x}" y="${barY}" width="${Math.max(2, barWidth)}" height="${barHeight}" rx="2">
        <title>${row.label}: ${groupFormatPercent(row.value)} relative to wages</title>
      </rect>
      <text class="bar-value-label" x="${labelX}" y="${y + 25}" text-anchor="${labelAnchor}">${groupFormatPercent(row.value)}</text>
    `;
  }).join("");

  svg.innerHTML = `
    <line class="axis-line" x1="${zeroX}" y1="${margin.top - 8}" x2="${zeroX}" y2="${height - margin.bottom + 2}"></line>
    ${bars}
  `;
}

function buildRankingRows(start, end) {
  const wpi = groupWpiLookup();
  const cpi = groupOverallCpi();
  const cpiLookup = pointLookup(cpi);
  const cpiStart = cpiLookup.get(start);
  const cpiEnd = cpiLookup.get(end);
  const wageStart = wpi.get(start);
  const wageEnd = wpi.get(end);
  return groupSeries()
    .filter((series) => groupChartState.selectedIds.has(series.seriesId))
    .map((series) => {
      const lookup = pointLookup(series);
      return {
        label: series.label,
        value: metricValue(lookup.get(start), lookup.get(end), cpiStart, cpiEnd, wageStart, wageEnd),
      };
    })
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value);
}

function renderGroupRanking(start, end) {
  const target = document.getElementById("group-ranking-list");
  const title = document.getElementById("group-ranking-title");
  const note = document.getElementById("group-ranking-note");
  if (!target) return;
  const copy = GROUP_MODE_COPY[groupChartState.mode] || GROUP_MODE_COPY.price;
  if (title) title.textContent = copy.rankingTitle;
  if (note) note.textContent = copy.rankingNote;
  const rows = buildRankingRows(start, end);
  if (!rows.length) {
    target.innerHTML = '<p class="empty-state">Select one or more CPI groups to rank them.</p>';
    return;
  }
  target.innerHTML = rows.slice(0, 10).map((row, index) => `
    <div class="ranking-row">
      <span class="ranking-index">${index + 1}</span>
      <span class="ranking-label">${escapeGroupAttribute(row.label)}</span>
      <span class="ranking-value ${row.value > 0 ? "positive" : row.value < 0 ? "negative" : ""}">${groupFormatPercent(row.value)}</span>
    </div>
  `).join("");
}

function updateGroupSummary(start, end) {
  const summary = document.getElementById("group-summary");
  const range = document.getElementById("group-range-label");
  const rows = buildRankingRows(start, end);
  if (range) {
    range.textContent = `${groupFormatQuarter(start)} to ${groupFormatQuarter(end)}. WPI source: ${window.WPI_METADATA?.seriesId || "WPI"}.`;
  }
  if (!summary) return;
  if (!rows.length) {
    summary.textContent = "Select one or more CPI groups to compare them over the chosen range.";
    return;
  }
  const high = rows[0];
  const low = rows[rows.length - 1];
  const positives = rows.filter((row) => row.value > 0).length;
  const negatives = rows.filter((row) => row.value < 0).length;
  if (groupChartState.mode === "abundance") {
    summary.textContent = `${positives} selected groups became more abundant relative to wages and ${negatives} became less abundant. Strongest abundance gain: ${high.label} (${groupFormatPercent(high.value)}). Biggest decline: ${low.label} (${groupFormatPercent(low.value)}).`;
    return;
  }
  if (groupChartState.mode === "wages") {
    summary.textContent = `${positives} selected groups rose faster than wages and ${negatives} rose slower than wages. Highest pressure: ${high.label} (${groupFormatPercent(high.value)}). Lowest pressure: ${low.label} (${groupFormatPercent(low.value)}).`;
    return;
  }
  if (groupChartState.mode === "cpi") {
    summary.textContent = `${positives} selected groups rose faster than CPI and ${negatives} rose slower than CPI. Biggest CPI outlier: ${high.label} (${groupFormatPercent(high.value)}). Lowest relative change: ${low.label} (${groupFormatPercent(low.value)}).`;
    return;
  }
  summary.textContent = `Highest selected price change: ${high.label} (${groupFormatPercent(high.value)}). Lowest selected price change: ${low.label} (${groupFormatPercent(low.value)}).`;
}

function renderGroupCharts(options = {}) {
  const { start, end } = getRangeDates();
  if (!start || !end) return;

  if (!options.keepPlayback) stopGroupPlayback();
  const startSelect = document.getElementById("group-start-date");
  const endSelect = document.getElementById("group-end-date");
  if (start > end) {
    endSelect.value = start;
  }

  const range = getRangeDates();
  syncGroupTimeline();
  renderGroupLineChart(range.start, range.end);
  renderGroupRanking(range.start, range.end);
  updateGroupSummary(range.start, range.end);
}

function initGroupCharts() {
  if (!window.CPI_DATA || !window.WPI_DATA) return;
  createGroupToggles();
  fillGroupDateSelects();
  document.getElementById("group-start-date")?.addEventListener("change", renderGroupCharts);
  document.getElementById("group-end-date")?.addEventListener("change", renderGroupCharts);
  document.getElementById("group-relative-mode")?.addEventListener("change", (event) => {
    groupChartState.mode = event.target.value;
    renderGroupCharts();
  });
  document.getElementById("group-end-slider")?.addEventListener("input", (event) => {
    const dates = sharedGroupDates(true);
    const date = dates[Number(event.target.value || 0)];
    if (!date) return;
    const endSelect = document.getElementById("group-end-date");
    if (endSelect) endSelect.value = date;
    renderGroupCharts();
  });
  document.getElementById("group-play")?.addEventListener("click", toggleGroupPlayback);
  document.querySelectorAll(".preset-button").forEach((button) => {
    button.addEventListener("click", () => applyGroupPreset(button.dataset.preset));
  });
  document.getElementById("group-reset")?.addEventListener("click", () => {
    setSelectedGroups("default");
  });
  document.getElementById("group-select-all")?.addEventListener("click", () => setSelectedGroups("all"));
  document.getElementById("group-clear-all")?.addEventListener("click", () => setSelectedGroups("none"));
  wireGroupLineHover();
  renderGroupCharts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGroupCharts);
} else {
  initGroupCharts();
}
