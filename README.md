# CIS Affordability Index

Local website for comparing selected CPI goods or custom baskets against:

- `All groups CPI`
- `Wage Price Index (WPI)`

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

- single-good comparison
- custom basket mode with user weights
- CPI and WPI percentage comparisons
- rebased charts starting at `1`
- separate price-vs-CPI and price-vs-WPI charts
- interactive CPI group line chart
- CPI groups relative to wages abundance bar chart

## Data sources

- CPI workbook: `C:\RProjects\CIS_Marian\CPI GROUP data from 1948-Sept 2025 (EDITED).xlsx`
- WPI workbook: `C:\Users\samfo\Downloads\WPI.xlsx`
