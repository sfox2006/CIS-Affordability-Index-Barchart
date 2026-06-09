const abundanceState = {
  electricianGood: "",
  nationalGood: "",
  stateName: "Victoria",
  wageGroup: "men",
  stateGood: "",
};

function abundancePercent(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function abundanceSentence(label, value) {
  if (!Number.isFinite(value)) return "No abundance value is available.";
  if (value > 0) return `${label} became ${value.toFixed(1)}% more abundant.`;
  if (value < 0) return `${label} became ${Math.abs(value).toFixed(1)}% less abundant.`;
  return `${label} was unchanged in abundance.`;
}

function fillAbundanceSelect(select, rows, selectedLabel) {
  if (!select) return;
  select.innerHTML = rows.map((row) => `<option value="${row.label}">${row.label}</option>`).join("");
  select.value = rows.some((row) => row.label === selectedLabel) ? selectedLabel : rows[0]?.label || "";
}

function renderAbundanceBars(svg, rows, selectedLabel) {
  if (!svg) return;

  const width = 980;
  const rowHeight = 34;
  const margin = { top: 22, right: 120, bottom: 26, left: 300 };
  const height = Math.max(360, margin.top + margin.bottom + rows.length * rowHeight);
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  const maxAbs = Math.max(10, ...values.map((value) => Math.abs(value)));
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const zeroX = plotLeft + (plotRight - plotLeft) / 2;
  const scale = (plotRight - plotLeft) / 2 / maxAbs;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <line class="axis-line" x1="${zeroX}" y1="${margin.top - 8}" x2="${zeroX}" y2="${height - margin.bottom + 4}"></line>
    ${rows.map((row, index) => {
      const y = margin.top + index * rowHeight;
      const barY = y + 6;
      const barHeight = 20;
      const value = row.value;
      const x = value >= 0 ? zeroX : zeroX + value * scale;
      const barWidth = Math.max(2, Math.abs(value * scale));
      const labelAnchor = value >= 0 ? "end" : "start";
      const valueAnchor = value >= 0 ? "start" : "end";
      const labelX = value >= 0 ? zeroX - 10 : zeroX + 10;
      const valueX = value >= 0 ? x + barWidth + 8 : x - 8;
      const isSelected = row.label === selectedLabel;
      return `
        <g class="abundance-bar-row ${isSelected ? "is-selected" : ""}" data-good="${row.label}">
          <text class="bar-row-label" x="${labelX}" y="${y + 22}" text-anchor="${labelAnchor}">${row.label}</text>
          <rect class="${value >= 0 ? "abundance-positive" : "abundance-negative"}" x="${x}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="2">
            <title>${abundanceSentence(row.label, value)}</title>
          </rect>
          <text class="bar-value-label" x="${valueX}" y="${y + 22}" text-anchor="${valueAnchor}">${abundancePercent(value)}</text>
        </g>
      `;
    }).join("")}
  `;
}

function setResult(panelId, row, context) {
  const result = document.getElementById(`${panelId}-result`);
  if (!result || !row) return;
  result.innerHTML = `
    <span>${context}</span>
    <p>${abundanceSentence(row.label, row.value)}</p>
  `;
}

function wireBarClicks(svg, select, onSelect) {
  if (!svg || svg.dataset.abundanceWired === "true") return;
  svg.dataset.abundanceWired = "true";
  svg.addEventListener("click", (event) => {
    const row = event.target.closest(".abundance-bar-row");
    if (!row) return;
    select.value = row.dataset.good;
    onSelect(row.dataset.good);
  });
}

function renderElectricianAbundance() {
  const data = window.PERSONAL_ABUNDANCE_DATA?.electrician;
  if (!data) return;
  const rows = data.rows;
  abundanceState.electricianGood ||= rows[0]?.label || "";
  const select = document.getElementById("electrician-good-select");
  fillAbundanceSelect(select, rows, abundanceState.electricianGood);
  const selected = rows.find((row) => row.label === abundanceState.electricianGood) || rows[0];
  setResult("electrician", selected, `${data.title}, ${data.period}`);
}

function renderNationalAbundance() {
  const data = window.PERSONAL_ABUNDANCE_DATA?.national;
  if (!data) return;
  const rows = data.rows;
  abundanceState.nationalGood ||= rows[0]?.label || "";
  const select = document.getElementById("national-good-select");
  fillAbundanceSelect(select, rows, abundanceState.nationalGood);
  const selected = rows.find((row) => row.label === abundanceState.nationalGood) || rows[0];
  setResult("national", selected, `${data.title}, ${data.period}`);
}

function renderStateAbundance() {
  const states = window.PERSONAL_ABUNDANCE_DATA?.states || {};
  const stateNames = Object.keys(states);
  if (!stateNames.length) return;
  if (!states[abundanceState.stateName]) abundanceState.stateName = stateNames[0];
  const stateData = states[abundanceState.stateName];
  const rows = stateData[abundanceState.wageGroup] || stateData.men || [];
  abundanceState.stateGood = rows.some((row) => row.label === abundanceState.stateGood)
    ? abundanceState.stateGood
    : rows[0]?.label || "";

  const stateSelect = document.getElementById("state-abundance-select");
  const wageSelect = document.getElementById("state-wage-select");
  const goodSelect = document.getElementById("state-good-select");

  stateSelect.innerHTML = stateNames.map((name) => `<option value="${name}">${name}</option>`).join("");
  stateSelect.value = abundanceState.stateName;
  wageSelect.value = abundanceState.wageGroup;
  fillAbundanceSelect(goodSelect, rows, abundanceState.stateGood);

  const selected = rows.find((row) => row.label === abundanceState.stateGood) || rows[0];
  const wageLabel = abundanceState.wageGroup === "women" ? "Female average full-time wage" : "Male average full-time wage";
  setResult("state", selected, `${abundanceState.stateName}, ${wageLabel}, ${stateData.period}`);
}

function initPersonalAbundance() {
  if (!window.PERSONAL_ABUNDANCE_DATA) return;

  document.getElementById("electrician-good-select")?.addEventListener("change", (event) => {
    abundanceState.electricianGood = event.target.value;
    renderElectricianAbundance();
  });
  document.getElementById("national-good-select")?.addEventListener("change", (event) => {
    abundanceState.nationalGood = event.target.value;
    renderNationalAbundance();
  });
  document.getElementById("state-abundance-select")?.addEventListener("change", (event) => {
    abundanceState.stateName = event.target.value;
    abundanceState.stateGood = "";
    renderStateAbundance();
  });
  document.getElementById("state-wage-select")?.addEventListener("change", (event) => {
    abundanceState.wageGroup = event.target.value;
    abundanceState.stateGood = "";
    renderStateAbundance();
  });
  document.getElementById("state-good-select")?.addEventListener("change", (event) => {
    abundanceState.stateGood = event.target.value;
    renderStateAbundance();
  });

  renderElectricianAbundance();
  renderNationalAbundance();
  renderStateAbundance();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPersonalAbundance);
} else {
  initPersonalAbundance();
}
