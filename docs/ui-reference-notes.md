# UI reference notes: Scattered Hopes and BSG

Research pass, 2026-10-10. Sources: the *Battlestar Galactica: Scattered Hopes* Steam store
screenshots (Alt Shift / Dotemu, 2026) and Battlestar Wiki (DRADIS; Colonial "octagon" aesthetics).
Per the spec (§4), we borrow **principles**, never assets, logos, fonts or exact layouts.

## What the references do

**Scattered Hopes**
- Crisis panel: a solid red header bar with a warning icon, a short title ("Desertion") and a
  designation code (FMD-1), plus "N turns left to avoid negative effect".
- A cream "CRISIS REPORT" card sits on the dark UI: paper-coloured documents against
  console chrome.
- Choices are side-by-side cards. Each has **Cost** and **Risk** rows (risk as a range, e.g.
  "0–25"), a SELECT button, and a green RESOLVE connector for the chosen one.
- Dialogue choices carry consequence tags: "Military → Increases", "Workers → Deteriorates".
- Investigation screen: a beige paper dossier with cut corners and paperclipped photos, a grid of
  status pills, and a small legend table of cost bands (VERY HIGH / HIGH / MODERATE / CHEAP).
- Chrome: chamfered panel corners, L-shaped corner brackets, diamond node icons, dashed leader
  lines, segmented gauges with numbers, status rings around crew portraits, an FTL-jump panel
  with a countdown, and a resource strip with red deltas.
- Palette: near-black with teal for systems, red for crises, green for confirm/complete.

**Battlestar Galactica (2004 series)**
- Colonial design trims corners at 45°: paper, photos, books and data discs are "snub
  rectangles" (octagons).
- DRADIS: a dark field in a red/magenta frame with tabbed headers and tiny small-caps labels.
  Friendly contacts are green, hostile contacts red; monochrome vector feel.

## What School Run takes from them

| Principle | Where it lives |
|---|---|
| 45° cut corners | `.frame` / `.frame.oct` in `src/styles.css`: panels (two corners), buttons and paper (four) |
| Paper documents on console chrome | Situation report inside each incident; debrief is an after-action report with a rubber stamp |
| Crisis header + designation code | `IncidentView`: amber bar (red after 07:45), ▲, title, `INC-03`, "Waiting N min" |
| Cost / Risk read-outs | `ResponseCard`: TIME and RISK cells; risk band from the sim's live `escalationChance` (grogginess, mood, coffee) |
| Consequence tags | `ResponseDef.tags` in `src/sim/content.ts` ("Mood ↑ likely", "No socks") |
| Status rings | Activity cards show task progress as a ring with minutes left |
| Segmented gauge / jump countdown | Time box: 5-minute segments until departure |
| Diamond nodes | Checklist markers: filled = done, half = in progress, flashing = stopped |
| Corner brackets | `.bracketed` around the terminal |
| DRADIS-style track | `MorningPlot`: 06:30–08:15 track with lanes for you and her, recorded spans, dashed projections, LEAVE/BELL lines |

## Deliberately not taken

- **Teal and red as the main accents.** The spec palette (charcoal, amber, desaturated green)
  stays. Red is kept for being late and for genuinely urgent states, as the spec asks.
- **Portraits, ship art, icons and logos.** The spec says "no custom graphics", and those are
  proprietary assets.
- **Military-parody copy.** Codes like `INC-03` are ornament. The writing stays plain ("Socks",
  "She doesn't want those socks").
- **Risk as numeric ranges.** We show bands (None/Low/Some/High) so there are no hidden
  coin-flips, but the player also isn't doing arithmetic over breakfast.
