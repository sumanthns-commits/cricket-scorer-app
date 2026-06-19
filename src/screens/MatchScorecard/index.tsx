import { useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Share, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, getMatchOvers, getClubPlayers } from '../../services/matchService';
import { buildInningsCard, formatDismissal, type InningsCard } from '../../services/scorecard';
import { useThemeStore } from '../../store/themeStore';
import type { CustomDismissal, Match } from '../../types';

type Route = RouteProp<RootStackParamList, 'MatchScorecard'>;

const SNAPSHOT_WIDTH = 390;
const SNAP_BG = '#0f172a';
const SNAP_SURFACE = '#1e293b';
const SNAP_BORDER = '#334155';
const SNAP_TEXT = '#f1f5f9';
const SNAP_MUTED = '#94a3b8';
const SNAP_ACCENT = '#22c55e';
const SNAP_GOLD = '#d97706';

function CaptainBadge() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{
      backgroundColor: theme.accentDim, borderRadius: 4, borderWidth: 1, borderColor: theme.accent,
      paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start',
    }}>
      <Text style={{ color: theme.accent, fontSize: 9, fontWeight: '800' }}>C</Text>
    </View>
  );
}

function InningsView({
  card,
  nameOf,
  captains,
  customDismissals,
}: {
  card: InningsCard;
  nameOf: (id: string) => string;
  captains: Set<string>;
  customDismissals: CustomDismissal[];
}) {
  const theme = useThemeStore((s) => s.theme);
  const num = { width: 38, textAlign: 'right' as const, color: theme.textSecondary, fontSize: 13 };
  const bnum = { width: 44, textAlign: 'right' as const, color: theme.textSecondary, fontSize: 13 };

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>
        {card.totalRuns}/{card.totalWickets}{' '}
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>({card.overs} ov)</Text>
      </Text>

      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>BATTING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11 }}>Batter</Text>
        {['R', 'B', '4s', '6s', 'SR'].map((h) => (
          <Text key={h} style={{ width: 38, textAlign: 'right', color: theme.textMuted, fontSize: 11 }}>{h}</Text>
        ))}
      </View>
      {card.batting.map((b) => {
        const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : '–';
        return (
          <View key={b.id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: theme.text, fontSize: 13 }}>{nameOf(b.id)}</Text>
                {captains.has(b.id) && <CaptainBadge />}
              </View>
              <Text style={{ color: b.out ? theme.textMuted : theme.accent, fontSize: 10 }}>
                {b.out ? (b.dismissal ? formatDismissal(b.dismissal, nameOf, customDismissals) : (b.dismissalText ?? 'out')) : 'not out'}
              </Text>
            </View>
            <Text style={num}>{b.runs}</Text>
            <Text style={num}>{b.balls}</Text>
            <Text style={num}>{b.fours}</Text>
            <Text style={num}>{b.sixes}</Text>
            <Text style={num}>{sr}</Text>
          </View>
        );
      })}

      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 6 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11 }}>Bowler</Text>
        {['O', 'R', 'W', 'Econ'].map((h) => (
          <Text key={h} style={{ width: 44, textAlign: 'right', color: theme.textMuted, fontSize: 11 }}>{h}</Text>
        ))}
      </View>
      {card.bowling.map((b) => {
        const oversNum = b.balls / 6;
        const econ = b.balls > 0 ? (b.runs / oversNum).toFixed(1) : '–';
        return (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: theme.text, fontSize: 13 }}>{nameOf(b.id)}</Text>
              {captains.has(b.id) && <CaptainBadge />}
            </View>
            <Text style={bnum}>{Math.floor(b.balls / 6)}.{b.balls % 6}</Text>
            <Text style={bnum}>{b.runs}</Text>
            <Text style={bnum}>{b.wickets}</Text>
            <Text style={bnum}>{econ}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Snapshot-only components (fixed dark theme, no Zustand) ──────────────────

function SnapInningsTable({ card, nameOf, label, customDismissals }: { card: InningsCard; nameOf: (id: string) => string; label: string; customDismissals: CustomDismissal[] }) {
  const num = { width: 36, textAlign: 'right' as const, color: SNAP_MUTED, fontSize: 12 };
  const bnum = { width: 42, textAlign: 'right' as const, color: SNAP_MUTED, fontSize: 12 };

  return (
    <View style={{ marginTop: 12 }}>
      {/* Innings header */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Text style={{ color: SNAP_ACCENT, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: SNAP_TEXT, fontSize: 18, fontWeight: '800' }}>
          {card.totalRuns}/{card.totalWickets}
        </Text>
        <Text style={{ color: SNAP_MUTED, fontSize: 12 }}>({card.overs} ov)</Text>
      </View>

      {/* Batting */}
      <Text style={{ color: SNAP_MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>BATTING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 3 }}>
        <Text style={{ flex: 1, color: SNAP_MUTED, fontSize: 10 }}>Batter</Text>
        {['R', 'B', '4s', '6s', 'SR'].map((h) => (
          <Text key={h} style={{ width: 36, textAlign: 'right', color: SNAP_MUTED, fontSize: 10 }}>{h}</Text>
        ))}
      </View>
      {card.batting.map((b) => {
        const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : '–';
        return (
          <View key={b.id} style={{ flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1, borderTopColor: SNAP_BORDER }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: SNAP_TEXT, fontSize: 12 }}>{nameOf(b.id)}</Text>
              <Text style={{ color: b.out ? SNAP_MUTED : SNAP_ACCENT, fontSize: 10 }}>{b.out ? (b.dismissal ? formatDismissal(b.dismissal, nameOf, customDismissals) : (b.dismissalText ?? 'out')) : 'not out'}</Text>
            </View>
            <Text style={num}>{b.runs}</Text>
            <Text style={num}>{b.balls}</Text>
            <Text style={num}>{b.fours}</Text>
            <Text style={num}>{b.sixes}</Text>
            <Text style={num}>{sr}</Text>
          </View>
        );
      })}

      {/* Bowling */}
      <Text style={{ color: SNAP_MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 10, marginBottom: 4 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 3 }}>
        <Text style={{ flex: 1, color: SNAP_MUTED, fontSize: 10 }}>Bowler</Text>
        {['O', 'R', 'W', 'Econ'].map((h) => (
          <Text key={h} style={{ width: 42, textAlign: 'right', color: SNAP_MUTED, fontSize: 10 }}>{h}</Text>
        ))}
      </View>
      {card.bowling.map((b) => {
        const oversNum = b.balls / 6;
        const econ = b.balls > 0 ? (b.runs / oversNum).toFixed(1) : '–';
        return (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: SNAP_BORDER }}>
            <Text style={{ flex: 1, color: SNAP_TEXT, fontSize: 12 }}>{nameOf(b.id)}</Text>
            <Text style={bnum}>{Math.floor(b.balls / 6)}.{b.balls % 6}</Text>
            <Text style={bnum}>{b.runs}</Text>
            <Text style={bnum}>{b.wickets}</Text>
            <Text style={bnum}>{econ}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ScorecardSnapshot({
  match,
  card1,
  card2,
  nameOf,
  customDismissals,
}: {
  match: Match;
  card1: InningsCard | null;
  card2: InningsCard | null;
  nameOf: (id: string) => string;
  customDismissals: CustomDismissal[];
}) {
  const dateStr = match.date
    ? new Date(match.date.toMillis()).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <View style={{ width: SNAPSHOT_WIDTH, backgroundColor: SNAP_BG, padding: 20 }}>
      {/* Brand header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: SNAP_ACCENT, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Crease</Text>
        <Text style={{ color: SNAP_MUTED, fontSize: 11 }}>{dateStr}</Text>
      </View>

      {/* Match title */}
      <View style={{ backgroundColor: SNAP_SURFACE, borderRadius: 10, padding: 14, marginBottom: 4 }}>
        <Text style={{ color: SNAP_TEXT, fontSize: 16, fontWeight: '800' }}>
          {match.homeTeam} vs {match.awayTeam}
        </Text>
        {match.venue ? (
          <Text style={{ color: SNAP_MUTED, fontSize: 11, marginTop: 2 }}>{match.venue}</Text>
        ) : null}
        {match.result ? (
          <Text style={{ color: SNAP_GOLD, fontSize: 13, fontWeight: '600', marginTop: 6 }}>{match.result}</Text>
        ) : null}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: SNAP_BORDER, marginVertical: 14 }} />

      {/* Innings tables */}
      {card1 && <SnapInningsTable card={card1} nameOf={nameOf} label="INNINGS 1" customDismissals={customDismissals} />}
      {card1 && card2 && <View style={{ height: 1, backgroundColor: SNAP_BORDER, marginVertical: 14 }} />}
      {card2 && <SnapInningsTable card={card2} nameOf={nameOf} label="INNINGS 2" customDismissals={customDismissals} />}

      {/* Footer */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: SNAP_BORDER }}>
        <Text style={{ color: SNAP_MUTED, fontSize: 10 }}>Scored with </Text>
        <Text style={{ color: SNAP_ACCENT, fontSize: 10, fontWeight: '700' }}>Crease</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MatchScorecardScreen() {
  const { params } = useRoute<Route>();
  const { clubId, matchId } = params;
  const [innings, setInnings] = useState<1 | 2>(1);
  const [sharing, setSharing] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const snapshotRef = useRef<ViewShot>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scorecard', clubId, matchId],
    queryFn: async () => {
      const [match, overs, players] = await Promise.all([
        getMatch(clubId, matchId),
        getMatchOvers(clubId, matchId),
        // Non-members may not have permission to read the players subcollection;
        // fall back to an empty map so the scorecard still renders with IDs.
        getClubPlayers(clubId).catch(() => [] as import('../../types').Player[]),
      ]);
      const ballsPerOver = match?.rules.ballsPerOver ?? 6;
      const first = overs.filter((o) => o.inningsId === 'innings-1');
      const second = overs.filter((o) => o.inningsId === 'innings-2');
      const summary = match?.inningsSummary;
      return {
        match,
        nameMap: Object.fromEntries(players.map((p) => [p.id, p.displayName])) as Record<string, string>,
        card1: first.length ? buildInningsCard(first, ballsPerOver) : summary?.['1'] ?? null,
        card2: second.length ? buildInningsCard(second, ballsPerOver) : summary?.['2'] ?? null,
      };
    },
  });

  async function handleShare() {
    if (!snapshotRef.current || !data?.match) return;
    try {
      setSharing(true);
      const uri = await captureRef(snapshotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Scorecard',
          UTI: 'public.png',
        });
      } else {
        // Fallback: text share (e.g. web / simulator)
        await Share.share({ message: formatTextScorecard(data) });
      }
    } catch {
      // user cancelled or error — nothing to do
    } finally {
      setSharing(false);
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center' }}>Could not load scorecard.</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 }}>You may not have access to this club's data.</Text>
      </View>
    );
  }

  const { match, nameMap, card1, card2 } = data;
  const nameOf = (id: string) => nameMap[id] ?? id;
  const hasBoth = !!card1 && !!card2;
  const card = innings === 1 ? card1 : card2;
  const captains = new Set([match?.captainA, match?.captainB].filter(Boolean) as string[]);
  const customDismissals = match?.rules.customDismissals ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Off-screen snapshot (rendered but hidden via absolute position off-viewport) */}
      <View style={{ position: 'absolute', top: -9999, left: 0 }} pointerEvents="none">
        <ViewShot ref={snapshotRef} options={{ format: 'png', quality: 1 }}>
          {match && (
            <ScorecardSnapshot match={match} card1={card1} card2={card2} nameOf={nameOf} customDismissals={customDismissals} />
          )}
        </ViewShot>
      </View>

      {/* Header */}
      <View style={{ padding: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
            {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match'}
          </Text>
          {match?.result ? (
            <Text style={{ color: '#d97706', fontSize: 13, marginTop: 2 }}>{match.result}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={handleShare}
          disabled={sharing}
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
            backgroundColor: theme.accentDim, borderWidth: 1, borderColor: theme.accent,
            flexDirection: 'row', alignItems: 'center', gap: 6, opacity: sharing ? 0.5 : 1,
          }}
        >
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>
            {sharing ? 'Preparing…' : 'Share'}
          </Text>
        </TouchableOpacity>
      </View>

      {hasBoth && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
          {([1, 2] as const).map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setInnings(n)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                backgroundColor: innings === n ? theme.accentDim : theme.surface,
                borderWidth: 1, borderColor: innings === n ? theme.accent : theme.border,
              }}
            >
              <Text style={{ color: innings === n ? theme.accent : theme.textMuted, fontWeight: '600' }}>
                Innings {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {card ? (
          <InningsView card={card} nameOf={nameOf} captains={captains} customDismissals={customDismissals} />
        ) : (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>No scorecard data.</Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTextScorecard(data: { match: Match | null; nameMap: Record<string, string>; card1: InningsCard | null; card2: InningsCard | null }) {
  const { match, nameMap, card1, card2 } = data;
  const nameOf = (id: string) => nameMap[id] ?? id;
  const lines: string[] = [];

  lines.push(`🏏 ${match?.homeTeam ?? ''} vs ${match?.awayTeam ?? ''}`);
  if (match?.result) lines.push(`🏆 ${match.result}`);
  lines.push('');

  const formatInnings = (card: InningsCard, label: string) => {
    lines.push(`${label}: ${card.totalRuns}/${card.totalWickets} (${card.overs} ov)`);
    lines.push('Batting:');
    card.batting.forEach((b) => {
      const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : '-';
      lines.push(`  ${nameOf(b.id)} – ${b.runs}(${b.balls}) [${b.fours}x4 ${b.sixes}x6 SR:${sr}]${b.out ? '' : ' *'}`);
    });
    lines.push('Bowling:');
    card.bowling.forEach((b) => {
      const overs = `${Math.floor(b.balls / 6)}.${b.balls % 6}`;
      const econ = b.balls > 0 ? ((b.runs / (b.balls / 6))).toFixed(1) : '-';
      lines.push(`  ${nameOf(b.id)} – ${overs}-${b.runs}-${b.wickets} (Econ: ${econ})`);
    });
    lines.push('');
  };

  if (card1) formatInnings(card1, 'Innings 1');
  if (card2) formatInnings(card2, 'Innings 2');
  lines.push('Scored with Crease 🏏');

  return lines.join('\n');
}
