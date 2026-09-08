# CIS Affordability Index

Static website comparing each selected CPI good or goods group with the Wage Price Index (WPI) over the same selected quarters.

## Static deployment

The front end now runs as a static site using the bundled `data.js` file, so the main comparison interface can be hosted on GitHub Pages without `server.py`.

## Embed on WordPress without nested scrolling

Replace the existing GitHub iframe with the complete contents of `GITHUB-EMBED.html` in a Custom HTML block or Elementor HTML widget. The external `embed.js` script must be permitted to run on the WordPress page. It listens only to the expected GitHub origin and matching iframe, then adjusts the height as content changes. The calculator's `embed-frame.js` reports its content height to its embedding parent. Both parts are required; updating GitHub alone cannot resize an iframe on the host page.

Test the saved page on desktop and mobile, including adding and removing several goods, opening information, and adding notes. The only vertical scrollbar should be the WordPress page's scrollbar. Keep the containing Elementor section/widget height automatic, with no fixed height or scrolling overflow. Do not hide overflow as a substitute for resizing. If WordPress removes the script, an administrator must load it using the site's approved script mechanism. Without it the iframe remains scrollable, so content is not cut off. GitHub still uses a static ABS data snapshot.

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

These links document the initial Q2 2026 snapshot. The GitHub website now refreshes its bundle using the daily workflow below; the methodology note on the website links to the workbooks used for the most recent data update. The WordPress plugin has its own independent updater.

## Daily ABS updates

The `Update ABS data and publish website` workflow runs daily at 03:23 UTC and can also be started from GitHub's Actions tab using **Run workflow**. Scheduled runs may start later when GitHub is busy.

Each check discovers the current CPI Table 18 and WPI Table 1 links on the ABS latest-release pages and downloads both files. It validates the existing series IDs, index units, quarterly dates, positive values, and preservation of all existing history. New quarters and revisions to existing observations rebuild `data.js`; unchanged observations leave it untouched. Complete histories are replaced together so changes in index reference bases are handled consistently. A missing series or invalid download fails the run and preserves the published site.

The website continues to restrict comparisons to quarters available in both datasets. CPI can update before WPI without exposing an unmatched quarter. Successful updates also refresh the methodology date, source links, and data cache version in `index.html`.

After the tests pass, GitHub commits any updates and explicitly deploys the website to Pages. This deployment is required because commits made with the built-in GitHub Actions token do not themselves trigger a Pages build. Ordinary pushes to `main` also test and deploy the site. Only public website assets are uploaded.

Repository settings: **Settings > Pages > Build and deployment > Source: GitHub Actions**. The workflow requests repository write and Pages deployment permissions; repository or organisation policies must permit these. No personal access token or WordPress plugin is needed. The existing `GITHUB-EMBED.html` snippet and public URL remain valid.

The workflow records the month of its last successful check in `.github/abs-last-successful-check.txt`. This produces at most one maintenance commit per month when data is unchanged, keeping the repository active across quarterly releases. GitHub disables scheduled workflows in public repositories after 60 days without repository activity. If checks fail for an extended period, inspect the failed run in Actions and re-enable the workflow if needed.

Local checks: `pip install openpyxl==3.1.5`, then `python scripts/update_abs_data.py --check`. Omit `--check` to refresh local files. Run `python -m unittest discover -s tests -p test_update_abs_data.py` for updater validation tests. Existing audit results in `AUDIT.md` describe the initial snapshot, not subsequent automated releases.

## Calculation and verification

`((wageEnd / wageStart) / (priceEnd / priceStart) - 1) * 100`

Positive values mean wages can buy more of the good; negative values mean wages can buy less. This follows the supplied Affordability Change Metric - Index Version document. For example, wages rising 50% and prices rising 20% gives a 25% increase in affordability. Gains appear green, losses red, and rankings put the largest gains first. Different reference bases for CPI and WPI cancel out because each index is divided by its own starting value. Each good is calculated separately; this is not a weighted household basket.

Run `node --test tests/calculations.test.cjs` for the calculation and date-selection tests. Run `python tests/audit_sources.py path/to/6401018.xlsx path/to/634501.xlsx` (requires `openpyxl`) to compare every bundled observation with the linked ABS workbooks. See [AUDIT.md](AUDIT.md) for findings and scope.
