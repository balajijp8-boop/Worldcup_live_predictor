### 🌐 https://balajijp8-boop.github.io/Worldcup_live_predictor/

# 🏆 World Cup 2026 Predictor

An interactive sports-analytics dashboard that predicts the **2026 FIFA World Cup** —
match win/draw/loss odds, full-tournament championship probabilities, predicted
group standings, and a predicted knockout bracket all the way to the final.

It runs on a real statistical pipeline — **FIFA ranking + player strength + form →
Dixon-Coles bivariate-Poisson match model → Monte-Carlo tournament simulation** —
and can **train & validate itself on 49,000+ historical international results**.

> Pure HTML + Tailwind (CDN) + vanilla JS. No build step. Open and go.

---

## Quick start

```bash
cd world-cup-predictor
python -m http.server 5500     # then open http://localhost:5500
```

…or just open `index.html` in a browser. Everything works offline with the
bundled real data — no keys or signup required.

---

## Features

- **Real 2026 data** — the actual final draw (12 groups A–L, 48 teams), real FIFA
  ranking points, and real opening results baked in
  (**Mexico 2–0 South Africa**, **South Korea 2–1 Czechia**).
- **Live Tournament Odds** — probability each team reaches **R16 / QF / Semis /
  Final / Wins it**, from a 12,000-run Monte-Carlo simulation.
- **Predicted group standings** — most-likely 1st–4th in every group, marking the
  top-2 (**Q**) and predicted best-third qualifiers (**3rd→Q**).
- **Knockout bracket** — built from the predicted standings via the **official
  2026 Round-of-32 slotting**, through to the predicted champion. Toggle a
  **🎲 random sampled outcome** for one possible future.
- **Match predictions** — click any fixture for an animated win/draw/loss + xG +
  likely-scoreline breakdown, with **predicted-vs-actual** on played games.
- **Player strength & form** — each team carries a squad-talent index (e.g. Norway
  rates high for Haaland/Ødegaard above its FIFA rank) plus a live form swing.
- **Polymarket odds** — model probabilities shown next to real **market-implied**
  odds (📈 Polymarket view).
- **Train & validate** — fits the model on real historical results and reports
  log-loss + accuracy vs a baseline.
- **Stable & on-demand** — odds only change on real results or when you hit
  **↻ Refresh** (a seeded RNG keeps repeated runs identical).

---

## How the model works

| Layer | File | What it does |
|-------|------|--------------|
| **Ratings** | `js/data.js` | Real **FIFA ranking points** (June 2026) per team + a curated **squad-talent index** + goal-rate priors. |
| **Form** | `js/app.js` | Recent-results momentum (`formElo`) folded into the effective rating. |
| **Dixon-Coles** | `js/engine.js` | Bivariate-Poisson match model with the low-score (ρ) correction — the football-industry standard for W/D/L + scoreline odds. |
| **Monte Carlo** | `js/engine.js` | Plays the *entire* tournament 12,000× (12 groups → best-3rd race → official R32 → Final), tracking how far each team gets. |
| **Predicted bracket** | `js/engine.js` | Deterministic best-guess bracket from predicted standings + official slotting. |
| **Training** | `js/train.js` | Fits per-team attack/defence + home advantage by gradient ascent on 49k historical matches; validates on a held-out slice. |
| **Players** | `js/players.js` | Optional API-Football squad ratings + form (see below). |
| **Market** | `js/market.js` | Real Polymarket "winner" odds snapshot + best-effort live refresh. |

---

## Live scores (on by default, free, no setup)

Real 2026 World Cup scores come from **TheSportsDB** (free key, CORS-enabled), so
they update **live in the browser — even on the hosted GitHub Pages site**, with
no token and no proxy. Every finished match updates ratings + form and re-runs
the simulation automatically (`js/livescore.js`, league id 4429).

> football-data.org is *not* used for the World Cup: its free tier paywalls the
> WC and sends no CORS header, so it can't run client-side.

## Optional extra feeds

The app is fully functional offline. Optional integrations add more live data:

**Live scores** ([football-data.org](https://www.football-data.org/client/register), free)
1. Paste your token into `API_TOKEN` in `js/config.js`.
2. Run the bundled CORS proxy: `node proxy/server.js` (Node 18+).
3. Set `PROXY_URL: 'http://localhost:8787/'`.

Every finished match then updates ratings + form and re-runs the whole simulation.

**Live player ratings** ([API-Football](https://www.api-football.com/), free tier)
- Paste your key into `PLAYER_API_KEY` in `js/config.js` (also via the proxy).
- Replaces the curated squad index with real per-player ratings + form.
- Note: the free plan only covers seasons 2022–2024.

---

## Project structure

```
index.html         Tailwind dashboard shell (UI layout)
js/config.js       Keys, intervals, engine + model weights
js/data.js         48-team dataset: FIFA pts, squad index, flags, real results
js/engine.js       Dixon-Coles + Monte-Carlo + official bracket + predictions
js/train.js        Train & validate on historical results
js/players.js      API-Football player strength + form (optional)
js/market.js       Polymarket odds (snapshot + live)
js/api.js          football-data.org live fixtures/scores (optional)
js/ui.js           DOM rendering & animation
js/app.js          Orchestrator / state / recompute cycle
proxy/server.js    Zero-dependency CORS proxy for the live APIs
```

---

## Format — real 2026 rules

- **48 teams · 12 groups (A–L) of 4.**
- Top 2 of each group **+ the 8 best 3rd-placed teams** → 32-team knockout.
- **Round of 32 → R16 → Quarter → Semi → Final**, using FIFA's official R32 slotting.

---

## Honest notes

- Squad-talent indices are curated priors; the API-Football integration swaps in
  real player ratings when configured.
- Predictions are probabilistic and for entertainment / educational use.
- Data sources: [FIFA](https://www.fifa.com/), Wikipedia (2026 draw & bracket),
  [Polymarket](https://polymarket.com/), and the
  [martj42 international results](https://github.com/martj42/international_results)
  dataset (training).

---

## License

MIT — see [LICENSE](LICENSE).
