import type { FactorKey } from "../lib/model";

export const SOURCES = [
  { name: "U.S. Census Bureau, American Community Survey", vintage: "2020–2024 ACS 5-year estimates", url: "https://www.census.gov/programs-surveys/acs/data/summary-file.html", role: "Population, income, rent, home value, vacancy, household size, employed residents, commuting, housing units, tenure, structure, and year-built estimates.", note: "Downloaded from the Census Bureau Table-Based Summary File. These are survey estimates, not live market observations." },
  { name: "U.S. Census Bureau, American Community Survey", vintage: "2015–2019 ACS 5-year estimates", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2019/", role: "Non-overlapping baseline for metro, county, and state population plus employed-resident and housing-unit growth where identifiers match.", note: "The periods do not overlap. Boundaries are not harmonized; matching an identifier does not guarantee unchanged geography. It is not an annual growth rate." },
  { name: "U.S. Census Bureau Gazetteer Files", vintage: "2024 national state, county, and CBSA files", url: "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html", role: "Land area and internal latitude/longitude points used for density and location context.", note: "Density equals ACS population divided by Gazetteer land area in square miles." },
  { name: "U.S. Census Bureau Cartographic Boundaries", vintage: "2017 us-atlas base plus 2024 county supplement", url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html", role: "State and county outlines used by the nationwide atlas and state drill-down.", note: "Base outlines use 2017 Census cartography distributed by us-atlas (ISC license); 11 supplemental 2024 features cover newer Alaska and Connecticut county equivalents. Geometry is for display, not a boundary or parcel survey." },
];

export const METRIC_DEFINITIONS = [
  ["Population", "B01003_001", "Reported", "People"], ["Population growth", "B01003_001", "Calculated", "Change, 2015–2019 to 2020–2024"],
  ["Median household income", "B19013_001", "Reported", "2024 inflation-adjusted dollars"], ["Median gross rent", "B25064_001", "Reported", "Monthly dollars"],
  ["Median home value", "B25077_001", "Reported", "Owner-occupied dollars"], ["Vacancy rate", "B25002", "Calculated", "Vacant units / housing units"],
  ["Average household size", "B25010_001", "Reported", "People per occupied unit"], ["Employed residents", "B23025_004", "Reported", "Civilian employed residents age 16+"],
  ["Employed-resident growth", "B23025_004", "Calculated", "Change between ACS vintages"], ["Population density", "B01003 + Gazetteer", "Calculated", "People / land square mile"],
  ["Housing units", "B25001_001", "Reported", "Units"], ["Housing-unit growth", "B25001_001", "Calculated", "Change between ACS vintages"],
  ["Transit share", "B08301", "Calculated", "Transit commuters / workers"], ["Drive-alone share", "B08301", "Calculated", "Drive-alone commuters / workers"],
  ["Work-from-home share", "B08301", "Calculated", "Home workers / workers"], ["Mean commute", "B08013 / B08301", "Calculated", "Minutes among non-home workers"],
  ["Annualized median rent / median income", "B25064 / B19013", "Calculated", "12 × median monthly rent / median household income × 100; not household rent burden"],
  ["Home value / income", "B25077 / B19013", "Calculated", "Ratio of medians, not a price-to-income measure for individual households"],
  ["Recent construction share", "B25034", "Calculated", "Share of units built in 2020 or later"],
  ["Renter share", "B25003", "Calculated", "Renter-occupied / occupied units"], ["Housing-form shares", "B25024", "Calculated", "Detached, attached, and multifamily"],
] as const;

export const FACTOR_METHODS: Record<FactorKey, { input: string; interpretation: string; limitation: string }> = {
  affordability: { input: "Rent-to-income and home-value-to-income percentiles", interpretation: "Higher values indicate greater cost pressure and a stronger need for comparatively efficient forms.", limitation: "Not a development pro forma or household burden measure." },
  density: { input: "Population per land square mile", interpretation: "Higher density generally favors compact housing forms.", limitation: "Community-wide density hides neighborhood variation." },
  household: { input: "Average household-size percentile", interpretation: "Larger households raise the fit of formats with flexible space.", limitation: "An average does not describe every bedroom need." },
  jobs: { input: "Employed-resident growth percentile", interpretation: "Growth can increase housing demand and development pressure.", limitation: "Resident employment is not payroll jobs located in the selected geography." },
  transportation: { input: "Transit and work-from-home percentiles", interpretation: "Higher values improve the fit of transit-compatible compact formats.", limitation: "Mode share does not measure frequency or walkability." },
  shortage: { input: "Vacancy, population growth, and housing growth", interpretation: "Lower vacancy and population growth outpacing units raise the signal.", limitation: "Not a formal housing-needs assessment." },
  land: { input: "Density and geography land-area percentiles", interpretation: "Represents land-efficiency pressure, not measured parcels.", limitation: "No parcel, zoning, or environmental inventory." },
  pressure: { input: "Population, employed-resident, and rent pressure", interpretation: "Combines broad demand and cost signals.", limitation: "Depends on documented model assumptions." },
  existingMix: { input: "Detached, attached, and multifamily shares", interpretation: "Measures structural compatibility with local stock.", limitation: "Existing prevalence can reflect past regulation." },
};
