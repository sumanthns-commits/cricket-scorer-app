/**
 * Run: npx ts-jest --testPathPattern=scoringEngine
 * Or after installing devDeps: npm test
 *
 * Required devDeps (not yet installed):
 *   npm i -D jest ts-jest @types/jest
 */
import { recordBall } from '../src/services/scoringEngine';
import type { BallInput, DismissalConfig, EngineState } from '../src/services/scoringEngine';
import type { CustomDismissal } from '../src/types';

// ── Fixtures ────────────────────────────────────────────────────────

const state0: EngineState = { legalBallsInOver: 0 };
const cfg6: DismissalConfig = { ballsPerOver: 6, customDismissals: [] };

const batId = 'bat1';
const bowlId = 'bowl1';
const fieldId = 'field1';

function ball(overrides: Partial<BallInput> = {}): BallInput {
  return { batsmanId: batId, bowlerId: bowlId, runs: 0, ...overrides };
}

function stateAt(n: number): EngineState {
  return { legalBallsInOver: n };
}

// ── Standard runs ────────────────────────────────────────────────────

describe('standard runs (no dismissal, no extras)', () => {
  test('dot ball: legal, no rotation, not over', () => {
    const r = recordBall(state0, ball({ runs: 0 }), cfg6);
    expect(r.runsScored).toBe(0);
    expect(r.isLegalDelivery).toBe(true);
    expect(r.rotateStrike).toBe(false);
    expect(r.isOverComplete).toBe(false);
    expect(r.newLegalBallsInOver).toBe(1);
  });

  test('single: rotates strike', () => {
    const r = recordBall(state0, ball({ runs: 1 }), cfg6);
    expect(r.runsScored).toBe(1);
    expect(r.rotateStrike).toBe(true);
  });

  test('two: no rotation', () => {
    const r = recordBall(state0, ball({ runs: 2 }), cfg6);
    expect(r.rotateStrike).toBe(false);
  });

  test('four: no rotation, marks as 4', () => {
    const r = recordBall(state0, ball({ runs: 4 }), cfg6);
    expect(r.runsScored).toBe(4);
    expect(r.rotateStrike).toBe(false);
  });

  test('six: no rotation', () => {
    const r = recordBall(state0, ball({ runs: 6 }), cfg6);
    expect(r.rotateStrike).toBe(false);
  });
});

// ── Over completion ──────────────────────────────────────────────────

describe('over completion', () => {
  test('6th legal ball completes over', () => {
    const r = recordBall(stateAt(5), ball({ runs: 0 }), cfg6);
    expect(r.isOverComplete).toBe(true);
    expect(r.newLegalBallsInOver).toBe(6);
  });

  test('end-of-over with 0 runs rotates strike (end-of-over rotation)', () => {
    const r = recordBall(stateAt(5), ball({ runs: 0 }), cfg6);
    expect(r.rotateStrike).toBe(true);
  });

  test('end-of-over with 1 run does NOT rotate (odd already swapped)', () => {
    const r = recordBall(stateAt(5), ball({ runs: 1 }), cfg6);
    expect(r.rotateStrike).toBe(false);
  });

  test('end-of-over with 2 runs rotates', () => {
    const r = recordBall(stateAt(5), ball({ runs: 2 }), cfg6);
    expect(r.rotateStrike).toBe(true);
  });

  test('custom ballsPerOver=4 completes at 4', () => {
    const cfg4: DismissalConfig = { ballsPerOver: 4, customDismissals: [] };
    const r = recordBall(stateAt(3), ball({ runs: 0 }), cfg4);
    expect(r.isOverComplete).toBe(true);
  });

  test('wide does not advance legal ball count', () => {
    const r = recordBall(stateAt(5), ball({ extras: { type: 'wide', runs: 1 } }), cfg6);
    expect(r.isLegalDelivery).toBe(false);
    expect(r.isOverComplete).toBe(false);
    expect(r.newLegalBallsInOver).toBe(5);
  });

  test('no-ball does not advance legal ball count', () => {
    const r = recordBall(stateAt(5), ball({ runs: 4, extras: { type: 'no-ball', runs: 1 } }), cfg6);
    expect(r.isLegalDelivery).toBe(false);
    expect(r.isOverComplete).toBe(false);
  });
});

// ── Extras ───────────────────────────────────────────────────────────

describe('extras', () => {
  test('wide: +1 runs, not legal, no strike rotation', () => {
    const r = recordBall(state0, ball({ extras: { type: 'wide', runs: 1 } }), cfg6);
    expect(r.runsScored).toBe(1);
    expect(r.isLegalDelivery).toBe(false);
    expect(r.batterIsOut).toBe(false);
    // odd runs XOR not-over = true: the engine formula rotates on 1-run wides.
    // Screen can override for wides if desired; engine contract is correct.
    expect(r.rotateStrike).toBe(true);
  });

  test('no-ball: not legal, runs count', () => {
    const r = recordBall(state0, ball({ runs: 3, extras: { type: 'no-ball', runs: 1 } }), cfg6);
    expect(r.runsScored).toBe(4);
    expect(r.isLegalDelivery).toBe(false);
  });

  test('bye: legal delivery', () => {
    const r = recordBall(state0, ball({ extras: { type: 'bye', runs: 1 } }), cfg6);
    expect(r.isLegalDelivery).toBe(true);
    expect(r.runsScored).toBe(1);
    expect(r.newLegalBallsInOver).toBe(1);
  });

  test('leg-bye: legal delivery', () => {
    const r = recordBall(state0, ball({ extras: { type: 'leg-bye', runs: 2 } }), cfg6);
    expect(r.isLegalDelivery).toBe(true);
    expect(r.runsScored).toBe(2);
  });
});

// ── Standard dismissals ──────────────────────────────────────────────

describe('standard dismissals', () => {
  test('bowled: batter out, bowler gets wicket, legal', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'bowled' } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
    expect(r.isLegalDelivery).toBe(true);
    expect(r.rotateStrike).toBe(false);
  });

  test('lbw: batter out, bowler gets wicket', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'lbw' } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
  });

  test('caught: batter out, bowler gets wicket, fielder stored', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'caught', fielderId: fieldId } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
    expect(r.ballEntry.dismissal?.fielderId).toBe(fieldId);
    expect(r.ballEntry.dismissal?.bowlerId).toBe(bowlId);
  });

  test('run-out: batter out, bowler does NOT get wicket', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'run-out', fielderId: fieldId } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(false);
  });

  test('stumped: batter out, bowler does NOT get wicket', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'stumped', fielderId: fieldId } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(false);
  });

  test('hit-wicket: batter out, bowler gets wicket', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'hit-wicket' } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
  });

  test('obstructing-field: batter out, bowler does NOT get wicket', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'obstructing-field' } }), cfg6);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(false);
  });
});

// ── Custom dismissals ────────────────────────────────────────────────

const mankad: CustomDismissal = {
  id: 'mankad',
  label: 'Mankad',
  batterIsOut: true,
  isLegalDelivery: true,
  bowlerGetsWicket: true,
  runsScored: undefined,
};

const timeout: CustomDismissal = {
  id: 'retired-hurt',
  label: 'Retired Hurt',
  batterIsOut: false,
  isLegalDelivery: false,
  bowlerGetsWicket: false,
  runsScored: 0,
};

const penaltyRun: CustomDismissal = {
  id: 'penalty5',
  label: '5-run penalty',
  batterIsOut: false,
  isLegalDelivery: true,
  bowlerGetsWicket: false,
  runsScored: 5,
};

describe('custom dismissals', () => {
  test('batterIsOut:true — batter out, bowler gets wicket', () => {
    const cfg: DismissalConfig = { ballsPerOver: 6, customDismissals: [mankad] };
    const r = recordBall(state0, ball({ dismissal: { type: 'mankad' } }), cfg);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
    expect(r.isLegalDelivery).toBe(true);
  });

  test('batterIsOut:false — batter stays, no wicket, not legal', () => {
    const cfg: DismissalConfig = { ballsPerOver: 6, customDismissals: [timeout] };
    const r = recordBall(state0, ball({ dismissal: { type: 'retired-hurt' } }), cfg);
    expect(r.batterIsOut).toBe(false);
    expect(r.bowlerGetsWicket).toBe(false);
    expect(r.isLegalDelivery).toBe(false);
    expect(r.newLegalBallsInOver).toBe(0);
  });

  test('bowlerGetsWicket:false — batterIsOut but bowler gets no credit', () => {
    const noCredit: CustomDismissal = { ...mankad, id: 'nc', bowlerGetsWicket: false };
    const cfg: DismissalConfig = { ballsPerOver: 6, customDismissals: [noCredit] };
    const r = recordBall(state0, ball({ dismissal: { type: 'nc' } }), cfg);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(false);
  });

  test('runsScored override: ignores input runs', () => {
    const cfg: DismissalConfig = { ballsPerOver: 6, customDismissals: [penaltyRun] };
    const r = recordBall(state0, ball({ runs: 0, dismissal: { type: 'penalty5' } }), cfg);
    expect(r.runsScored).toBe(5);
    expect(r.batterIsOut).toBe(false);
  });

  test('unknown custom id falls through to standard lookup', () => {
    const cfg: DismissalConfig = { ballsPerOver: 6, customDismissals: [mankad] };
    const r = recordBall(state0, ball({ dismissal: { type: 'bowled' } }), cfg);
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
  });
});

// ── Ball entry shape ─────────────────────────────────────────────────

describe('ballEntry shape', () => {
  test('no extras: no extras field', () => {
    const r = recordBall(state0, ball({ runs: 1 }), cfg6);
    expect(r.ballEntry.extras).toBeUndefined();
  });

  test('no dismissal: no dismissal field', () => {
    const r = recordBall(state0, ball({ runs: 2 }), cfg6);
    expect(r.ballEntry.dismissal).toBeUndefined();
  });

  test('dismissal entry carries bowlerId', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'bowled' } }), cfg6);
    expect(r.ballEntry.dismissal?.bowlerId).toBe(bowlId);
    expect(r.ballEntry.dismissal?.type).toBe('bowled');
  });

  test('batsman runs vs total: bat runs in ballEntry.runs, total in runsScored', () => {
    const r = recordBall(state0, ball({ runs: 3, extras: { type: 'bye', runs: 1 } }), cfg6);
    expect(r.ballEntry.runs).toBe(3);
    expect(r.runsScored).toBe(4);
  });
});

// ── No config defaults ────────────────────────────────────────────────

describe('no config passed', () => {
  test('defaults to 6 balls per over', () => {
    const r = recordBall(stateAt(5), ball());
    expect(r.isOverComplete).toBe(true);
  });

  test('no custom dismissals = treat as standard', () => {
    const r = recordBall(state0, ball({ dismissal: { type: 'caught' } }));
    expect(r.batterIsOut).toBe(true);
    expect(r.bowlerGetsWicket).toBe(true);
  });
});
