/* =============================================================================
 * config.js — Runtime configuration
 * -----------------------------------------------------------------------------
 * Drop your free football-data.org API token below to enable LIVE data.
 *   1. Sign up (free): https://www.football-data.org/client/register
 *   2. Paste the token into API_TOKEN.
 *   3. Because browsers block cross-origin calls to the API, run the tiny
 *      proxy in /proxy (see README) OR set PROXY_URL to a CORS proxy.
 *
 * With NO token the app runs in SIMULATION mode: it auto-generates plausible
 * live results on a timer so you can see the engine recalculate in real time.
 * ========================================================================== */

const CONFIG = {
  // ---- Live data -----------------------------------------------------------
  API_TOKEN: '',                       // <-- paste football-data.org token here
  COMPETITION: 'WC',                   // football-data.org competition code (World Cup)
  API_BASE: 'https://api.football-data.org/v4',

  // CORS workaround. Leave '' to call the API directly (works from the bundled
  // Node proxy). Or point at your own proxy, e.g. 'http://localhost:8787/'.
  PROXY_URL: '',

  // ---- Live scores: TheSportsDB (FREE, CORS-enabled, no token) -------------
  // Works directly from the browser / GitHub Pages — this is the live source.
  ENABLE_LIVESCORES: true,
  LIVESCORE_BASE: 'https://www.thesportsdb.com/api/v1/json/3',
  WC_LEAGUE_ID: 4429,                  // TheSportsDB league id for the 2026 World Cup
  WC_SEASON: 2026,                     // season for the full finished-games feed
  LIVESCORE_POLL_MS: 60_000,           // re-check for new scores every 60s

  // ---- Polling -------------------------------------------------------------
  POLL_INTERVAL_MS: 60_000,            // how often to re-check for finished games

  // ---- Prediction engine ---------------------------------------------------
  MONTE_CARLO_RUNS: 12_000,            // simulations per full-tournament recompute
                                       // (48-team sim is heavier; 12k stays snappy)
  HOME_ADVANTAGE_ELO: 0,              // neutral venues at a World Cup
  ELO_K_FACTOR: 40,                    // learning rate for live Elo updates
  MAX_GOALS: 8,                        // cap for Poisson goal sampling
  LEAGUE_AVG_GOALS: 1.35,              // baseline goals-per-team used by the model
  DIXON_COLES_RHO: -0.13,             // low-score dependence (Dixon-Coles ρ)

  // ---- Player-strength & form signals --------------------------------------
  SQUAD_PIVOT: 65,                     // a "65" squad index is treated as neutral
  SQUAD_ELO_WEIGHT: 0.8,               // rating pts added per squad-index point over pivot
  SQUAD_ATT_WEIGHT: 0.004,             // attack multiplier per squad-index point over pivot
  FORM_GAMES: 4,                       // recent matches used for momentum
  FORM_RANGE: 90,                      // max ± rating swing from hot/cold form

  // ---- Player API (API-Football / api-sports.io) — optional, real data -----
  // Free key: https://www.api-football.com/  (100 req/day). Browser calls are
  // CORS-blocked, so route through the bundled proxy (see proxy/server.js).
  PLAYER_API_KEY: '',                  // <-- paste API-Football key to enable LIVE player data
  PLAYER_API_BASE: 'https://v3.football.api-sports.io',
  PLAYER_WC_LEAGUE_ID: 1,              // API-Football league id for the World Cup
  PLAYER_SEASON: 2026,
  PLAYER_REFRESH_MS: 600_000,          // refresh player ratings/form every 10 min

  // ---- Simulation mode (no API token) -------------------------------------
  SIM_TICK_MS: 8_000,                  // how often a fake "live" result lands

  // ---- Polymarket (model vs market) ---------------------------------------
  ENABLE_POLYMARKET: true,             // fetch live "winner" odds for comparison
  POLYMARKET_SLUG: 'world-cup-2026-winner', // event slug on polymarket.com
  POLYMARKET_API: 'https://gamma-api.polymarket.com',
  MARKET_REFRESH_MS: 120_000,          // re-pull market odds every 2 min
};

if (typeof module !== 'undefined') module.exports = { CONFIG };
