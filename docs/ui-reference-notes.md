# UI reference notes: reading as *Galactica*

Goal (from the user): the console should read as **Battlestar Galactica**, not generic sci-fi.
Research passes 2026-10-10 and 2026-10-11. Sources:

- Battlestar Wiki: *Arts and Literature of the Twelve Colonies* (sections "Octagons",
  "Hexagons", "Polygonal Architecture"), *Computers in the Re-imagined Series*, *DRADIS*,
  *Combat Information Center*, and set and screen captures linked from those pages.
- *Battlestar Galactica: Scattered Hopes* Steam store screenshots (Alt Shift / Dotemu, 2026).

We borrow **principles**: shapes, colour roles, typographic feel and layout ideas. We don't use
assets, logos, insignia or the show's own typefaces.

## What reads as Galactica

1. **Octagons, on all four corners.** Colonial paper, photos, data discs, and "windows and menus"
   on Colonial computers have their corners trimmed at 45°. Production chose this to make things
   feel "a bit unconventional and unfamiliar". Hexagons are the secondary shape (dog tags, cards,
   corridors, the CIC table). A two-corner chamfer reads as generic sci-fi.
2. **Black CRT glass.** Screens are near-black, slightly blooming, with scanlines. Text glows.
3. **Colour by function on screen.** Cyan for message text ("HAVE HOPE. WE'RE COMING FOR YOU."),
   green for status ("CHANNEL OPEN"), amber/yellow for confirmations ("PACKET RECEIVED"), red for
   alarms.
4. **Wide extended caps.** On-screen labels use a wide, geometric, all-caps face (a
   Eurostile-Extended look) with generous tracking. Micro-legends are tiny caps
   ("SYS_REQ OUTPUT / PRIMARY DATA BUS", "DATA THROUGHPUT STATUS: NOMINAL").
5. **Message windows.** An octagon with a thick **khaki/olive bezel**, a dark title strip carrying
   micro labels, centred cyan caps text, and a matching footer strip.
6. **Salmon / red-orange outlined controls.** Buttons like SOURCE, ACQUIRE and CYCLE, outlined
   number keypads, and salmon bar gauges.
7. **DRADIS.** A black field inside **red-magenta chrome** with angled tab headers ("SYS REQ",
   "SHUT DOWN", "CENTRAL TAC"), a blue grid, green friendly contacts and red hostiles.
8. **Hardware.** Gunmetal consoles, rows of guarded red switches, round amber/red/green indicator
   lamps, chunky analogue dials, warm desk lamps.

## How Tuesday applies it

| Galactica principle | Implementation |
|---|---|
| Octagons everywhere | `.frame` in `src/styles.css`: every panel, button, window and printout is an octagon (edge width `--bw`) |
| Hexagons | Checklist pips (`.node`) are hexagons |
| CRT glass | `.screen`: near-black fill, scanlines, centre bloom; glowing text via `--glow` |
| Colour by function | Cyan messages and log, green done/status, amber time/costs/in-progress, red stopped/late/problems |
| Wide caps | Michroma (OFL, Eurostile-Extended-like) for titles, strips, button labels, micro legends. Body copy stays in Barlow for readability |
| Message window | Incidents (`IncidentView`): khaki bezel, title strip (`▲ SOCKS · INC-02`), centred cyan headline, footer strip (`LOGGED 07:12 · WAITING 2 MIN`) |
| Salmon controls | `.btnline` / `.callout` / `.primary` / `.tool` |
| DRADIS | `MorningPlot`: red-magenta frame with angled tabs; your and her activity as green "friendly" bars, incidents as red "hostile" bars, blue grid, LEAVE/BELL lines |
| Hardware | Gunmetal housing (`.terminal`) with indicator lamps: Awake, Groggy, Coffee, Problem (blinking), Late (blinking) |
| Colonial printout | Debrief: octagonal paper after-action report with rubber stamp |

## Deliberately not taken

- Logos, the Colonial eagle, colony symbols, ship art, portraits: proprietary, and the spec says
  no custom graphics.
- The word "DRADIS" and other show jargon on screen. Labels stay plain ("Morning plot", "You",
  "Her"). The spec's copy restraint still applies: the serious interface carries the joke and the
  writing stays ordinary.
- Military parody headings ("Condition One", "Action stations").
- Animated CRT flicker and screen shake. Only the Problem and Late lamps and a stopped task's pip
  blink, and not at all with `prefers-reduced-motion`.

## Departure from the spec palette

Spec §4 listed a charcoal/slate/amber palette. The user later asked for the UI to read as
Galactica, which needs black CRT glass, cyan/green screen text, salmon controls and red-magenta
DRADIS chrome. The spec's restraint survives: red is kept for genuinely urgent states (problems,
lateness, the bell), and copy stays plain.
