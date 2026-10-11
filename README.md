# School Run

A turn-based browser game about getting a child out the door by 07:45, presented like a
military crisis console. Built from `docs/operation_school_run_spec_v0_2.md` (design spec v0.2).

```sh
npm install
npm run dev        # http://localhost:5173  (?seed=1234 replays a specific morning)
npm test           # sim unit tests + UI render smoke test
npm run balance    # bot playtests across 500 seeds, for tuning
npm run build      # static site in dist/ (relative paths; host anywhere)
```

## Layout

| Path | What |
| --- | --- |
| `src/sim/types.ts` | `GameState`, `Action` |
| `src/sim/constants.ts` | Clock values (start, wake, deadline, commute, cutoff) |
| `src/sim/content.ts` | Tasks, incidents + responses, run conditions. **Most tuning happens here.** |
| `src/sim/engine.ts` | Pure, deterministic reducer: `createGame(seed)`, `reduce(state, action)`, `results(state)` |
| `src/ui/` | React panels (status, actions/incident, debrief) and synthesized sounds |
| `scripts/balance.ts` | Bot strategies for comparing openings |
| `docs/` | Original spec, design mockups, reference screenshots |

## How the sim works

- Time advances minute by minute **only** when the player acts; each action runs the clock to the
  next meaningful event (task done, incident, she wakes, deadline).
- One parent activity and one child activity run in parallel. Assigning her a task is free.
- Incidents are rolled once when a child task starts (seeded RNG); the roll fixes *where* in the
  task it fires, so progress before it is kept. Library book fires on bag check, missing shoes
  on "Put on shoes" without found shoes, bathroom on leaving.
- Same seed + same decisions = identical morning.

## Decisions I made beyond the spec

- **Prep is 25% slower once she's awake** ("she keeps needing you"). Without this, waking her at
  06:30 had no cost, since parent prep ran in parallel anyway.
- **Supervised tasks**: teeth and a new *Do her hair* task only progress while you help.
  This adds parent load after 07:00.
- **Help her**: parent joins her task for 1.5× speed.
- **Coffee** is a one-use buffer that cancels one escalation from a risky response.
- Risky responses escalate with ~40% chance (+ groggy, + low mood): mood −1, the task
  takes longer, and 2 extra minutes for both of you.
- **Leaving mid-incident** is allowed; the problem is left unresolved and shows in the debrief.
- Score = 100 − 3/late min − 8/missing objective − 3/extra loose end ± mood. It's shown, but
  the debrief leads with times and the checklist.
- Variation: one morning condition (late bedtime, shoes by the door, no bread, early bird,
  or ordinary) and one tendency (independent, distracted, particular, cheerful), both shown.

## Balance snapshot (`npm run balance`, bots that finish everything)

A careful bot finishes everything around 07:38–07:40 against a 07:45 deadline. Waking at
06:30 saves about 9 minutes but costs mood and leaves more loose ends. Human players should
be under real pressure, but this needs actual playtesting.
