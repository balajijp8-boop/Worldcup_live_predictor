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

/* Official 2026 group-stage schedule (all 72 matches, 11–27 Jun).
 * `ko` = sortable kickoff (ET, 24h) used to order the fixtures chronologically.
 * Times are ET as published. Team names are canonical (match BASE_TEAMS). */
const GROUP_FIXTURES = [
  // Group A
  { g:'A', home:'Mexico',        away:'South Africa',          ko:'2026-06-11T15:00', day:'Thu Jun 11', time:'3:00 PM',  city:'Mexico City' },
  { g:'A', home:'South Korea',   away:'Czechia',               ko:'2026-06-11T22:00', day:'Thu Jun 11', time:'10:00 PM', city:'Guadalajara' },
  { g:'A', home:'Czechia',       away:'South Africa',          ko:'2026-06-18T12:00', day:'Thu Jun 18', time:'12:00 PM', city:'Atlanta' },
  { g:'A', home:'Mexico',        away:'South Korea',           ko:'2026-06-18T21:00', day:'Thu Jun 18', time:'9:00 PM',  city:'Guadalajara' },
  { g:'A', home:'Czechia',       away:'Mexico',                ko:'2026-06-24T21:00', day:'Wed Jun 24', time:'9:00 PM',  city:'Mexico City' },
  { g:'A', home:'South Africa',  away:'South Korea',           ko:'2026-06-24T21:00', day:'Wed Jun 24', time:'9:00 PM',  city:'Monterrey' },
  // Group B
  { g:'B', home:'Canada',        away:'Bosnia & Herzegovina',  ko:'2026-06-12T15:00', day:'Fri Jun 12', time:'3:00 PM',  city:'Toronto' },
  { g:'B', home:'Qatar',         away:'Switzerland',           ko:'2026-06-13T15:00', day:'Sat Jun 13', time:'3:00 PM',  city:'San Francisco' },
  { g:'B', home:'Switzerland',   away:'Bosnia & Herzegovina',  ko:'2026-06-18T15:00', day:'Thu Jun 18', time:'3:00 PM',  city:'Los Angeles' },
  { g:'B', home:'Canada',        away:'Qatar',                 ko:'2026-06-18T18:00', day:'Thu Jun 18', time:'6:00 PM',  city:'Vancouver' },
  { g:'B', home:'Switzerland',   away:'Canada',                ko:'2026-06-24T15:00', day:'Wed Jun 24', time:'3:00 PM',  city:'Vancouver' },
  { g:'B', home:'Bosnia & Herzegovina', away:'Qatar',          ko:'2026-06-24T15:00', day:'Wed Jun 24', time:'3:00 PM',  city:'Seattle' },
  // Group C
  { g:'C', home:'Brazil',        away:'Morocco',               ko:'2026-06-13T18:00', day:'Sat Jun 13', time:'6:00 PM',  city:'New York/NJ' },
  { g:'C', home:'Haiti',         away:'Scotland',              ko:'2026-06-13T21:00', day:'Sat Jun 13', time:'9:00 PM',  city:'Boston' },
  { g:'C', home:'Scotland',      away:'Morocco',               ko:'2026-06-19T18:00', day:'Fri Jun 19', time:'6:00 PM',  city:'Boston' },
  { g:'C', home:'Brazil',        away:'Haiti',                 ko:'2026-06-19T21:00', day:'Fri Jun 19', time:'9:00 PM',  city:'Philadelphia' },
  { g:'C', home:'Scotland',      away:'Brazil',                ko:'2026-06-24T18:00', day:'Wed Jun 24', time:'6:00 PM',  city:'Miami' },
  { g:'C', home:'Morocco',       away:'Haiti',                 ko:'2026-06-24T18:00', day:'Wed Jun 24', time:'6:00 PM',  city:'Atlanta' },
  // Group D
  { g:'D', home:'United States', away:'Paraguay',              ko:'2026-06-12T21:00', day:'Fri Jun 12', time:'9:00 PM',  city:'Los Angeles' },
  { g:'D', home:'Australia',     away:'Turkey',                ko:'2026-06-13T00:00', day:'Sat Jun 13', time:'12:00 AM', city:'Vancouver' },
  { g:'D', home:'Turkey',        away:'Paraguay',              ko:'2026-06-19T00:00', day:'Fri Jun 19', time:'12:00 AM', city:'San Francisco' },
  { g:'D', home:'United States', away:'Australia',             ko:'2026-06-19T15:00', day:'Fri Jun 19', time:'3:00 PM',  city:'Seattle' },
  { g:'D', home:'Turkey',        away:'United States',         ko:'2026-06-25T22:00', day:'Thu Jun 25', time:'10:00 PM', city:'Los Angeles' },
  { g:'D', home:'Paraguay',      away:'Australia',             ko:'2026-06-25T22:00', day:'Thu Jun 25', time:'10:00 PM', city:'San Francisco' },
  // Group E
  { g:'E', home:'Germany',       away:'Curaçao',               ko:'2026-06-14T13:00', day:'Sun Jun 14', time:'1:00 PM',  city:'Houston' },
  { g:'E', home:'Ivory Coast',   away:'Ecuador',               ko:'2026-06-14T19:00', day:'Sun Jun 14', time:'7:00 PM',  city:'Philadelphia' },
  { g:'E', home:'Germany',       away:'Ivory Coast',           ko:'2026-06-20T16:00', day:'Sat Jun 20', time:'4:00 PM',  city:'Toronto' },
  { g:'E', home:'Ecuador',       away:'Curaçao',               ko:'2026-06-20T20:00', day:'Sat Jun 20', time:'8:00 PM',  city:'Kansas City' },
  { g:'E', home:'Ecuador',       away:'Germany',               ko:'2026-06-25T16:00', day:'Thu Jun 25', time:'4:00 PM',  city:'New York/NJ' },
  { g:'E', home:'Curaçao',       away:'Ivory Coast',           ko:'2026-06-25T16:00', day:'Thu Jun 25', time:'4:00 PM',  city:'Philadelphia' },
  // Group F
  { g:'F', home:'Netherlands',   away:'Japan',                 ko:'2026-06-14T16:00', day:'Sun Jun 14', time:'4:00 PM',  city:'Dallas' },
  { g:'F', home:'Sweden',        away:'Tunisia',               ko:'2026-06-14T22:00', day:'Sun Jun 14', time:'10:00 PM', city:'Monterrey' },
  { g:'F', home:'Tunisia',       away:'Japan',                 ko:'2026-06-20T00:00', day:'Sat Jun 20', time:'12:00 AM', city:'Monterrey' },
  { g:'F', home:'Netherlands',   away:'Sweden',                ko:'2026-06-20T13:00', day:'Sat Jun 20', time:'1:00 PM',  city:'Houston' },
  { g:'F', home:'Japan',         away:'Sweden',                ko:'2026-06-25T19:00', day:'Thu Jun 25', time:'7:00 PM',  city:'Dallas' },
  { g:'F', home:'Tunisia',       away:'Netherlands',           ko:'2026-06-25T19:00', day:'Thu Jun 25', time:'7:00 PM',  city:'Kansas City' },
  // Group G
  { g:'G', home:'Belgium',       away:'Egypt',                 ko:'2026-06-15T15:00', day:'Mon Jun 15', time:'3:00 PM',  city:'Seattle' },
  { g:'G', home:'Iran',          away:'New Zealand',           ko:'2026-06-15T21:00', day:'Mon Jun 15', time:'9:00 PM',  city:'Los Angeles' },
  { g:'G', home:'Belgium',       away:'Iran',                  ko:'2026-06-21T15:00', day:'Sun Jun 21', time:'3:00 PM',  city:'Los Angeles' },
  { g:'G', home:'New Zealand',   away:'Egypt',                 ko:'2026-06-21T21:00', day:'Sun Jun 21', time:'9:00 PM',  city:'Vancouver' },
  { g:'G', home:'Egypt',         away:'Iran',                  ko:'2026-06-26T23:00', day:'Fri Jun 26', time:'11:00 PM', city:'Seattle' },
  { g:'G', home:'New Zealand',   away:'Belgium',               ko:'2026-06-26T23:00', day:'Fri Jun 26', time:'11:00 PM', city:'Vancouver' },
  // Group H
  { g:'H', home:'Spain',         away:'Cape Verde',            ko:'2026-06-15T12:00', day:'Mon Jun 15', time:'12:00 PM', city:'Atlanta' },
  { g:'H', home:'Saudi Arabia',  away:'Uruguay',               ko:'2026-06-15T18:00', day:'Mon Jun 15', time:'6:00 PM',  city:'Miami' },
  { g:'H', home:'Spain',         away:'Saudi Arabia',          ko:'2026-06-21T12:00', day:'Sun Jun 21', time:'12:00 PM', city:'Atlanta' },
  { g:'H', home:'Uruguay',       away:'Cape Verde',            ko:'2026-06-21T18:00', day:'Sun Jun 21', time:'6:00 PM',  city:'Miami' },
  { g:'H', home:'Cape Verde',    away:'Saudi Arabia',          ko:'2026-06-26T20:00', day:'Fri Jun 26', time:'8:00 PM',  city:'Houston' },
  { g:'H', home:'Uruguay',       away:'Spain',                 ko:'2026-06-26T20:00', day:'Fri Jun 26', time:'8:00 PM',  city:'Guadalajara' },
  // Group I
  { g:'I', home:'France',        away:'Senegal',               ko:'2026-06-16T15:00', day:'Tue Jun 16', time:'3:00 PM',  city:'New York/NJ' },
  { g:'I', home:'Iraq',          away:'Norway',                ko:'2026-06-16T18:00', day:'Tue Jun 16', time:'6:00 PM',  city:'Boston' },
  { g:'I', home:'France',        away:'Iraq',                  ko:'2026-06-22T17:00', day:'Mon Jun 22', time:'5:00 PM',  city:'Philadelphia' },
  { g:'I', home:'Norway',        away:'Senegal',               ko:'2026-06-22T20:00', day:'Mon Jun 22', time:'8:00 PM',  city:'New York/NJ' },
  { g:'I', home:'Norway',        away:'France',                ko:'2026-06-26T15:00', day:'Fri Jun 26', time:'3:00 PM',  city:'Boston' },
  { g:'I', home:'Senegal',       away:'Iraq',                  ko:'2026-06-26T15:00', day:'Fri Jun 26', time:'3:00 PM',  city:'Toronto' },
  // Group J
  { g:'J', home:'Austria',       away:'Jordan',                ko:'2026-06-16T00:00', day:'Tue Jun 16', time:'12:00 AM', city:'San Francisco' },
  { g:'J', home:'Argentina',     away:'Algeria',               ko:'2026-06-16T21:00', day:'Tue Jun 16', time:'9:00 PM',  city:'Kansas City' },
  { g:'J', home:'Argentina',     away:'Austria',               ko:'2026-06-22T13:00', day:'Mon Jun 22', time:'1:00 PM',  city:'Dallas' },
  { g:'J', home:'Jordan',        away:'Algeria',               ko:'2026-06-22T23:00', day:'Mon Jun 22', time:'11:00 PM', city:'San Francisco' },
  { g:'J', home:'Algeria',       away:'Austria',               ko:'2026-06-27T22:00', day:'Sat Jun 27', time:'10:00 PM', city:'Kansas City' },
  { g:'J', home:'Jordan',        away:'Argentina',             ko:'2026-06-27T22:00', day:'Sat Jun 27', time:'10:00 PM', city:'Dallas' },
  // Group K
  { g:'K', home:'Portugal',      away:'DR Congo',              ko:'2026-06-17T13:00', day:'Wed Jun 17', time:'1:00 PM',  city:'Houston' },
  { g:'K', home:'Uzbekistan',    away:'Colombia',              ko:'2026-06-17T22:00', day:'Wed Jun 17', time:'10:00 PM', city:'Mexico City' },
  { g:'K', home:'Portugal',      away:'Uzbekistan',            ko:'2026-06-23T13:00', day:'Tue Jun 23', time:'1:00 PM',  city:'Houston' },
  { g:'K', home:'Colombia',      away:'DR Congo',              ko:'2026-06-23T22:00', day:'Tue Jun 23', time:'10:00 PM', city:'Guadalajara' },
  { g:'K', home:'Colombia',      away:'Portugal',              ko:'2026-06-27T19:30', day:'Sat Jun 27', time:'7:30 PM',  city:'Miami' },
  { g:'K', home:'DR Congo',      away:'Uzbekistan',            ko:'2026-06-27T19:30', day:'Sat Jun 27', time:'7:30 PM',  city:'Atlanta' },
  // Group L
  { g:'L', home:'England',       away:'Croatia',               ko:'2026-06-17T16:00', day:'Wed Jun 17', time:'4:00 PM',  city:'Dallas' },
  { g:'L', home:'Ghana',         away:'Panama',                ko:'2026-06-17T19:00', day:'Wed Jun 17', time:'7:00 PM',  city:'Toronto' },
  { g:'L', home:'England',       away:'Ghana',                 ko:'2026-06-23T16:00', day:'Tue Jun 23', time:'4:00 PM',  city:'Boston' },
  { g:'L', home:'Panama',        away:'Croatia',               ko:'2026-06-23T19:00', day:'Tue Jun 23', time:'7:00 PM',  city:'Toronto' },
  { g:'L', home:'Panama',        away:'England',               ko:'2026-06-27T17:00', day:'Sat Jun 27', time:'5:00 PM',  city:'New York/NJ' },
  { g:'L', home:'Croatia',       away:'Ghana',                 ko:'2026-06-27T17:00', day:'Sat Jun 27', time:'5:00 PM',  city:'Philadelphia' },
];

/* Real matches played / in progress (as of 13 Jun 2026).
 * Names MUST match BASE_TEAMS exactly. Goals omitted -> not yet known. */
const KNOWN_RESULTS = [
  // 11 Jun — Group A
  { home: 'Mexico',         away: 'South Africa',         homeGoals: 2, awayGoals: 0, status: 'FINISHED' },
  { home: 'South Korea',    away: 'Czechia',              homeGoals: 2, awayGoals: 1, status: 'FINISHED' },
  // 12 Jun — hosts begin
  { home: 'Canada',         away: 'Bosnia & Herzegovina', homeGoals: 1, awayGoals: 1, status: 'FINISHED' },
  // 13 Jun
  { home: 'United States',  away: 'Paraguay',             homeGoals: 4, awayGoals: 1, status: 'FINISHED' },
  // Qatar v Switzerland and Brazil v Morocco are NOT started yet (NS) — left as
  // normal upcoming fixtures; the live feed flips them to LIVE/FT when they kick off.
];

if (typeof module !== 'undefined') module.exports = { BASE_TEAMS, GROUP_LETTERS, GROUP_FIXTURES, KNOWN_RESULTS };
