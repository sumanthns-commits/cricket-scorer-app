import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import type { BallEntry, Player } from '../types';
import type { BatterStats, BowlerStats } from '../services/inningsState';

// Presentational pieces of the live scoring header/crease/ball-strip UI,
// shared between LiveScoring (the scorer's editable view — passes onEdit/
// onToggleHand handlers) and MatchScorecard's read-only live view for
// spectators (omits them, so rows render without any edit affordance).

export function ScoreHeader({
  runs, wickets, overNumber, legalBalls, ballsPerOver, matchName,
}: {
  runs: number; wickets: number; overNumber: number; legalBalls: number; ballsPerOver: number; matchName: string;
}) {
  const theme = useThemeStore((s) => s.theme);
  const oversDisplay = `${overNumber}.${legalBalls}`;
  const ballsBowled = overNumber * ballsPerOver + legalBalls;
  const crr = ballsBowled > 0 ? ((runs * ballsPerOver) / ballsBowled).toFixed(2) : '0.00';
  return (
    <View style={{ backgroundColor: theme.surface, padding: 20, paddingTop: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 4 }}>{matchName}</Text>
      <Text style={{ color: theme.text, fontSize: 52, fontWeight: '800', textAlign: 'center', lineHeight: 58 }}>
        {runs}<Text style={{ color: theme.textMuted, fontSize: 32, fontWeight: '600' }}>/{wickets}</Text>
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center' }}>
        {oversDisplay} ov{ballsPerOver !== 6 ? ` (${ballsPerOver} ball overs)` : ''} · CRR {crr}
      </Text>
    </View>
  );
}

export function BatterRow({
  player,
  stats,
  onStrike,
  hand,
  onToggleHand,
  onEdit,
  showStrikeHint,
}: {
  player: Player | undefined;
  stats: BatterStats;
  onStrike: boolean;
  hand: 'RHB' | 'LHB';
  onToggleHand?: () => void;
  onEdit?: () => void;
  showStrikeHint?: boolean;
}) {
  const theme = useThemeStore((s) => s.theme);
  const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '–';
  const HandChip = onToggleHand ? TouchableOpacity : View;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      {/* Strike bar */}
      <View
        style={{
          width: 4, height: 36, borderRadius: 2,
          backgroundColor: onStrike ? theme.accent : 'transparent',
          marginRight: 10,
          shadowColor: onStrike ? theme.accent : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: onStrike ? 0.9 : 0,
          shadowRadius: 6,
        }}
      />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
            {player?.displayName ?? '–'}
          </Text>
          {onStrike ? (
            <View style={{ backgroundColor: theme.accentDim, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '700' }}>ON STRIKE</Text>
            </View>
          ) : showStrikeHint ? (
            <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '600', fontStyle: 'italic' }}>tap to face</Text>
          ) : null}
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
          SR {sr} · {stats.fours}×4 · {stats.sixes}×6
        </Text>
      </View>

      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 4 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}

      <HandChip
        onPress={onToggleHand}
        style={{
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
          marginRight: 14,
        }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{hand}</Text>
      </HandChip>

      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', minWidth: 36, textAlign: 'right' }}>
        {stats.runs}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, marginLeft: 2, minWidth: 28 }}>
        ({stats.balls})
      </Text>
    </View>
  );
}

export function BowlerRow({
  player,
  stats,
  ballsPerOver,
  onEdit,
}: {
  player: Player | undefined;
  stats: BowlerStats;
  ballsPerOver: number;
  onEdit?: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const oversFull = stats.completedOvers + (stats.legalBalls % ballsPerOver) / 10;
  const economy = stats.legalBalls > 0
    ? ((stats.runsConceded / stats.legalBalls) * ballsPerOver).toFixed(1)
    : '–';
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: theme.surfaceAlt,
        borderBottomWidth: 1, borderBottomColor: theme.border,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 13, marginRight: 8 }}>🎯</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1 }}>{player?.displayName ?? '–'}</Text>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 6 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        {oversFull.toFixed(1)}-0-{stats.runsConceded}-{stats.wickets}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 10 }}>econ {economy}</Text>
    </View>
  );
}

export function BallCircle({ ball, dim }: { ball: BallEntry; dim?: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const isDot = ball.runs === 0 && !ball.extras && !ball.dismissal;
  const isWicket = !!ball.dismissal;
  const isWide = ball.extras?.type === 'wide';
  const isNoBall = ball.extras?.type === 'no-ball';
  const isBye = ball.extras?.type === 'bye';
  const isLegBye = ball.extras?.type === 'leg-bye';
  const isFour = ball.runs === 4 && !ball.extras;
  const isSix = ball.runs === 6 && !ball.extras;

  // Segments describing what happened on this ball, joined with " + " when
  // there's more than one — e.g. a no-ball with a bat run and a run-out
  // becomes ["NB", "1", "W"] → "NB + 1 + W", and a bare no-ball run-out with
  // no extra run becomes ["NB", "W"] → "NB + W" — so the runs/extras info is
  // never swallowed by the wicket. Byes/leg-byes always carry a run count
  // (only ever signalled with runs > 0); wide/no-ball only add a numeric
  // segment when there's something beyond the bare extra.
  const segments: string[] = [];
  if (isWide) {
    segments.push('Wd');
    // extras.runs is the wide's total (the automatic 1 + any runs actually
    // run) — only the amount beyond that automatic 1 belongs in the label.
    if (ball.extras!.runs > 1) segments.push(String(ball.extras!.runs - 1));
  } else if (isNoBall) {
    segments.push('NB');
    if (ball.runs > 0) segments.push(String(ball.runs));
  } else if (isBye) {
    segments.push('B', String(ball.extras!.runs));
  } else if (isLegBye) {
    segments.push('LB', String(ball.extras!.runs));
  } else if (ball.runs > 0) {
    segments.push(String(ball.runs));
  } else if (isDot) {
    segments.push('•');
  }
  if (isWicket) segments.push('W');

  // A "pure" wicket (no runs/extras — bowled/caught/etc., the overwhelming
  // majority of dismissals) keeps the classic fully-red badge exactly as
  // before. A wicket paired with runs/extras instead keeps the badge's
  // normal colouring and highlights only the "W" segment in red, so the
  // runs/extras info stays legible instead of being swallowed by a solid
  // red tile — the "W" itself is still always red, as it was before.
  const isPureWicket = isWicket && segments.length === 1;
  const isCompound = segments.length > 1;

  const sixBg = theme.id === 'light' ? '#ede9fe' : '#2d1a5f';
  const bg = isPureWicket ? '#dc2626' : isSix ? sixBg : isFour ? theme.accentDim : theme.surface;
  const border = isPureWicket ? '#dc2626' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.border;
  const textColor = isPureWicket ? '#ffffff' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.textSecondary;

  return (
    <View
      style={{
        minWidth: 34, height: 34, borderRadius: 17,
        paddingHorizontal: isCompound ? 6 : 0,
        backgroundColor: bg,
        borderWidth: 1.5, borderColor: border,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 6,
        opacity: dim ? 0.45 : 1,
      }}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: isCompound ? 11 : 12, fontWeight: '700' }}>
        {segments.map((seg, i) => (
          <Text key={i}>
            {i > 0 ? <Text style={{ color: theme.textMuted }}> + </Text> : null}
            <Text style={{ color: seg === 'W' ? (isPureWicket ? '#ffffff' : '#dc2626') : textColor }}>{seg}</Text>
          </Text>
        ))}
      </Text>
    </View>
  );
}
