import type {
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
    duration: () => 8,
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
    hint: () => 'She can eat as soon as she sits down',
    scored: false,
    missing: 'A cooked breakfast',
    duration: () => 7,
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
  coffee: {
    id: 'coffee',
    owner: 'parent',
    label: 'Coffee',
    action: 'Have a coffee',
    doing: 'Drinking coffee',
    hint: () => 'Helps you keep your composure once',
    scored: false,
    missing: 'Coffee',
    duration: () => 5,
  },
  bagChecked: {
    id: 'bagChecked',
    owner: 'parent',
    label: 'Bag checked',
    action: 'Check the school bag',
    doing: 'Checking the bag',
    hint: () => 'Make sure everything is in it',
    scored: true,
    missing: 'Bag check',
    duration: () => 4,
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
    duration: (s) => (done(s, 'breakfastMade') ? 14 : 18),
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
    duration: (s) => (done(s, 'clothesOut') ? 10 : 13),
  },
  teeth: {
    id: 'teeth',
    owner: 'child',
    label: 'Teeth brushed',
    action: 'Brush teeth',
    doing: 'Brushing teeth',
    hint: (s) => (done(s, 'breakfastEaten') ? 'Needs you there' : 'Needs you there. Better after breakfast'),
    scored: true,
    missing: 'Brushed teeth',
    duration: () => 4,
    supervised: true,
  },
  hair: {
    id: 'hair',
    owner: 'child',
    label: 'Hair done',
    action: 'Do her hair',
    doing: 'Doing her hair',
    hint: () => 'Needs you there',
    scored: true,
    missing: 'Brushed hair',
    duration: () => 5,
    supervised: true,
  },
  shoesOn: {
    id: 'shoesOn',
    owner: 'child',
    label: 'Shoes on',
    action: 'Put on shoes',
    doing: 'Putting on shoes',
    hint: (s) => (done(s, 'shoesFound') ? 'Shoes are by the door' : "You haven't seen her shoes yet"),
    scored: true,
    missing: 'Shoes',
    duration: (s) => (has(s, 'noSocks') ? 8 : 6),
  },
  coat: {
    id: 'coat',
    owner: 'child',
    label: 'Coat on',
    action: 'Put on her coat',
    doing: 'Putting on her coat',
    hint: (s) =>
      s.day.weather === 'cold'
        ? "It's cold out"
        : s.day.weatherKnown
          ? "It's raining"
          : `Forecast says ${Math.round(s.day.rainChance * 100)}% rain`,
    scored: false,
    missing: 'Her coat',
    duration: (s) => (s.perks.includes('hooks') ? 1 : 3),
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
  peKit: {
    id: 'peKit',
    owner: 'parent',
    label: 'PE kit packed',
    action: 'Pack her PE kit',
    doing: 'Packing the PE kit',
    hint: (s) => (s.day.eventKnown ? 'It is PE today' : 'In case it is PE today'),
    scored: false,
    missing: 'PE kit',
    duration: () => 3,
  },
  costume: {
    id: 'costume',
    owner: 'child',
    label: 'Costume on',
    action: 'Put on her costume',
    doing: 'Getting into costume',
    hint: (s) => (s.day.eventKnown ? 'Dress-up day. Counts as dressed' : 'In case it is dress-up day. Counts as dressed'),
    scored: false,
    missing: 'Her costume',
    duration: () => 9,
  },
  slip: {
    id: 'slip',
    owner: 'parent',
    label: 'Slip signed',
    action: 'Sign the permission slip',
    doing: 'Signing the slip',
    hint: (s) => (has(s, 'slipFound') ? 'It is in her bag' : 'Have to find it first'),
    scored: false,
    missing: 'Permission slip',
    duration: (s) => (has(s, 'slipFound') ? 2 : 5),
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
    hint: () => 'Confirms the weather',
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
  'coffee',
  'bagChecked',
  'peKit',
  'slip',
];
export const INTEL_TASKS: TaskId[] = ['email', 'window'];
export const CHILD_TASKS: TaskId[] = ['breakfastEaten', 'dressed', 'teeth', 'hair', 'shoesOn', 'coat', 'stuffy', 'costume'];
/** Child tasks every morning needs; the rest depend on the day. */
export const CORE_CHILD_TASKS: TaskId[] = ['breakfastEaten', 'dressed', 'teeth', 'hair', 'shoesOn'];
// Exactly the scored tasks, so the checklist count matches the debrief.
export const CHECKLIST: TaskId[] = [
  'parentReady',
  'lunch',
  'bagChecked',
  'breakfastEaten',
  'dressed',
  'teeth',
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
};

export type ResponseTag = { text: string; tone: 'good' | 'bad' | 'neutral' };

export type ResponseDef = {
  id: string;
  label: string;
  hint: string;
  minutes: number;
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
  detail: (s: GameState) => string;
  deferrable: boolean;
  tasks?: TaskId[]; // child tasks this can interrupt (rolled when the task starts)
  chance?: (s: GameState) => number; // base chance before global modifiers
  responses: ResponseDef[];
};

const picky = (s: GameState) => (s.childTendency === 'picky' ? 0.2 : 0);

export const INCIDENTS: Record<IncidentId, IncidentDef> = {
  spoon: {
    id: 'spoon',
    title: 'Wrong spoon',
    context: 'While eating breakfast',
    headline: () => 'She wanted the blue spoon.',
    detail: () => 'Breakfast has stopped.',
    deferrable: false,
    tasks: ['breakfastEaten'],
    chance: (s) => (s.perks.includes('spoons') ? 0 : 0.3 + picky(s)),
    responses: [
      {
        id: 'blue',
        label: 'Get the blue spoon',
        hint: 'Simple, if it is clean',
        minutes: 2,
        tags: [{ text: 'Breakfast resumes', tone: 'neutral' }],
        apply: (c) => {
          if (c.roll() < 0.7) c.log('Breakfast resumed with the blue spoon.', true);
          else {
            c.addExtra(2);
            c.log('The blue spoon was in the dishwasher. Washed it.', true);
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
            c.log('She chose the green spoon. Very pleased about it.', true);
          } else c.log('She chose a spoon. Breakfast resumed.', true);
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
          c.log('Breakfast abandoned over a spoon.', true);
        },
      },
    ],
  },

  spill: {
    id: 'spill',
    title: 'Spilled breakfast',
    context: 'While eating breakfast',
    headline: (s) => (done(s, 'dressed') ? 'Cereal everywhere. Including her top.' : 'Her cereal is on the floor.'),
    detail: () => 'Most of the bowl, and a fair amount of milk.',
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
          c.log(done(c.s, 'dressed') ? 'Cleaned up and changed her top.' : 'Cleaned up and poured another bowl.', true);
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
    headline: () => "She doesn't want those socks.",
    detail: () => 'She says they feel wrong. Getting dressed has stopped.',
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
          c.log('Socks dispute resolved by choice.', true);
        },
      },
      {
        id: 'soft',
        label: 'Find the soft socks',
        hint: 'Usually works, if you can find them',
        minutes: 3,
        tags: [{ text: 'Better if clothes laid out', tone: 'neutral' }],
        apply: (c) => {
          if (done(c.s, 'clothesOut') || c.roll() < 0.6) c.log('Found the soft socks. Accepted.', true);
          else {
            c.addExtra(3);
            c.log('The soft socks were in the wash. She wore these, eventually.', true);
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
          if (!c.escalate({ extra: 3 })) c.log('She wore the socks. Under protest.', true);
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
          c.log('Socks postponed indefinitely.', true);
        },
      },
    ],
  },

  outfit: {
    id: 'outfit',
    title: 'Outfit',
    context: 'While getting dressed',
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

  bug: {
    id: 'bug',
    title: 'A bug',
    context: 'Distracted',
    headline: () => "She's found a fascinating bug.",
    detail: () => "It's on the windowsill. She would like you to see it.",
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
          c.log('Spent three minutes admiring a beetle.', true);
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
            c.log('Bug viewing postponed until after school.', true);
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
          c.log('She watched the bug for some time.', true);
        },
      },
    ],
  },

  shoesMissing: {
    id: 'shoesMissing',
    title: 'Missing shoes',
    context: 'Putting on shoes',
    headline: () => "Her shoes aren't by the door.",
    detail: () => 'Nobody knows where they are.',
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
        label: 'She can wear her wellies',
        hint: 'Quick; she may object',
        minutes: 1,
        tags: [{ text: 'Wellies', tone: 'bad' }],
        riskBase: 0.3,
        risky: true,
        apply: (c) => {
          c.flag('wellies');
          c.completeTask('shoesFound');
          if (!c.escalate({ extra: 2 })) c.log('Wellies on. It is not raining.', true);
        },
      },
    ],
  },

  library: {
    id: 'library',
    title: 'Library book',
    context: 'Checking the school bag',
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
            c.log('Library book found under her bed. She knew all along.', true);
          } else c.keepOpen("She doesn't remember. It was \"somewhere\".");
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
    context: 'At the door',
    headline: () => 'She needs the toilet. Now.',
    detail: () => 'Coat on, bag on, at the front door.',
    deferrable: false,
    responses: [
      {
        id: 'wait',
        label: 'Wait for her',
        hint: 'Reliable',
        minutes: 4,
        tags: [{ text: 'Reliable', tone: 'neutral' }],
        apply: (c) => c.log('A last-minute bathroom trip.', true),
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
          if (!c.escalate({ extra: 0 })) c.log('A very quick bathroom trip.', true);
        },
      },
    ],
  },

  stuffyWash: {
    id: 'stuffyWash',
    title: 'Stuffy in the wash',
    context: 'Choosing a stuffy',
    headline: () => 'Bun-Bun is in the washing machine.',
    detail: () => 'Mid-cycle. She will accept no substitute. Probably.',
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
          c.log('Bun-Bun rescued from the drum. Slightly damp.', true);
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
          if (!c.escalate({ extra: 2 })) c.log('She took the giraffe. Bun-Bun was not mentioned again.', true);
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

  peLaundry: {
    id: 'peLaundry',
    title: 'PE kit',
    context: 'Packing the PE kit',
    headline: () => 'Her PE kit is in the laundry basket.',
    detail: () => 'Worn once. Possibly twice.',
    deferrable: true,
    responses: [
      {
        id: 'spare',
        label: 'Look for the spare',
        hint: 'There might be one',
        minutes: 4,
        tags: [{ text: '60%', tone: 'neutral' }],
        available: (s) => !has(s, 'searchedKit'),
        apply: (c) => {
          c.flag('searchedKit');
          if (c.roll() < 0.6) {
            c.completeTask('peKit');
            c.log('Found the spare PE kit at the back of a drawer.', true);
          } else c.keepOpen('No spare. Just the one in the basket.');
        },
      },
      {
        id: 'dirty',
        label: 'Pack it as it is',
        hint: 'Nobody will notice. Probably',
        minutes: 1,
        tags: [{ text: 'Smelly kit', tone: 'bad' }],
        apply: (c) => {
          c.flag('smellyKit');
          c.completeTask('peKit');
          c.log('Packed the PE kit from the laundry basket.', true);
        },
      },
      {
        id: 'skip',
        label: 'No PE kit',
        hint: 'She can sit it out',
        minutes: 0,
        tags: [{ text: 'No PE kit', tone: 'bad' }],
        apply: (c) => {
          c.skipTask('peKit');
          c.log('No PE kit today.', true);
        },
      },
    ],
  },
};

/** Order matters: the first incident that hits for a task wins. */
export const ROLL_ORDER: IncidentId[] = ['spoon', 'spill', 'socks', 'outfit', 'bug', 'stuffyWash'];
export const PE_LAUNDRY_CHANCE = 0.4;

export const LIBRARY_CHANCE = 0.6;
export const BATHROOM_CHANCE = 0.5;

// ---------------------------------------------------------------------------
// Run variation
// ---------------------------------------------------------------------------

export const CONDITIONS: Record<MorningCondition, { label: string; note: string }> = {
  ordinary: { label: 'An ordinary Tuesday', note: 'Nothing unusual.' },
  lateBedtime: { label: 'Late bedtime', note: 'She went to bed late. She will be tired even at 7.' },
  shoesByDoor: { label: 'Shoes by the door', note: 'Her shoes are where they belong, for once.' },
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
  missing: string; // "Left behind" wording
  reveal: string; // after-action line
};

export const EVENTS: Record<EventId, EventDef> = {
  stuffy: {
    name: 'Stuffy day',
    calendar: 'STUFFY DAY ✿',
    ask: "It's stuffy day! I think.",
    email: 'Bring a favourite soft toy for stuffy day.',
    task: 'stuffy',
    missing: 'A stuffy, on stuffy day',
    reveal: 'It was stuffy day.',
  },
  pe: {
    name: 'PE day',
    calendar: 'PE',
    ask: 'We have PE today. Or was that yesterday?',
    email: 'PE today: please send kit.',
    task: 'peKit',
    missing: 'PE kit, on PE day',
    reveal: 'It was PE day.',
  },
  picture: {
    name: 'Picture day',
    calendar: 'PHOTOS',
    ask: "Is it photos today? I want my hair like Ava's.",
    email: 'School photographs today. Neat hair and a clean top, please.',
    missing: 'A clean top for the photo',
    reveal: 'It was picture day.',
  },
  library: {
    name: 'Library day',
    calendar: 'LIBRARY',
    ask: 'Library day. My book is somewhere.',
    email: 'Library books are due back today.',
    missing: 'Library book',
    reveal: 'It was library day.',
  },
  dressUp: {
    name: 'Dress-up day',
    calendar: 'DRESS UP!!',
    ask: "It's dress-up day! I'm a dragon.",
    email: 'Dress-up day: come as your favourite character.',
    task: 'costume',
    missing: 'Costume (everyone else had one)',
    reveal: 'It was dress-up day.',
  },
  trip: {
    name: 'Trip day',
    calendar: 'TRIP · coach 7:50',
    ask: "We're going on the coach!",
    email: 'Trip today. The coach leaves at 07:50 sharp. Signed slips, please.',
    task: 'slip',
    missing: 'Signed permission slip',
    reveal: 'It was trip day. The coach left at 07:50.',
  },
};

export const EVENT_POOL: EventId[] = ['stuffy', 'pe', 'picture', 'library', 'dressUp', 'trip'];
export const EVENT_CHANCE = 0.4;
export const RAIN_CHANCES = [0.1, 0.3, 0.6, 0.85];
export const COLD_CHANCE = 0.25;
export const CALENDAR_RIGHT = 0.65;
export const ASK_RIGHT = 0.7;
export const RAIN_WALK_MINUTES = 3;
export const EARLY_START_MINUTES = 10; // a trip or a meeting with the head teacher

// ---------------------------------------------------------------------------
// Run: weekly perks
// ---------------------------------------------------------------------------

export const PERKS: Record<PerkId, { name: string; note: string }> = {
  shoeRack: { name: 'Shoe rack', note: 'Her shoes start by the door half the time.' },
  chart: { name: 'Morning chart', note: 'She gets on with things a little faster.' },
  spoons: { name: 'Spare blue spoons', note: 'The spoon question never comes up.' },
  hooks: { name: 'Coat hooks by the door', note: 'Coats take a minute, not three.' },
  calendar: { name: 'Family calendar', note: 'The fridge calendar is always right.' },
};

export const MOOD_LABELS = ['Meltdown', 'Upset', 'Tense', 'Calm', 'Good', 'Bright'] as const;
