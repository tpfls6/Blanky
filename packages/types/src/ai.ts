/** Input routing only; Planner execution belongs to a later phase. */
export type InputRoute =
  | { route: 'parser'; reason: 'simple_schedule' }
  | { route: 'ai'; reason: 'complex_sentence' | 'low_confidence' }
  | { route: 'planner'; reason: 'planning_request' }
