# Calculation and source audit

Update: the original website now contains the verified Q2 2026 dataset from the WordPress package: 22,813 CPI observations and 116 WPI observations. Sources are July 2026 CPI Table 18 and June 2026 WPI Table 1. All 864,766 available good/period comparisons were checked after the refresh. The December 2025 findings below describe the earlier audit snapshot.

Audited 7 September 2026 against the live GitHub Pages application and ABS December 2025 workbooks.

## Findings corrected

1. The original live bar chart subtracted percentage wage growth from percentage price growth. The final metric follows the user's Affordability Change Metric - Index Version document: `((W1/W0)/(P1/P0)-1)*100`, measuring the percentage change in how much wages can buy. Positive values are improvements (green), negative values are declines (red), and rankings place the largest improvements first.
2. The end-quarter control offered Q4 2025 while bundled wages ended in Q1 2025. The chart silently used Q1 instead. Added the verified Q2, Q3 and Q4 2025 original WPI values (156.2, 158.3, 159.4). Date options now require valid observations for every selected good and wages; rendering rejects mismatched endpoints.
3. Quick ranges counted observations rather than elapsed quarters. For example, the one-year range spanned three quarters. Ranges now use calendar-year offsets.
4. Adding, removing or changing goods reset custom dates to the maximum history. Valid custom dates are now retained; dates outside a new good's history are clamped to available dates, visibly in both controls.
5. A same-quarter comparison was rejected and zero was labelled more affordable. It now returns zero and is labelled unchanged.
6. Quarter labels mixed local-time parsing with UTC formatting. They now consistently use UTC.

## Source verification

- All 22,549 CPI observations in 132 series exactly match ABS quarterly Table 18 for December 2025 by series ID and quarter.
- All 111 original bundled WPI observations exactly matched ABS Table 1, series A2603609J. After extending through Q4 2025, all 114 observations match.
- This WPI series measures total hourly rates of pay excluding bonuses, all industries, private and public sectors, Australia, original (not seasonally adjusted).
- CPI is the weighted average of eight capital cities. Historical CPI indexes in this workbook were re-referenced to September 2025 = 100. Using within-series growth factors avoids comparing incompatible CPI and WPI reference bases.
- The app loads only `data.js` and `app.js`, plus its inline UI code. Legacy group/abundance scripts and the Python data loader are not used by the live page.

## Verification

The regression suite compares 834,993 combinations of selectable good and start/end quarters against an independently expressed change in wage divided by price levels. It also covers both reference-document examples, chart colours and ranking direction, invalid values, reference-base invariance, custom-date persistence, full-year ranges, missing wage endpoints, shorter good histories and same-quarter comparisons. The source audit independently checks every bundled observation against the downloaded workbooks.

Reference-document examples: milk prices 100 to 160 and wages 100 to 130 give `(1.30/1.60-1)*100 = -18.75%`: wages buy 18.75% less milk. Bread prices 100 to 120 and wages 100 to 150 give `(1.50/1.20-1)*100 = +25%`: wages buy 25% more bread. This is the inverse of the price-relative-to-wages growth factor, not simply a sign reversal of that percentage change.

## Scope and limitations

The bundled data ends in Q4 2025 and does not automatically refresh. This audit verifies that snapshot, not coverage of later ABS releases. The measure compares price indexes with hourly wage rates; it is not a measure of disposable income or household living standards, and does not incorporate taxes, hours worked or individual household spending weights. Each selected good is a separate comparison. ABS aggregate/subgroup series can share labels; the calculation uses their distinct series IDs.

Sources: [ABS CPI December 2025](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/dec-2025), [ABS WPI December 2025](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/dec-2025).
