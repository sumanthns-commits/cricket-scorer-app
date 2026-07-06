import { wagonLabelFor } from '../constants/wagonPositions';
import type { BallDoc, CustomDismissal } from '../types';

export interface CommentaryEntry {
  id: string;
  type: 'ball' | 'over-end';
  overLabel?: string;      // e.g. "0.4" — only on 'ball' entries
  text?: string;           // e.g. "Anand to Hegde. 1 run to cover." — only on 'ball' entries
  isWicket?: boolean;
  overEndText?: string;    // e.g. "End of over 0: 8 runs, 1 wkt" — only on 'over-end' entries
}

// A shot already implying distance from the bat doesn't need a "deep" prefix.
const ALREADY_DEEP = new Set(['third man', 'fine leg']);

function sectorName(sector: number, isLHB: boolean): string {
  return wagonLabelFor(sector, isLHB).toLowerCase();
}

// Bare position name — used for boundaries (already "at the rope", so a
// "deep" prefix would be redundant) and dismissals.
function wagonPhrase(wagon: { sector: number; depth: number } | undefined, isLHB: boolean): string | null {
  if (!wagon) return null;
  return sectorName(wagon.sector, isLHB);
}

// Position name with a "deep" prefix when the shot reached the outfield
// without being a boundary (e.g. a well-struck two or a misfield saving four).
function wagonPhraseWithDepth(wagon: { sector: number; depth: number } | undefined, isLHB: boolean): string | null {
  if (!wagon) return null;
  const name = sectorName(wagon.sector, isLHB);
  if (wagon.depth >= 2 && !ALREADY_DEEP.has(name)) {
    return `deep ${name}`;
  }
  return name;
}

function dismissalPhrase(
  dismissal: NonNullable<BallDoc['dismissal']>,
  getName: (id: string) => string,
  customDismissals: CustomDismissal[],
  wagonText: string | null,
): string {
  const custom = customDismissals.find((d) => d.id === dismissal.type);
  if (custom) return custom.label;

  const fielders = (dismissal.fielderIds ?? []).map(getName).join(' & ');
  // The facing batter is already named in the sentence ("X to Y. Out! ...").
  // Only a non-striker dismissal needs calling out explicitly — otherwise the
  // reader has no way to tell it wasn't the facing batter who's out.
  const nonStrikerName = dismissal.nonStrikerOut ? getName(dismissal.outBatsmanId) : null;

  switch (dismissal.type) {
    case 'bowled': return 'Bowled!';
    case 'lbw': return 'LBW!';
    case 'caught': return fielders ? `Caught by ${fielders}${wagonText ? ` in ${wagonText}` : ''}` : 'Caught!';
    case 'stumped': return fielders ? `Stumped by ${fielders}` : 'Stumped!';
    case 'run-out': {
      const who = nonStrikerName ? `${nonStrikerName} run out` : 'Run out';
      return fielders ? `${who} (${fielders})` : `${who}!`;
    }
    case 'hit-wicket': return 'Hit wicket!';
    case 'obstructing-field': return 'Obstructing the field!';
    case 'timed-out': return 'Timed out!';
    case 'handled-ball': return 'Handled the ball!';
    case 'hit-ball-twice': return 'Hit the ball twice!';
    default: return 'Out!';
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

/**
 * Builds ball-by-ball commentary lines for a single innings, in chronological
 * order (oldest first) — reverse the result to show newest-first. Purely
 * derived from ball docs, so it works identically for a live innings and a
 * completed one.
 */
export function buildCommentary(
  balls: BallDoc[],
  getName: (id: string) => string,
  handOf: (id: string) => 'RHB' | 'LHB' | undefined,
  customDismissals: CustomDismissal[],
): CommentaryEntry[] {
  const sorted = [...balls].sort((a, b) => a.seq - b.seq);
  const entries: CommentaryEntry[] = [];

  let curOver = -1;
  let legalCount = 0;
  let overRuns = 0;
  let overWickets = 0;

  for (const ball of sorted) {
    if (ball.overNumber !== curOver) {
      curOver = ball.overNumber;
      legalCount = 0;
      overRuns = 0;
      overWickets = 0;
    }
    const isExtra = ball.extras?.type === 'wide' || ball.extras?.type === 'no-ball';
    if (!isExtra) legalCount++;
    const overLabel = `${curOver}.${isExtra ? Math.max(legalCount, 1) : legalCount}`;

    const bowler = getName(ball.bowlerId);
    const batsman = getName(ball.batsmanId);
    const isLHB = handOf(ball.batsmanId) === 'LHB';
    // Bare name for dismissals/boundaries (already "at the rope"); "deep"-
    // prefixed for anything running the outfield without reaching it.
    const wagonText = wagonPhrase(ball.wagon, isLHB);
    const wagonTextDeep = wagonPhraseWithDepth(ball.wagon, isLHB);
    const extraRuns = ball.extras?.runs ?? 0;

    overRuns += ball.runs + extraRuns;
    if (ball.dismissal) overWickets++;

    // Extras label always applies regardless of dismissal — a run-out off a
    // wide/no-ball/bye/leg-bye is common and must still say so.
    const extraLabel =
      ball.extras?.type === 'wide'
        ? (extraRuns > 1 ? `Wide, ${plural(extraRuns - 1, 'run')} extra` : 'Wide')
      : ball.extras?.type === 'no-ball'
        ? 'No ball'
      : ball.extras?.type === 'bye'
        ? `${plural(extraRuns, 'bye')}${wagonTextDeep ? ` to ${wagonTextDeep}` : ''}`
      : ball.extras?.type === 'leg-bye'
        ? `${plural(extraRuns, 'leg bye')}${wagonTextDeep ? ` to ${wagonTextDeep}` : ''}`
      : null;

    // What happened on the delivery itself (dismissal takes priority over
    // describing the shot; boundaries/sixes are checked even on a no-ball,
    // since the bat can still clear the rope off an illegal delivery).
    const eventNote = ball.dismissal && ball.fielding?.eventLabel ? ` (${ball.fielding.eventLabel})` : '';
    const mainText =
      ball.dismissal
        ? `Out! ${dismissalPhrase(ball.dismissal, getName, customDismissals, wagonText)}${eventNote}`
      : ball.runs === 4
        ? (wagonText ? `Boundary to ${wagonText}!` : 'Boundary!')
      : ball.runs === 6
        ? `Six!${wagonText ? ` Over ${wagonText}` : ''}`
      : ball.runs > 0
        ? `${plural(ball.runs, 'run')}${wagonTextDeep ? ` to ${wagonTextDeep}` : ''}`
      : null;

    const outcomeParts = [extraLabel, mainText].filter((p): p is string => !!p);
    const outcome = outcomeParts.length > 0 ? outcomeParts.join('. ') : 'No run';

    // A fielding event (misfield, great stop, ...) noted on a non-dismissal
    // ball. On a dismissal ball the event is already folded into mainText.
    const fielderIds = ball.fielding?.fielderIds ?? [];
    const fieldingNote = !ball.dismissal && fielderIds.length > 0
      ? ` ${ball.fielding!.eventLabel ?? 'Fielded'} by ${fielderIds.map(getName).join(' & ')}.`
      : '';

    const needsPeriod = !outcome.endsWith('.') && !outcome.endsWith('!');
    entries.push({
      id: ball.id,
      type: 'ball',
      overLabel,
      text: `${bowler} to ${batsman}. ${outcome}${needsPeriod ? '.' : ''}${fieldingNote}`,
      isWicket: !!ball.dismissal,
    });

    if (ball.isLastBallOfOver) {
      entries.push({
        id: `${ball.id}-over-end`,
        type: 'over-end',
        overEndText: `End of over ${curOver}: ${plural(overRuns, 'run')}${overWickets > 0 ? `, ${plural(overWickets, 'wkt')}` : ''}`,
      });
    }
  }

  return entries;
}
