/* =============================================================================
 * data.js — 2026 FIFA World Cup — REAL final draw + REAL FIFA ranking
 * -----------------------------------------------------------------------------
 * Draw: 5 Dec 2025 (verified vs FIFA / Wikipedia).
 * Strength prior `elo` = each team's REAL FIFA ranking points (June 2026 update,
 * top-20 exact from Wikipedia; rest anchored to their real FIFA rank position).
 * `rank` = FIFA world rank. `iso` = ISO-3166 code for flag images (flagcdn).
 * att/def = goals scored / conceded priors.
 * `squad`  = individual-PLAYER-strength index 0-100 (star power / depth). This
 *            captures talent the ranking misses — e.g. Norway rates high for
 *            Haaland & Ødegaard despite a modest FIFA rank. It's a curated prior
 *            that the live Player API (players.js) OVERWRITES with real squad
 *            ratings + form when a key is configured.
 * The engine updates `elo` live after every result and blends squad talent +
 * recent form into every prediction.
 * Format: 48 teams · 12 groups (A–L) · top 2 + 8 best 3rd → R32.
 * ========================================================================== */

const BASE_TEAMS = [
  // Group A
  { name: 'Mexico',               iso: 'mx',     rank: 14, group: 'A', elo: 1687, att: 1.6, def: 1.1, squad: 72 },
  { name: 'South Africa',         iso: 'za',     rank: 60, group: 'A', elo: 1290, att: 1.2, def: 1.4, squad: 58 },
  { name: 'South Korea',          iso: 'kr',     rank: 25, group: 'A', elo: 1575, att: 1.5, def: 1.2, squad: 74 },
  { name: 'Czechia',              iso: 'cz',     rank: 40, group: 'A', elo: 1450, att: 1.5, def: 1.2, squad: 70 },

  // Group B
  { name: 'Canada',               iso: 'ca',     rank: 30, group: 'B', elo: 1530, att: 1.4, def: 1.2, squad: 73 },
  { name: 'Bosnia & Herzegovina', iso: 'ba',     rank: 64, group: 'B', elo: 1262, att: 1.4, def: 1.3, squad: 68 },
  { name: 'Qatar',                iso: 'qa',     rank: 56, group: 'B', elo: 1320, att: 0.9, def: 1.9, squad: 56 },
  { name: 'Switzerland',          iso: 'ch',     rank: 19, group: 'B', elo: 1650, att: 1.6, def: 1.1, squad: 76 },

  // Group C
  { name: 'Brazil',               iso: 'br',     rank:  6, group: 'C', elo: 1766, att: 2.0, def: 0.9, squad: 93 },
  { name: 'Morocco',              iso: 'ma',     rank:  7, group: 'C', elo: 1755, att: 1.6, def: 0.9, squad: 82 },
  { name: 'Haiti',                iso: 'ht',     rank: 83, group: 'C', elo: 1123, att: 1.0, def: 1.7, squad: 50 },
  { name: 'Scotland',             iso: 'gb-sct', rank: 42, group: 'C', elo: 1438, att: 1.4, def: 1.2, squad: 68 },

  // Group D
  { name: 'United States',        iso: 'us',     rank: 17, group: 'D', elo: 1671, att: 1.6, def: 1.1, squad: 77 },
  { name: 'Paraguay',             iso: 'py',     rank: 41, group: 'D', elo: 1443, att: 1.3, def: 1.3, squad: 66 },
  { name: 'Australia',            iso: 'au',     rank: 27, group: 'D', elo: 1555, att: 1.3, def: 1.3, squad: 64 },
  { name: 'Turkey',               iso: 'tr',     rank: 22, group: 'D', elo: 1605, att: 1.7, def: 1.1, squad: 79 },

  // Group E
  { name: 'Germany',              iso: 'de',     rank: 10, group: 'E', elo: 1736, att: 1.9, def: 1.0, squad: 88 },
  { name: 'Curaçao',              iso: 'cw',     rank: 82, group: 'E', elo: 1130, att: 1.0, def: 1.6, squad: 50 },
  { name: 'Ivory Coast',          iso: 'ci',     rank: 33, group: 'E', elo: 1510, att: 1.5, def: 1.2, squad: 76 },
  { name: 'Ecuador',              iso: 'ec',     rank: 23, group: 'E', elo: 1599, att: 1.4, def: 1.1, squad: 73 },

  // Group F
  { name: 'Netherlands',          iso: 'nl',     rank:  8, group: 'F', elo: 1754, att: 2.0, def: 0.9, squad: 88 },
  { name: 'Japan',                iso: 'jp',     rank: 18, group: 'F', elo: 1662, att: 1.6, def: 1.1, squad: 78 },
  { name: 'Sweden',               iso: 'se',     rank: 38, group: 'F', elo: 1465, att: 1.5, def: 1.1, squad: 75 },
  { name: 'Tunisia',              iso: 'tn',     rank: 45, group: 'F', elo: 1410, att: 1.1, def: 1.3, squad: 64 },

  // Group G
  { name: 'Belgium',              iso: 'be',     rank:  9, group: 'G', elo: 1742, att: 1.9, def: 1.0, squad: 85 },
  { name: 'Egypt',                iso: 'eg',     rank: 29, group: 'G', elo: 1535, att: 1.4, def: 1.2, squad: 73 },
  { name: 'Iran',                 iso: 'ir',     rank: 20, group: 'G', elo: 1620, att: 1.3, def: 1.1, squad: 66 },
  { name: 'New Zealand',          iso: 'nz',     rank: 85, group: 'G', elo: 1108, att: 1.0, def: 1.6, squad: 48 },

  // Group H
  { name: 'Spain',                iso: 'es',     rank:  2, group: 'H', elo: 1875, att: 2.2, def: 0.8, squad: 94 },
  { name: 'Cape Verde',           iso: 'cv',     rank: 67, group: 'H', elo: 1240, att: 1.1, def: 1.4, squad: 56 },
  { name: 'Saudi Arabia',         iso: 'sa',     rank: 61, group: 'H', elo: 1283, att: 1.1, def: 1.5, squad: 58 },
  { name: 'Uruguay',              iso: 'uy',     rank: 16, group: 'H', elo: 1673, att: 1.7, def: 1.0, squad: 83 },

  // Group I
  { name: 'France',               iso: 'fr',     rank:  3, group: 'I', elo: 1871, att: 2.2, def: 0.9, squad: 95 },
  { name: 'Senegal',              iso: 'sn',     rank: 15, group: 'I', elo: 1684, att: 1.6, def: 1.0, squad: 80 },
  { name: 'Iraq',                 iso: 'iq',     rank: 57, group: 'I', elo: 1313, att: 1.2, def: 1.4, squad: 58 },
  { name: 'Norway',               iso: 'no',     rank: 31, group: 'I', elo: 1525, att: 1.9, def: 1.1, squad: 81 },

  // Group J
  { name: 'Argentina',            iso: 'ar',     rank:  1, group: 'J', elo: 1877, att: 2.2, def: 0.7, squad: 92 },
  { name: 'Algeria',              iso: 'dz',     rank: 28, group: 'J', elo: 1545, att: 1.5, def: 1.2, squad: 74 },
  { name: 'Austria',              iso: 'at',     rank: 24, group: 'J', elo: 1585, att: 1.6, def: 1.1, squad: 77 },
  { name: 'Jordan',               iso: 'jo',     rank: 63, group: 'J', elo: 1268, att: 1.1, def: 1.5, squad: 56 },

  // Group K
  { name: 'Portugal',             iso: 'pt',     rank:  5, group: 'K', elo: 1768, att: 2.0, def: 0.9, squad: 91 },
  { name: 'DR Congo',             iso: 'cd',     rank: 46, group: 'K', elo: 1402, att: 1.3, def: 1.3, squad: 67 },
  { name: 'Uzbekistan',           iso: 'uz',     rank: 50, group: 'K', elo: 1370, att: 1.2, def: 1.4, squad: 60 },
  { name: 'Colombia',             iso: 'co',     rank: 13, group: 'K', elo: 1698, att: 1.7, def: 1.0, squad: 82 },

  // Group L
  { name: 'England',              iso: 'gb-eng', rank:  4, group: 'L', elo: 1828, att: 2.0, def: 0.8, squad: 93 },
  { name: 'Croatia',              iso: 'hr',     rank: 11, group: 'L', elo: 1715, att: 1.7, def: 1.0, squad: 81 },
  { name: 'Ghana',                iso: 'gh',     rank: 73, group: 'L', elo: 1195, att: 1.3, def: 1.5, squad: 70 },
  { name: 'Panama',               iso: 'pa',     rank: 34, group: 'L', elo: 1500, att: 1.2, def: 1.4, squad: 60 },
];

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

/* Real matches already played / in progress (as of 12 Jun 2026).
 * Names MUST match BASE_TEAMS exactly. Goals omitted -> not yet known. */
const KNOWN_RESULTS = [
  // Matchday 1 — Group A (both finished 11 Jun)
  { home: 'Mexico',      away: 'South Africa',          homeGoals: 2, awayGoals: 0, status: 'FINISHED' },
  { home: 'South Korea', away: 'Czechia',               homeGoals: 2, awayGoals: 1, status: 'FINISHED' },
  // 12 Jun — hosts begin (scores arrive via the live API; marked live/scheduled)
  { home: 'Canada',         away: 'Bosnia & Herzegovina', status: 'LIVE' },
  { home: 'United States',  away: 'Paraguay',             status: 'SCHEDULED' },
];

if (typeof module !== 'undefined') module.exports = { BASE_TEAMS, GROUP_LETTERS, KNOWN_RESULTS };
