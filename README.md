# All of This Has Happened Before

The console is the C·I·C, the Child Information Center.
(Working titles: *School Run*, *Tuesday*, *C·I·C*.)

**Play:** https://shredinger137.github.io/all-of-this-has-happened-before/

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

- **06:45, before she wakes.** Read the briefing on the Intel screen: the forecast, the fridge calendar
  (graded C3: usually right), anything you prepared last night. Prep quietly, or wake her early.
- **Confirm or bet.** The school email (3 min) is certain. Looking outside (1 min) shows the weather now,
  which doesn't always settle it; look again later. Asking her is free-ish and confidently unreliable (E5).
  Messaging another parent costs a **fate point**; the class group chat sometimes settles it for free.
- **She's up.** You do one thing, she does one thing. Coat and shoes wait until she's dressed. Problems
  interrupt; work calls, the group chat and the doorbell interrupt *you*. The bathroom and hunger keep
  their own clock. Put a problem off for too long and it comes back worse. Every choice shows its result;
  some lead to more choices (she's upset now; the door is shut).
- **Small decisions.** Breakfast: what will you make? She has a preference today and you only have a clue
  (or ask her, once she's up). Hair: down, a ponytail, pigtails or braids, her choice, different most days.
  Jokes: you hear the whole thing. Her mood counts at every step and shows in what she does.
- **The endgame.** From about fifteen minutes before leaving time, waves of crises. Each wave is
  announced on the plot and in the status bar ("2 crises incoming · 5 min") five minutes
  before it lands. When it lands, each crisis is a problem that can undo finished work: shoes off,
  juice down the clean top, the bag on the hall floor, the toilet. Waves grow (1, 2, 3) and come closer
  together. You can't stop them, only finish up or get out first. Arrive 10+ minutes late and she signs
  in tardy. The drop-off is always a good one.
- **Leave.** The status bar always shows what leaving now means. Leaving is final: the door shuts,
  the drive plays out, then the after-action report. A wave still inbound lands on an empty house. What you leave behind is weighted:
  missing a stuffy on stuffy day is serious; a packed lunch is not.
- **Evening.** Pick two preparations for tomorrow. Keep your promises.
- **Friday.** The week report. Three tardies means a word with the principal on Monday.
  Pick one permanent household improvement. No game over: the weeks just keep coming.

## Layout

| Path | What |
| --- | --- |
| `src/sim/types.ts` | `GameState`, `Day`, `Intel`, `Action` |
| `src/sim/constants.ts` | Clock values (start, wake, deadline, commute, cutoff) |
| `src/sim/content.ts` | Tasks, incidents + responses, school events, intel odds, perks. **Most tuning happens here.** |
| `src/sim/engine.ts` | Pure, deterministic morning: `createGame(seed, setup)`, `reduce`, `requirements`, `results` |
| `src/sim/run.ts` | The continuous run: weeks, evening cards, fate, carry-over, weekly perks |
| `src/ui/` | `GameScreen` (one morning), `RunScreen` (evening, week report), Intel/Checklist/Log/Action panels, `Intro`, `Dock` status bar, `music.ts` (tiered background music), `sound.ts` |
| `public/music/` | The background tracks, generated for this game with Suno and Gemini |
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
- **Supervised tasks**: hair only progresses while you help; teeth and face are hers to do. **Help her**: 1.5× speed.
- **Tea**: 15% faster for 20 minutes (two minutes to make if you filled the kettle the night before). **Fate** makes one risky choice certain.
- Risky responses show their odds ("Upset 45%"); escalation costs mood, time, and 2 minutes for both.
- **Leaving mid-incident** is allowed; the problem goes unresolved. The toilet is no longer an ambush at
  the door: it arrives with a wave, announced.
- **Score** = 100 − 4/late min − misses (minor 5, moderate 10, serious 20) ± mood. Shown, but the report
  leads with times, what the day really was, and what got left behind.
- **Fate**: +1 for an on-time morning with no serious misses, max 3. **Mood** carries over, pulled
  toward calm. Broken promises cost mood the next morning.

## Balance (`npx vite-node scripts/tune.ts`)

The point, not fairness: this is a game jam entry, and a good player should usually *not quite* make it.
She gets more distractible the longer she behaves and the closer it gets to 07:45; the bathroom and
hunger come due on their own. `scripts/tune.ts` plays 1,500 single mornings and 100 four-week runs per
policy (`--only strong`, `--severe`, `--slices`, `--trace <seed>`); `npm run balance` is the older bot set.

| Policy | median spare | on time | close call (0–3) | >5 spare | nothing left behind | serious misses |
| --- | --- | --- | --- | --- | --- | --- |
| strong, single mornings | −1 min | 41% | 38% | 0% | 0% | 0.10 / morning |
| strong, full weeks | −1 min | 40% | 34% | 1% | 0% | 0.18 / morning |
| mediocre, full weeks | −9 min | 0% | 0% | 0% | 1% | 0.59 / morning |

Rain days are hardest (on time ~21%).
