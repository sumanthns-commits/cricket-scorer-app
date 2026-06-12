import type { BallEntry, CustomDismissal, ExtrasType, StandardDismissalType } from '../types';

export interface EngineState {
  legalBallsInOver: number;
}

export interface BallInput {
  batsmanId: string;
  bowlerId: string;
  runs: number;
  extras?: { type: ExtrasType; runs: number };
  dismissal?: { type: string; fielderId?: string; fielderIds?: string[] };
}

export interface BallResult {
  ballEntry: BallEntry;
  runsScored: number;
  isLegalDelivery: boolean;
  bowlerGetsWicket: boolean;
  batterIsOut: boolean;
  newLegalBallsInOver: number;
  isOverComplete: boolean;
  rotateStrike: boolean;
}

export interface DismissalConfig {
  ballsPerOver: number;
  customDismissals: CustomDismissal[];
}

const STD_WICKET: Record<StandardDismissalType, { bowlerGetsWicket: boolean }> = {
  caught:              { bowlerGetsWicket: true },
  bowled:              { bowlerGetsWicket: true },
  lbw:                 { bowlerGetsWicket: true },
  'run-out':           { bowlerGetsWicket: false },
  stumped:             { bowlerGetsWicket: false },
  'hit-wicket':        { bowlerGetsWicket: true },
  'obstructing-field': { bowlerGetsWicket: false },
  'timed-out':         { bowlerGetsWicket: false },
  'handled-ball':      { bowlerGetsWicket: false },
  'hit-ball-twice':    { bowlerGetsWicket: false },
};

export function recordBall(
  state: EngineState,
  input: BallInput,
  config?: DismissalConfig,
): BallResult {
  const ballsPerOver = config?.ballsPerOver ?? 6;
  const extrasType = input.extras?.type;
  const extrasRuns = input.extras?.runs ?? 0;

  let isLegalDelivery = extrasType !== 'wide' && extrasType !== 'no-ball';
  let runsScored = input.runs + extrasRuns;
  let batterIsOut = false;
  let bowlerGetsWicket = false;

  if (input.dismissal) {
    const custom = config?.customDismissals.find((d) => d.id === input.dismissal!.type);
    if (custom) {
      batterIsOut = custom.batterIsOut;
      bowlerGetsWicket = custom.bowlerGetsWicket;
      isLegalDelivery = custom.isLegalDelivery;
      if (custom.runsScored !== undefined) runsScored = custom.runsScored;
    } else {
      const std = STD_WICKET[input.dismissal.type as StandardDismissalType];
      if (std) {
        batterIsOut = true;
        bowlerGetsWicket = std.bowlerGetsWicket;
      }
    }
  }

  const newLegalBallsInOver = isLegalDelivery
    ? state.legalBallsInOver + 1
    : state.legalBallsInOver;

  const isOverComplete = newLegalBallsInOver >= ballsPerOver;

  // XOR: odd runs rotate strike; end of over rotates again; these cancel out
  const oddRuns = runsScored % 2 !== 0;
  const rotateStrike = batterIsOut ? false : oddRuns !== isOverComplete;

  const ballEntry: BallEntry = {
    runs: input.runs,
    batsmanId: input.batsmanId,
    ...(input.extras ? { extras: input.extras } : {}),
    ...(input.dismissal
      ? {
          dismissal: {
            type: input.dismissal.type,
            fielderId: input.dismissal.fielderId,
            fielderIds: input.dismissal.fielderIds,
            bowlerId: input.bowlerId,
          },
        }
      : {}),
  };

  return {
    ballEntry,
    runsScored,
    isLegalDelivery,
    bowlerGetsWicket,
    batterIsOut,
    newLegalBallsInOver,
    isOverComplete,
    rotateStrike,
  };
}
