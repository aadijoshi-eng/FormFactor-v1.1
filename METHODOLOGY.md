# FormFactor 1.1 methodology

FormFactor is an educational comparison of five housing formats. It is a model of alignment under assumptions, not a prediction, probability, recommended housing mix, or project feasibility study. Calculations execute in `src/lib/model.ts`; the public Methodology and Sources pages expose the main choices.

## Bundled observations and provenance

There are 387 metros, 51 state/DC records and 3,144 counties or county equivalents. Puerto Rico and other territories are excluded. These counts describe this bundle, not a claim about every possible definition of U.S. communities.

Current values are attributed to the 2020–2024 ACS five-year release. The 2015–2019 five-year release supplies non-overlapping population, employed-resident and housing-unit baselines. The bundle lacks population baselines for 16 metros and 11 counties; no state is missing that baseline. Missing values remain null. Counts of missing values for other fields can differ.

The dataset is a static project snapshot, not a live feed. Original Census downloads and margins of error are not bundled, so the project does not provide a complete independent reproduction of every survey estimate. `SOURCE_MANIFEST.json` lists the public sources and vintages used.

2024 Gazetteer land areas support density. Base maps use simplified 2017 Census geometry from `us-atlas`, with 11 2024 supplemental features for two Alaska census areas and nine Connecticut planning regions. Outlines are not current cadastral maps. Connecticut's legacy counties are not interchangeable with its current planning regions. [Census boundary documentation](https://www.census.gov/programs-surveys/acs/geography-acs/geography-boundaries-by-year/2024.html), [Connecticut change note](https://www.census.gov/programs-surveys/acs/technical-documentation/user-notes/2023-01.html), [us-atlas provenance](https://github.com/topojson/us-atlas).

## Reported and calculated fields

The dictionary in `src/data/content.ts` identifies the source tables and units. "Reported" means a bundled survey estimate attributed to a Census table, not a directly observed property price. "Calculated" means a ratio or change computed from estimates.

- Growth (%) = `100 × (current / baseline − 1)`, rounded to two decimals. A missing or zero baseline yields null. This is a change between five-year vintages, not annual growth. Joins use geographic identifiers; boundaries have not been harmonized. Identical identifiers do not prove unchanged boundaries.
- Rent/income signal = `100 × 12 × median monthly gross rent / median household income`. This ratio of medians is not the share of income paid by a typical renter or the ACS rent-burden distribution.
- Home/income signal = `median owner-occupied home value / median household income`. It is not an individual purchaser's affordability calculation.
- Vacancy = `100 × vacant units / all housing units`; it includes seasonal and other vacancy, not just units available for rent or sale.
- Commute mode shares = `100 × workers in mode / workers`. Mean commute = aggregate travel minutes divided by workers excluding those working at home. Transit commute share does not measure service coverage or frequency; remote work is not transit availability.
- Density = population / Gazetteer land square miles. The generator uses source land precision before storing land to one decimal and density to two decimals.
- Recent construction = share of units built in 2020 or later. This is a stock composition estimate, not a building-permit time series.
- Employed-resident growth measures residents employed, not payroll jobs located in the community.
- Housing-form shares use detached, attached, and 2+ unit structures. They exclude mobile and other structures and therefore need not sum to 100%.

ACS margins of error are not used. No statistical significance test, parcel data, zoning constraints, actual development costs or investment returns are included. Small apparent differences can reflect survey uncertainty. [ACS Summary File documentation](https://www.census.gov/programs-surveys/acs/data/summary-file.html), [Gazetteer documentation](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html).

## Nine community signals

For each underlying input, `P(x)` is `100 × count(finite peer values ≤ x) / finite peer count`. Metro calculations use only the 387 bundled metros; county calculations use only the 3,144 bundled counties. Signals use national same-type peers, even when displaying a statewide ranking. A missing percentile input or empty peer group produces the neutral value 50. Density and land-area percentiles apply `log1p(max(value, 0))` first. These groups are bundled comparisons, not a sampled target market.

Let `R` be the rent/income percentile, `V` the home/income percentile, `P` population-growth percentile, `J` employed-resident-growth percentile, `H` housing-growth percentile, `Q` vacancy percentile, `D` density percentile and `A` land-area percentile. `clamp(x)` limits x to 0–100.

| Factor | Community signal | Default slider points |
| --- | --- | ---: |
| Affordability | `(R + V) / 2` | 30 |
| Density | `D` | 13 |
| Household size | Household-size percentile | 9 |
| Job growth | `J` (employed-resident growth proxy) | 12 |
| Transportation | `min(100, .7 × P(transit share) + .3 × P(work-from-home share))` | 11 |
| Shortage | `clamp(.55 × (100 − Q) + .30 × P + .50 × max(0, P − H))` | 14 |
| Land | `clamp(.72 × D + .28 × (100 − A))` | 9 |
| Pressure | `clamp(.45 × P + .35 × J + .20 × R)` | 8 |
| Existing mix | Format-specific stock fit below; displayed generic signal is 50 | 6 |

These coefficients are hand-set assumptions. "Shortage" is not a measured shortage of homes. "Land" is pressure for land efficiency, not measured developable acres. Choosing a community with larger administrative boundaries can affect that proxy.

## Format fit and final score

For the first eight factors:

```text
factor_fit = max(0, 100 − 0.72 × abs(community_signal − format_profile))
```

The exact assumed targets are exported as `FORMAT_PROFILES`:

| Format | Affordability | Density | Household | Jobs | Transportation | Shortage | Land | Pressure |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Apartments | 92 | 92 | 34 | 80 | 92 | 92 | 95 | 80 |
| Townhomes | 78 | 58 | 72 | 74 | 58 | 82 | 68 | 80 |
| Detached | 45 | 18 | 94 | 55 | 22 | 38 | 18 | 50 |
| Mixed-use | 82 | 96 | 44 | 92 | 98 | 88 | 98 | 90 |
| Master-planned | 58 | 34 | 88 | 76 | 38 | 68 | 24 | 90 |

Existing-mix fits use percentage shares (0–100), treating a missing share as zero:

| Format | Existing-mix factor fit | Fixed adjustment (score points) |
| --- | --- | ---: |
| Apartments | `min(100, 35 + 1.5 × multifamilyShare)` | −5.2 |
| Townhomes | `min(100, 48 + 3.2 × attachedShare)` | −5.7 |
| Detached | `min(100, 20 + detachedShare)` | −8.9 |
| Mixed-use | `min(100, 35 + 1.5 × multifamilyShare)` | −3.5 |
| Master-planned | `max(35, 90 − multifamilyShare)` | −5.0 |

```text
raw_fit = sum(factor_fit × slider_points) / sum(slider_points)
score = round(clamp(raw_fit + fixed_format_adjustment), 1 decimal)
```

The initial total is 112; raw slider points are normalized by dividing by their total. Sliders accept 0–30 integer points and preserve at least one positive point. Fixed adjustments continue to apply independently of which factors have zero weight. They are part of FormFactor 1.1's assumptions and are not learned from housing outcomes or empirical evidence of suitability. Rankings use the rounded scores. Format ties retain the declared format order.

The density ranges, construction categories, privacy, amenities, maintenance and household descriptions in `FORMAT_INFO` are illustrative format assumptions. They are not national averages or cost estimates. Master-planned and mixed-use developments may contain several structural housing types, so these five formats are not mutually exclusive building classifications.

## Scenario Lab

Each of the six scenarios replaces the named community signals and weight entries in `SCENARIOS`; other entries retain current community conditions and user weights. The Lab shows these replacements and compares resulting scores with the current-weight community baseline. Some scenario weights exceed the user slider limit (for example affordability 32) because they are scenario assumptions, not slider values. Existing-mix fit continues to use the selected community's stock shares. Scenarios are illustrative, not observations about a metro or forecasts. The sensitivity values are score-point differences.

## Atlas rankings, benchmarks, and exports

Each layer ranks the underlying numeric values. Highest/Lowest reverses the numeric ordering; ties use name and geographic ID. These are ordinal positions, not shared statistical ranks. Missing values appear after numeric results but receive no rank and are excluded from the reported rank denominator. A filtered search changes display order/count, not the statewide denominator.

"State median" means the unweighted median of available county values in that state, not the state's reported ACS estimate. "Pinned median" and range use the pinned counties with available values. All-six-metric exports repeat the same rank and benchmark calculation per layer. Dollars remain dollars; density differences are people per square mile; growth and vacancy differences are percentage points, with no extra multiplication by 100.

Map shading groups values by percentile within the displayed national-state or within-state-county set. The legend gives min/max values rather than uniform numeric bin widths. Pale gray indicates missing data.

Housing-fit state ranks compare the chosen format's score across that state's counties, calculated with national county peers and current weights. Pinned scorecards show both within-county format ranking and within-pinned-group county ranking for each format. Those are distinct comparisons. CSV headings identify the scope; `weight_profile` records the scorecard export's nine weights. These exports are educational extracts, not official Census tables.
