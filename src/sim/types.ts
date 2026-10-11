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
  | 'shoesOn';

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
  | 'bathroom';

export type OpenIncident = {
  uid: number;
  id: IncidentId;
  task?: TaskId;
  minute: number;
  status: 'open' | 'deferred';
  note?: string; // replaces the default detail line after a partial resolution
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
  | 'bathroomDone'
  | 'deadlinePassed';

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
  history: LogEntry[];
  spans: Span[];
  ended: boolean;
  departedAt?: number;
};

export type Action =
  | { type: 'startParent'; task: TaskId }
  | { type: 'help' }
  | { type: 'assignChild'; task: TaskId }
  | { type: 'wakeNow' }
  | { type: 'wait' }
  | { type: 'respond'; response: string }
  | { type: 'defer' }
  | { type: 'reopen'; uid: number }
  | { type: 'leave' };
