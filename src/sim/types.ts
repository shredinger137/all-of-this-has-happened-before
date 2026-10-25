export type Owner = 'parent' | 'child';

export type TaskId =
  | 'parentReady'
  | 'lunch'
  | 'breakfastMade'
  | 'shoesFound'
  | 'clothesOut'
  | 'coffee'
  | 'bagChecked'
  | 'breakfastEaten'
  | 'dressed'
  | 'teeth'
  | 'hair'
  | 'shoesOn'
  // weather and school-event tasks; offered only when the day calls (or might call) for them
  | 'coat'
  | 'stuffy'
  | 'face'
  | 'carStuffy'
  | 'festivalClothes'
  | 'project'
  | 'paperwork'
  // intel: spend minutes to confirm what today needs
  | 'email'
  | 'window';

export type ObjectiveStatus = 'todo' | 'active' | 'blocked' | 'done' | 'skipped';

export type Objective = {
  status: ObjectiveStatus;
  progress: number; // minutes of work done (may be fractional for child tasks)
  extra: number; // minutes added to the base duration by incidents
  rolled: boolean; // incident roll already made for this task
  pending?: { incidentId: IncidentId; at: number };
};

export type IncidentId =
  | 'spoon'
  | 'spill'
  | 'socks'
  | 'outfit'
  | 'bug'
  | 'shoesMissing'
  | 'library'
  | 'bathroom'
  | 'stuffyWash'
  | 'phone'
  | 'groupChat'
  | 'doorbell'
  // the endgame: what a wave of contacts brings
  | 'shoesOff'
  | 'coatOff'
  | 'hairMess'
  | 'juice'
  | 'hungryAgain'
  | 'bagRaid'
  | 'wobble'
  // follow-through: what a choice can lead to
  | 'upset'
  | 'wrongBreakfast'
  | 'hairdo'
  | 'joke'
  | 'closedDoor'
  | 'cats';

export type OpenIncident = {
  uid: number;
  id: IncidentId;
  task?: TaskId;
  minute: number;
  status: 'open' | 'deferred';
  note?: string; // replaces the default detail line after a partial resolution
  deferredAt?: number; // put off at this minute; it comes back worse if left too long
  worse?: boolean;
  joke?: number; // which joke she is telling
  stage?: number; // how far into it you are
};

export type MorningCondition = 'ordinary' | 'lateBedtime' | 'shoesByDoor' | 'noBread' | 'earlyBird';
export type ChildTendency = 'independent' | 'dawdler' | 'picky' | 'cheerful';

export type Flag =
  | 'noSocks'
  | 'wellies'
  | 'stainedShirt'
  | 'messyKitchen'
  | 'bookLeft'
  | 'bookFound'
  | 'askedBook'
  | 'searchedBook'
  | 'hungry'
  | 'deadlinePassed'
  | 'askedHer'
  | 'stuffyDamp'
  | 'promisedDress'
  | 'promisedBug'
  | 'formFound'
  | 'promisedBraids'
  | 'sulking'
  | 'askedBreakfast';

/** What a lane (you / her) was doing over a stretch of minutes, for the morning plot. */
export type Span = {
  lane: 'parent' | 'child';
  kind: 'task' | 'help' | 'incident' | 'blocked';
  task?: TaskId;
  start: number;
  end: number;
};

export type LogEntry = { minute: number; text: string; notable?: boolean };

export type Mood = 0 | 1 | 2 | 3 | 4 | 5;

export type HairStyle = 'down' | 'ponytail' | 'pigtails' | 'braids';
export type Breakfast = 'toast' | 'oatmeal' | 'pancakes' | 'cereal';

/** What a choice in a problem window did: shown before the next thing happens. */
export type Outcome = { title: string; choice: string; lines: string[]; costs: string[]; good: boolean };

/** The endgame: a wave of contacts, announced in advance. When it lands, each one becomes a problem. */
export type Wave = { at: number; size: number; announced: number };

export type Weather = 'clear' | 'rain' | 'cold';
export type EventId = 'stuffy' | 'festival' | 'project' | 'paperwork' | 'assembly' | 'picture' | 'library';
export type PerkId = 'shoeRack' | 'chart' | 'spoons' | 'hooks' | 'calendar';

/** One piece of intel on the morning briefing. `claims` is what it says today's event is. */
export type Intel = {
  id: number;
  source: string;
  text: string;
  grade: string; // admiralty-style reliability, e.g. "C3"
  claims?: EventId | 'none';
  minute: number;
};

/** What today actually is. The player only sees what intel has revealed. */
export type Day = {
  label: string; // "Tuesday", "Week 2 · Monday"
  weekday: number; // 0 = Monday … 4 = Friday
  weather: Weather;
  rainChance: number; // the forecast's figure, 0..1
  event?: EventId;
  eventKnown: boolean; // event (or its absence) confirmed
  weatherKnown: boolean;
  lookedOutside?: string; // the last look out of the window, when it didn't settle anything
  schoolStart: number; // real start (a trip or a meeting moves it)
  meeting: boolean; // the principal wants a word: be there by 07:50
};

export type GameState = {
  seed: number;
  rng: number; // current RNG state
  minute: number;
  departureDeadline: number;
  wakeMinute: number; // when she will wake naturally
  childAwake: boolean;
  wokenAt?: number;
  groggyUntil?: number;
  groggyLevel: number; // 0..1 strength while groggy
  householdMood: Mood;
  coffeeBuffer: boolean;
  objectives: Record<TaskId, Objective>;
  parentActivity?: TaskId | 'help';
  childActivity?: TaskId;
  incidents: OpenIncident[];
  firedIncidents: IncidentId[];
  nextUid: number;
  flags: Flag[];
  morningCondition: MorningCondition;
  childTendency: ChildTendency;
  day: Day;
  intel: Intel[];
  breakfastWant: Breakfast; // what she'll want today; hidden
  breakfastChoice?: Breakfast; // what you're making (or made)
  hairWant: HairStyle; // what she wants done with her hair today
  hairStyle?: HairStyle; // what she ended up with
  carStuffyWant: boolean; // some days a stuffy has to come in the car
  caffeinatedUntil?: number; // coffee: you work faster until then
  outcome?: Outcome; // the result of the last choice, until you carry on
  wave?: Wave; // inbound, if any
  waves: number; // how many have landed this morning
  nextWaveAt?: number;
  fate: number; // fate points carried by the run; spent here
  perks: PerkId[];
  week: number;
  history: LogEntry[];
  spans: Span[];
  ended: boolean;
  departedAt?: number;
};

export type Action =
  | { type: 'startParent'; task: TaskId; variant?: Breakfast }
  | { type: 'askBreakfast' }
  | { type: 'ack' }
  | { type: 'help' }
  | { type: 'assignChild'; task: TaskId }
  | { type: 'wakeNow' }
  | { type: 'wait' }
  | { type: 'respond'; response: string; fate?: boolean }
  | { type: 'ask' }
  | { type: 'favor' }
  | { type: 'defer' }
  | { type: 'reopen'; uid: number }
  | { type: 'leave' };
