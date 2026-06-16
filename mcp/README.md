# 🏆 World Cup 2026 Predictor — MCP server

Exposes the predictor's engine to **Claude Desktop** as callable tools, so you
can just *chat* with it:

> "What are Brazil's odds to win the World Cup?"
> "Predict Spain vs Argentina."
> "Show me Group D's predicted standings."
> "Who does the model have winning the whole thing?"

It reuses `js/engine.js`, `js/data.js` and `js/livescore.js` directly — same
Dixon-Coles + Monte-Carlo model as the website, pulling **live scores from
ESPN** on demand. **Zero dependencies** (speaks JSON-RPC over stdio by hand),
so there is **no `npm install`**.

---

## 1. Install Node (one time)

The server needs **Node.js 18 or newer** (for the built-in `fetch`).
Download the LTS build from <https://nodejs.org/> and install it. Then in a
**new** terminal confirm:

```bash
node --version    # should print v18.x or higher
```

## 2. Tell Claude Desktop about the server

Open Claude Desktop → **Settings → Developer → Edit Config**. That opens
`claude_desktop_config.json` (on Windows it lives at
`%APPDATA%\Claude\claude_desktop_config.json`). Add this server under
`mcpServers` (merge it with anything already there):

```json
{
  "mcpServers": {
    "worldcup-predictor": {
      "command": "node",
      "args": ["C:\\Users\\balaj\\Desktop\\Worldcup_live_predictor\\mcp\\server.js"]
    }
  }
}
```

Save, then **fully quit and reopen Claude Desktop** (use the tray icon → Quit;
a window close isn't enough).

## 3. Turn it on / off

In Claude Desktop the server appears as a connector with a **toggle** — flip it
off to disable, on to re-enable. You'll see a 🔌/tools icon in the chat input;
the seven tools below appear there when it's connected. (Removing the block from
the config file disables it permanently.)

---

## Tools

| Tool | What it does |
|------|--------------|
| `predict_match` | W/D/L + xG + likely score for any two teams |
| `tournament_odds` | Championship & round-reach odds (one team, or all 48 ranked) |
| `group_standings` | Predicted final standings for a group (A–L) or all groups |
| `predicted_bracket` | Best-guess knockout bracket → predicted champion |
| `team_info` | Rank, ratings, squad index, form, group standing, headline odds |
| `live_scores` | Current real scores from ESPN (finished + live now) |
| `refresh` | Re-pull live scores and re-run the whole simulation |

You don't call these directly — just ask Claude in plain English and it picks
the right tool.

---

## Tuning / troubleshooting

- **Faster responses:** the full sim is 12,000 runs. Drop it with an env var —
  add `"env": { "WC_MC_RUNS": "4000" }` inside the server block.
- **Offline:** if ESPN can't be reached the server logs a note to stderr and
  falls back to the bundled pre-tournament FIFA ratings — everything still works.
- **Server logs:** anything the server prints to **stderr** shows up in Claude
  Desktop's MCP logs (`%APPDATA%\Claude\logs\`). stdout is reserved for the
  protocol, so never `console.log` from the server.
- **Test it by hand** (without Claude):

  ```bash
  cd mcp
  echo {"jsonrpc":"2.0","id":1,"method":"tools/list"} | node server.js
  ```
