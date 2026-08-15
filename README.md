# Seahawks Command Center

A single-page dashboard for the Seattle Seahawks: live/next game, schedule,
standings, roster, injuries, team stats, season-by-season history, playoff
positioning, and a fantasy football watch list.

- **No build step, no API keys.** Plain HTML/CSS/JS, fetched client-side
  straight from ESPN's free public sports APIs (the same ones espn.com's
  own pages use).
- **No backend.** Everything runs in the browser; `run.bat` just serves the
  static files locally.

## Usage

```bash
run.bat
```

Then open http://localhost:5510 — or just double-click `index.html` to open
it directly in a browser (works fine since there's no server-side code).

## What's on each tab

| Tab | Source |
|---|---|
| Overview | Next/live game, last 5 results, NFC West mini-standings, latest news |
| Schedule | Full season schedule with live/final scores |
| Standings | NFC West, NFC Wild Card race, full league standings by division |
| Roster | Full roster grouped by offense/defense/special teams; click a player for season stats |
| Injuries | Current injury report with status and latest notes |
| Team Stats | Season team totals by category (passing, rushing, defense, etc.) |
| History | Season-by-season win/loss record and scoring for the last decade |
| Playoff Odds | Real current seeding/games-back from ESPN standings, plus a clearly-labeled simplified estimate bar (ESPN's real FPI-based odds aren't available through a free public endpoint) |
| Fantasy Watch | Real ESPN Fantasy ownership %, position rank, and recent scoring for skill-position players; click a row for full detail |

## Notes

- Data refreshes on tab switch; hit the ⟳ button in the header to force a
  full refresh. The Overview tab auto-polls every 30s while a game is live.
- Built during NFL preseason — standings/stats will look sparse (0-0, no
  team totals) until the regular season kicks off; the History tab still
  shows real prior-season results.
- Data via ESPN's public site API — not affiliated with the NFL or the
  Seattle Seahawks.
