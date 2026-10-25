import type {
  HairStyle,
  Breakfast,
  ChildTendency,
  EventId,
  Flag,
  GameState,
  IncidentId,
  MorningCondition,
  OpenIncident,
  Owner,
  PerkId,
  TaskId,
} from './types';

const done = (s: GameState, t: TaskId) => s.objectives[t].status === 'done';
const has = (s: GameState, f: Flag) => s.flags.includes(f);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskDef = {
  id: TaskId;
  owner: Owner;
  label: string; // checklist wording
  action: string; // button wording
  doing: string; // present-tense activity
  hint: (s: GameState) => string;
  scored: boolean; // counts toward readiness in the debrief
  missing: string; // how it reads in "Left behind"
  duration: (s: GameState) => number; // base minutes, before incident extras
  supervised?: boolean; // child task that only progresses while you help
  unavailable?: (s: GameState) => string | undefined;
  intel?: boolean; // confirms something rather than getting anyone ready
};

export const TASKS: Record<TaskId, TaskDef> = {
  parentReady: {
    id: 'parentReady',
    owner: 'parent',
    label: 'You are ready',
    action: 'Get yourself ready',
    doing: 'Getting ready',
    hint: () => "You'll be ready to leave",
    scored: true,
    missing: 'Your own hair',
    duration: () => 15,
  },
  lunch: {
    id: 'lunch',
    owner: 'parent',
    label: 'Lunch packed',
    action: 'Pack lunch',
    doing: 'Packing lunch',
    hint: (s) => (s.morningCondition === 'noBread' ? 'No bread. Crackers will take longer' : 'One less thing to handle later'),
    scored: true,
    missing: 'Packed lunch',
    duration: (s) => (s.morningCondition === 'noBread' ? 12 : 8),
  },
  breakfastMade: {
    id: 'breakfastMade',
    owner: 'parent',
    label: 'Breakfast ready',
    action: 'Make breakfast',
    doing: 'Making breakfast',
    hint: (s) => (s.breakfastChoice ? `${BREAKFASTS[s.breakfastChoice].name}. If it's what she wants` : 'Pick what to make. If she wants something else, there will be words'),
    scored: false,
    missing: 'A cooked breakfast',
    duration: (s) => BREAKFASTS[s.breakfastChoice ?? 'toast'].minutes,
    unavailable: (s) =>
      s.objectives.breakfastEaten.progress > 0 || done(s, 'breakfastEaten') ? "She's already eating" : undefined,
  },
  shoesFound: {
    id: 'shoesFound',
    owner: 'parent',
    label: 'Shoes found',
    action: 'Find her shoes',
    doing: 'Looking for shoes',
    hint: () => 'Check the usual places',
    scored: false,
    missing: 'Her shoes',
    duration: () => 5,
  },
  clothesOut: {
    id: 'clothesOut',
    owner: 'parent',
    label: 'Clothes laid out',
    action: 'Set out her clothes',
    doing: 'Laying out clothes',
    hint: () => 'Dressing goes faster, with fewer arguments',
    scored: false,
    missing: 'Clothes laid out',
    duration: () => 4,
    unavailable: (s) =>
      s.objectives.dressed.progress > 0 || done(s, 'dressed') ? "She's already getting dressed" : undefined,
  },
  tea: {
    id: 'tea',
    owner: 'parent',
    label: 'Tea',
    action: 'Have a cup of tea',
    doing: 'Drinking tea',
    hint: (s) => (s.kettleReady ? 'Kettle filled, mug out. You work faster for 20 minutes' : 'You work faster for 20 minutes'),
    scored: false,
    missing: 'Tea',
    duration: (s) => (s.kettleReady ? 2 : 5),
  },
  bagChecked: {
    id: 'bagChecked',
    owner: 'parent',
    label: 'Things packed',
    action: 'Pack her things',
    doing: 'Packing her things',
    hint: () => 'Folder, water bottle, snack. Any notes turn up here',
    scored: true,
    missing: 'Her things (folder, water bottle)',
    duration: () => 6,
  },
  breakfastEaten: {
    id: 'breakfastEaten',
    owner: 'child',
    label: 'Breakfast eaten',
    action: 'Eat breakfast',
    doing: 'Eating breakfast',
    hint: (s) => (done(s, 'breakfastMade') ? 'Breakfast is ready' : 'Nothing made yet. Cereal will be slower'),
    scored: true,
    missing: 'Breakfast',
    duration: (s) => (done(s, 'breakfastMade') ? 20 : 24),
  },
  dressed: {
    id: 'dressed',
    owner: 'child',
    label: 'Dressed',
    action: 'Get dressed',
    doing: 'Getting dressed',
    hint: (s) => (done(s, 'clothesOut') ? 'Clothes are laid out' : "She'll pick her own clothes"),
    scored: true,
    missing: 'Getting dressed',
    duration: (s) => (done(s, 'clothesOut') ? 12 : 16),
  },
  teeth: {
    id: 'teeth',
    owner: 'child',
    label: 'Teeth brushed',
    action: 'Brush teeth',
    doing: 'Brushing teeth',
    hint: () => 'She can do it herself',
    scored: true,
    missing: 'Brushed teeth',
    duration: () => 4,
  },
  hair: {
    id: 'hair',
    owner: 'child',
    label: 'Hair brushed',
    action: 'Brush her hair',
    doing: 'Brushing her hair',
    hint: () => 'Brushed, at least. She may have other ideas',
    scored: true,
    missing: 'Brushed hair',
    duration: () => 4,
    supervised: true,
  },
  face: {
    id: 'face',
    owner: 'child',
    label: 'Face clean',
    action: 'Wash her face',
    doing: 'Washing her face',
    hint: (s) => (done(s, 'breakfastEaten') ? 'Breakfast is still on it' : 'She can do it herself'),
    scored: true,
    missing: 'A clean face',
    duration: () => 2,
  },
  carStuffy: {
    id: 'carStuffy',
    owner: 'child',
    label: 'Car stuffy chosen',
    action: 'Pick a stuffy for the car',
    doing: 'Choosing a car stuffy',
    hint: () => 'She insists. It has to be the right one',
    scored: false,
    missing: 'A stuffy for the car',
    duration: () => 3,
  },
  shoesOn: {
    id: 'shoesOn',
    owner: 'child',
    label: 'Shoes on',
    action: 'Put on shoes',
    doing: 'Putting on shoes',
    hint: (s) => (has(s, 'wellies') ? 'Rain boots today' : done(s, 'shoesFound') ? 'Shoes are by the door' : "You haven't seen her shoes yet"),
    scored: true,
    missing: 'Shoes',
    duration: (s) => (has(s, 'noSocks') ? 9 : 7),
  },
  coat: {
    id: 'coat',
    owner: 'child',
    label: 'Coat on',
    action: 'Put on her coat',
    doing: 'Putting on her coat',
    // On a cold day it's just the coat. Otherwise it's for rain: raincoat and rain boots,
    // and if it stays dry she's in rain boots all day.
    hint: (s) =>
      s.day.weather === 'cold'
        ? "It's cold out"
        : s.day.weatherKnown
          ? 'Raincoat and rain boots. It is raining'
          : `Raincoat and rain boots. ${Math.round(s.day.rainChance * 100)}% rain; if it stays dry, she wears rain boots all day`,
    scored: false,
    missing: 'Her coat',
    duration: (s) => (s.day.weather === 'cold' ? 3 : RAIN_GEAR_MINUTES) - (s.perks.includes('hooks') ? 2 : 0),
  },
  stuffy: {
    id: 'stuffy',
    owner: 'child',
    label: 'Stuffy chosen',
    action: 'Choose a stuffy',
    doing: 'Choosing a stuffy',
    hint: (s) => (s.day.eventKnown ? 'It is stuffy day' : 'In case it is stuffy day'),
    scored: false,
    missing: 'A stuffy',
    duration: () => 4,
  },
  festivalClothes: {
    id: 'festivalClothes',
    owner: 'child',
    label: 'Festival clothes on',
    action: 'Put on her festival clothes',
    doing: 'Getting into festival clothes',
    hint: (s) => (s.day.eventKnown ? 'Festival day. Counts as dressed' : 'In case it is festival day. Counts as dressed'),
    scored: false,
    missing: 'Festival clothes',
    duration: () => 9,
  },
  project: {
    id: 'project',
    owner: 'parent',
    label: 'Project finished',
    action: 'Finish her project',
    doing: 'Gluing leaves to card',
    hint: (s) => (s.day.eventKnown ? 'Due today. The leaf collage' : 'In case the leaf collage is due'),
    scored: false,
    missing: 'Her project',
    duration: () => 10,
  },
  paperwork: {
    id: 'paperwork',
    owner: 'parent',
    label: 'Form filled in',
    action: 'Fill in the form',
    doing: 'Filling in the form',
    hint: (s) => (has(s, 'formFound') ? 'It is in her bag' : 'Have to find it first'),
    scored: false,
    missing: 'The form',
    duration: (s) => (has(s, 'formFound') ? 3 : 6),
  },
  email: {
    id: 'email',
    owner: 'parent',
    label: 'School email read',
    action: 'Read the school email',
    doing: 'Reading the school email',
    hint: () => "Confirms what's on today",
    scored: false,
    missing: 'School email',
    duration: () => 3,
    intel: true,
  },
  window: {
    id: 'window',
    owner: 'parent',
    label: 'Looked outside',
    action: 'Look outside',
    doing: 'Looking outside',
    hint: () => 'What it is doing now. Not always what it will do',
    scored: false,
    missing: 'A look outside',
    duration: () => 1,
    intel: true,
  },
};

export const PARENT_TASKS: TaskId[] = [
  'lunch',
  'breakfastMade',
  'parentReady',
  'shoesFound',
  'clothesOut',
  'tea',
  'bagChecked',
  'project',
  'paperwork',
];
export const INTEL_TASKS: TaskId[] = ['email', 'window'];
export const CHILD_TASKS: TaskId[] = ['breakfastEaten', 'dressed', 'teeth', 'face', 'hair', 'shoesOn', 'coat', 'carStuffy', 'stuffy', 'festivalClothes'];
/** Child tasks every morning needs; the rest depend on the day. */
export const CORE_CHILD_TASKS: TaskId[] = ['breakfastEaten', 'dressed', 'teeth', 'face', 'hair', 'shoesOn'];
// Exactly the scored tasks, so the checklist count matches the debrief.
export const CHECKLIST: TaskId[] = [
  'parentReady',
  'lunch',
  'bagChecked',
  'breakfastEaten',
  'dressed',
  'teeth',
  'face',
  'hair',
  'shoesOn',
];

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export type ResolveCtx = {
  s: GameState;
  incident: OpenIncident;
  roll: () => number;
  log: (text: string, notable?: boolean) => void;
  mood: (delta: number) => void;
  flag: (f: Flag) => void;
  /** Risky responses: may upset her (mood -1, task takes longer, extra minutes for both). */
  escalate: (opts?: { base?: number; extra?: number }) => boolean;
  /** Add minutes to the blocked task. */
  addExtra: (minutes: number) => void;
  completeTask: (task: TaskId) => void;
  skipTask: (task: TaskId) => void;
  /** Leave the incident open with a new detail line. */
  keepOpen: (note: string) => void;
  /** More minutes than planned, for you (and her, if the response takes you both). */
  spend: (minutes: number) => void;
  /** Something finished comes undone and goes back on the list. */
  reopen: (task: TaskId) => void;
  /** Not now: it goes on the pile and comes back, worse, if left too long. */
  later: () => void;
  /** Someone else has said what today is: it goes in the intel, graded, and the day is settled. */
  learnEvent: (source: string) => void;
  /** The conversation isn't over: another problem follows straight on from this one. */
  followUp: (id: IncidentId) => void;
  unflag: (f: Flag) => void;
};

export type ResponseTag = { text: string; tone: 'good' | 'bad' | 'neutral' };

export type ResponseDef = {
  id: string;
  label: string;
  hint: string;
  minutes: number;
  minutesFor?: (s: GameState) => number; // when it depends on the morning
  labelFor?: (s: GameState, inc: OpenIncident) => string; // when the words depend on where you are
  both?: boolean; // requires parent and child together
  risky?: boolean;
  riskBase?: number; // escalation base chance passed to escalate(); default 0.4
  tags?: ResponseTag[]; // likely outcomes, shown before choosing
  available?: (s: GameState, inc: OpenIncident) => boolean;
  apply: (ctx: ResolveCtx) => void;
};

export type IncidentDef = {
  id: IncidentId;
  title: string; // short label for logs and deferred list
  context: string; // "While getting dressed"
  headline: (s: GameState) => string;
  detail?: (s: GameState) => string | undefined; // a second line, only when it adds something
  deferrable: boolean;
  tasks?: TaskId[]; // tasks this can interrupt (rolled when the task starts)
  chance?: (s: GameState) => number; // base chance before global modifiers
  external?: boolean; // the outside world, not her: tiredness and mood don't change the odds
  endgame?: (s: GameState) => boolean; // a contact a wave can bring, if it has something to undo
  worse?: string; // what it turns into if put off too long
  speaks?: boolean; // a conversation: her current line is the headline
  responses: ResponseDef[];
};

const picky = (s: GameState) => (s.childTendency === 'picky' ? 0.2 : 0);

export const INCIDENTS: Record<IncidentId, IncidentDef> = {
  spoon: {
    id: 'spoon',
    title: 'Wrong spoon',
    context: 'While eating breakfast',
    headline: () => 'She wants her spoon, not this one.',
    deferrable: false,
    tasks: ['breakfastEaten'],
    // Only breakfasts eaten with a spoon.
    chance: (s) => (s.perks.includes('spoons') || !['cereal', 'oatmeal'].includes(eating(s)) ? 0 : 0.3 + picky(s)),
    responses: [
      {
        id: 'hers',
        label: 'Get her spoon',
        hint: 'Simple, if it is clean',
        minutes: 2,
        tags: [{ text: 'Breakfast resumes', tone: 'neutral' }],
        apply: (c) => {
          if (c.roll() < 0.7) c.log('She went back to eating with her spoon.', true);
          else {
            c.addExtra(2);
            c.log('Her spoon was in the dishwasher. You washed it.', true);
          }
        },
      },
      {
        id: 'choices',
        label: 'Offer her two choices',
        hint: 'Takes a moment; she may cheer up',
        minutes: 3,
        tags: [{ text: 'Mood ↑ likely', tone: 'good' }],
        both: true,
        apply: (c) => {
          if (c.roll() < 0.7) {
            c.mood(1);
            c.log('She picked one and was happy with it.', true);
          } else c.log('She picked one and kept eating.', true);
        },
      },
      {
        id: 'insist',
        label: 'Tell her to use this one',
        hint: 'Quick, but might upset her',
        minutes: 1,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 3 })) c.log('She used the spoon she had.', true);
        },
      },
      {
        id: 'abandon',
        label: 'Leave breakfast unfinished',
        hint: "Saves time; she'll be hungry later",
        minutes: 0,
        tags: [{ text: 'No breakfast', tone: 'bad' }],
        apply: (c) => {
          c.skipTask('breakfastEaten');
          c.flag('hungry');
          c.log('She stopped eating.', true);
        },
      },
    ],
  },

  spill: {
    id: 'spill',
    title: 'Spilled breakfast',
    context: 'While eating breakfast',
    headline: (s) => (done(s, 'dressed') ? SPILLS[eating(s)].top : SPILLS[eating(s)].floor),
    deferrable: false,
    tasks: ['breakfastEaten'],
    chance: () => 0.2,
    responses: [
      {
        id: 'together',
        label: 'Clean up together',
        hint: 'Reliable, if slow',
        minutes: 5,
        tags: [{ text: 'Fresh start', tone: 'neutral' }],
        both: true,
        apply: (c) => {
          c.addExtra(2);
          c.log(done(c.s, 'dressed') ? 'Cleaned up and changed her top.' : `Cleaned up and ${SPILLS[eating(c.s)].again}.`, true);
        },
      },
      {
        id: 'wipe',
        label: 'Wipe it up yourself',
        hint: 'Faster; the top stays as it is',
        minutes: 2,
        tags: [{ text: 'Top may stay stained', tone: 'bad' }],
        apply: (c) => {
          c.addExtra(2);
          if (done(c.s, 'dressed')) c.flag('stainedShirt');
          c.log('Wiped up the worst of it.', true);
        },
      },
      {
        id: 'later',
        label: 'Leave it for later',
        hint: 'Free now; the kitchen will be waiting',
        minutes: 0,
        tags: [{ text: 'Messy kitchen', tone: 'bad' }],
        apply: (c) => {
          c.addExtra(2);
          c.flag('messyKitchen');
          if (done(c.s, 'dressed')) c.flag('stainedShirt');
          c.log('The spill was left for later.', true);
        },
      },
    ],
  },

  socks: {
    id: 'socks',
    title: 'Socks',
    context: 'While getting dressed',
    worse: "She still won't wear the socks, and now she's sitting on the stairs.",
    headline: () => "She doesn't want those socks.",
    detail: () => 'She says they feel wrong.',
    deferrable: true,
    tasks: ['dressed'],
    chance: (s) => (done(s, 'clothesOut') ? 0.2 : 0.4) + picky(s),
    responses: [
      {
        id: 'choose',
        label: 'Let her choose another pair',
        hint: 'Slow, but likely to go well',
        minutes: 4,
        tags: [{ text: 'Mood ↑ likely', tone: 'good' }],
        both: true,
        apply: (c) => {
          if (c.roll() < 0.7) c.mood(1);
          c.log('She picked another pair.', true);
        },
      },
      {
        id: 'soft',
        label: 'Find the soft socks',
        hint: 'Usually works, if you can find them',
        minutes: 3,
        tags: [{ text: 'Better if clothes laid out', tone: 'neutral' }],
        apply: (c) => {
          if (done(c.s, 'clothesOut') || c.roll() < 0.6) c.log('She took the soft socks.', true);
          else {
            c.addExtra(3);
            c.log('The soft socks were in the wash. She wore these in the end.', true);
          }
        },
      },
      {
        id: 'insist',
        label: 'Insist on these socks',
        hint: 'Quick, but might make things worse',
        minutes: 1,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 3 })) c.log('She wore them, complaining.', true);
        },
      },
      {
        id: 'skip',
        label: 'Skip socks for now',
        hint: 'Leave the problem for later; shoes will be harder',
        minutes: 0,
        tags: [{ text: 'No socks', tone: 'bad' }, { text: 'Shoes slower', tone: 'bad' }],
        apply: (c) => {
          c.flag('noSocks');
          c.log('No socks for now.', true);
        },
      },
    ],
  },

  outfit: {
    id: 'outfit',
    title: 'Outfit',
    context: 'While getting dressed',
    worse: 'She has found the yellow dress herself. It is still wet.',
    headline: () => "She's changed her mind about the outfit.",
    detail: () => 'She wants the yellow dress. It is in the laundry basket.',
    deferrable: true,
    tasks: ['dressed'],
    chance: (s) => (done(s, 'clothesOut') ? 0.15 : 0.25),
    responses: [
      {
        id: 'change',
        label: 'Let her change',
        hint: 'Slow; she will be happy',
        minutes: 3,
        tags: [{ text: 'Mood ↑', tone: 'good' }, { text: 'Dressing longer', tone: 'bad' }],
        both: true,
        apply: (c) => {
          c.addExtra(3);
          c.mood(1);
          c.log('She changed into the yellow dress.', true);
        },
      },
      {
        id: 'promise',
        label: 'Promise the dress tomorrow',
        hint: 'Often works',
        minutes: 2,
        tags: [{ text: 'Small chance of upset', tone: 'bad' }],
        riskBase: 0.2,
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 3 })) {
            c.flag('promisedDress');
            c.log('Yellow dress promised for tomorrow.', true);
          }
        },
      },
      {
        id: 'insist',
        label: 'Tell her there is no time',
        hint: 'Quick, but might make things worse',
        minutes: 1,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 4 })) c.log('Outfit stayed as it was.', true);
        },
      },
    ],
  },

  cats: {
    id: 'cats',
    title: 'The cats',
    context: 'Distracted',
    headline: () => 'She is playing with the cats.',
    deferrable: false,
    tasks: ['breakfastEaten', 'dressed', 'teeth', 'face', 'hair', 'shoesOn', 'coat'],
    chance: (s) => (s.childTendency === 'dawdler' ? 0.3 : 0.15),
    endgame: () => true,
    responses: [
      {
        id: 'together',
        label: 'Two minutes of cats, together',
        hint: 'Then back to it',
        minutes: 2,
        both: true,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.mood(1);
          c.log('Two minutes with the cats, then back to it.', true);
        },
      },
      {
        id: 'shoo',
        label: 'Stop her and get her back to it',
        hint: 'Quick. She may not take it well',
        minutes: 1,
        risky: true,
        riskBase: 0.4,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 1 })) c.log('She left the cats and went back to it.', true);
        },
      },
      {
        id: 'let',
        label: 'Let her play',
        hint: 'Free for you. Her job waits',
        minutes: 0,
        tags: [{ text: 'Her task slows', tone: 'bad' }],
        apply: (c) => {
          c.addExtra(4);
          c.log('She played with the cats for a while.', true);
        },
      },
    ],
  },

  bug: {
    id: 'bug',
    title: 'A bug',
    context: 'Distracted',
    headline: () => "She's found a fascinating bug.",
    detail: () => 'She wants you to come and see it.',
    deferrable: false,
    tasks: ['breakfastEaten', 'dressed', 'teeth', 'hair', 'shoesOn'],
    chance: (s) => (s.childTendency === 'dawdler' ? 0.3 : 0.1),
    responses: [
      {
        id: 'look',
        label: 'Look at it together',
        hint: "Costs a few minutes; she'll be pleased",
        minutes: 3,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        both: true,
        apply: (c) => {
          c.mood(1);
          c.log('You looked at the bug together.', true);
        },
      },
      {
        id: 'later',
        label: 'Promise to look after school',
        hint: 'Quick; she may not let it go',
        minutes: 1,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 2 })) {
            c.flag('promisedBug');
            c.log('You promised to look at it after school.', true);
          }
        },
      },
      {
        id: 'ignore',
        label: 'Let her watch it',
        hint: "Free for you; she'll be a while",
        minutes: 0,
        tags: [{ text: 'Her task slows', tone: 'bad' }],
        apply: (c) => {
          c.addExtra(4);
          c.log('She watched the bug for a while.', true);
        },
      },
    ],
  },

  shoesMissing: {
    id: 'shoesMissing',
    title: 'Missing shoes',
    context: 'Putting on shoes',
    worse: 'Still no shoes.',
    headline: () => "Her shoes aren't by the door.",
    deferrable: true,
    responses: [
      {
        id: 'together',
        label: 'Look for them together',
        hint: 'Reliable, takes a while',
        minutes: 6,
        tags: [{ text: 'Shoes found', tone: 'neutral' }],
        both: true,
        apply: (c) => {
          c.completeTask('shoesFound');
          c.log('Shoes found behind the sofa.', true);
        },
      },
      {
        id: 'wellies',
        label: 'She can wear her rain boots',
        hint: 'Quick; she may object',
        minutes: 1,
        tags: [{ text: 'Rain boots', tone: 'bad' }],
        riskBase: 0.3,
        risky: true,
        apply: (c) => {
          c.flag('wellies');
          c.completeTask('shoesFound');
          if (!c.escalate({ extra: 2 })) {
            const d = c.s.day;
            c.log(
              d.weatherKnown && d.weather === 'rain' ? "Rain boots on. It's raining, so that works." : d.weatherKnown ? 'Rain boots on, on a dry day.' : 'Rain boots on.',
              true,
            );
          }
        },
      },
    ],
  },

  library: {
    id: 'library',
    title: 'Library book',
    context: 'Checking her backpack',
    worse: 'She has remembered the book. She is upset that you forgot.',
    headline: () => "The library book isn't in her bag.",
    detail: (s) => (s.day.event === 'library' && !s.day.eventKnown ? "If it's library day, it's due back." : "It's due back today."),
    deferrable: true,
    responses: [
      {
        id: 'ask',
        label: 'Ask her where it is',
        hint: 'Quick, if she remembers',
        minutes: 2,
        tags: [{ text: '50/50', tone: 'neutral' }],
        both: true,
        available: (s) => s.childAwake && !has(s, 'askedBook'),
        apply: (c) => {
          c.flag('askedBook');
          if (c.roll() < 0.5) {
            c.flag('bookFound');
            c.log('She remembered: under her bed.', true);
          } else c.keepOpen("She doesn't remember where it is.");
        },
      },
      {
        id: 'search',
        label: 'Search the house',
        hint: 'Takes a while; might find it',
        minutes: 6,
        tags: [{ text: 'Better odds', tone: 'neutral' }],
        available: (s) => !has(s, 'searchedBook'),
        apply: (c) => {
          c.flag('searchedBook');
          if (c.roll() < 0.6) {
            c.flag('bookFound');
            c.log('Library book found in the car.', true);
          } else c.keepOpen('Not in any of the usual places.');
        },
      },
      {
        id: 'leave',
        label: 'Leave it',
        hint: 'It can go back tomorrow',
        minutes: 0,
        tags: [{ text: 'Book stays home', tone: 'bad' }],
        apply: (c) => {
          c.flag('bookLeft');
          c.log('Library book not found. It can go back tomorrow.', true);
        },
      },
    ],
  },

  bathroom: {
    id: 'bathroom',
    title: 'Bathroom',
    context: 'Crisis',
    headline: () => 'She has to go to the bathroom.',
    deferrable: false,
    responses: [
      {
        id: 'wait',
        label: 'Wait for her',
        hint: 'Reliable',
        minutes: 4,
        tags: [{ text: 'Reliable', tone: 'neutral' }],
        apply: (c) => c.log('Bathroom trip.', true),
      },
      {
        id: 'hurry',
        label: 'Ask her to be quick',
        hint: 'Might save time; might not',
        minutes: 2,
        tags: [{ text: 'May take longer', tone: 'bad' }],
        riskBase: 0.35,
        risky: true,
        apply: (c) => {
          if (!c.escalate({ extra: 0 })) c.log('A quick bathroom trip.', true);
        },
      },
    ],
  },

  stuffyWash: {
    id: 'stuffyWash',
    title: 'Stuffy in the wash',
    context: 'Choosing a stuffy',
    headline: () => 'Bun-Bun is in the washing machine.',
    detail: () => "It's mid-cycle. She wants Bun-Bun.",
    deferrable: false,
    tasks: ['stuffy'],
    chance: (s) => 0.35 + picky(s),
    responses: [
      {
        id: 'damp',
        label: 'Fish Bun-Bun out',
        hint: 'Damp, but the right one',
        minutes: 3,
        tags: [{ text: 'Damp stuffy', tone: 'bad' }, { text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.flag('stuffyDamp');
          c.mood(1);
          c.completeTask('stuffy');
          c.log('You got Bun-Bun out. Damp.', true);
        },
      },
      {
        id: 'other',
        label: 'Suggest the giraffe',
        hint: 'Quick, if she goes for it',
        minutes: 1,
        both: true,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        risky: true,
        riskBase: 0.5,
        apply: (c) => {
          if (!c.escalate({ extra: 2 })) c.log('She took the giraffe.', true);
        },
      },
      {
        id: 'skip',
        label: 'No stuffy today',
        hint: 'Saves time. She will mind',
        minutes: 0,
        tags: [{ text: 'No stuffy', tone: 'bad' }, { text: 'Mood ↓', tone: 'bad' }],
        apply: (c) => {
          c.mood(-1);
          c.skipTask('stuffy');
          c.log('No stuffy. She went quiet about it.', true);
        },
      },
    ],
  },

  phone: {
    id: 'phone',
    title: 'Work call',
    context: 'While you were busy',
    headline: () => "Your phone is ringing. It's work.",
    worse: 'Work is calling again.',
    deferrable: false,
    external: true,
    tasks: ['lunch', 'breakfastMade', 'parentReady', 'shoesFound', 'clothesOut', 'bagChecked', 'project', 'email'],
    chance: (s) => (s.childAwake ? 0.1 : 0.04),
    responses: [
      {
        id: 'quick',
        label: 'Answer, keep it short',
        hint: 'Might run long',
        minutes: 1,
        tags: [{ text: '40% runs long', tone: 'bad' }],
        apply: (c) => {
          if (c.roll() < 0.4) {
            c.spend(3);
            c.log('It ran long.', true);
          } else c.log('You kept it to a minute.', true);
        },
      },
      {
        id: 'answer',
        label: 'Hear them out',
        hint: 'Could be important',
        minutes: 4,
        tags: [{ text: 'Might be useful', tone: 'neutral' }],
        apply: (c) => {
          if (c.roll() < 0.3) {
            c.mood(1);
            c.log('Your 09:00 is canceled. You relax a little, and so does she.', true);
          } else c.log('Nothing urgent.', true);
        },
      },
      {
        id: 'ignore',
        label: 'Let it ring',
        hint: 'Free now. They will call back, and it will be worse',
        minutes: 0,
        tags: [{ text: 'They call back', tone: 'bad' }],
        apply: (c) => {
          if (c.incident.worse) c.log('You let it ring again.', true);
          else {
            c.later();
            c.log('You let it ring. They left a voicemail.', true);
          }
        },
      },
    ],
  },

  groupChat: {
    id: 'groupChat',
    title: 'Group chat',
    context: 'While you were busy',
    headline: () => 'The class parents\' group chat is going off.',
    detail: (s) => (s.day.eventKnown ? undefined : "Someone in there might have said what's on today."),
    deferrable: false,
    external: true,
    tasks: ['lunch', 'breakfastMade', 'parentReady', 'clothesOut', 'bagChecked', 'tea'],
    chance: (s) => (s.childAwake ? 0.08 : 0.05),
    responses: [
      {
        id: 'read',
        label: 'Scroll back through it',
        hint: "Might tell you what's on today",
        minutes: 3,
        tags: [{ text: 'Might settle what today is', tone: 'good' }],
        apply: (c) => {
          if (c.s.day.eventKnown) c.log('Nothing new.', true);
          else if (c.roll() < 0.7) c.learnEvent('Group chat');
          else c.log('Nothing about today.', true);
        },
      },
      {
        id: 'mute',
        label: 'Mute it',
        hint: 'Free, and you learn nothing',
        minutes: 0,
        tags: [{ text: 'Free', tone: 'neutral' }],
        apply: (c) => c.log('Muted.', true),
      },
    ],
  },

  doorbell: {
    id: 'doorbell',
    title: 'Doorbell',
    context: 'While you were busy',
    headline: () => 'Someone is at the door.',
    detail: () => 'A package that needs a signature.',
    deferrable: false,
    external: true,
    tasks: ['lunch', 'breakfastMade', 'parentReady', 'shoesFound', 'clothesOut', 'bagChecked', 'tea'],
    chance: (s) => (s.childAwake ? 0.08 : 0.03),
    responses: [
      {
        id: 'sign',
        label: 'Sign for it',
        hint: 'Quick',
        minutes: 2,
        tags: [{ text: 'Reliable', tone: 'neutral' }],
        apply: (c) => c.log('You signed for a package.', true),
      },
      {
        id: 'ignore',
        label: 'Pretend nobody is home',
        hint: 'If she hears it, she will answer it',
        minutes: 0,
        tags: [{ text: '50% she gets there first', tone: 'bad' }],
        available: (s) => s.childAwake,
        apply: (c) => {
          if (c.roll() < 0.5) {
            c.spend(2);
            c.log(done(c.s, 'dressed') ? 'She got to the door first.' : 'She answered the door in her pajamas.', true);
          } else c.log('The driver left a note.', true);
        },
      },
    ],
  },

  // The endgame. A wave lands and each contact becomes one of these.
  shoesOff: {
    id: 'shoesOff',
    title: 'Shoes off',
    context: 'Crisis',
    headline: () => 'She has taken her shoes off.',
    deferrable: false,
    endgame: (s) => done(s, 'shoesOn'),
    responses: [
      {
        id: 'together',
        label: 'Back on, together',
        hint: 'Reliable',
        minutes: 3,
        both: true,
        tags: [{ text: 'Shoes stay on', tone: 'neutral' }],
        apply: (c) => c.log('Shoes back on.', true),
      },
      {
        id: 'leave',
        label: 'She can do it herself',
        hint: 'Free now; back on her list',
        minutes: 0,
        tags: [{ text: 'Shoes undone', tone: 'bad' }],
        apply: (c) => {
          c.reopen('shoesOn');
          c.log('Shoes are hers to put back on.', true);
        },
      },
    ],
  },

  coatOff: {
    id: 'coatOff',
    title: 'Coat off',
    context: 'Crisis',
    headline: (s) => (s.day.weather === 'cold' ? "She took her coat off. She says she's too hot." : 'She took her raincoat off.'),
    deferrable: false,
    endgame: (s) => done(s, 'coat'),
    responses: [
      {
        id: 'zip',
        label: 'Back on, zipped',
        hint: 'Quick, if she agrees',
        minutes: 1,
        both: true,
        risky: true,
        riskBase: 0.3,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 0 })) c.log('Coat back on.', true);
        },
      },
      {
        id: 'leave',
        label: 'Leave it off',
        hint: 'Free now',
        minutes: 0,
        tags: [{ text: 'Coat undone', tone: 'bad' }],
        apply: (c) => {
          c.reopen('coat');
          c.log('The coat stays off.', true);
        },
      },
    ],
  },

  hairMess: {
    id: 'hairMess',
    title: 'Hair',
    context: 'Crisis',
    headline: (s) => (done(s, 'coat') ? 'Her hood has messed up her hair.' : HAIR[s.hairStyle ?? 'down'].mess),
    deferrable: false,
    endgame: (s) => done(s, 'hair'),
    responses: [
      {
        id: 'redo',
        label: 'Redo it',
        hint: 'Properly',
        minutes: 3,
        minutesFor: (s) => HAIR[s.hairStyle ?? 'down'].redo,
        both: true,
        tags: [{ text: 'Hair fixed', tone: 'neutral' }],
        apply: (c) => c.log('Hair redone.', true),
      },
      {
        id: 'leave',
        label: 'It will do',
        hint: 'Free now',
        minutes: 0,
        tags: [{ text: 'Hair undone', tone: 'bad' }],
        apply: (c) => {
          c.reopen('hair');
          c.log('The hair will have to do.', true);
        },
      },
    ],
  },

  juice: {
    id: 'juice',
    title: 'Juice',
    context: 'Crisis',
    headline: () => 'Juice, all down her top.',
    deferrable: false,
    endgame: (s) => done(s, 'dressed') && !has(s, 'stainedShirt'),
    responses: [
      {
        id: 'change',
        label: 'Change her top',
        hint: 'Slow, but clean',
        minutes: 4,
        both: true,
        tags: [{ text: 'Clean top', tone: 'neutral' }],
        apply: (c) => c.log('Changed into a clean top.', true),
      },
      {
        id: 'wipe',
        label: 'Wipe it',
        hint: 'Quick. It will show',
        minutes: 1,
        tags: [{ text: 'Stained top', tone: 'bad' }],
        apply: (c) => {
          c.flag('stainedShirt');
          c.log('Wiped. It still shows.', true);
        },
      },
    ],
  },

  hungryAgain: {
    id: 'hungryAgain',
    title: 'Hungry',
    context: 'Crisis',
    headline: (s) => (done(s, 'breakfastEaten') ? 'She is hungry again.' : 'She is hungry.'),
    deferrable: false,
    endgame: () => true,
    responses: [
      {
        id: 'home',
        label: 'A snack at home',
        hint: 'She sits down and eats it. Takes a few minutes',
        minutes: 4,
        both: true,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.mood(1);
          c.log('She ate a snack at the table.', true);
        },
      },
      {
        id: 'snack',
        label: 'A snack for the car',
        hint: 'Quick',
        minutes: 1,
        tags: [{ text: 'Handled', tone: 'neutral' }],
        apply: (c) => c.log('She took a snack for the car.', true),
      },
      {
        id: 'no',
        label: 'Not now',
        hint: 'Free, if she accepts it',
        minutes: 0,
        risky: true,
        riskBase: 0.5,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 0 })) c.log('She let it go.', true);
        },
      },
    ],
  },

  bagRaid: {
    id: 'bagRaid',
    title: 'Bag',
    context: 'Crisis',
    headline: () => 'Half her backpack is on the hallway floor.',
    detail: () => 'She was looking for a drawing to show you.',
    deferrable: false,
    endgame: (s) => done(s, 'bagChecked'),
    responses: [
      {
        id: 'repack',
        label: 'Repack it properly',
        hint: 'Everything back where it was',
        minutes: 3,
        tags: [{ text: 'Bag checked', tone: 'neutral' }],
        apply: (c) => c.log('You repacked the bag and looked at the drawing.', true),
      },
      {
        id: 'scoop',
        label: 'Scoop it all back in',
        hint: 'Quick. Who knows what is in there now',
        minutes: 1,
        tags: [{ text: 'Bag unchecked', tone: 'bad' }],
        apply: (c) => {
          c.reopen('bagChecked');
          c.log('You pushed everything back in.', true);
        },
      },
    ],
  },

  joke: {
    id: 'joke',
    title: 'A joke',
    context: 'She has something to tell you',
    headline: () => 'She has a joke.',
    detail: () => 'Knock knock.',
    speaks: true,
    deferrable: false,
    tasks: ['breakfastEaten', 'dressed', 'shoesOn', 'coat'],
    chance: (s) => (s.childTendency === 'cheerful' ? 0.3 : 0.15),
    endgame: () => true,
    responses: [
      {
        id: 'listen',
        label: 'Go on',
        labelFor: (_s, inc) => JOKES[inc.joke ?? 0].lines[inc.stage ?? 0].you,
        hint: 'She needs you to hear all of it',
        minutes: 1,
        both: true,
        tags: [{ text: "She's happy", tone: 'good' }],
        available: (_s, inc) => (inc.stage ?? 0) < JOKES[inc.joke ?? 0].lines.length - 1,
        apply: (c) => {
          const joke = JOKES[c.incident.joke ?? 0];
          const stage = (c.incident.stage ?? 0) + 1;
          c.incident.stage = stage;
          c.keepOpen(joke.lines[stage].her);
        },
      },
      {
        id: 'laugh',
        label: 'Laugh',
        labelFor: (_s, inc) => JOKES[inc.joke ?? 0].lines[inc.stage ?? 0].you,
        hint: "She'll notice if you don't mean it",
        minutes: 1,
        both: true,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        available: (_s, inc) => (inc.stage ?? 0) === JOKES[inc.joke ?? 0].lines.length - 1,
        apply: (c) => {
          c.mood(1);
          c.log(JOKES[c.incident.joke ?? 0].landed, true);
        },
      },
      {
        id: 'interrupt',
        label: 'Not now, sweetheart',
        hint: 'Free now. She will take it personally',
        minutes: 0,
        tags: [{ text: 'Door shut', tone: 'bad' }, { text: 'Next job refused', tone: 'bad' }],
        apply: (c) => {
          c.flag('sulking');
          c.mood(-1);
          if (c.s.childActivity) {
            c.s.objectives[c.s.childActivity].status = 'todo';
            c.s.childActivity = undefined;
          }
          c.log('She went to her room and shut the door.', true);
        },
      },
    ],
  },

  closedDoor: {
    id: 'closedDoor',
    title: 'Closed door',
    context: 'Her bedroom',
    headline: () => 'The door is shut. She is not coming out.',
    detail: () => 'You did not let her finish the joke.',
    deferrable: false,
    responses: [
      {
        id: 'joke',
        label: 'Ask to hear the joke after all',
        hint: 'She has been waiting for you to ask',
        minutes: 2,
        both: true,
        tags: [{ text: 'Door opens', tone: 'good' }, { text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.unflag('sulking');
          c.mood(1);
          c.log('You listened through the door, and she came out.', true);
        },
      },
      {
        id: 'sorry',
        label: 'Knock, and say sorry',
        hint: 'Takes a little while',
        minutes: 3,
        both: true,
        tags: [{ text: 'Door opens', tone: 'good' }],
        apply: (c) => {
          c.unflag('sulking');
          c.log('She accepted the apology.', true);
        },
      },
      {
        id: 'wait',
        label: 'Leave her to it',
        hint: 'She will come out when she is ready',
        minutes: 6,
        tags: [{ text: 'Slow', tone: 'bad' }],
        apply: (c) => {
          c.unflag('sulking');
          c.log('She came out in her own time.', true);
        },
      },
    ],
  },

  upset: {
    id: 'upset',
    title: 'Upset',
    context: 'It went badly',
    headline: () => 'She is upset now.',
    deferrable: false,
    responses: [
      {
        id: 'hug',
        label: 'Kneel down, hug it out',
        hint: 'Takes a moment. Works',
        minutes: 2,
        both: true,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.mood(1);
          c.log('A hug helped.', true);
        },
      },
      {
        id: 'wait',
        label: 'Give her a minute',
        hint: "She'll come around",
        minutes: 3,
        tags: [{ text: 'Slow', tone: 'bad' }],
        apply: (c) => c.log('She came around in her own time.', true),
      },
      {
        id: 'carry',
        label: 'Carry on regardless',
        hint: 'Free. She stays upset',
        minutes: 0,
        tags: [{ text: 'Mood stays down', tone: 'bad' }],
        apply: (c) => c.log("You kept going. She's still upset.", true),
      },
    ],
  },

  wrongBreakfast: {
    id: 'wrongBreakfast',
    title: 'Breakfast',
    context: 'Sitting down to breakfast',
    headline: (s) => `She wanted ${BREAKFASTS[s.breakfastWant].name.toLowerCase()}.`,
    detail: (s) => `You made ${BREAKFASTS[s.breakfastChoice ?? 'toast'].name.toLowerCase()}.`,
    deferrable: false,
    responses: [
      {
        id: 'negotiate',
        label: 'Talk her round',
        hint: 'Takes a minute or two',
        minutes: 2,
        both: true,
        risky: true,
        riskBase: 0.45,
        tags: [{ text: 'She might eat it', tone: 'neutral' }],
        apply: (c) => {
          if (!c.escalate({ extra: 2 })) c.log('She ate it.', true);
        },
      },
      {
        id: 'remake',
        label: 'Make what she asked for',
        hint: 'She will eat it happily. Costs you the time',
        minutes: 5,
        minutesFor: (s) => BREAKFASTS[s.breakfastWant].minutes,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.s.breakfastChoice = c.s.breakfastWant;
          c.mood(1);
          c.log(`Made the ${BREAKFASTS[c.s.breakfastWant].name.toLowerCase()} after all.`, true);
        },
      },
      {
        id: 'insist',
        label: 'This, or nothing',
        hint: 'Quick. She may choose nothing',
        minutes: 0,
        risky: true,
        riskBase: 0.6,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 3 })) c.log('She ate it.', true);
        },
      },
    ],
  },

  hairdo: {
    id: 'hairdo',
    title: 'Hair',
    context: 'Doing her hair',
    headline: (s) => `She wants ${HAIR[s.hairWant].name}.`,
    deferrable: false,
    responses: [
      {
        id: 'yes',
        label: 'Yes',
        labelFor: (s) => `${HAIR[s.hairWant].title} it is`,
        hint: "She'll be happy. It takes longer",
        minutes: 0,
        tags: [{ text: 'Her way', tone: 'good' }, { text: 'Takes longer', tone: 'bad' }],
        apply: (c) => {
          const want = c.s.hairWant;
          c.addExtra(HAIR[want].extra);
          c.mood(1);
          c.s.hairStyle = want;
          c.log(`You did ${HAIR[want].name}.`, true);
        },
      },
      {
        id: 'clip',
        label: 'Ponytail, with the sparkly clip',
        hint: 'Quicker, if the clip is enough',
        minutes: 1,
        both: true,
        risky: true,
        riskBase: 0.4,
        tags: [{ text: 'She may not buy it', tone: 'neutral' }],
        available: (s) => s.hairWant === 'pigtails' || s.hairWant === 'braids',
        apply: (c) => {
          c.addExtra(HAIR.ponytail.extra);
          c.s.hairStyle = 'ponytail';
          if (!c.escalate({ extra: 1 })) c.log('She went for the ponytail with the clip.', true);
        },
      },
      {
        id: 'down',
        label: 'Down today, brushed',
        hint: 'Quickest. She had her heart set on it',
        minutes: 0,
        risky: true,
        riskBase: 0.45,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          c.s.hairStyle = 'down';
          if (!c.escalate({ extra: 1 })) c.log('Down and brushed.', true);
        },
      },
      {
        id: 'promise',
        label: 'Braids on Saturday. Promise',
        hint: 'She will hold you to it',
        minutes: 1,
        both: true,
        risky: true,
        riskBase: 0.2,
        tags: [{ text: 'A promise', tone: 'neutral' }],
        available: (s) => s.hairWant === 'braids',
        apply: (c) => {
          c.s.hairStyle = 'down';
          if (!c.escalate({ extra: 1 })) {
            c.flag('promisedBraids');
            c.log('You promised braids on Saturday.', true);
          }
        },
      },
    ],
  },

  flop: {
    id: 'flop',
    title: 'On the floor',
    context: 'Not today',
    headline: () => "She's lying on the floor and won't get up.",
    detail: (s) => (s.householdMood === 0 ? "She's screaming." : undefined),
    deferrable: false,
    tasks: ['breakfastEaten', 'dressed', 'teeth', 'face', 'hair', 'shoesOn', 'coat'],
    chance: (s) => [0.35, 0.25, 0.1, 0, 0, 0][s.householdMood],
    responses: [
      {
        id: 'scoop',
        label: 'Scoop her up and carry on',
        hint: 'Reliable. She stays cross',
        minutes: 2,
        both: true,
        tags: [{ text: 'Back to it', tone: 'neutral' }],
        apply: (c) => c.log('You carried her.', true),
      },
      {
        id: 'sit',
        label: 'Lie down on the floor with her',
        hint: 'Takes a few minutes. Turns it around',
        minutes: 3,
        both: true,
        tags: [{ text: 'Mood ↑', tone: 'good' }],
        apply: (c) => {
          c.mood(1);
          c.log('You lay down with her until she laughed.', true);
        },
      },
      {
        id: 'count',
        label: 'Count to three',
        hint: 'Free, if she gets up',
        minutes: 0,
        risky: true,
        riskBase: 0.5,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 2 })) c.log('She got up.', true);
        },
      },
    ],
  },

  helper: {
    id: 'helper',
    title: 'A helper',
    context: 'She wants to help',
    headline: () => 'She wants to help.',
    deferrable: false,
    external: true,
    tasks: ['lunch', 'breakfastMade', 'bagChecked'],
    chance: (s) => (s.childAwake && !s.childActivity ? [0, 0, 0, 0, 0.2, 0.35][s.householdMood] : 0),
    responses: [
      {
        id: 'yes',
        label: 'Yes, you can help',
        hint: 'It will take longer. She will be very proud',
        minutes: 0,
        tags: [{ text: 'Mood ↑', tone: 'good' }, { text: 'Your job slows', tone: 'bad' }],
        apply: (c) => {
          c.addExtra(3);
          c.mood(1);
          c.log('She helped. It took longer, and she was proud of it.', true);
        },
      },
      {
        id: 'job',
        label: 'Give her a job of her own',
        hint: 'Point that energy somewhere useful',
        minutes: 1,
        tags: [{ text: 'Useful', tone: 'good' }],
        apply: (c) => {
          if (c.s.objectives.shoesFound.status !== 'done') {
            c.completeTask('shoesFound');
            c.log('You asked her to find her shoes, and she did.', true);
          } else c.log('She took her water bottle to the door.', true);
        },
      },
      {
        id: 'no',
        label: 'Not now, but thank you',
        hint: 'Free. She may deflate a little',
        minutes: 0,
        tags: [{ text: 'Mood may dip', tone: 'bad' }],
        apply: (c) => {
          if (c.roll() < 0.3) {
            c.mood(-1);
            c.log('She looked disappointed.', true);
          } else c.log('She went off to find something else to do.', true);
        },
      },
    ],
  },

  wobble: {
    id: 'wobble',
    title: 'Wobble',
    context: 'Crisis',
    headline: () => "She's about to cry.",
    deferrable: false,
    endgame: (s) => s.householdMood >= 1,
    responses: [
      {
        id: 'hug',
        label: 'A big hug',
        hint: 'Usually works',
        minutes: 2,
        both: true,
        tags: [{ text: 'Mood holds', tone: 'good' }],
        apply: (c) => c.log('A hug by the door helped.', true),
      },
      {
        id: 'distract',
        label: 'Look, a bird!',
        hint: 'Quick, sometimes',
        minutes: 0,
        risky: true,
        riskBase: 0.5,
        tags: [{ text: 'May upset her', tone: 'bad' }],
        apply: (c) => {
          if (!c.escalate({ extra: 0 })) c.log('The distraction worked.', true);
        },
      },
    ],
  },
};

/** Order matters: the first incident that hits for a task wins. */
export const ROLL_ORDER: IncidentId[] = ['flop', 'spoon', 'spill', 'socks', 'outfit', 'cats', 'bug', 'joke', 'stuffyWash', 'helper', 'phone', 'groupChat', 'doorbell'];
export const COMPOUND_MINUTES = 8;

// ---------------------------------------------------------------------------
// Breakfast: what you make, against what she wants today
// ---------------------------------------------------------------------------

export const BREAKFASTS: Record<Breakfast, { name: string; minutes: number }> = {
  cereal: { name: 'Cereal', minutes: 2 },
  toast: { name: 'Toast', minutes: 5 },
  oatmeal: { name: 'Oatmeal', minutes: 7 },
  pancakes: { name: 'Pancakes', minutes: 12 },
};
export const BREAKFAST_ORDER: Breakfast[] = ['cereal', 'toast', 'oatmeal', 'pancakes'];

/** What is actually on her plate: what you made, or cereal if you made nothing. */
export function eating(s: GameState): Breakfast {
  return done(s, 'breakfastMade') && s.breakfastChoice ? s.breakfastChoice : 'cereal';
}

/** How each breakfast ends up on the floor. */
const SPILLS: Record<Breakfast, { floor: string; top: string; again: string }> = {
  cereal: {
    floor: 'Her cereal is on the floor.',
    top: 'Cereal and milk everywhere. Including her top.',
    again: 'poured another bowl',
  },
  toast: {
    floor: 'Her toast is on the floor.',
    top: 'Jam everywhere. Including her top.',
    again: 'made another slice',
  },
  oatmeal: {
    floor: 'Her oatmeal is on the floor.',
    top: 'Oatmeal everywhere. Including her top.',
    again: 'scraped together a second bowl',
  },
  pancakes: {
    floor: 'Her pancakes are on the floor.',
    top: 'Syrup everywhere. Including her top.',
    again: 'saved what was left of the stack',
  },
};
export const BREAKFAST_CLUE_CHANCE = 0.6; // she said something about it last night
export const BREAKFAST_CLUE_RIGHT = 0.75; // and still wants it this morning
/** What she wants done with her hair today, and what each costs on top of brushing. */
export const HAIR: Record<HairStyle, { name: string; title: string; extra: number; redo: number; mess: string }> = {
  down: { name: 'it down', title: 'Down', extra: 0, redo: 2, mess: 'Her hair is a mess again.' },
  ponytail: {
    name: 'a ponytail',
    title: 'A ponytail',
    extra: 2,
    redo: 3,
    mess: 'She pulled her ponytail out.',
  },
  pigtails: {
    name: 'pigtails',
    title: 'Pigtails',
    extra: 4,
    redo: 4,
    mess: 'One pigtail has come out.',
  },
  braids: {
    name: 'braided pigtails',
    title: 'Braided pigtails',
    extra: 8,
    redo: 6,
    mess: 'One of the braids is coming out.',
  },
};
/** How likely each request is on a given morning. */
export const HAIR_WANTS: [HairStyle, number][] = [
  ['down', 0.3],
  ['ponytail', 0.3],
  ['pigtails', 0.2],
  ['braids', 0.2],
];
export const HAIR_CLUE_CHANCE = 0.4; // she announced it at bedtime
export const CAR_STUFFY_CHANCE = 0.4;
export const TEA_MINUTES = 20;
export const TEA_SPEED = 1.15;

// ---------------------------------------------------------------------------
// The endgame: as leaving time nears, waves of crises. Each wave is announced, then lands.

/** She gets more distractible: a little anyway, more the longer she's been good, more as time runs out. */
export const BASE_DISTRACTION = 0.05;
export const FOCUS_STEP = 0.06; // per job finished in a row without a problem
export const FOCUS_CAP = 0.24;
export const CRUNCH_MINUTES = 30; // the last half hour before leaving
export const CRUNCH_DISTRACTION = 0.15; // extra chance by leaving time
/** Bodies keep time: the bathroom and hunger come due, whatever else is going on. */
export const BATHROOM_AFTER_BREAKFAST = [25, 40];
export const BATHROOM_AFTER_WAKING = 50;
export const HUNGRY_AFTER_BREAKFAST = 50;
export const HUNGRY_AFTER_WAKING = 40;
// ---------------------------------------------------------------------------

export const ENDGAME_POOL: IncidentId[] = ['shoesOff', 'coatOff', 'hairMess', 'juice', 'hungryAgain', 'bagRaid', 'wobble', 'bathroom', 'joke', 'cats'];

// ---------------------------------------------------------------------------
// Her jokes. You go through all of it; there is no other way.
// ---------------------------------------------------------------------------

export type Joke = { lines: { her: string; you: string }[]; landed: string };

export const JOKES: Joke[] = [
  {
    lines: [
      { her: 'Knock knock.', you: "Who's there?" },
      { her: 'Cowgoes.', you: 'Cowgoes who?' },
      { her: 'No, cows go MOO!', you: 'Laugh' },
    ],
    landed: 'She laughed at her own joke.',
  },
  {
    lines: [
      { her: 'Knock knock.', you: "Who's there?" },
      { her: 'Who.', you: 'Who who?' },
      { her: 'You sound like an owl!', you: 'Laugh' },
    ],
    landed: 'She hooted like an owl for a while.',
  },
  {
    // One of her own.
    lines: [
      { her: 'Knock knock.', you: "Who's there?" },
      { her: 'Blanket.', you: 'Blanket who?' },
      { her: '…', you: 'Wait for it' },
      { her: "…blankets can't talk!", you: 'Laugh' },
    ],
    landed: "She made that one up herself, and she's proud of it.",
  },
];
/** Minutes before leaving time when the first wave is announced. */
export const COLLAPSE_LEAD = 15;
export const WAVE_WARNING = 5; // minutes between a wave being announced and landing
export const GATE_CLOSES_AFTER = 10; // arriving this many minutes late: the gate is shut, sign in at the office

export const LIBRARY_CHANCE = 0.6;

// ---------------------------------------------------------------------------
// Run variation
// ---------------------------------------------------------------------------

export const CONDITIONS: Record<MorningCondition, { label: string; note: string }> = {
  ordinary: { label: 'An ordinary Tuesday', note: 'Nothing unusual.' },
  lateBedtime: { label: 'Late bedtime', note: 'She went to bed late. She will be tired even at 7.' },
  shoesByDoor: { label: 'Shoes by the door', note: 'Her shoes are by the door.' },
  noBread: { label: 'No bread', note: 'Lunch will take longer.' },
  earlyBird: { label: 'Early bird', note: 'She might wake a little early today.' },
};

export const TENDENCIES: Record<ChildTendency, { label: string; note: string }> = {
  independent: { label: 'Independent', note: 'Gets on with things a bit faster.' },
  dawdler: { label: 'Easily distracted', note: 'Notices everything.' },
  picky: { label: 'Particular', note: 'Has opinions about spoons and socks.' },
  cheerful: { label: 'Cheerful', note: 'In a good mood today.' },
};

// ---------------------------------------------------------------------------
// School days, weather, intel
// ---------------------------------------------------------------------------

export type EventDef = {
  name: string;
  calendar: string; // what the fridge calendar says
  ask: string; // what she says when asked
  email: string; // what the school email says
  task?: TaskId; // what has to be done for it
  earlier?: number; // school starts this many minutes early
  missing: string; // "Left behind" wording
  reveal: string; // after-action line
};

export const EVENTS: Record<EventId, EventDef> = {
  stuffy: {
    name: 'Stuffy day',
    calendar: 'STUFFY DAY ✿',
    ask: "It's stuffy day! I think.",
    email: 'Bring a favorite stuffed animal for stuffy day.',
    task: 'stuffy',
    missing: 'A stuffy, on stuffy day',
    reveal: 'It was stuffy day.',
  },
  festival: {
    name: 'Festival day',
    calendar: 'FESTIVAL ☆',
    ask: "It's the festival! I need my festival clothes.",
    email: 'Autumn festival today. Children come in festival clothes.',
    task: 'festivalClothes',
    missing: 'Festival clothes (everyone else had them)',
    reveal: 'It was festival day.',
  },
  project: {
    name: 'Project due',
    calendar: 'LEAF PROJECT DUE',
    ask: 'My leaf picture has to go in! Is it today?',
    email: 'Leaf collage projects are due today.',
    task: 'project',
    missing: 'Her leaf project',
    reveal: 'The leaf project was due.',
  },
  paperwork: {
    name: 'Paperwork due',
    calendar: 'FORMS!!',
    ask: "There's a paper in my bag for you.",
    email: 'Health forms are due back today, signed.',
    task: 'paperwork',
    missing: 'The signed form',
    reveal: 'The health form was due.',
  },
  assembly: {
    name: 'Assembly',
    calendar: 'ASSEMBLY 7:55',
    ask: "We're singing at assembly!",
    email: 'Assembly at 07:55: school shirts, please, and arrive a little early.',
    missing: 'A clean school shirt for assembly',
    earlier: 5,
    reveal: 'It was assembly. They started at 07:55.',
  },
  picture: {
    name: 'Picture day',
    calendar: 'PHOTOS',
    ask: 'Is it picture day today?',
    email: 'School photographs today. Neat hair and a clean top, please.',
    missing: 'A clean top for the photo',
    reveal: 'It was picture day.',
  },
  library: {
    name: 'Library day',
    calendar: 'LIBRARY',
    ask: "Is it library day? I don't know where my book is.",
    email: 'Library books are due back today.',
    missing: 'Library book',
    reveal: 'It was library day.',
  },
};

export const EVENT_POOL: EventId[] = ['stuffy', 'festival', 'project', 'paperwork', 'assembly', 'picture', 'library'];
export const EVENT_CHANCE = 0.4;
/** Each week the school calendar fills up and the mornings get busier. */
export const WEEKLY_EVENT_CHANCE = 0.05;
export const WEEKLY_INCIDENT_CHANCE = 0.03;
export const RAIN_CHANCES = [0.1, 0.3, 0.6, 0.85];
export const COLD_CHANCE = 0.25;
export const CALENDAR_RIGHT = 0.5;
export const ASK_RIGHT = 0.7;
export const RAIN_DRIVE_MINUTES = 3; // traffic is slower in the rain
/** Raincoat and rain boots, versus 3 minutes for a coat on a cold day. */
export const RAIN_GEAR_MINUTES = 5;
/** A look outside settles the weather this often at first, and more surely as departure nears. */
export const LOOK_SETTLES = 0.45;
export const LOOK_SETTLES_LATE = 0.35;
export const EARLY_START_MINUTES = 10; // a meeting with the principal

// ---------------------------------------------------------------------------
// Run: weekly perks
// ---------------------------------------------------------------------------

export const PERKS: Record<PerkId, { name: string; note: string }> = {
  shoeRack: { name: 'Shoe rack', note: 'Her shoes start by the door half the time.' },
  chart: { name: 'Morning chart', note: 'She gets on with things a little faster.' },
  spoons: { name: 'A second set of her spoons', note: 'The spoon question never comes up.' },
  hooks: { name: 'Coat hooks by the door', note: 'Coats take a minute, not three.' },
  calendar: { name: 'Family calendar', note: 'The calendar on the fridge is always right.' },
};

export const MOOD_LABELS = ['Meltdown', 'Upset', 'Tense', 'Calm', 'Good', 'Bright'] as const;

/**
 * Every step of her mood counts, from Meltdown (0) to Bright (5): how fast she goes, how often
 * things go wrong, how often a risky call backfires, and how early the house starts to fall apart.
 */
export const MOOD_EFFECTS: { speed: number; trouble: number; backfire: number; collapse: number; seen: string }[] = [
  { speed: 0.75, trouble: 0.2, backfire: 0.2, collapse: 5, seen: 'On the floor' },
  { speed: 0.85, trouble: 0.12, backfire: 0.12, collapse: 3, seen: 'Saying no' },
  { speed: 0.95, trouble: 0.05, backfire: 0.05, collapse: 1, seen: 'Short answers' },
  { speed: 1, trouble: 0, backfire: 0, collapse: 0, seen: 'Going along with it' },
  { speed: 1.05, trouble: -0.05, backfire: -0.05, collapse: 0, seen: 'Chatty' },
  { speed: 1.1, trouble: -0.1, backfire: -0.1, collapse: 0, seen: 'Singing, helping' },
];

/** How she takes being sent to a job, by mood. Calm gets no comment. */
export const MOOD_TAKES: string[][] = [
  ['She screams first.', 'She goes very slowly.'],
  ['"No." Then she goes.', 'She flops on the floor first.', 'She sighs loudly.'],
  ['She goes slowly.', 'She grumbles.'],
  [],
  ['She goes, chatting.', '"Okay!"'],
  ['She runs off to do it.', 'She sings while she does it.', '"I can do it myself!"'],
];
