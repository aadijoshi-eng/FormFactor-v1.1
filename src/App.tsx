import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  Download,
  ExternalLink,
  Gauge,
  Home,
  House,
  Info,
  Layers3,
  Link2,
  Map as MapIcon,
  MapPin,
  Menu,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrainFront,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { feature } from "topojson-client";
import usAtlas from "us-atlas/counties-10m.json";
import countyGeometrySupplement from "./data/county-geometry-supplement.json";
import rawDataset from "./data/formfactor-data.json";
import { FACTOR_METHODS, METRIC_DEFINITIONS, SOURCES } from "./data/content";
import { atlasShareCountyFips, resolveAtlasLinkState, sanitizeAtlasStoredState, validWeights, writeAtlasShareParams, type AtlasLinkResolution, type AtlasStoredResolution } from "./lib/atlasState";
import { sanitizeStoredState } from "./lib/storedState";
import { safeSetStorage } from "./lib/browserStorage";
import { compareMetricRecords, median, metricDeltaFormat, metricDeltaFromMedian, metricRank, metricValue, type MapLayer } from "./lib/metrics";
import { downloadCsv } from "./lib/csv";
import {
  compact,
  communitySignals,
  DEFAULT_WEIGHTS,
  FACTOR_LABELS,
  FORMAT_INFO,
  FORMAT_ADJUSTMENTS,
  money,
  numeral,
  percent,
  SCENARIOS,
  scoreFormats,
  whyPrioritized,
  type AnalysisGeography,
  type County,
  type Dataset,
  type FactorKey,
  type FormatKey,
  type GeographyKind,
  type GeographyRecord,
  type ViewKey,
  type Weights,
  updateWeightPreservingPositiveTotal,
} from "./lib/model";

const dataset = rawDataset as Dataset;
const mutableCountiesByStateFips = new Map<string, County[]>();
for (const county of dataset.counties) {
  const stateCounties = mutableCountiesByStateFips.get(county.stateFips) || [];
  stateCounties.push(county);
  mutableCountiesByStateFips.set(county.stateFips, stateCounties);
}
const countiesByStateFips = new Map<string, readonly County[]>();
for (const [stateFips, stateCounties] of mutableCountiesByStateFips) {
  stateCounties.sort((a, b) => (b.population || 0) - (a.population || 0));
  countiesByStateFips.set(stateFips, Object.freeze(stateCounties));
}
const NO_COUNTIES: readonly County[] = Object.freeze([]);
const STORAGE_KEY = "formfactor-state-v2";
const ATLAS_STORAGE_KEY = "formfactor-atlas-state-v1";

type SortKey = "population" | "populationGrowth" | "medianRent" | "density" | "name";

interface SavedComparison {
  id: string;
  geographyKind?: GeographyKind;
  geographyId?: string;
  geographyName?: string;
  cbsa?: string;
  metroName?: string;
  savedAt: string;
  winner: string;
  score: number;
  weights: Weights;
}

interface StoredState {
  selectedCbsa?: string;
  selectedCountyFips?: string;
  geographyKind?: GeographyKind;
  weights?: Weights;
  saved?: SavedComparison[];
}

type AtlasStoredState = Omit<AtlasStoredResolution, "layer"> & { layer?: MapLayer };
type AtlasLinkState = Omit<AtlasLinkResolution, "layer"> & { layer?: MapLayer };

interface MapFeature {
  id: string | number;
  geometry: unknown;
}

interface MapFeatureCollection {
  features: MapFeature[];
}

const HASHES: Record<ViewKey, string> = {
  home: "home",
  atlas: "atlas",
  explorer: "communities",
  profile: "profile",
  compare: "compare",
  scenarios: "scenarios",
  methodology: "methodology",
  sources: "sources",
};

const VIEW_FROM_HASH = Object.fromEntries(Object.entries(HASHES).map(([view, hash]) => [hash, view])) as Record<string, ViewKey>;

const NAV_ITEMS: Array<{ view: ViewKey; label: string; icon: typeof Home }> = [
  { view: "home", label: "Home", icon: Home },
  { view: "atlas", label: "U.S. Atlas", icon: MapIcon },
  { view: "explorer", label: "Community Explorer", icon: Search },
  { view: "profile", label: "Community Profile", icon: MapPin },
  { view: "compare", label: "Compare Housing Types", icon: Building2 },
  { view: "scenarios", label: "Scenario Lab", icon: SlidersHorizontal },
];

const DOC_ITEMS: Array<{ view: ViewKey; label: string; icon: typeof Home }> = [
  { view: "methodology", label: "Methodology", icon: BookOpen },
  { view: "sources", label: "Sources", icon: Database },
];

const LAYER_OPTIONS: Array<{ key: MapLayer; label: string }> = [
  { key: "populationGrowth", label: "Population growth" },
  { key: "medianIncome", label: "Median household income" },
  { key: "medianRent", label: "Median gross rent" },
  { key: "medianHomeValue", label: "Median home value" },
  { key: "vacancyRate", label: "Housing vacancy rate" },
  { key: "density", label: "Population density" },
];

const FORMAT_KEYS = Object.keys(FORMAT_INFO) as FormatKey[];
const FACTOR_KEYS = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];

function readStoredState(): StoredState {
  try {
    return sanitizeStoredState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"), FACTOR_KEYS);
  } catch {
    return { saved: [] };
  }
}

function initialView(): ViewKey {
  return VIEW_FROM_HASH[window.location.hash.replace(/^#\/?/, "")] || "home";
}

function readAtlasStoredState(): AtlasStoredState {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATLAS_STORAGE_KEY) || "{}");
    return sanitizeAtlasStoredState(parsed, LAYER_OPTIONS.map((option) => option.key), FORMAT_KEYS) as AtlasStoredState;
  } catch {
    return { countyCompareFips: [] };
  }
}

function readAtlasLinkState(): AtlasLinkState {
  const resolved = resolveAtlasLinkState(
    new URLSearchParams(window.location.search),
    dataset.states,
    dataset.counties,
    LAYER_OPTIONS.map((option) => option.key),
    FORMAT_KEYS,
    FACTOR_KEYS,
  );
  return { ...resolved, layer: resolved.layer as MapLayer | undefined };
}

function metricFormat(layer: MapLayer, value: number | null) {
  if (layer === "medianIncome" || layer === "medianRent" || layer === "medianHomeValue") return money(value);
  if (layer === "density") return value == null ? "Not available" : `${numeral(value, 0)} people / sq. mi.`;
  return percent(value);
}

function colorFor(value: number | null, values: number[]) {
  if (value == null || values.length === 0) return "#e4e9e4";
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.filter((candidate) => candidate <= value).length / sorted.length;
  const colors = ["#dfeae5", "#b7d1c6", "#82b5a4", "#4b907c", "#246654", "#123f38"];
  return colors[Math.min(colors.length - 1, Math.floor(rank * colors.length))];
}

function cleanMetroName(name: string) {
  return name.replace(/ Metro Area$/, "");
}

function geographyName(geography: AnalysisGeography) {
  return "cbsa" in geography ? cleanMetroName(geography.name) : geography.name;
}

function geographyId(geography: AnalysisGeography) {
  return "cbsa" in geography ? geography.cbsa : geography.countyFips;
}

function geographyKindOf(geography: AnalysisGeography): GeographyKind {
  return "cbsa" in geography ? "metro" : "county";
}

function geographyState(geography: AnalysisGeography) {
  return "cbsa" in geography ? geography.primaryState : geography.stateAbbr;
}

function App() {
  const stored = useMemo(() => readStoredState(), []);
  const atlasLink = useMemo(() => readAtlasLinkState(), []);
  const [atlasLinkPending, setAtlasLinkPending] = useState(true);
  const fallbackMetro = dataset.metros.find((metro) => metro.name.startsWith("Charlotte-Concord-Gastonia")) || dataset.metros[0];
  const fallbackCounty = dataset.counties.find((county) => county.countyFips === "37119") || dataset.counties[0];
  const linkedCounty = atlasLink.countyFips ? dataset.counties.find((county) => county.countyFips === atlasLink.countyFips) : undefined;
  const initialLinkedCounty = linkedCounty;
  const [view, setView] = useState<ViewKey>(initialView);
  const [selectedCbsa, setSelectedCbsa] = useState(stored.selectedCbsa && dataset.metros.some((metro) => metro.cbsa === stored.selectedCbsa) ? stored.selectedCbsa : fallbackMetro.cbsa);
  const [selectedCountyFips, setSelectedCountyFips] = useState(initialLinkedCounty?.countyFips || (stored.selectedCountyFips && dataset.counties.some((county) => county.countyFips === stored.selectedCountyFips) ? stored.selectedCountyFips : fallbackCounty.countyFips));
  const [geographyKind, setGeographyKind] = useState<GeographyKind>(initialLinkedCounty ? "county" : stored.geographyKind === "county" ? "county" : "metro");
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS, ...(stored.weights || {}), ...(atlasLink.weights || {}) });
  const [saved, setSaved] = useState<SavedComparison[]>(stored.saved || []);
  const [mobileMenu, setMobileMenu] = useState(false);

  const selectedMetro = dataset.metros.find((metro) => metro.cbsa === selectedCbsa) || fallbackMetro;
  const selectedCounty = dataset.counties.find((county) => county.countyFips === selectedCountyFips) || fallbackCounty;
  const selectedGeography: AnalysisGeography = geographyKind === "county" ? selectedCounty : selectedMetro;
  const peers: GeographyRecord[] = geographyKind === "county" ? dataset.counties : dataset.metros;
  const scores = useMemo(() => scoreFormats(selectedGeography, peers, weights), [selectedGeography, peers, weights]);

  useEffect(() => {
    const onHash = () => {
      const nextView = initialView();
      setView(nextView);
      if (nextView !== "atlas") setAtlasLinkPending(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    try {
      safeSetStorage(localStorage, STORAGE_KEY, { selectedCbsa, selectedCountyFips, geographyKind, weights, saved });
    } catch { /* A browser can deny access to the storage property itself. */ }
  }, [selectedCbsa, selectedCountyFips, geographyKind, weights, saved]);

  function navigate(next: ViewKey) {
    setView(next);
    if (next !== "atlas") setAtlasLinkPending(false);
    window.location.hash = HASHES[next];
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseMetro(cbsa: string, next?: ViewKey) {
    setSelectedCbsa(cbsa);
    setGeographyKind("metro");
    if (next) navigate(next);
  }

  function chooseCounty(countyFips: string, next?: ViewKey) {
    setSelectedCountyFips(countyFips);
    setGeographyKind("county");
    if (next) navigate(next);
  }

  function chooseGeography(kind: GeographyKind, id: string, next?: ViewKey) {
    if (kind === "county") chooseCounty(id, next);
    else chooseMetro(id, next);
  }

  function saveComparison() {
    const newest: SavedComparison = {
      id: `${geographyKind}-${geographyId(selectedGeography)}-${Date.now()}`,
      geographyKind,
      geographyId: geographyId(selectedGeography),
      geographyName: geographyName(selectedGeography),
      savedAt: new Date().toISOString(),
      winner: scores[0].name,
      score: scores[0].score,
      weights: { ...weights },
    };
    setSaved((items) => [newest, ...items.filter((item) => `${item.geographyKind || "metro"}:${item.geographyId || item.cbsa}` !== `${geographyKind}:${geographyId(selectedGeography)}`)].slice(0, 8));
  }

  function loadComparison(item: SavedComparison) {
    chooseGeography(item.geographyKind || "metro", item.geographyId || item.cbsa || fallbackMetro.cbsa);
    setWeights(validWeights(item.weights, FACTOR_KEYS) ? item.weights : { ...DEFAULT_WEIGHTS });
    navigate("compare");
  }

  return (
    <div className="app-shell">
      <Topbar view={view} navigate={navigate} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
      <Sidebar view={view} navigate={navigate} geography={selectedGeography} open={mobileMenu} />
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
      <main tabIndex={-1} id="main-content" className="main-content">
        {view === "home" && <HomePage geography={selectedGeography} kind={geographyKind} scores={scores} chooseGeography={chooseGeography} navigate={navigate} />}
        {view === "atlas" && <AtlasPage selectedGeography={selectedGeography} weights={weights} initialLink={atlasLinkPending ? atlasLink : undefined} chooseMetro={chooseMetro} chooseCounty={chooseCounty} navigate={navigate} />}
        {view === "explorer" && <ExplorerPage selectedGeography={selectedGeography} selectedKind={geographyKind} chooseGeography={chooseGeography} />}
        {view === "profile" && <ProfilePage geography={selectedGeography} scores={scores} navigate={navigate} />}
        {view === "compare" && <ComparePage geography={selectedGeography} peers={peers} weights={weights} setWeights={setWeights} scores={scores} saved={saved} saveComparison={saveComparison} loadComparison={loadComparison} navigate={navigate} />}
        {view === "scenarios" && <ScenarioPage geography={selectedGeography} peers={peers} weights={weights} navigate={navigate} />}
        {view === "methodology" && <MethodologyPage navigate={navigate} />}
        {view === "sources" && <SourcesPage />}
      </main>
      <MobileNav view={view} navigate={navigate} />
    </div>
  );
}

function Brand() {
  return (
    <button className="brand" onClick={() => { window.location.hash = HASHES.home; }} aria-label="FormFactor 1.1 home">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span><strong>FormFactor 1.1</strong><small>AADI JOSHI · U.S. HOUSING ATLAS</small></span>
    </button>
  );
}

function Topbar({ view, navigate, mobileMenu, setMobileMenu }: { view: ViewKey; navigate: (view: ViewKey) => void; mobileMenu: boolean; setMobileMenu: (open: boolean) => void }) {
  return (
    <header className="topbar">
      <Brand />
      <nav className="top-links" aria-label="Documentation shortcuts">
        <button className={view === "methodology" ? "current" : ""} onClick={() => navigate("methodology")}>Methodology</button>
        <button className={view === "sources" ? "current" : ""} onClick={() => navigate("sources")}>Sources</button>
        <span className="data-badge"><i /> 2024 ACS data</span>
      </nav>
      <button className="menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-label={mobileMenu ? "Close navigation" : "Open navigation"}>
        {mobileMenu ? <X /> : <Menu />}
      </button>
    </header>
  );
}

function Sidebar({ view, navigate, geography, open }: { view: ViewKey; navigate: (view: ViewKey) => void; geography: AnalysisGeography; open: boolean }) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Primary navigation">
      <div className="nav-section-label">Analyze</div>
      <nav className="side-nav">
        {NAV_ITEMS.map(({ view: target, label, icon: Icon }) => (
          <button key={target} onClick={() => navigate(target)} className={view === target ? "active" : ""} aria-current={view === target ? "page" : undefined}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="nav-section-label docs-label">Documentation</div>
      <nav className="side-nav">
        {DOC_ITEMS.map(({ view: target, label, icon: Icon }) => (
          <button key={target} onClick={() => navigate(target)} className={view === target ? "active" : ""} aria-current={view === target ? "page" : undefined}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <section className="active-metro-card">
          <span>Active {geographyKindOf(geography)}</span>
          <strong>{geographyName(geography)}</strong>
          <button onClick={() => navigate("profile")}>Open profile <ArrowRight /></button>
        </section>
        <div className="vintage-note"><span>Data vintage</span><strong>2020–2024 ACS 5-year</strong><small>Educational model · v1.1</small></div>
      </div>
    </aside>
  );
}

function MobileNav({ view, navigate }: { view: ViewKey; navigate: (view: ViewKey) => void }) {
  const items = NAV_ITEMS.filter((item) => ["home", "atlas", "explorer", "compare", "scenarios"].includes(item.view));
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map(({ view: target, label, icon: Icon }) => (
        <button key={target} onClick={() => navigate(target)} className={view === target ? "active" : ""} aria-current={view === target ? "page" : undefined}>
          <Icon /><span>{label.replace("Community ", "").replace(" Housing Types", "")}</span>
        </button>
      ))}
    </nav>
  );
}

function GeographyPicker({ kind, geography, onChoose, compact: isCompact = false }: { kind: GeographyKind; geography: AnalysisGeography; onChoose: (kind: GeographyKind, id: string) => void; compact?: boolean }) {
  const selectedState = dataset.states.find((state) => state.abbr === geographyState(geography)) || dataset.states[0];
  const [stateFips, setStateFips] = useState(selectedState.fips);
  const [query, setQuery] = useState(geographyName(geography));
  const [open, setOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(0);
  const resultsId = `geography-results-${isCompact ? "compact" : "full"}`;
  const inputId = `${resultsId}-input`;
  const state = dataset.states.find((item) => item.fips === stateFips) || selectedState;
  const records = (kind === "county"
    ? dataset.counties.filter((county) => county.stateFips === state.fips)
    : dataset.metros.filter((metro) => metro.states.includes(state.abbr)))
    .sort((a, b) => (b.population || 0) - (a.population || 0));
  const term = query.trim().toLowerCase();
  const matches = records.filter((record) => !term || geographyName(record).toLowerCase().includes(term)).slice(0, 7);

  function switchKind(nextKind: GeographyKind) {
    if (nextKind === kind) return;
    const next = nextKind === "county"
      ? dataset.counties.filter((county) => county.stateFips === state.fips).sort((a, b) => (b.population || 0) - (a.population || 0))[0]
      : dataset.metros.filter((metro) => metro.states.includes(state.abbr)).sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    if (next) onChoose(nextKind, geographyId(next));
  }

  function switchState(fips: string) {
    setStateFips(fips);
    const nextState = dataset.states.find((item) => item.fips === fips) || dataset.states[0];
    const next = kind === "county"
      ? dataset.counties.filter((county) => county.stateFips === fips).sort((a, b) => (b.population || 0) - (a.population || 0))[0]
      : dataset.metros.filter((metro) => metro.states.includes(nextState.abbr)).sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    if (next) onChoose(kind, geographyId(next));
  }

  function select(record: AnalysisGeography) {
    setQuery(geographyName(record));
    setOpen(false);
    onChoose(kind, geographyId(record));
  }

  return (
    <div className={`geography-picker ${isCompact ? "compact-picker" : ""}`}>
      <div className="kind-toggle" role="group" aria-label="Community type">
        <button className={kind === "metro" ? "active" : ""} aria-pressed={kind === "metro"} onClick={() => switchKind("metro")}>Metro</button>
        <button className={kind === "county" ? "active" : ""} aria-pressed={kind === "county"} onClick={() => switchKind("county")}>County</button>
      </div>
      <div className="picker-fields">
        <label><span>State</span><div className="select-wrap"><select value={stateFips} onChange={(event) => switchState(event.target.value)} aria-label="State"><option value={state.fips}>{state.name}</option>{dataset.states.filter((item) => item.fips !== state.fips).map((item) => <option key={item.fips} value={item.fips}>{item.name}</option>)}</select><ChevronDown /></div></label>
        <div className="picker-search">
          <label htmlFor={inputId}><span>{kind === "county" ? "County" : "Metro area"}</span></label>
          <div className="search-combobox"><Search /><input id={inputId} value={query}
            onFocus={() => { setOpen(true); setActiveOption(0); }} onBlur={() => setOpen(false)}
            onChange={(event) => { setQuery(event.target.value); setActiveOption(0); setOpen(true); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); setOpen(true);
                setActiveOption((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
              }
              if (event.key === "Enter" && open && matches[activeOption]) { event.preventDefault(); select(matches[activeOption]); }
              if (event.key === "Escape") setOpen(false);
            }} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={resultsId}
            aria-activedescendant={open && matches[activeOption] ? `${resultsId}-${activeOption}` : undefined}
            placeholder={kind === "county" ? "Type a county" : "Type a metro"} /></div>
          {open && <div className="picker-results" id={resultsId} role="listbox" aria-label={kind === "county" ? "Counties" : "Metro areas"}>
            {matches.length ? matches.map((record, index) => <button id={`${resultsId}-${index}`} key={geographyId(record)} role="option" tabIndex={-1} aria-selected={index === activeOption} onMouseDown={(event) => event.preventDefault()} onClick={() => select(record)}><span>{geographyName(record)}</span><small>{kind === "county" ? "County" : "Metro"} · {compact(record.population)}</small></button>) : <p>No {kind === "county" ? "counties" : "metros"} match in {state.abbr}.</p>}
          </div>}
        </div>
      </div>
    </div>
  );
}

function HomePage({ geography, kind, scores, chooseGeography, navigate }: { geography: AnalysisGeography; kind: GeographyKind; scores: ReturnType<typeof scoreFormats>; chooseGeography: (kind: GeographyKind, id: string, view?: ViewKey) => void; navigate: (view: ViewKey) => void }) {
  const top = scores[0];
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-orbit" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow dot-eyebrow">FormFactor · Aadi Joshi</p>
          <h1>Housing form,<br /><em>community fit.</em></h1>
          <p className="hero-lede">Explore how five housing formats align with affordability, growth, transportation, household needs, and existing development patterns across the United States.</p>
          <div className="button-row">
            <button className="button primary" onClick={() => navigate("atlas")}>Open the U.S. atlas <ArrowRight /></button>
            <button className="button outline" onClick={() => navigate("compare")}>Compare housing types</button>
          </div>
          <small>Not a property search. Not a market forecast. A transparent public-data screening tool.</small>
        </div>
        <section className="analysis-card" aria-label={`Interactive analysis for ${geographyName(geography)}`}>
          <div className="card-kicker"><span>Interactive analysis</span><Gauge /></div>
          <h2>Start with a community</h2>
          <GeographyPicker key={`${kind}-${geographyId(geography)}`} kind={kind} geography={geography} onChoose={chooseGeography} compact />
          <div className="fit-summary">
            <ScoreRing score={top.score} />
            <div>
              <small>Highest comparative fit</small>
              <h3>{top.name}</h3>
              <p>{top.description}</p>
              <button className="text-link" onClick={() => navigate("compare")}>Inspect score <ArrowRight /></button>
            </div>
          </div>
          <ol className="ranking-list">
            {scores.slice(0, 3).map((score, index) => <li key={score.key}><span>{index + 1}. {score.name}</span><strong>{score.score.toFixed(1)}</strong></li>)}
          </ol>
          <button className="button dark full" onClick={() => navigate("profile")}>View {geographyName(geography)} profile <ArrowRight /></button>
        </section>
      </section>
      <section className="home-stats" aria-label="Dataset coverage">
        <Stat value="387" label="U.S. metro areas" />
        <Stat value="3,144" label="U.S. counties" />
        <Stat value="50 + D.C." label="State atlas coverage" />
        <Stat value="5" label="Housing formats" />
      </section>
      <section className="home-intro content-bound">
        <p className="eyebrow">One question, made inspectable</p>
        <div><h2>Which housing format fits the conditions already on the ground?</h2><p>FormFactor combines local public data with visible model assumptions. Change the priorities, compare formats, and see exactly why the ranking moves.</p></div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  return (
    <div className={`score-ring ${small ? "small" : ""}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties} aria-label={`${score.toFixed(1)} out of 100`}>
      <div><strong>{Math.round(score)}</strong><span>/100</span></div>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: React.ReactNode; description: string; children?: React.ReactNode }) {
  return (
    <header className="page-intro">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {children}
    </header>
  );
}

function DataNotice({ warm = false, children }: { warm?: boolean; children: React.ReactNode }) {
  return <div className={`data-notice ${warm ? "warm" : ""}`}><Info /> <span>{children}</span></div>;
}

function AtlasPage({ selectedGeography, weights, initialLink, chooseMetro, chooseCounty, navigate }: { selectedGeography: AnalysisGeography; weights: Weights; initialLink?: AtlasLinkState; chooseMetro: (cbsa: string, view?: ViewKey) => void; chooseCounty: (countyFips: string, view?: ViewKey) => void; navigate: (view: ViewKey) => void }) {
  const atlasStored = useMemo(() => readAtlasStoredState(), []);
  const [atlasLink] = useState<AtlasLinkState>(() => initialLink || { countyCompareFips: [], pinsSpecified: false });
  const geographyStateRecord = dataset.states.find((state) => state.abbr === geographyState(selectedGeography)) || dataset.states[0];
  const useStoredPosition = atlasStored.analysisId === `${geographyKindOf(selectedGeography)}:${geographyId(selectedGeography)}`;
  const initialState = dataset.states.find((state) => state.fips === atlasLink.stateFips) || (useStoredPosition ? dataset.states.find((state) => state.fips === atlasStored.selectedFips) : undefined) || geographyStateRecord;
  const storedLayer = atlasLink.layer || (LAYER_OPTIONS.some((option) => option.key === atlasStored.layer) ? atlasStored.layer as MapLayer : "populationGrowth");
  const preferredPins = atlasLink.pinsSpecified ? atlasLink.countyCompareFips : (atlasStored.countyCompareFips || []);
  const storedPins = preferredPins.filter((fips) => dataset.counties.some((county) => county.countyFips === fips && county.stateFips === initialState.fips)).slice(0, 3);
  const selectedGeographyCountyInInitialState = "countyFips" in selectedGeography && selectedGeography.stateFips === initialState.fips ? selectedGeography.countyFips : "";
  const storedCountyFips = useStoredPosition && dataset.counties.some((county) => county.countyFips === atlasStored.selectedCountyFips && county.stateFips === initialState.fips) ? atlasStored.selectedCountyFips : undefined;
  const initialCountyFips = atlasLink.countyFips || storedCountyFips || selectedGeographyCountyInInitialState;
  const initialAtlasMode: "states" | "counties" = atlasLink.stateFips
    ? (atlasLink.countyFips ? "counties" : "states")
    : (useStoredPosition && atlasStored.atlasMode ? atlasStored.atlasMode : selectedGeographyCountyInInitialState ? "counties" : "states");
  const [selectedFips, setSelectedFips] = useState(initialState.fips);
  const [selectedCountyFips, setSelectedCountyFips] = useState(initialCountyFips);
  const [atlasMode, setAtlasMode] = useState<"states" | "counties">(initialAtlasMode);
  const [lastStateClick, setLastStateClick] = useState<string | null>(null);
  const [layer, setLayer] = useState<MapLayer>(storedLayer);
  const [countyQuery, setCountyQuery] = useState("");
  const [countyCompareFips, setCountyCompareFips] = useState<string[]>(storedPins);
  const [countyRankDirection, setCountyRankDirection] = useState<"highest" | "lowest">(atlasLink.countyRankDirection || (atlasStored.countyRankDirection === "lowest" ? "lowest" : "highest"));
  const [housingFitFormat, setHousingFitFormat] = useState<FormatKey>(atlasLink.housingFitFormat || (atlasStored.housingFitFormat && FORMAT_KEYS.includes(atlasStored.housingFitFormat) ? atlasStored.housingFitFormat : "apartments"));
  const [countyVisible, setCountyVisible] = useState(7);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  const [previousGeography, setPreviousGeography] = useState(selectedGeography);
  if (previousGeography !== selectedGeography) {
    setPreviousGeography(selectedGeography);
    const nextState = dataset.states.find((state) => state.abbr === geographyState(selectedGeography));
    if (nextState && nextState.fips !== selectedFips) {
      setSelectedFips(nextState.fips);
      setCountyCompareFips([]);
      setCountyQuery("");
      setCountyVisible(7);
    }
    if ("countyFips" in selectedGeography) {
      setSelectedCountyFips(selectedGeography.countyFips);
      setAtlasMode("counties");
    }
  }
  const selectedState = dataset.states.find((state) => state.fips === selectedFips) || initialState;
  const stateMetros = dataset.metros.filter((metro) => metro.states.includes(selectedState.abbr)).sort((a, b) => (b.population || 0) - (a.population || 0));
  const stateCounties = useMemo(() => [...(countiesByStateFips.get(selectedFips) ?? NO_COUNTIES)], [selectedFips]);
  const countyMatches = stateCounties
    .filter((county) => county.name.toLowerCase().includes(countyQuery.trim().toLowerCase()))
    .sort((a, b) => compareMetricRecords(a, b, layer, countyRankDirection));
  const selectedCounty = stateCounties.find((county) => county.countyFips === selectedCountyFips) || stateCounties[0];
  const countyRank = selectedCounty ? metricRank(selectedCounty, stateCounties, layer, countyRankDirection) : null;
  const countyMedianContext = selectedCounty ? metricDeltaFromMedian(selectedCounty, stateCounties, layer) : null;
  const stateOptions = [...dataset.states].sort((a, b) => a.name.localeCompare(b.name));
  const topo = usAtlas as unknown as { objects: { states: unknown; counties: unknown } };
  const statesGeo = feature(usAtlas as never, topo.objects.states as never) as unknown as { features: MapFeature[] };
  const countiesGeo = feature(usAtlas as never, topo.objects.counties as never) as unknown as MapFeatureCollection;
  const allCountyFeatures = [...countiesGeo.features, ...(countyGeometrySupplement as unknown as MapFeatureCollection).features];
  const path = geoPath(geoAlbersUsa().scale(1280).translate([487.5, 305]));
  const stateFeature = statesGeo.features.find((mapFeature) => String(mapFeature.id).padStart(2, "0") === selectedState.fips);
  const stateCountyFeatures = allCountyFeatures.filter((mapFeature) => String(mapFeature.id).padStart(5, "0").startsWith(selectedState.fips));
  const countyByFips = new Map(stateCounties.map((county) => [county.countyFips, county]));
  const visibleRecords: GeographyRecord[] = atlasMode === "counties" ? stateCounties : dataset.states;
  const values = visibleRecords.map((record) => metricValue(record, layer)).filter((value): value is number => value != null);
  const option = LAYER_OPTIONS.find((item) => item.key === layer)!;

  useEffect(() => {
    try {
      safeSetStorage(localStorage, ATLAS_STORAGE_KEY, { layer, countyCompareFips, countyRankDirection, housingFitFormat, selectedFips, selectedCountyFips, atlasMode, analysisId: `${geographyKindOf(selectedGeography)}:${geographyId(selectedGeography)}` });
    } catch { /* Storage access can be unavailable in restricted contexts. */ }
  }, [layer, countyCompareFips, countyRankDirection, housingFitFormat, selectedFips, selectedCountyFips, atlasMode, selectedGeography]);

  let viewBox = "0 0 975 610";
  if (atlasMode === "counties" && stateFeature) {
    const [[x0, y0], [x1, y1]] = path.bounds(stateFeature as unknown as GeoPermissibleObjects);
    const padding = Math.max(12, Math.min(x1 - x0, y1 - y0) * .08);
    viewBox = `${x0 - padding} ${y0 - padding} ${x1 - x0 + padding * 2} ${y1 - y0 + padding * 2}`;
  }

  function enterCounties(fips = selectedState.fips) {
    const counties = dataset.counties.filter((county) => county.stateFips === fips).sort((a, b) => (b.population || 0) - (a.population || 0));
    setSelectedFips(fips);
    setAtlasMode("counties");
    setLastStateClick(null);
    setCountyQuery("");
    setCountyVisible(7);
    if (fips !== selectedFips) setCountyCompareFips([]);
    const next = counties.find((county) => county.countyFips === selectedCountyFips) || counties[0];
    if (next) {
      setSelectedCountyFips(next.countyFips);
      chooseCounty(next.countyFips);
    }
  }

  function activateState(fips: string) {
    if (lastStateClick === fips && selectedFips === fips) enterCounties(fips);
    else {
      if (fips !== selectedFips) { setSelectedCountyFips(""); setCountyCompareFips([]); }
      setSelectedFips(fips);
      setLastStateClick(fips);
    }
  }

  function activateCounty(county: County) {
    setSelectedCountyFips(county.countyFips);
    chooseCounty(county.countyFips);
  }

  function changeState(fips: string) {
    setSelectedFips(fips);
    setLastStateClick(null);
    setCountyQuery("");
    setCountyVisible(7);
    setCountyCompareFips([]);
    if (atlasMode === "counties") enterCounties(fips);
  }

  function toggleCountyCompare(countyFips: string) {
    setCountyCompareFips((current) => {
      if (current.includes(countyFips)) return current.filter((fips) => fips !== countyFips);
      if (current.length >= 3) return [...current.slice(1), countyFips];
      return [...current, countyFips];
    });
  }

  const stateCountyHousingFit = useMemo(() => stateCounties.map((county) => {
    const score = scoreFormats(county, dataset.counties, weights).find((candidate) => candidate.key === housingFitFormat);
    return { county, score: score?.score ?? null };
  }).sort((a, b) => {
    if (a.score == null && b.score == null) return a.county.name.localeCompare(b.county.name);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score || a.county.name.localeCompare(b.county.name);
  }), [stateCounties, weights, housingFitFormat]);
  const selectedCountyHousingFit = selectedCounty ? stateCountyHousingFit.find((entry) => entry.county.countyFips === selectedCounty.countyFips) : null;
  const selectedCountyHousingFitRank = selectedCountyHousingFit?.score == null ? null : stateCountyHousingFit.findIndex((entry) => entry.county.countyFips === selectedCounty?.countyFips) + 1;

  const comparedCounties = countyCompareFips
    .map((fips) => stateCounties.find((county) => county.countyFips === fips))
    .filter((county): county is County => Boolean(county));
  const comparedCountyScores = new Map(comparedCounties.map((county) => [county.countyFips, scoreFormats(county, dataset.counties, weights)]));
  const comparedCountyFit = new Map(comparedCounties.map((county) => [county.countyFips, comparedCountyScores.get(county.countyFips)?.[0]]));
  const comparedFormatCountyRanks = new Map(FORMAT_KEYS.map((formatKey) => {
    const ranked = comparedCounties
      .map((county) => ({ countyFips: county.countyFips, score: comparedCountyScores.get(county.countyFips)?.find((candidate) => candidate.key === formatKey)?.score }))
      .filter((entry): entry is { countyFips: string; score: number } => entry.score != null)
      .sort((a, b) => b.score - a.score || a.countyFips.localeCompare(b.countyFips));
    return [formatKey, new Map(ranked.map((entry, index) => [entry.countyFips, { rank: index + 1, total: ranked.length }]))];
  }));
  const comparedMetricEntries = comparedCounties
    .map((county) => ({ county, value: metricValue(county, layer) }))
    .filter((entry): entry is { county: County; value: number } => entry.value != null);
  const comparedMetricMedian = median(comparedMetricEntries.map((entry) => entry.value));
  const comparedMetricLow = [...comparedMetricEntries].sort((a, b) => a.value - b.value)[0] || null;
  const comparedMetricHigh = [...comparedMetricEntries].sort((a, b) => b.value - a.value)[0] || null;
  const comparedMetricSpread = comparedMetricLow && comparedMetricHigh ? comparedMetricHigh.value - comparedMetricLow.value : null;

  async function copyAtlasLink() {
    const url = new URL(window.location.href);
    writeAtlasShareParams(url.searchParams, {
      stateFips: selectedState.fips,
      countyFips: atlasShareCountyFips(atlasMode, selectedCounty?.countyFips),
      layer,
      countyCompareFips,
      countyRankDirection,
      housingFitFormat,
      weights,
    }, FACTOR_KEYS);
    url.hash = HASHES.atlas;
    const shareUrl = url.toString();
    setShareError("");
    let copied = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    } catch {
      const input = document.createElement("textarea");
      input.value = shareUrl;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      input.remove();
    }
    setShareCopied(copied);
    if (!copied) setShareError(shareUrl);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  function downloadCountyRanking() {
    const searchFilter = countyQuery.trim();
    const header = ["display_rank", "statewide_rank", "statewide_total", "rank_direction", "export_scope", "search_filter", "county", "state", "county_fips", "metric", "value"];
    const rows = countyMatches.map((county, index) => {
      const statewideRank = metricRank(county, stateCounties, layer, countyRankDirection);
      return [
        index + 1,
        statewideRank?.rank ?? "",
        statewideRank?.total ?? "",
        countyRankDirection,
        searchFilter ? "filtered_search" : "all_state_counties",
        searchFilter,
        county.name,
        selectedState.abbr,
        county.countyFips,
        option.label,
        metricValue(county, layer) ?? "",
      ];
    });
    downloadCsv(`formfactor-${selectedState.abbr.toLowerCase()}-${layer}-county-ranking.csv`, [header, ...rows]);
  }

  function downloadCountyMetricMatrix() {
    const header = ["county", "state", "county_fips", "metric", "metric_value", "rank_direction", "statewide_rank", "statewide_total", "state_median", "difference_from_state_median"];
    const rows = comparedCounties.flatMap((county) => LAYER_OPTIONS.map((metricOption) => {
      const metricLayer = metricOption.key;
      const rank = metricRank(county, stateCounties, metricLayer, countyRankDirection);
      const medianContext = metricDeltaFromMedian(county, stateCounties, metricLayer);
      return [
        county.name,
        selectedState.abbr,
        county.countyFips,
        metricOption.label,
        metricValue(county, metricLayer) ?? "",
        countyRankDirection,
        rank?.rank ?? "",
        rank?.total ?? "",
        medianContext?.benchmark ?? "",
        medianContext?.delta ?? "",
      ];
    }));
    downloadCsv(`formfactor-${selectedState.abbr.toLowerCase()}-pinned-county-all-metrics.csv`, [header, ...rows]);
  }

  function downloadCountyHousingFitMatrix() {
    const header = ["county", "state", "county_fips", "housing_format", "fit_score", "county_format_rank", "pinned_county_rank_for_format", "pinned_county_total", "weight_profile"];
    const weightProfile = FACTOR_KEYS.map((factor) => `${factor}:${weights[factor]}`).join("|");
    const rows = comparedCounties.flatMap((county) => {
      const scores = comparedCountyScores.get(county.countyFips) || [];
      return scores.map((score, index) => {
        const pinnedRank = comparedFormatCountyRanks.get(score.key)?.get(county.countyFips);
        return [
          county.name,
          selectedState.abbr,
          county.countyFips,
          score.name,
          score.score,
          index + 1,
          pinnedRank?.rank ?? "",
          pinnedRank?.total ?? "",
          weightProfile,
        ];
      });
    });
    downloadCsv(`formfactor-${selectedState.abbr.toLowerCase()}-pinned-county-housing-fit.csv`, [header, ...rows]);
  }

  function downloadCountyComparison() {
    const header = ["county", "state", "county_fips", "metric", "metric_value", "rank_direction", "state_median", "difference_from_state_median", "pinned_group_median", "difference_from_pinned_group_median", "statewide_rank", "population", "median_income", "median_rent", "vacancy_rate", "top_housing_fit", "fit_score"];
    const rows = comparedCounties.map((county) => {
      const rank = metricRank(county, stateCounties, layer, countyRankDirection);
      const fit = comparedCountyFit.get(county.countyFips);
      const medianContext = metricDeltaFromMedian(county, stateCounties, layer);
      const currentMetricValue = metricValue(county, layer);
      const pinnedMedianDelta = currentMetricValue != null && comparedMetricMedian != null ? currentMetricValue - comparedMetricMedian : null;
      return [
        county.name,
        selectedState.abbr,
        county.countyFips,
        option.label,
        currentMetricValue ?? "",
        countyRankDirection,
        medianContext?.benchmark ?? "",
        medianContext?.delta ?? "",
        comparedMetricMedian ?? "",
        pinnedMedianDelta ?? "",
        rank?.rank ?? "",
        county.population ?? "",
        county.medianIncome ?? "",
        county.medianRent ?? "",
        county.vacancyRate ?? "",
        fit?.name ?? "",
        fit?.score ?? "",
      ];
    });
    downloadCsv(`formfactor-${selectedState.abbr.toLowerCase()}-pinned-county-comparison.csv`, [header, ...rows]);
  }

  return (
    <div className="page surface-page">
      <PageIntro eyebrow="Nationwide community atlas" title={<>Housing pressure, growth, and<br />form across the U.S.</>} description="Select a layer, inspect any state, then enter its county map. Every color is tied to a reported or transparently calculated local metric.">
        <button className="button soft" onClick={() => navigate("explorer")}>Browse communities <ArrowRight /></button>
      </PageIntro>
      <DataNotice><strong>Bundled Census estimates.</strong> Values are ACS five-year estimates, not live market observations. Growth compares 2015–2019 with 2020–2024 five-year vintages.</DataNotice>
      <div className="atlas-grid">
        <section className="panel map-panel">
          <div className="panel-heading map-heading">
            <div>{atlasMode === "counties" && <button className="atlas-back" onClick={() => { setAtlasMode("states"); setLastStateClick(null); }}><ArrowLeft /> Back to U.S.</button>}<p className="eyebrow">{atlasMode === "counties" ? `${selectedState.name} counties` : "Map layer"}</p><h2>{option.label}</h2></div>
            <div className="atlas-controls">
              <div className="select-wrap compact-select state-select"><select value={selectedState.fips} onChange={(event) => changeState(event.target.value)} aria-label="Select state">{stateOptions.map((state) => <option key={state.fips} value={state.fips}>{state.name}</option>)}</select><ChevronDown /></div>
              <div className="select-wrap compact-select"><select value={layer} onChange={(event) => setLayer(event.target.value as MapLayer)} aria-label="Map layer">{LAYER_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><ChevronDown /></div>
              {<button className="icon-text-button atlas-share-button" onClick={copyAtlasLink} title="Copy a link that restores this state, county, layer, ranking direction, pinned comparison, and current model weights"><Link2 /> {shareCopied ? "Copied" : "Copy view link"}</button>}
            </div>
          </div>
          {shareError && <p className="source-line" role="status">Clipboard unavailable. Select and copy this link: <input aria-label="Shareable Atlas link" readOnly value={shareError} onFocus={(event) => event.target.select()} /></p>}
          {atlasMode === "states" && <p className="map-instruction">Select a state, then select it again to open its counties.</p>}
          <div className={`us-map-wrap ${atlasMode === "counties" ? "county-map-wrap" : ""}`}>
            <svg className={`us-map ${atlasMode === "counties" ? "county-map" : ""}`} viewBox={viewBox} role="group" aria-label={`${atlasMode === "counties" ? selectedState.name + " county" : "United States"} map shaded by ${option.label}`}>
              {atlasMode === "states" ? statesGeo.features.map((mapFeature) => {
                const fips = String(mapFeature.id).padStart(2, "0");
                const state = dataset.states.find((candidate) => candidate.fips === fips);
                if (!state) return null;
                const active = fips === selectedState.fips;
                return <path key={fips} d={path(mapFeature as unknown as GeoPermissibleObjects) || undefined} fill={colorFor(metricValue(state, layer), values)} className={active ? "selected" : ""} onClick={() => activateState(fips)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateState(fips); } }} tabIndex={0} role="button" aria-label={`${state.name}: ${metricFormat(layer, metricValue(state, layer))}. Select twice to view counties.`}><title>{`${state.name}: ${metricFormat(layer, metricValue(state, layer))}`}</title></path>;
              }) : <>
                {stateCountyFeatures.map((mapFeature) => {
                  const fips = String(mapFeature.id).padStart(5, "0"); const county = countyByFips.get(fips); if (!county) return null;
                  const active = fips === selectedCounty?.countyFips;
                  const pinned = countyCompareFips.includes(fips);
                  return <path key={fips} d={path(mapFeature as unknown as GeoPermissibleObjects) || undefined} fill={colorFor(metricValue(county, layer), values)} className={`county-shape ${active ? "selected" : ""} ${pinned ? "pinned" : ""}`} onClick={() => activateCounty(county)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateCounty(county); } }} tabIndex={0} role="button" aria-label={`${county.name}: ${metricFormat(layer, metricValue(county, layer))}${pinned ? ". Pinned for comparison." : ""}`}><title>{`${county.name}: ${metricFormat(layer, metricValue(county, layer))}${pinned ? " · Pinned" : ""}`}</title></path>;
                })}
                {stateFeature && <path className="state-outline" d={path(stateFeature as unknown as GeoPermissibleObjects) || undefined} aria-hidden="true" />}
              </>}
            </svg>
          </div>
          <div className="map-legend"><span>{metricFormat(layer, values.length ? Math.min(...values) : null)}</span><i /><span>{metricFormat(layer, values.length ? Math.max(...values) : null)}</span></div>
          <p className="source-line">Equal color steps show percentile groups among records with data. Pale gray means unavailable. {atlasMode === "counties" ? `Colors compare counties within ${selectedState.name}. ` : ""}Source: U.S. Census Bureau ACS 2020–2024 5-year estimates; FormFactor calculation where noted.</p>
        </section>
        {atlasMode === "states" ? <aside className="panel state-panel">
          <div className="state-heading"><span>{selectedState.abbr}</span><div><p className="eyebrow">Selected state</p><h2>{selectedState.name}</h2></div></div>
          <div className="featured-metric"><span>{option.label}</span><strong>{metricFormat(layer, metricValue(selectedState, layer))}</strong><small>{layer === "populationGrowth" ? "Census ACS 2015–2019 → 2020–2024 · 5-year" : "Census ACS 2020–2024 · 5-year"}</small></div>
          <div className="state-mini-grid"><MetricMini label="Population" value={compact(selectedState.population)} /><MetricMini label="Median income" value={money(selectedState.medianIncome)} /><MetricMini label="Median rent" value={money(selectedState.medianRent)} /><MetricMini label="Vacancy" value={percent(selectedState.vacancyRate)} /></div>
          <button className="button soft full county-entry" onClick={() => enterCounties()}>Explore {stateCounties.length} counties <ArrowRight /></button>
          <div className="state-metros-head"><h3>Metro areas</h3><span>{stateMetros.length}</span></div>
          <div className="state-metro-list">{stateMetros.slice(0, 6).map((metro) => <button key={metro.cbsa} onClick={() => chooseMetro(metro.cbsa, "profile")}><span>{cleanMetroName(metro.name)}</span><strong>{compact(metro.population)} <ArrowRight /></strong></button>)}</div>
          {stateMetros.length > 6 && <button className="text-link bottom-link" onClick={() => navigate("explorer")}>Browse all {selectedState.abbr} communities <ArrowRight /></button>}
        </aside> : selectedCounty && <aside className="panel state-panel county-panel">
          <div className="state-heading"><span>{selectedState.abbr}</span><div><p className="eyebrow">Selected county</p><h2>{selectedCounty.name}</h2></div></div>
          <div className="featured-metric"><span>{option.label}</span><strong>{metricFormat(layer, metricValue(selectedCounty, layer))}</strong><small>{layer === "populationGrowth" ? "Census ACS 2015–2019 → 2020–2024 · 5-year" : "Census ACS 2020–2024 · 5-year"}</small>{countyRank && <div className="county-rank-chip">#{countyRank.rank} of {countyRank.total} {selectedState.abbr} counties, {countyRankDirection === "highest" ? "highest" : "lowest"} {option.label.toLowerCase()}</div>}{countyMedianContext && <div className={`county-median-context ${countyMedianContext.delta > 0 ? "above" : countyMedianContext.delta < 0 ? "below" : "equal"}`}><span>State median {metricFormat(layer, countyMedianContext.benchmark)}</span><strong>{countyMedianContext.delta === 0 ? "At state median" : `${metricDeltaFormat(layer, countyMedianContext.delta)} ${countyMedianContext.delta > 0 ? "above" : "below"}`}</strong></div>}</div>
          <div className="county-fit-rank-card"><div className="county-fit-rank-head"><div><span>Statewide housing-fit rank</span><strong>{FORMAT_INFO[housingFitFormat].name}</strong></div><div className="select-wrap compact-select"><select value={housingFitFormat} onChange={(event) => setHousingFitFormat(event.target.value as FormatKey)} aria-label="Housing format for statewide county fit ranking">{FORMAT_KEYS.map((formatKey) => <option key={formatKey} value={formatKey}>{FORMAT_INFO[formatKey].name}</option>)}</select><ChevronDown /></div></div>{selectedCountyHousingFit?.score != null && selectedCountyHousingFitRank ? <div className="county-fit-rank-result"><strong>#{selectedCountyHousingFitRank} of {stateCountyHousingFit.filter((entry) => entry.score != null).length}</strong><span>{selectedCountyHousingFit.score.toFixed(1)} / 100 fit score</span></div> : <p>Fit rank unavailable for this county.</p>}<small>Derived from the existing FormFactor model using your current nine-factor weights; not a reported public statistic.</small></div>
          <div className="state-mini-grid"><MetricMini label="Population" value={compact(selectedCounty.population)} /><MetricMini label="Median income" value={money(selectedCounty.medianIncome)} /><MetricMini label="Median rent" value={money(selectedCounty.medianRent)} /><MetricMini label="Vacancy" value={percent(selectedCounty.vacancyRate)} /></div>
          <div className="county-primary-actions"><button className="button primary ink-primary full county-entry" onClick={() => chooseCounty(selectedCounty.countyFips, "profile")}>Open county profile <ArrowRight /></button><button className={`button soft county-pin-button ${countyCompareFips.includes(selectedCounty.countyFips) ? "active" : ""}`} onClick={() => toggleCountyCompare(selectedCounty.countyFips)} aria-pressed={countyCompareFips.includes(selectedCounty.countyFips)}>{countyCompareFips.includes(selectedCounty.countyFips) ? <BookmarkCheck /> : <Bookmark />} {countyCompareFips.includes(selectedCounty.countyFips) ? "Pinned" : "Pin county"}</button></div>
          <p className="county-pin-status">{countyCompareFips.length}/3 comparison slots used. Pins persist when you select another county or return to the Atlas.</p>
          <label className="county-search"><span>Find a county in {selectedState.abbr}</span><div><Search /><input value={countyQuery} onChange={(event) => { setCountyQuery(event.target.value); setCountyVisible(7); }} placeholder="Type a county" /></div></label>
          <div className="state-metros-head county-results-head"><h3>{countyQuery.trim() ? "Matching counties" : `Counties by ${option.label.toLowerCase()}`}</h3><div><span>{countyMatches.length}</span><div className="county-rank-direction" role="group" aria-label="County ranking direction"><button className={countyRankDirection === "highest" ? "active" : ""} onClick={() => { setCountyRankDirection("highest"); setCountyVisible(7); }} aria-pressed={countyRankDirection === "highest"}>Highest</button><button className={countyRankDirection === "lowest" ? "active" : ""} onClick={() => { setCountyRankDirection("lowest"); setCountyVisible(7); }} aria-pressed={countyRankDirection === "lowest"}>Lowest</button></div><button className="icon-text-button" onClick={downloadCountyRanking} title="Download current county ranking as CSV"><Download /> CSV</button></div></div>
          <div className="state-metro-list county-ranked-list">{countyMatches.slice(0, countyVisible).map((county) => {
            const comparing = countyCompareFips.includes(county.countyFips);
            return <div className={`county-ranked-row ${county.countyFips === selectedCounty.countyFips ? "active" : ""} ${comparing ? "pinned" : ""}`} key={county.countyFips}>
              <button className="county-ranked-main" onClick={() => activateCounty(county)}><span>{county.name.replace(`, ${selectedState.name}`, "")}{comparing && <small className="county-pinned-label"><BookmarkCheck /> Pinned</small>}</span><strong>{metricFormat(layer, metricValue(county, layer))} <ArrowRight /></strong></button>
              <button className={`county-compare-toggle ${comparing ? "active" : ""}`} onClick={() => toggleCountyCompare(county.countyFips)} aria-pressed={comparing} title={comparing ? "Remove from county comparison" : "Add to county comparison"}><Bookmark /></button>
            </div>;
          })}</div>
          {countyMatches.length === 0 && <p className="county-no-results">No counties match that search.</p>}
          {countyMatches.length > 7 && <button className="county-show-more" onClick={() => setCountyVisible((current) => current >= countyMatches.length ? 7 : Math.min(current + 20, countyMatches.length))}>{countyVisible >= countyMatches.length ? "Show top 7" : `Show more (${Math.min(countyVisible, countyMatches.length)} of ${countyMatches.length})`}</button>}
          <button className="text-link bottom-link" onClick={() => navigate("explorer")}>Search all {selectedState.abbr} counties <ArrowRight /></button>
        </aside>}
      </div>
      {atlasMode === "counties" && comparedCounties.length > 0 && <section className="panel county-compare-panel">
        <div className="panel-heading county-compare-heading"><div><p className="eyebrow">Pinned county comparison</p><h2>Compare up to three counties</h2><p>Keep candidates visible while you search or change the active map metric. Housing fit uses your current nine-factor slider weights.</p></div><div className="county-compare-actions"><button className="icon-text-button" onClick={downloadCountyComparison} title="Download active-metric county comparison as CSV"><Download /> Active metric</button><button className="icon-text-button" onClick={downloadCountyMetricMatrix} title="Download all six Atlas metrics for pinned counties as CSV"><Download /> All metrics</button><button className="icon-text-button" onClick={downloadCountyHousingFitMatrix} title="Download all five housing-fit scores for pinned counties as CSV"><Download /> Housing fit</button><button className="icon-text-button" onClick={() => setCountyCompareFips([])}><X /> Clear</button></div></div>
        {comparedMetricEntries.length > 0 && <div className="county-compare-summary" aria-label={`Pinned county ${option.label.toLowerCase()} summary`}>
          <article><span>Lowest pinned</span><strong>{comparedMetricLow ? metricFormat(layer, comparedMetricLow.value) : "Not available"}</strong><small>{comparedMetricLow?.county.name.replace(`, ${selectedState.name}`, "") || "—"}</small></article>
          <article><span>Pinned median</span><strong>{comparedMetricMedian == null ? "Not available" : metricFormat(layer, comparedMetricMedian)}</strong><small>{comparedMetricEntries.length} county{comparedMetricEntries.length === 1 ? "" : "ies"}</small></article>
          <article><span>Highest pinned</span><strong>{comparedMetricHigh ? metricFormat(layer, comparedMetricHigh.value) : "Not available"}</strong><small>{comparedMetricHigh?.county.name.replace(`, ${selectedState.name}`, "") || "—"}</small></article>
          <article><span>Pinned range</span><strong>{comparedMetricSpread == null ? "Not available" : metricDeltaFormat(layer, comparedMetricSpread)}</strong><small>High minus low</small></article>
        </div>}
        <div className="county-metric-matrix-wrap">
          <div className="county-metric-matrix-heading"><div><p className="eyebrow">All-metric snapshot</p><h3>Statewide position across all six Atlas layers</h3></div><small>Each cell shows the reported/calculated value and the county's {countyRankDirection}-first rank within {selectedState.name} for that metric.</small></div>
          <div className="county-metric-matrix-scroll"><table><thead><tr><th>Metric</th>{comparedCounties.map((county) => <th key={county.countyFips}>{county.name.replace(`, ${selectedState.name}`, "")}</th>)}</tr></thead><tbody>{LAYER_OPTIONS.map((metricOption) => <tr key={metricOption.key}><td><strong>{metricOption.label}</strong></td>{comparedCounties.map((county) => {
            const rank = metricRank(county, stateCounties, metricOption.key, countyRankDirection);
            const value = metricValue(county, metricOption.key);
            return <td key={county.countyFips}><strong>{metricFormat(metricOption.key, value)}</strong><small>{rank ? `#${rank.rank} of ${rank.total} statewide` : "Rank unavailable"}</small></td>;
          })}</tr>)}</tbody></table></div>
        </div>
        <div className="county-fit-matrix-wrap">
          <div className="county-metric-matrix-heading"><div><p className="eyebrow">Housing-fit snapshot</p><h3>Five-format scorecard under your current weights</h3></div><small>Each cell shows both the format's rank within that county and the county's rank among your pinned shortlist for that format.</small></div>
          <div className="county-fit-matrix-scroll"><table><thead><tr><th>Housing format</th>{comparedCounties.map((county) => <th key={county.countyFips}>{county.name.replace(`, ${selectedState.name}`, "")}</th>)}</tr></thead><tbody>{FORMAT_KEYS.map((formatKey) => <tr key={formatKey}><td><strong>{FORMAT_INFO[formatKey].name}</strong></td>{comparedCounties.map((county) => {
            const scores = comparedCountyScores.get(county.countyFips) || [];
            const scoreIndex = scores.findIndex((score) => score.key === formatKey);
            const score = scoreIndex >= 0 ? scores[scoreIndex] : null;
            const pinnedRank = comparedFormatCountyRanks.get(formatKey)?.get(county.countyFips);
            const classes = [scoreIndex === 0 ? "top-fit-cell" : "", pinnedRank?.rank === 1 && (pinnedRank.total || 0) > 1 ? "top-pinned-county-cell" : ""].filter(Boolean).join(" ");
            return <td className={classes} key={county.countyFips}><strong>{score ? `${score.score.toFixed(1)} / 100` : "Not available"}</strong><small>{score ? `#${scoreIndex + 1} of ${FORMAT_KEYS.length} formats in county` : "Format rank unavailable"}</small><small>{pinnedRank ? `#${pinnedRank.rank} of ${pinnedRank.total} pinned counties for format` : "Pinned rank unavailable"}</small></td>;
          })}</tr>)}</tbody></table></div>
        </div>
        <div className="county-compare-scroll"><table><thead><tr><th>County</th><th>{option.label}</th><th>Vs. state median</th><th>Vs. pinned median</th><th>Top housing fit</th><th>Population</th><th>Median income</th><th>Median rent</th><th>Vacancy</th><th></th></tr></thead><tbody>{comparedCounties.map((county) => {
          const rank = metricRank(county, stateCounties, layer, countyRankDirection);
          const fit = comparedCountyFit.get(county.countyFips);
          const medianContext = metricDeltaFromMedian(county, stateCounties, layer);
          const currentMetricValue = metricValue(county, layer);
          const pinnedMedianDelta = currentMetricValue != null && comparedMetricMedian != null ? currentMetricValue - comparedMetricMedian : null;
          return <tr className={county.countyFips === selectedCounty?.countyFips ? "selected-comparison-row" : ""} key={county.countyFips}><td><strong>{county.name.replace(`, ${selectedState.name}`, "")}</strong><small>{rank ? `#${rank.rank} of ${rank.total} statewide (${countyRankDirection})` : "Rank unavailable"}</small></td><td><strong>{metricFormat(layer, currentMetricValue)}</strong></td><td>{medianContext ? <><strong>{medianContext.delta === 0 ? "At median" : `${metricDeltaFormat(layer, medianContext.delta)} ${medianContext.delta > 0 ? "above" : "below"}`}</strong><small>Median {metricFormat(layer, medianContext.benchmark)}</small></> : "Not available"}</td><td>{pinnedMedianDelta == null ? "Not available" : <><strong>{pinnedMedianDelta === 0 ? "At pinned median" : `${metricDeltaFormat(layer, pinnedMedianDelta)} ${pinnedMedianDelta > 0 ? "above" : "below"}`}</strong><small>Pinned median {metricFormat(layer, comparedMetricMedian)}</small></>}</td><td>{fit ? <><strong>{fit.name}</strong><small>{fit.score.toFixed(1)} / 100</small></> : "Not available"}</td><td>{compact(county.population)}</td><td>{money(county.medianIncome)}</td><td>{money(county.medianRent)}</td><td>{percent(county.vacancyRate)}</td><td><button className="county-table-action" onClick={() => activateCounty(county)} title={`Select ${county.name}`}><MapPin /></button></td></tr>;
        })}</tbody></table></div>
      </section>}
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ExplorerPage({ selectedGeography, selectedKind, chooseGeography }: { selectedGeography: AnalysisGeography; selectedKind: GeographyKind; chooseGeography: (kind: GeographyKind, id: string, view?: ViewKey) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<GeographyKind>(selectedKind);
  const currentState = dataset.states.find((state) => state.abbr === geographyState(selectedGeography));
  const [stateFips, setStateFips] = useState(currentState?.fips || "all");
  const [sort, setSort] = useState<SortKey>("population");
  const [visible, setVisible] = useState(30);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const records: AnalysisGeography[] = kind === "county" ? dataset.counties : dataset.metros;
    const state = dataset.states.find((item) => item.fips === stateFips);
    const results = records.filter((record) => {
      const stateMatch = !state || ("countyFips" in record ? record.stateFips === state.fips : record.states.includes(state.abbr));
      const searchText = `${geographyName(record)} ${"countyFips" in record ? record.stateAbbr : record.states.join(" ")}`.toLowerCase();
      return stateMatch && (!term || searchText.includes(term));
    });
    return results.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (Number(b[sort] ?? -Infinity) - Number(a[sort] ?? -Infinity)));
  }, [query, kind, stateFips, sort]);

  return (
    <div className="page surface-page explorer-page">
      <PageIntro eyebrow="Community explorer" title={<>Find a metro or county.<br />Read its conditions.</>} description="Choose a geography, narrow to a state, or type a community name before opening its sourced housing profile." />
      <section className="filter-bar geography-filter-bar panel">
        <div className="filter-kind"><span>Geography</span><div className="kind-toggle" role="group" aria-label="Community type"><button className={kind === "metro" ? "active" : ""} aria-pressed={kind === "metro"} onClick={() => { setKind("metro"); setVisible(30); }}>Metro</button><button className={kind === "county" ? "active" : ""} aria-pressed={kind === "county"} onClick={() => { setKind("county"); setVisible(30); }}>County</button></div></div>
        <label className="search-field"><span>Search communities</span><div><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(30); }} placeholder={kind === "county" ? "Type a county name" : "Type a city or metro"} /></div></label>
        <label><span>State</span><div className="select-wrap"><select value={stateFips} onChange={(event) => { setStateFips(event.target.value); setVisible(30); }}><option value="all">All states</option>{dataset.states.map((state) => <option key={state.fips} value={state.fips}>{state.name}</option>)}</select><ChevronDown /></div></label>
        <label><span>Sort by</span><div className="select-wrap"><select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setVisible(30); }}><option value="population">Largest population</option><option value="populationGrowth">Fastest population growth</option><option value="medianRent">Highest median rent</option><option value="density">Highest density</option><option value="name">Alphabetical</option></select><ChevronDown /></div></label>
      </section>
      <div className="result-summary"><span><strong>{filtered.length}</strong> {kind === "county" ? "counties" : "metros"} match</span><small>All values use the local prototype dataset.</small></div>
      {filtered.length ? <div className="community-grid">{filtered.slice(0, visible).map((record) => <CommunityCard key={`${kind}-${geographyId(record)}`} geography={record} active={kind === selectedKind && geographyId(record) === geographyId(selectedGeography)} chooseGeography={chooseGeography} />)}</div> : <section className="empty-state panel"><Search /><h2>No communities match</h2><p>Try a broader place name or clear the state filter.</p><button className="button soft" onClick={() => { setQuery(""); setStateFips("all"); }}>Clear filters</button></section>}
      {visible < filtered.length && <button className="button soft load-more" onClick={() => setVisible((count) => count + 30)}>Show more communities</button>}
    </div>
  );
}

function CommunityCard({ geography, active, chooseGeography }: { geography: AnalysisGeography; active: boolean; chooseGeography: (kind: GeographyKind, id: string, view?: ViewKey) => void }) {
  const kind = geographyKindOf(geography);
  return (
    <article className={`community-card panel ${active ? "active" : ""}`}>
      <div className="community-card-top"><span className="region-chip">{"countyFips" in geography ? `${geography.stateAbbr} county` : `${geography.region} metro`}</span>{active && <span className="active-chip"><CheckCircle2 /> Active</span>}</div>
      <h2>{geographyName(geography)}</h2>
      <div className="community-metrics"><MetricMini label="Population" value={compact(geography.population)} /><MetricMini label="Growth" value={percent(geography.populationGrowth)} /><MetricMini label="Median rent" value={money(geography.medianRent)} /><MetricMini label="Density" value={`${numeral(geography.density, 0)} / sq. mi.`} /></div>
      <button className="card-action" onClick={() => chooseGeography(kind, geographyId(geography), "profile")}>Open community profile <ArrowRight /></button>
    </article>
  );
}

const profileMetrics: Array<{ label: string; key: keyof GeographyRecord; format: (value: number | null) => string; note: string; icon: typeof Home }> = [
  { label: "Population", key: "population", format: compact, note: "Census ACS · Reported · 2020–2024", icon: Users },
  { label: "Population growth", key: "populationGrowth", format: percent, note: "Census ACS · Calculated · two vintages", icon: TrendingUp },
  { label: "Median household income", key: "medianIncome", format: money, note: "Census ACS · Reported · 2024 dollars", icon: Briefcase },
  { label: "Median gross rent", key: "medianRent", format: money, note: "Census ACS · Reported · monthly", icon: CircleDollarSign },
  { label: "Median home value", key: "medianHomeValue", format: money, note: "Census ACS · Reported · owner occupied", icon: House },
  { label: "Housing vacancy", key: "vacancyRate", format: percent, note: "Census ACS · Calculated · all units", icon: Building2 },
  { label: "Household size", key: "avgHouseholdSize", format: (value) => `${numeral(value, 2)} people`, note: "Census ACS · Reported · occupied units", icon: Users },
  { label: "Employed residents", key: "employedResidents", format: compact, note: "Census ACS · Reported · civilian age 16+", icon: Briefcase },
  { label: "Employed-resident growth", key: "employmentGrowth", format: percent, note: "Census ACS · Calculated · two vintages", icon: TrendingUp },
  { label: "Population density", key: "density", format: (value) => `${numeral(value, 0)} / sq. mi.`, note: "Census ACS + Gazetteer · Calculated", icon: Layers3 },
  { label: "Housing units", key: "housingUnits", format: compact, note: "Census ACS · Reported · 2020–2024", icon: Building2 },
  { label: "Housing-unit growth", key: "housingGrowth", format: percent, note: "Census ACS · Calculated · two vintages", icon: TrendingUp },
  { label: "Transit commute share", key: "transitShare", format: percent, note: "Census ACS · Calculated · workers", icon: TrainFront },
  { label: "Drive-alone share", key: "driveAloneShare", format: percent, note: "Census ACS · Calculated · workers", icon: Gauge },
  { label: "Work-from-home share", key: "workFromHomeShare", format: percent, note: "Census ACS · Calculated · workers", icon: Home },
  { label: "Mean commute", key: "meanCommuteMinutes", format: (value) => `${numeral(value, 1)} min`, note: "Census ACS · Calculated · non-home workers", icon: TrainFront },
  { label: "Renter share", key: "renterShare", format: percent, note: "Census ACS · Calculated · occupied units", icon: House },
  { label: "Recent construction", key: "recentConstructionShare", format: percent, note: "Census ACS · Built 2020 or later", icon: Building2 },
];

function ProfilePage({ geography, scores, navigate }: { geography: AnalysisGeography; scores: ReturnType<typeof scoreFormats>; navigate: (view: ViewKey) => void }) {
  const kind = geographyKindOf(geography);
  const trendData = [
    { period: "2015–2019", Population: geography.populationBaseline, "Employed residents": geography.employedBaseline, "Housing units": geography.housingBaseline },
    { period: "2020–2024", Population: geography.population, "Employed residents": geography.employedResidents, "Housing units": geography.housingUnits },
  ];
  const mixData = [
    { name: "Detached", value: geography.detachedShare, color: FORMAT_INFO.detached.color },
    { name: "Attached", value: geography.attachedShare, color: FORMAT_INFO.townhomes.color },
    { name: "Multifamily", value: geography.multifamilyShare, color: FORMAT_INFO.apartments.color },
  ];
  return (
    <div className="page surface-page profile-page">
      <PageIntro eyebrow={"cbsa" in geography ? `${geography.region} · CBSA ${geography.cbsa}` : `${geography.stateAbbr} · County FIPS ${geography.countyFips}`} title={geographyName(geography)} description={`A ${kind}-wide snapshot of affordability, growth, household structure, transportation, and the existing housing mix.`}>
        <button className="button primary ink-primary" onClick={() => navigate("compare")}>Compare housing types <ArrowRight /></button>
      </PageIntro>
      <DataNotice>Every value below is either a reported ACS estimate or a calculation identified beside the metric. {kind === "county" ? "County" : "Metro"} averages do not describe individual neighborhoods.</DataNotice>
      <section className="metric-grid">{profileMetrics.map(({ label, key, format, note, icon: Icon }) => <article className="metric-card" key={key}><div><Icon /><span>{label}</span></div><strong>{geography[key] == null ? "Not available" : format(geography[key] as number)}</strong><small>{note}</small></article>)}</section>
      <div className="profile-chart-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">Change over time</p><h2>Growth context</h2></div><span className="model-chip">ACS vintages</span></div>
          <div className="chart-frame tall-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 12, right: 18, bottom: 4, left: 2 }}><CartesianGrid stroke="#e4e2d9" vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => compact(value)} tick={{ fontSize: 10 }} width={58} /><Tooltip formatter={(value) => compact(Number(value))} /><Legend /><Line type="monotone" dataKey="Population" stroke="#173f45" strokeWidth={3} dot={{ r: 4 }} /><Line type="monotone" dataKey="Employed residents" stroke="#3d927b" strokeWidth={2} dot={{ r: 4 }} /><Line type="monotone" dataKey="Housing units" stroke="#506e9e" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div>
          <p className="source-line">Two non-overlapping ACS 5-year vintages; lines connect the endpoints only. Geography identifiers are matched, but boundaries are not held constant. No statistical significance test is applied.</p>
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">Existing stock</p><h2>Housing structure mix</h2></div><span className="model-chip">Calculated shares · 2020–2024</span></div>
          <div className="mix-bars">{mixData.map((item) => <div key={item.name}><div><span><i style={{ background: item.color }} />{item.name}</span><strong>{percent(item.value)}</strong></div><div className="bar-track"><span style={{ width: `${Math.min(100, item.value ?? 0)}%`, background: item.color }} /></div></div>)}</div>
          <p className="source-line">Detached, attached, and 2+ unit structures. Categories shown are not intended to sum to exactly 100% because mobile and other structures are omitted.</p>
        </section>
      </div>
      <section className="panel profile-fit">
        <div><p className="eyebrow">Comparative model result</p><h2>Housing-format fit</h2><p>The ranking is a screening result built from the visible current model weights. It is not a prescribed development mix.</p></div>
        <div className="compact-ranking">{scores.map((item, index) => <div key={item.key}><span>{index + 1}</span><i style={{ background: item.color }} /><strong>{item.name}</strong><b>{item.score.toFixed(1)}</b></div>)}</div>
        <button className="button dark" onClick={() => navigate("compare")}>Inspect and adjust model <ArrowRight /></button>
      </section>
    </div>
  );
}

function ComparePage({ geography, peers, weights, setWeights, scores, saved, saveComparison, loadComparison, navigate }: { geography: AnalysisGeography; peers: GeographyRecord[]; weights: Weights; setWeights: React.Dispatch<React.SetStateAction<Weights>>; scores: ReturnType<typeof scoreFormats>; saved: SavedComparison[]; saveComparison: () => void; loadComparison: (item: SavedComparison) => void; navigate: (view: ViewKey) => void }) {
  const [openMethod, setOpenMethod] = useState(false);
  const signals = useMemo(() => communitySignals(geography, peers), [geography, peers]);
  const chartScores = scores.map((item) => ({ name: item.short, score: item.score, color: item.color }));
  const radar = FACTOR_KEYS.slice(0, 6).map((factor) => ({ factor: FACTOR_LABELS[factor].replace("Transportation", "Transit"), ...Object.fromEntries(scores.slice(0, 3).map((item) => [item.short, Number(item.factors[factor].toFixed(1))])) }));
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const isSaved = saved.some((item) => `${item.geographyKind || "metro"}:${item.geographyId || item.cbsa}` === `${geographyKindOf(geography)}:${geographyId(geography)}`);
  return (
    <div className="page surface-page compare-page">
      <PageIntro eyebrow="Housing-format comparison" title={<>Five forms.<br />One transparent model.</>} description={`Compare how each format aligns with ${geographyName(geography)}. The scores are relative screening results among ${geographyKindOf(geography)} peers, not feasibility findings.`}>
        <button className="button soft" onClick={() => navigate("methodology")}>Read methodology <ArrowRight /></button>
      </PageIntro>
      <DataNotice warm><strong>Model assumptions.</strong> Qualitative format ratings and factor weights are explicit judgments. They are not reported Census facts or professional recommendations.</DataNotice>
      <div className="compare-chart-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">Comparative result</p><h2>Housing-format scores</h2></div><span className="model-chip">0–100 model scale</span></div>
          <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartScores} layout="vertical" margin={{ top: 8, right: 18, left: 24, bottom: 5 }}><CartesianGrid stroke="#e5e3da" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={92} /><Tooltip formatter={(value) => `${Number(value).toFixed(1)} / 100`} /><Bar dataKey="score" radius={[0, 3, 3, 0]}>{chartScores.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Bar></BarChart></ResponsiveContainer></div>
        </section>
        <section className="panel chart-panel radar-panel">
          <div className="panel-heading"><div><p className="eyebrow">Top three</p><h2>Factor alignment</h2></div><span className="model-chip">Fit by factor</span></div>
          <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar} outerRadius="72%"><PolarGrid stroke="#d9ddd7" /><PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: "#617471" }} />{scores.slice(0, 3).map((item) => <Radar key={item.key} name={item.short} dataKey={item.short} stroke={item.color} fill={item.color} fillOpacity={0.08} strokeWidth={2} />)}<Legend iconType="square" wrapperStyle={{ fontSize: 10 }} /><Tooltip /></RadarChart></ResponsiveContainer></div>
        </section>
      </div>
      <section className="panel model-controls">
        <div className="model-controls-head"><div><p className="eyebrow">Your priorities</p><h2>Adjust the model</h2><p>Raw slider points are normalized to 100% in the calculation. Current total: <strong>{total}</strong>. At least one factor must remain above zero.</p></div><div className="control-actions"><button className="text-link" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}><RotateCcw /> Reset</button><button className="button soft save-button" onClick={saveComparison}>{isSaved ? <BookmarkCheck /> : <Bookmark />} {isSaved ? "Update saved" : "Save comparison"}</button></div></div>
        <div className="slider-grid">{FACTOR_KEYS.map((factor) => <label className="slider-row" key={factor}><span><strong>{FACTOR_LABELS[factor]}</strong><b>{weights[factor]}</b></span><input type="range" min="0" max="30" step="1" value={weights[factor]} onChange={(event) => { const nextValue = Number(event.target.value); setWeights((current) => updateWeightPreservingPositiveTotal(current, factor, nextValue)); }} aria-label={`${FACTOR_LABELS[factor]} weight`} /></label>)}</div>
      </section>
      <section className={`method-disclosure ${openMethod ? "open" : ""}`}><button onClick={() => setOpenMethod(!openMethod)} aria-expanded={openMethod}><span><Info /> How this score works</span><ChevronDown /></button>{openMethod && <div><ModelFormulaNotes /><div className="signal-grid">{FACTOR_KEYS.map((factor) => <div key={factor}><span>{FACTOR_LABELS[factor]}</span><strong>{Math.round(signals[factor])}<small>/100 local signal</small></strong><p>{FACTOR_METHODS[factor].interpretation}</p></div>)}</div></div>}</section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">Qualitative comparison</p><h2>Format characteristics</h2></div><span className="model-chip warm-chip">Model assumption</span></div>
        <div className="table-scroll"><table><thead><tr><th>Format</th><th>Typical density</th><th>Cost category</th><th>Privacy</th><th>Transit fit</th><th>Household flexibility</th></tr></thead><tbody>{FORMAT_KEYS.map((key) => { const info = FORMAT_INFO[key]; return <tr key={key}><td><i style={{ background: info.color }} /> <strong>{info.name}</strong></td><td>{info.density}</td><td>{info.cost}</td><td>{info.privacy}</td><td>{info.transit}</td><td>{info.households}</td></tr>; })}</tbody></table></div>
      </section>
      <section className="format-card-grid">{scores.map((item) => <article className="format-card panel" key={item.key}><div className="format-card-head"><i style={{ background: item.color }} /><div><span>{item.score.toFixed(1)} comparative fit</span><h2>{item.name}</h2></div></div><p>{whyPrioritized(item.key, signals)}</p><dl><div><dt>Advantage</dt><dd>{item.advantage}</dd></div><div><dt>Limitation</dt><dd>{item.limitation}</dd></div><div><dt>Best fit</dt><dd>{item.bestFit}</dd></div><div><dt>Common amenities</dt><dd>{item.amenities}</dd></div></dl></article>)}</section>
      {saved.length > 0 && <section className="saved-comparisons"><div className="section-heading"><div><p className="eyebrow">Saved locally</p><h2>Recent comparisons</h2></div><span>{saved.length} saved</span></div><div className="saved-grid">{saved.map((item) => <button key={item.id} onClick={() => loadComparison(item)}><BookmarkCheck /><span><strong>{item.geographyName || item.metroName || "Saved community"}</strong><small>{item.winner} · {item.score.toFixed(1)}</small></span><ArrowRight /></button>)}</div></section>}
    </div>
  );
}

function ScenarioPage({ geography, peers, weights, navigate }: { geography: AnalysisGeography; peers: GeographyRecord[]; weights: Weights; navigate: (view: ViewKey) => void }) {
  const [scenarioId, setScenarioId] = useState<(typeof SCENARIOS)[number]["id"]>(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0];
  const scenarioScores = scoreFormats(geography, peers, weights, scenario.id);
  const winner = scenarioScores[0];
  const baseline = scoreFormats(geography, peers, weights);
  return (
    <div className="page surface-page scenario-page">
      <PageIntro eyebrow="Scenario lab" title={<>Change the context. Watch the fit<br />shift.</>} description="Use stylized planning scenarios to see how different assumptions change comparative housing-format rankings." />
      <DataNotice warm><strong>Illustrative scenarios.</strong> These are model assumptions—not descriptions of any specific community and not prescribed housing mixes.</DataNotice>
      <section className="scenario-grid" aria-label="Available scenarios">{SCENARIOS.map((item) => <button key={item.id} className={item.id === scenario.id ? "active" : ""} onClick={() => setScenarioId(item.id)}><span>{item.eyebrow}</span><h2>{item.name}</h2><p>{item.description}</p><ArrowRight /></button>)}</section>
      <div className="scenario-results">
        <section className="panel scenario-detail">
          <div className="panel-heading"><div><p className="eyebrow">Active scenario</p><h2>{scenario.name}</h2></div><span className="model-chip">Model assumption</span></div>
          <p>{scenario.description}</p>
          <div className="scenario-assumptions">{Object.entries(scenario.signal).map(([factor, value]) => <div key={factor}><span>{FACTOR_LABELS[factor as FactorKey]}</span><strong>{value}</strong><div><i style={{ width: `${value}%` }} /></div></div>)}</div>
          <button className="text-link" onClick={() => navigate("methodology")}>Read factor definitions <ArrowRight /></button>
        </section>
        <section className="panel scenario-ranking">
          <div className="panel-heading"><div><p className="eyebrow">Illustrative ranking</p><h2>Comparative fit</h2></div><span className="model-chip warm-chip">Model assumption</span></div>
          <div className="scenario-winner"><ScoreRing score={winner.score} small /><div><span>Highest fit under scenario</span><h3>{winner.name}</h3><p>{whyPrioritized(winner.key, communitySignals(geography, peers, scenario.id))}</p></div></div>
          <div className="score-bars">{scenarioScores.map((item) => <div key={item.key}><div><span><i style={{ background: item.color }} />{item.name}</span><strong>{item.score.toFixed(1)}</strong></div><div className="bar-track"><span style={{ width: `${item.score}%`, background: item.color }} /></div></div>)}</div>
        </section>
      </div>
      <section className="panel sensitivity-panel">
        <div className="panel-heading"><div><p className="eyebrow">Scenario sensitivity</p><h2>Change from the community baseline</h2></div><span className="model-chip">Score-point change</span></div>
        <div className="sensitivity-grid">{scenarioScores.map((item) => { const before = baseline.find((base) => base.key === item.key)?.score || 0; const change = item.score - before; return <div key={item.key}><span>{item.name}</span><strong className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}</strong><small>Baseline {before.toFixed(1)} → Scenario {item.score.toFixed(1)}</small></div>; })}</div>
      </section>
    </div>
  );
}

function ModelFormulaNotes() {
  return <>
    <p>For eight factors, fit = max(0, 100 − 0.72 × |community signal − format profile|). Existing-mix fit uses the structure-share formulas documented in the source. The raw fit is the weighted mean; each slider’s effective weight is its value divided by the total.</p>
    <p>Final score = round to one decimal of clamp(raw fit + format adjustment, 0, 100). Fixed adjustments in score points: {FORMAT_KEYS.map((key) => `${FORMAT_INFO[key].name} ${FORMAT_ADJUSTMENTS[key]}`).join("; ")}. These hand-set assumptions are not fitted to observed housing outcomes. They affect rankings even when a factor’s weight is zero.</p>
    <p>Percentiles compare metros with the bundled metros and counties with the bundled counties. A missing percentile input receives 50; a missing housing-structure share receives zero in existing-mix calculations. Scores are model alignment, not probabilities, predicted returns, or prescriptions. Density ranges and all qualitative housing ratings are illustrative assumptions. Scenario Lab also replaces the factors and weights listed for the chosen scenario.</p>
  </>;
}

function MethodologyPage({ navigate }: { navigate: (view: ViewKey) => void }) {
  return (
    <div className="page surface-page methodology-page">
      <PageIntro eyebrow="Methodology" title={<>A screening model,<br />made inspectable.</>} description="FormFactor separates reported estimates, transparent calculations, and qualitative assumptions so the result can be questioned rather than merely accepted.">
        <button className="button soft" onClick={() => navigate("sources")}>Review every source <ArrowRight /></button>
      </PageIntro>
      <div className="method-steps"><article><span>01</span><h2>Read local conditions</h2><p>Reported ACS estimates describe affordability, households, commuting, and housing stock for a metro or county.</p></article><article><span>02</span><h2>Calculate signals</h2><p>Documented percentiles and ratios translate unlike metrics to a common 0–100 screening scale within the same geography type.</p></article><article><span>03</span><h2>Compare assumptions</h2><p>Each housing format has explicit qualitative profiles. User weights determine how strongly each factor matters.</p></article></div>
      <section className="panel formula-panel"><p className="eyebrow">Core calculation</p><h2>Weighted comparative fit</h2><div className="formula"><span>Raw fit</span><b>=</b><span>Σ (factor fit × user weight)</span><b>÷</b><span>Σ user weights</span></div><ModelFormulaNotes /></section>
      <section className="factor-methods"><div className="section-heading"><div><p className="eyebrow">Nine visible factors</p><h2>Inputs, interpretation, and limits</h2></div></div><div className="factor-method-grid">{FACTOR_KEYS.map((factor) => <article className="panel" key={factor}><span>{FACTOR_LABELS[factor]}</span><h3>{FACTOR_METHODS[factor].input}</h3><p>{FACTOR_METHODS[factor].interpretation}</p><small><strong>Limit:</strong> {FACTOR_METHODS[factor].limitation}</small></article>)}</div></section>
      <section className="limitations panel"><div><p className="eyebrow">Data limitations</p><h2>What FormFactor cannot determine</h2></div><ul><li>Parcel availability, land ownership, zoning capacity, environmental constraints, or infrastructure condition.</li><li>Project-level feasibility, construction bids, financing, rents, sale prices, absorption, or investment returns.</li><li>Neighborhood-level preferences, displacement risk, design quality, public process, or legal compliance.</li><li>A professional recommendation about what any community should approve or build.</li><li>Statistical significance: ACS margins of error are not used. Small differences may reflect sampling uncertainty.</li><li>Constant-boundary growth: 2019 and 2024 records are joined by identifier, without harmonizing changed boundaries. Missing baselines remain unavailable.</li><li>Complete evidence reproduction: original download timestamps, raw baseline files, and upstream file checksums were not retained with this source upload.</li></ul></section>
      <DataNotice warm>FormFactor is an educational public-data prototype. It is not investment, planning, legal, engineering, appraisal, brokerage, or financial advice.</DataNotice>
    </div>
  );
}

function SourcesPage() {
  function downloadManifest() {
    downloadCsv("formfactor-metric-dictionary.csv", [["metric", "table_or_input", "type", "unit"], ...METRIC_DEFINITIONS]);
  }
  return (
    <div className="page surface-page sources-page">
      <PageIntro eyebrow="Sources & definitions" title={<>Every number should<br />have a trail.</>} description="The prototype runs entirely from bundled local data. These records identify the public sources, vintages, calculations, and known limitations behind the atlas." />
      <DataNotice><strong>Data vintage:</strong> current metrics use the 2020–2024 ACS 5-year release. Growth uses the 2015–2019 ACS 5-year release as a non-overlapping baseline.</DataNotice>
      <p className="source-line">Connecticut uses nine planning regions as county equivalents. Legacy county names, such as New Haven County, are not current records in this bundle. Their boundaries do not match a single planning region. Growth is unavailable where a baseline is absent.</p>
      <section className="source-card-grid">{SOURCES.map((source, index) => <article className="panel source-card" key={`${source.name}-${source.vintage}`}><span>0{index + 1}</span><h2>{source.name}</h2><strong>{source.vintage}</strong><p>{source.role}</p><small>{source.note}</small><a href={source.url} target="_blank" rel="noreferrer">Open source <ExternalLink /></a></article>)}</section>
      <section className="panel dictionary-panel">
        <div className="panel-heading"><div><p className="eyebrow">Local metric dictionary</p><h2>Reported and calculated fields</h2></div><button className="button soft" onClick={downloadManifest}><Download /> Download CSV</button></div>
        <div className="table-scroll"><table><thead><tr><th>Metric</th><th>ACS table / input</th><th>Treatment</th><th>Unit / interpretation</th></tr></thead><tbody>{METRIC_DEFINITIONS.map(([metric, input, type, unit]) => <tr key={metric}><td><strong>{metric}</strong></td><td>{input}</td><td><span className={`type-chip ${type.toLowerCase()}`}>{type}</span></td><td>{unit}</td></tr>)}</tbody></table></div>
      </section>
      <section className="repro-note panel"><Database /><div><p className="eyebrow">Reproducibility note</p><h2>Static, inspectable, and API-free</h2><p>The included generator documents public Census file paths and calculations and writes a local JSON dataset. Original raw downloads and their access timestamps were not retained in this source upload, so the bundle is inspectable but not a complete research archive. The website has no runtime API dependency, account, database, or secret.</p></div></section>
    </div>
  );
}

export default App;
