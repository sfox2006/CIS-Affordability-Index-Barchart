# Selectable ABS categories

`cpi-categories.json` lists the 87 expenditure classes from the linked ABS
classification. IDs refer to quarterly original Australia index numbers in
Table 18, not percentage-change columns. Table 18 lists parents before their
children; where a subgroup has the same label as its only class, the second
entry is the expenditure class.

Only these reviewed IDs are selectable. Overall CPI is retained internally for
the empty calculator's date baseline, not as an item. Missing canonical IDs
fail validation and require review; updates cannot silently add broad categories.

The old Tobacco, Household textiles and Insurance pairs have identical complete
histories. Rents, New dwelling purchase and Urban transport fares have small
historical differences between hierarchy levels. They are not merged as exact
duplicates: their subgroup entries are excluded by classification, and each
expenditure-class history is preserved unchanged.

Repeated identical records with the same canonical ID are collapsed. Conflicting
records are rejected, and differently named items are never deduplicated merely
because some values happen to match.
