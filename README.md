# FormFactor 1.1

FormFactor 1.1 is a U.S. housing and community-planning tool created by me. It compares apartments, townhomes, detached houses, mixed-use development, and master-planned communities across a bundled national dataset.

The project is an educational screening model, NOT a property-search site or professional planning recommendation. It runs entirely in the browser and does not require an account, backend, API key, or live data service.

## Features

- Nationwide state atlas with six metric layers
- State-to-county drill-down for 3,144 counties and county equivalents
- Search, statewide rankings, median context, and CSV downloads
- Profiles for 387 metro areas and county-level analysis
- Five housing-format scorecards with nine adjustable weights
- Six planning scenarios
- Pinned county comparisons
- Saved comparisons and shareable Atlas views
- Responsive desktop and mobile layouts

## Run locally

FormFactor requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Vite will print the local address, usually `http://localhost:5173/`.

To run the project checks:

```sh
npm run verify
```

This runs TypeScript, ESLint, the test suite, data validation, and the production build.

To preview the production build:

```sh
npm run preview -- --host 127.0.0.1 --port 4173
```

Then open `http://127.0.0.1:4173/`.

## Data

The bundled dataset contains:

- 387 U.S. metro areas
- 50 states and Washington, D.C.
- 3,144 counties and county equivalents
- 18 local indicators

Current estimates are labeled as 2020–2024 American Community Survey five-year estimates. Growth measures compare them with the 2015–2019 five-year estimates. Density uses 2024 Census Gazetteer land area. The map uses `us-atlas` geometry with a small supplement for newer county-equivalent boundaries.

This is a static prototype dataset, not a live market feed. Margins of error, parcel data, zoning, construction bids, land availability, and investment returns are outside its scope. See [METHODOLOGY.md](METHODOLOGY.md) and [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) for details.

## Housing-fit model

The score is a weighted comparison between nine community signals and five housing-format profiles. Users can change every weight from the comparison page. The profiles, scenario overrides, and fixed format adjustments are project assumptions, not coefficients estimated from observed development outcomes.

The app shows the calculation and its limitations wherever scores appear. A higher score means stronger alignment within this model; it does not mean a project is feasible or advisable.

## Project structure

```text
src/App.tsx             Main application views and interactions
src/styles.css          Layout, visual system, and responsive styles
src/lib/model.ts        Housing-fit model and scenarios
src/lib/metrics.ts      Ranking and comparison calculations
src/lib/atlasState.ts   Atlas links and saved Atlas state
src/lib/storedState.ts  Saved user comparisons
src/lib/csv.ts          CSV generation
src/data/               Bundled data and public-facing copy
scripts/                Data generation and validation
tests/                  Model, data, state, and export tests
```

## Updating the data

Review `scripts/generate-data.mjs` and `SOURCE_MANIFEST.json` before rebuilding the dataset. The generator downloads public Census files and replaces the bundled data files.

```sh
npm run data:build
npm run data:validate
```

Any data update should also include a review of geographic boundary changes and source vintages.

## GitHub Pages

The Vite build uses relative asset paths and hash-based navigation, so it can be hosted from a repository subpath.

1. Push the project to GitHub.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Confirm the **Checks** workflow passes.
4. Run **Deploy to GitHub Pages** from the Actions tab.

The deploy workflow builds the project and publishes the `dist` folder.

## Author
I created FormFactor and wrote most of the application code. I used AI assistance for project scaffolding, planning, debugging, linting, testing, documentation, and release preparation. For example, I used it to troubleshoot Atlas share links and TypeScript and ESLint issues. I reviewed the changes and ran `npm run verify`.
