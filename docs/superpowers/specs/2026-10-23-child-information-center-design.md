# Child Information Center: from prototype to game

Date: 2026-10-23. Status: user opted out of further questions ("deciding what I mean is your current job");
everything below marked **(call)** is Claude's decision and open to change.

## Intent

The prototype is a click-through: every requirement is visible at 06:30, crises come one at a time, and
every morning is the same morning. The user wants:

- **Mornings that differ**: special school days ("stuffy party" happened in real life and needed an extra
  decision) and weather.
- **A default day that's still interesting**: meaningful decisions, *inference*, and choosing what to leave
  behind.
- **Over-dramatic seriousness**: lean into the CIC joke. The console is now the **Child Information Center**.
  The game is titled **All of This Has Happened Before** (2026-10-24): the show's line, and the loop of
  the run. The title is the only place it appears; the page header stays C·I·C.
- **Tension**: it should feel like a crisis, not a checklist.
- **Rogue-like continuity**: rounds build on each other; luck/fate points. Runs are **continuous**: no
  game over (user's choice, open to change).
- **Background music** from tracks the user has been making (`*.mp3` in the repo root).

### Anti-goals

- Military parody *copy*. The interface is dramatic; the writing stays plain and domestic.
- Real-time pressure. Time still only moves when you act (spec principle).
- A wall of systems. Every new system must create a decision on a normal Tuesday, or it doesn't ship.

## The core idea: you never quite know what today needs

Every morning has hidden requirements. The player works from **intel** of varying reliability, can spend
minutes confirming it, or bets on their read and moves. Leaving things behind is triage under fog: costs
differ, and some are only revealed in the after-action report.

## Systems

### 1. The day: weather + school event (generated per day, seeded)

- **Weather** **(call)**: `clear`, `rain`, `cold`. Rain needs her coat (and wellies are now *fine*); missing
  it costs. Rain adds 3 minutes to the walk. Cold: getting dressed takes +2 (layers); no coat costs.
- **School event** (~40% of days, never two days running) **(call)**:
  | Event | Requirement (a new objective) | Wrinkle |
  | --- | --- | --- |
  | Stuffy day | Bring a stuffed toy | She must choose one; the favourite may be in the wash |
  | PE day | PE kit in the bag | Kit may be in the laundry |
  | Picture day | Hair done + clean top count double | Spills hurt more |
  | Library day | Library book in the bag | Existing library incident becomes this |
  | Dress-up day | Costume instead of uniform | Dressing longer; missing it is the worst miss |
  | Trip day | Signed permission slip; leave 10 min earlier | Deadline moves |
- Event objectives are **unknown** until revealed. Unrevealed, the checklist shows a `? UNCONFIRMED` row.

### 2. Intel: sources with reliability grades

At 06:30 the actions screen opens on a **morning briefing**: a short list of intel items, each graded with
an admiralty-style reliability code (e.g. `B2`, `D4`). This is the over-dramatic layer; the content is
domestic.

| Source | When | Truth |
| --- | --- | --- |
| Fridge calendar | Always visible | Names the event right ~65% of the time; sometimes stale or wrong |
| Weather forecast | Always visible | Gives a % chance; the real weather is rolled from it |
| Ask her | Once awake, 1 min, both | Right ~70%; "I think it's stuffy day?" |
| School email | Parent action, 3 min | Certain |
| Look outside | Parent action, 1 min | Reveals today's weather |
| Bag check | Existing task | Reveals slips and notes (permission slip, PE note) |
| Evening: read newsletter | Evening card | Reveals tomorrow's event in advance |

Confirmed facts show as `CONFIRMED` (green). Unconfirmed ones are amber with their grade.

### 3. Leaving things behind has weighted, partly hidden costs

Every objective gets a **severity** (minor / moderate / severe) that feeds the score and the after-action
report. Event items are severe if missed *on that day*; ordinary items mostly minor. The report reveals
what the day actually was ("It was stuffy day. She was the only one without one.").

### 4. Tension within a morning

- **Odds as percentages** on risky responses ("Upset: 45%"), from the existing escalation model.
- **Deferred problems compound** **(call)**: each deferred incident escalates after ~8 minutes into a worse
  version (spill left → someone steps in it; socks skipped → blister complaint at the door).
- **Overlapping crises**: a second problem can arrive while one is open (queued, shown as a contact on the
  plot and a count on the problem window).
- **Register countdown**: after the leave time the status bar counts down to the register at 08:00.
- **Music escalates** (below).

### 5. The run: continuous weeks

- Days run Monday → Friday, then a **weekly report**, then Monday again. No game over.
- **Carry-over**: end mood sets tomorrow's start mood (pulled toward Calm); promises made ("the yellow
  dress tomorrow", "we'll look at the bug after school") become tomorrow's expectations; things left at
  home (library book) come back overdue.
- **Late marks**: three in a week → next Monday is a **meeting with the head teacher**: you must be there
  at 07:50 (leave 10 min earlier). A special day, not a fail state.
- **Fate points** (cap 3) **(call)**: +1 for an on-time morning with no severe misses. Spend in a problem
  window: **"This goes your way"** makes a risky response certain to succeed. Spend in the briefing:
  **"Call in a favour"** confirms today's event.
- **Evening refit** between mornings: pick **2 of 4** offered cards (lay out clothes, pack the bag, make
  lunch, find shoes, early bedtime, read the newsletter, wash the favourite stuffy, set the coffee timer).
  Picked cards pre-complete tomorrow's tasks or reveal intel. This is the rogue-like "upgrade" beat.
- **Weekly perk**: the weekly report offers 1 of 3 permanent household upgrades (a shoe rack: shoes start by
  the door half the time; a morning chart: she's a bit more independent; a spare spoon drawer: the spoon
  incident can't happen; a second alarm: 5 extra minutes on Mondays).
- **Persistence**: the run is saved in `localStorage`. `?seed=N` still plays a single standalone morning
  ("Drill") for sharing and testing.

### 6. Music

- Tracks move from the repo root to `public/music/` (copies; originals left in place).
- Three intensity tiers: **calm** (quiet window, evening, report), **active** (she's up), **crisis** (≤10
  minutes to leave, late, or a problem open past the leave time). Crossfade between tiers; a tier picks one
  of its tracks and loops.
- Track → tier mapping is a single constant, chosen by measuring each track's loudness/energy (Claude can't
  listen). Separate **Music** toggle next to Sound; starts on the first click (browser autoplay rules).

### 7. The endgame: waiting makes things fall apart (added 2026-10-24, revised same day)

The user's reference: in BSG and Scattered Hopes, as a mission ends everything goes wrong at once, and
waiting longer means nobody gets out. The morning had no equivalent: waiting only cost minutes.

First version: individual contacts with intercept buttons. The user's verdict: unclear what to do, the
same contact kept coming, and the button seemed to do nothing. "I don't think I should have an interface
for incoming; that's just a warning of the next wave we need to consider." Revised:

- From the **collapse point** (leaving time − 10, minus 2 per put-off problem, minus 3 if mood is low)
  **waves** are announced on the plot and in the status bar **5 minutes before they land**, with their
  size. No buttons: the warning is information for the leave-or-stay decision. The clock stops when a
  wave is announced.
- A landing wave opens one problem window per contact (queued), each with real choices: shoes off,
  coat off, hair undone, juice down the top, hungry again, bag emptied, a wobble, the toilet. Choices
  trade minutes against undoing finished work. Each contact comes at most once per morning.
- Waves grow (1, 2, 3 contacts) and come closer together (6, 4, 2 minutes apart).
- **Leaving is final** (the user: the button "should be more definitive"): no bathroom ambush at the
  door. A wave still inbound "lands on an empty house", and the report says how close it was.
- **Departure sequence** before the report: door shut, what came with you, what stayed behind, the walk,
  arrival. The header clock shows the departure time until the arrival is revealed.
- Arriving 10+ minutes late means **the gate had shut**: a serious miss.

### 8. Kindergarten events (2026-10-24)

She's in kindergarten: no trips or PE. Events are stuffy day, festival day (festival clothes count as
dressed), project due (10-minute leaf collage, or an evening card), paperwork due (a form, found in the
bag), assembly (school shirt preferred, moderate miss; school starts 5 minutes early), picture day and
library day.

### 9. Follow-through: every choice shows a result (2026-10-24)

The user: "if I select an action, I need to see a result, or have more choices." Choices used to resolve
in one click and vanish into the log.

- **Result card** after every choice: what happened, and what it cost (minutes, mood, a stained top,
  a task undone, coffee or fate used). Carry on, or "Next: …" if another problem is queued.
- **Follow-ups**: a risky choice that backfires opens "She is upset now" (hug / give her a minute /
  carry on regardless) instead of silently costing two minutes.
- **Decisions inside jobs**: breakfast asks *what* (cereal 2 / toast 5 / oatmeal 7 / pancakes 12). She
  has a hidden preference; a "last night" clue (C3) appears most mornings; once she's up you can ask her
  (1 min, certain). Made the wrong thing in advance: breakfast opens with an argument. Hair: some days she
  wants braided pigtails (+8 min, a clip that might work, or a promise for Saturday that carries over).
- **Her jokes**: a knock-knock joke you must go through line by line ("Cowgoes." / "Cowgoes who?" /
  "No, cows go MOO!"), a minute each, no result card between lines. "Not now, sweetheart" is always there:
  she shuts herself in her room, and the next job you give her opens a closed door first.
- **Tea** (was coffee; the "keep your cool once" buffer was dropped 2026-10-24, since none of the risky
  calls are about you losing your temper) now does something you can feel: you work 15% faster for 20 minutes, and it still keeps you
  calm once (named on the result card when it does).

### 10. Voice

She's in an American kindergarten: American English on screen (rain boots, principal, tardies, oatmeal,
backpack, °F). 24-hour time stays: it reads as military time, which is the console's joke.

## Future directions (noted, not built)

- **Something to spend and hoard**, like fuel and supply in Scattered Hopes, but abstract. Candidates:
  *patience* (yours; spent on negotiations and waiting out sulks, restored by coffee and good mornings),
  *goodwill* (hers; banked by listening to jokes and keeping promises, spent when you need her to just do
  the thing), *clean clothes* or *groceries* over a week (laundry and shopping as evening choices). Fate
  points are the seed of this. The user asked to keep it in mind for how it might weave through, not to
  build it yet.

## Build order

1. **Run + day model** (engine): `RunState`, day generation, weather, events, event objectives, intel,
   severities, carry-over, late marks, fate, evening cards, weekly perk. Pure and seeded; tests.
2. **UI for the run**: briefing panel, unconfirmed checklist rows, week strip in the header, fate lamp,
   evening screen, weekly report, Drill mode.
3. **Tension**: odds %, compounding deferrals, overlapping crises, register countdown.
4. **Music**.
5. **Balance**: extend `npm run balance` to play full weeks; tune so a careful bot is on time ~70–80% and
   misses an event item ~1 day in 4 without confirming intel.

Each step keeps the game playable and is committed separately.

## Left to the builder

Exact copy, durations and probabilities (tune with the bots); visual details within
`docs/ui-reference-notes.md`; which incidents get compounding versions first.
