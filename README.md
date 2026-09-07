# CIS Affordability Index

Static website comparing each selected CPI good or goods group with the Wage Price Index (WPI) over the same selected quarters.

## Static deployment

The front end now runs as a static site using the bundled `data.js` file, so the main comparison interface can be hosted on GitHub Pages without `server.py`.

## Run locally

Static front end:

```text
Open index.html directly in a browser
```

Python server version:

```powershell
python server.py
```

Then open:

```text
http://127.0.0.1:8000
```

## Main files

- `index.html` for the page structure
- `app.js` for the comparison logic and chart rendering
- `styles.css` for styling
- `data.js` for the bundled CPI and WPI datasets used by the static site
- `group-charts.js` for the CPI group inflation and wage-relative abundance charts
- `server.py` for local Python serving and data tooling

## Features

- Individual bars and rankings for selected goods
- Percentage change in affordability (how much wages can buy), with separate price and wage changes in bar tooltips
- Custom dates and full-calendar-year quick ranges, limited to shared data

## Data sources

- [ABS CPI, July 2026, Table 18](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jul-2026/6401018.xlsx): quarterly group, sub-group and expenditure class indexes, weighted average of eight capital cities. Bundled data includes 132 series (131 selectable series and overall CPI), through Q2 2026.
- [ABS WPI, June 2026, Table 1](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/jun-2026/634501.xlsx): series `A2603609J`, total hourly rates of pay excluding bonuses, private and public sectors, all industries, Australia, original. September 1997 to June 2026.

These are static snapshots through Q2 2026, not an automatically updated feed. The original website now uses the same verified snapshot as the WordPress plugin package.

## Calculation and verification

`((wageEnd / wageStart) / (priceEnd / priceStart) - 1) * 100`

Positive values mean wages can buy more of the good; negative values mean wages can buy less. This follows the supplied Affordability Change Metric - Index Version document. For example, wages rising 50% and prices rising 20% gives a 25% increase in affordability. Gains appear green, losses red, and rankings put the largest gains first. Different reference bases for CPI and WPI cancel out because each index is divided by its own starting value. Each good is calculated separately; this is not a weighted household basket.

Run `node --test tests/calculations.test.cjs` for the calculation and date-selection tests. Run `python tests/audit_sources.py path/to/6401018.xlsx path/to/634501.xlsx` (requires `openpyxl`) to compare every bundled observation with the linked ABS workbooks. See [AUDIT.md](AUDIT.md) for findings and scope.
