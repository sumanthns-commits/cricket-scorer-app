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
  const isFour = ball.runs === 4 && !ball.extras;
  const isSix = ball.runs === 6 && !ball.extras;

  const sixBg = theme.id === 'light' ? '#ede9fe' : '#2d1a5f';
  const bg = isWicket ? '#dc2626' : isSix ? sixBg : isFour ? theme.accentDim : theme.surface;
  const border = isWicket ? '#dc2626' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.border;
  const textColor = isWicket ? '#ffffff' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.textSecondary;
  const label = isWicket
    ? 'W'
    : isWide
    ? `W${ball.extras!.runs > 1 ? ball.extras!.runs : ''}`
    : isNoBall
    ? `NB${ball.runs > 0 ? `+${ball.runs}` : ''}`
    : isDot
    ? '•'
    : String(ball.runs + (ball.extras?.runs ?? 0));

  return (
    <View
      style={{
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: bg,
        borderWidth: 1.5, borderColor: border,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 6,
        opacity: dim ? 0.45 : 1,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}
