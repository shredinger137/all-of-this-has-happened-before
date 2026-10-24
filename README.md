# C·I·C: Child Information Center

(Working titles: *School Run*, *Tuesday*.)

A turn-based browser game about getting a child out the door by 07:45, presented as a Colonial
crisis console. You never quite know what today needs: the intel is graded, sometimes wrong, and
confirming it costs minutes. Mornings roll on, Monday to Friday, week after week.

Built from `docs/operation_school_run_spec_v0_2.md` (spec v0.2), then extended per
`docs/superpowers/specs/2026-10-23-child-information-center-design.md`.

```sh
npm install
npm run dev        # http://localhost:5173  (the run is saved in the browser; ?seed=1234 plays a one-off drill)
npm test           # sim + run unit tests, UI render smoke tests (random mornings and whole weeks)
npm run balance    # bot playtests across 500 seeds, for tuning
npm run build      # static site in dist/ (relative paths; host anywhere)
```

## How to play

- **06:30, before she wakes.** Read the briefing on the Intel screen: the forecast, the fridge calendar
  (graded C3: usually right), anything you prepared last night. Prep quietly, or wake her early.
- **Confirm or bet.** The school email (3 min) and looking outside (1 min) are certain. Asking her is
  free-ish and confidently unreliable (E5). Messaging another parent costs a **fate point**.
- **She's up.** You do one thing, she does one thing. Problems interrupt; the phone and doorbell
  interrupt *you*. Put a problem off for too long and it comes back worse.
- **The endgame.** From about ten minutes before leaving time, waves of contacts. Each wave is
  announced on the plot and in the status bar ("Contacts inbound: 2 · landing 07:43") five minutes
  before it lands. When it lands, each contact is a problem that can undo finished work: shoes off,
  juice down the clean top, the bag on the hall floor, the toilet. Waves grow (1, 2, 3) and come closer
  together. You can't stop them, only finish up or get out first. Arrive 10+ minutes late and the
  gate has shut.
- **Leave.** The status bar always shows what leaving now means. Leaving is final: the door shuts,
  the walk plays out, then the after-action report. A wave still inbound lands on an empty house. What you leave behind is weighted:
  missing a stuffy on stuffy day is serious; a packed lunch is not.
- **Evening.** Pick two preparations for tomorrow. Keep your promises.
- **Friday.** The week report. Three late marks means a word with the head teacher on Monday.
  Pick one permanent household improvement. No game over: the weeks just keep coming.

## Layout

| Path | What |
| --- | --- |
| `src/sim/types.ts` | `GameState`, `Day`, `Intel`, `Action` |
| `src/sim/constants.ts` | Clock values (start, wake, deadline, commute, cutoff) |
| `src/sim/content.ts` | Tasks, incidents + responses, school events, intel odds, perks. **Most tuning happens here.** |
| `src/sim/engine.ts` | Pure, deterministic morning: `createGame(seed, setup)`, `reduce`, `requirements`, `results` |
| `src/sim/run.ts` | The continuous run: weeks, evening cards, fate, carry-over, weekly perks |
| `src/ui/` | `GameScreen` (one morning), `RunScreen` (evening, week report), Intel/Status/Log/Action panels, `Dock` status bar, `music.ts` (tiered background music), `sound.ts` |
| `public/music/` | The background tracks |
| `scripts/balance.ts` | Bot strategies, including calendar-trusting vs email-reading |
| `docs/` | Spec, design doc, reference notes (`ui-reference-notes.md`: why it reads as Galactica) |

## How the sim works

- Time advances minute by minute **only** when the player acts; each action runs the clock to the
  next meaningful event (task done, incident, she wakes, deadline).
- One parent activity and one child activity run in parallel. Assigning her a task is free.
- Each morning rolls weather (forecast %, then the real thing) and, 40% of the time, a kindergarten
  event: stuffy day, festival day, project due, paperwork due, assembly (school shirt, starts at 07:55),
  picture day, library day. Event tasks are only offered when intel points at
  them; an unconfirmed event can still cost you a serious miss.
- Incidents are rolled once when a task starts (seeded RNG); the roll fixes *where* in the task it
  fires, so progress before it is kept. Deferred incidents return worse after 8 minutes.
- Same seed + same decisions = identical morning; a run derives each morning's seed from its own.

## Decisions beyond the spec

- **Prep is 25% slower once she's awake** ("she keeps needing you").
- **Supervised tasks**: teeth and hair only progress while you help. **Help her**: 1.5× speed.
- **Coffee** cancels one escalation from a risky response. **Fate** makes one risky choice certain.
- Risky responses show their odds ("Upset 45%"); escalation costs mood, time, and 2 minutes for both.
- **Leaving mid-incident** is allowed; the problem goes unresolved. The toilet is no longer an ambush at
  the door: it arrives with a wave, announced.
- **Score** = 100 − 4/late min − misses (minor 5, moderate 10, serious 20) ± mood. Shown, but the report
  leads with times, what the day really was, and what got left behind.
- **Fate**: +1 for an on-time morning with no serious misses, max 3. **Mood** carries over, pulled
  toward calm. Broken promises cost mood the next morning.

## Balance snapshot (`npm run balance`)

Careful bots are on time 61–85% of mornings; hasty bots leave earlier and lose more. Trusting the
calendar misses the day's event about 1 time in 6; reading the email first nearly never does. Trusting the calendar misses the day's event about
1 time in 6; reading the email first nearly never does, but costs ~10 points of on-time rate.
Hasty bots are on time more often and leave more behind. Needs human playtesting.
