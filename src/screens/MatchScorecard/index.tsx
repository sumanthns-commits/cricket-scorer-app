import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Share, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  getMatch,
  getMatchOvers,
  getMatchBalls,
  getClubPlayers,
  subscribeMatch,
  subscribeMatchBalls,
  ballDocsToOverDocs,
} from '../../services/matchService';
import { buildInningsCard, formatDismissal, type InningsCard } from '../../services/scorecard';
import { formatExtras } from '../../utils/extras';
import { buildCommentary } from '../../services/commentary';
import Commentary from '../../components/Commentary';
import { ScoreHeader, BatterRow, BowlerRow, BallCircle } from '../../components/LiveScoreboard';
import { buildInningsFromBalls, emptyBatterStats, emptyBowlerStats } from '../../services/inningsState';
import { useThemeStore } from '../../store/themeStore';
import type { BallDoc, CustomDismissal, Match } from '../../types';

// Target size of the "This over" strip, matching LiveScoring's ball strip.
const BALL_STRIP_SIZE = 6;

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
  const bnum = { width: 36, textAlign: 'right' as const, color: theme.textSecondary, fontSize: 13 };

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
      {card.extras && (
        <View style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
          <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 13 }}>Extras</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{formatExtras(card.extras)}</Text>
        </View>
      )}

      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 6 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11 }}>Bowler</Text>
        {['O', 'R', 'Ex', 'W', 'Econ'].map((h) => (
          <Text key={h} style={{ width: 36, textAlign: 'right', color: theme.textMuted, fontSize: 11 }}>{h}</Text>
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
            <Text style={bnum}>{b.extras ?? '–'}</Text>
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
  const bnum = { width: 34, textAlign: 'right' as const, color: SNAP_MUTED, fontSize: 12 };

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
      {card.extras && (
        <View style={{ flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1, borderTopColor: SNAP_BORDER }}>
          <Text style={{ flex: 1, color: SNAP_MUTED, fontSize: 12 }}>Extras</Text>
          <Text style={{ color: SNAP_MUTED, fontSize: 12 }}>{formatExtras(card.extras)}</Text>
        </View>
      )}

      {/* Bowling */}
      <Text style={{ color: SNAP_MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 10, marginBottom: 4 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 3 }}>
        <Text style={{ flex: 1, color: SNAP_MUTED, fontSize: 10 }}>Bowler</Text>
        {['O', 'R', 'Ex', 'W', 'Econ'].map((h) => (
          <Text key={h} style={{ width: 34, textAlign: 'right', color: SNAP_MUTED, fontSize: 10 }}>{h}</Text>
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
            <Text style={bnum}>{b.extras ?? '–'}</Text>
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
  const [tab, setTab] = useState<'live' | 'scorecard' | 'commentary' | 'teams'>('scorecard');
  const [sharing, setSharing] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const snapshotRef = useRef<ViewShot>(null);

  // Gate fetch (one-shot): determines whether the match is currently live.
  // Only 'live' matches get real-time listeners below — completed/abandoned
  // matches are static, so they stick to a plain one-shot fetch, same as before.
  const { data: gateMatch, isPending: gatePending, isError: gateError } = useQuery({
    queryKey: ['match', clubId, matchId],
    queryFn: () => getMatch(clubId, matchId),
  });
  const isLive = gateMatch?.status === 'live';

  // Live path: real-time match + ball subscriptions (status === 'live' matches
  // only — these are always scored with per-ball docs, never the legacy
  // overs/ format, so no legacy fallback is needed here).
  const [liveMatch, setLiveMatch] = useState<Match | null | undefined>(undefined);
  const [liveBalls, setLiveBalls] = useState<BallDoc[] | null>(null);
  const [liveSubError, setLiveSubError] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    setLiveMatch(undefined);
    setLiveBalls(null);
    setLiveSubError(false);

    let unsubMatch: (() => void) | null = null;
    let unsubBalls: (() => void) | null = null;

    unsubMatch = subscribeMatch(
      clubId,
      matchId,
      (m) => {
        setLiveMatch(m);
        // Match just finished — no further writes expected, so drop both
        // listeners (a completed match shouldn't keep listeners open). The
        // balls listener's own final snapshot isn't guaranteed to have
        // landed before this "completed" snapshot did (two independent
        // listeners, no ordering guarantee) — one authoritative one-shot
        // read after teardown guarantees the last ball(s) are never
        // dropped, while still ending up listener-free once settled.
        if (m && m.status !== 'live') {
          unsubMatch?.();
          unsubBalls?.();
          getMatchBalls(clubId, matchId).then(setLiveBalls).catch(() => setLiveSubError(true));
        }
      },
      () => setLiveSubError(true),
    );
    unsubBalls = subscribeMatchBalls(clubId, matchId, setLiveBalls, () => setLiveSubError(true));

    return () => {
      unsubMatch?.();
      unsubBalls?.();
    };
  }, [isLive, clubId, matchId]);

  // Static path: plain one-shot fetch for non-live matches. No listeners.
  const { data: staticData, isPending: staticPending, isError: staticError } = useQuery({
    queryKey: ['scorecard-static', clubId, matchId],
    enabled: !gatePending && !gateError && !isLive,
    queryFn: async () => {
      const [overs, balls] = await Promise.all([
        getMatchOvers(clubId, matchId),
        getMatchBalls(clubId, matchId).catch(() => [] as BallDoc[]),
      ]);
      return { overs, balls };
    },
  });

  // Non-members may not have permission to read the players subcollection;
  // fall back to an empty list so the scorecard still renders with IDs.
  const { data: players = [] } = useQuery({
    queryKey: ['clubPlayers', clubId],
    queryFn: () => getClubPlayers(clubId, { includeDeparted: true }).catch(() => []),
  });

  const currentMatch = isLive ? liveMatch : gateMatch;

  // The LIVE tab (current batters/bowler/this-over strip) only makes sense
  // while the match is actually in progress — derived from currentMatch's
  // real-time status rather than the one-shot `isLive` gate, so it disappears
  // again once the match finishes without needing a screen remount. Defaults
  // a fresh visit straight to it, and falls back off it (without touching a
  // manually-chosen tab) the moment it stops being live.
  const showLiveTab = currentMatch?.status === 'live';
  useEffect(() => {
    setTab((t) => {
      if (showLiveTab) return t === 'scorecard' ? 'live' : t;
      return t === 'live' ? 'scorecard' : t;
    });
  }, [showLiveTab]);

  // staticData's query is `enabled: !gateError && ...`, so if the gate query
  // itself errored, the static query stays disabled and never leaves
  // 'pending' — without the `!gateError` guard here, isLoading would get
  // stuck true forever instead of falling through to the isError screen.
  const isLoading = gatePending || (isLive ? (liveMatch === undefined || liveBalls === null) : (!gateError && staticPending));
  const isError = gateError || gateMatch === null || (isLive ? (liveSubError || liveMatch === null) : staticError);

  const data = useMemo(() => {
    if (!currentMatch) return null;
    const overs = isLive ? (liveBalls ? ballDocsToOverDocs(liveBalls, matchId) : []) : (staticData?.overs ?? []);
    const balls = isLive ? (liveBalls ?? []) : (staticData?.balls ?? []);
    const ballsPerOver = currentMatch.rules.ballsPerOver ?? 6;
    const first = overs.filter((o) => o.inningsId === 'innings-1');
    const second = overs.filter((o) => o.inningsId === 'innings-2');
    const summary = currentMatch.inningsSummary;
    return {
      match: currentMatch,
      nameMap: Object.fromEntries([
        ...players.map((p) => [p.id, p.displayName]),
        ...players.flatMap(p => p.linkedGhost ? [[p.linkedGhost.ghostId, p.displayName]] : []),
      ]) as Record<string, string>,
      handMap: Object.fromEntries([
        ...players.map((p) => [p.id, p.battingHand]),
        ...players.flatMap(p => p.linkedGhost ? [[p.linkedGhost.ghostId, p.battingHand]] : []),
      ]) as Record<string, 'RHB' | 'LHB' | undefined>,
      ball1: balls.filter((b) => b.inningsId === 'innings-1'),
      ball2: balls.filter((b) => b.inningsId === 'innings-2'),
      card1: first.length ? buildInningsCard(first, ballsPerOver) : summary?.['1'] ?? null,
      card2: second.length ? buildInningsCard(second, ballsPerOver) : summary?.['2'] ?? null,
    };
  }, [currentMatch, isLive, liveBalls, staticData, players, matchId]);

  // Current crease/over state for the LIVE tab — reconstructed with the same
  // buildInningsFromBalls LiveScoring uses, so the scorer's and spectators'
  // views of "who's batting/bowling right now" can never diverge.
  // match.firstInningsEnded says which innings is actually in progress.
  // Memoized and gated on `tab === 'live'` (not just showLiveTab):
  // buildInningsFromBalls replays every ball of the active innings, and
  // liveBalls updates via onSnapshot on every delivery, so recomputing this
  // while some other tab is visible (or on unrelated re-renders, e.g. the
  // share button's setSharing toggles) would be pure waste.
  const activeInningsNum: 1 | 2 = data?.match.firstInningsEnded ? 2 : 1;
  const liveInnings = useMemo(() => {
    if (!data || !showLiveTab || tab !== 'live') return null;
    return buildInningsFromBalls(
      activeInningsNum === 1 ? data.ball1 : data.ball2,
      data.match,
      activeInningsNum,
      players,
      data.match.rules.autoRotateStrikeEoO ?? true,
    );
  }, [data, showLiveTab, tab, activeInningsNum, players]);

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

  const { match, nameMap, handMap, ball1, ball2, card1, card2 } = data;
  const nameOf = (id: string) => nameMap[id] ?? id;
  const handOf = (id: string) => handMap[id];
  const hasBoth = !!card1 && !!card2;
  const card = innings === 1 ? card1 : card2;
  const commentaryBalls = innings === 1 ? ball1 : ball2;
  const customDismissals = match?.rules.customDismissals ?? [];
  const commentaryEntries = buildCommentary(commentaryBalls, nameOf, handOf, customDismissals);
  const captains = new Set([match?.captainA, match?.captainB].filter(Boolean) as string[]);

  const teamA = match?.teamA ?? [];
  const teamB = match?.teamB ?? [];
  const liveBallsPerOver = match?.rules.ballsPerOver ?? 6;

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

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        {(showLiveTab ? (['live', 'scorecard', 'commentary', 'teams'] as const) : (['scorecard', 'commentary', 'teams'] as const)).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? theme.accent : 'transparent' }}
          >
            <Text style={{ color: tab === t ? theme.accent : theme.textMuted, fontWeight: '700', fontSize: 12 }}>
              {t === 'live' ? 'LIVE' : t === 'scorecard' ? 'SCORECARD' : t === 'commentary' ? 'COMMENTARY' : 'TEAMS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'live' && liveInnings ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <ScoreHeader
            runs={liveInnings.totalRuns}
            wickets={liveInnings.totalWickets}
            overNumber={liveInnings.overNumber}
            legalBalls={liveInnings.legalBallsInOver}
            ballsPerOver={liveBallsPerOver}
            matchName={match ? `${match.homeTeam} vs ${match.awayTeam}` : ''}
          />

          {/* Chase target (2nd innings) */}
          {activeInningsNum === 2 && card1 && (() => {
            const target = card1.totalRuns + 1;
            const need = Math.max(0, target - liveInnings.totalRuns);
            const oversLimit = match?.rules.oversPerInnings;
            const ballsBowled = liveInnings.overNumber * liveBallsPerOver + liveInnings.legalBallsInOver;
            const ballsLeft = oversLimit != null ? oversLimit * liveBallsPerOver - ballsBowled : null;
            const rrr = ballsLeft != null && ballsLeft > 0 ? ((need * liveBallsPerOver) / ballsLeft).toFixed(2) : null;
            return (
              <View style={{ backgroundColor: theme.surface, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <Text style={{ color: '#d97706', fontSize: 13, fontWeight: '700' }}>
                  Need {need} run{need !== 1 ? 's' : ''}
                  {ballsLeft != null ? ` from ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}` : ''}
                </Text>
                {rrr != null && (
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>
                    Target {target} · RRR {rrr}
                  </Text>
                )}
              </View>
            );
          })()}

          {!liveInnings.onStrikeId ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>Waiting for the first ball…</Text>
            </View>
          ) : (
            <>
              <BatterRow
                player={players.find((p) => p.id === liveInnings.onStrikeId)}
                stats={liveInnings.batterStats[liveInnings.onStrikeId] ?? emptyBatterStats()}
                onStrike
                hand={players.find((p) => p.id === liveInnings.onStrikeId)?.battingHand ?? 'RHB'}
              />
              {liveInnings.offStrikeId ? (
                <BatterRow
                  player={players.find((p) => p.id === liveInnings.offStrikeId)}
                  stats={liveInnings.batterStats[liveInnings.offStrikeId] ?? emptyBatterStats()}
                  onStrike={false}
                  hand={players.find((p) => p.id === liveInnings.offStrikeId)?.battingHand ?? 'RHB'}
                />
              ) : (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>Last man standing — batting alone</Text>
                </View>
              )}
              <BowlerRow
                player={players.find((p) => p.id === liveInnings.bowlerId)}
                stats={liveInnings.bowlerStats[liveInnings.bowlerId] ?? emptyBowlerStats()}
                ballsPerOver={liveBallsPerOver}
              />
            </>
          )}

          {/* Ball strip — mirrors LiveScoring's "This over" row */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            {(() => {
              const previousSlots = Math.max(0, BALL_STRIP_SIZE - liveInnings.currentOverBalls.length);
              const shownPrevious = previousSlots > 0 ? liveInnings.previousOverBalls.slice(-previousSlots) : [];
              return (
                <>
                  {shownPrevious.length > 0 && (
                    <>
                      <Text style={{ color: theme.textMuted, fontSize: 11, fontStyle: 'italic', marginRight: 6 }}>Prev:</Text>
                      {shownPrevious.map((ball, i) => <BallCircle key={`prev-${i}`} ball={ball} dim />)}
                      <View style={{ width: 1, height: 20, backgroundColor: theme.border, marginRight: 8 }} />
                    </>
                  )}
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginRight: 8 }}>This over:</Text>
                  {liveInnings.currentOverBalls.length === 0 ? (
                    <Text style={{ color: theme.border, fontSize: 13 }}>–</Text>
                  ) : (
                    liveInnings.currentOverBalls.map((ball, i) => <BallCircle key={i} ball={ball} />)
                  )}
                </>
              );
            })()}
          </View>
        </ScrollView>
      ) : tab === 'commentary' ? (
        <View style={{ flex: 1 }}>
          {/* Gated on raw balls (what commentary actually reads), not card1/
              card2 — those can both be populated via inningsSummary even when
              this match predates per-ball docs and has no commentary data. */}
          {ball1.length > 0 && ball2.length > 0 && (
            <View style={{ flexDirection: 'row', padding: 8, gap: 8 }}>
              {([1, 2] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setInnings(n)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: innings === n ? theme.accentDim : theme.surface, borderWidth: 1, borderColor: innings === n ? theme.accent : theme.border, alignItems: 'center' }}
                >
                  <Text style={{ color: innings === n ? theme.accent : theme.textMuted, fontWeight: '600' }}>Innings {n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {commentaryBalls.length > 0 ? (
            <Commentary entries={commentaryEntries} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
                Commentary isn't available for this match.
              </Text>
            </View>
          )}
        </View>
      ) : tab === 'teams' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {([['A', '#60a5fa', match?.homeTeam ?? 'Team A', teamA, match?.captainA], ['B', '#f97316', match?.awayTeam ?? 'Team B', teamB, match?.captainB]] as const).map(([label, color, name, ids, captain]) => (
            <View key={label} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{label}</Text>
                </View>
                <Text style={{ color: label === 'A' ? '#2563eb' : '#f97316', fontSize: 15, fontWeight: '700' }}>
                  {name} ({ids.length})
                </Text>
              </View>
              {ids.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13, paddingLeft: 30 }}>No players assigned</Text>
              ) : (
                ids.map((id: string) => (
                  <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: theme.border }}>
                    <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{nameOf(id)}</Text>
                    {captain === id && (
                      <View style={{ backgroundColor: theme.id === 'light' ? '#fef9c3' : '#3b2f0a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#fbbf24' }}>
                        <Text style={{ color: '#d97706', fontSize: 10, fontWeight: '700' }}>C</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          ))}
          {(match?.substitutes ?? []).length > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>SUBSTITUTES</Text>
              {(match?.substitutes ?? []).map((id: string) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{nameOf(id)}</Text>
                  <View style={{ backgroundColor: theme.id === 'light' ? '#f0fdf4' : '#0a2a1a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#22c55e' }}>
                    <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '700' }}>SUB</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          {hasBoth && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4, marginTop: 8 }}>
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
        </>
      )}
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
    if (card.extras) lines.push(`Extras: ${formatExtras(card.extras)}`);
    lines.push('Bowling:');
    card.bowling.forEach((b) => {
      const overs = `${Math.floor(b.balls / 6)}.${b.balls % 6}`;
      const econ = b.balls > 0 ? ((b.runs / (b.balls / 6))).toFixed(1) : '-';
      const exSuffix = b.extras != null ? `, Ex:${b.extras}` : '';
      lines.push(`  ${nameOf(b.id)} – ${overs}-${b.runs}-${b.wickets} (Econ: ${econ}${exSuffix})`);
    });
    lines.push('');
  };

  if (card1) formatInnings(card1, 'Innings 1');
  if (card2) formatInnings(card2, 'Innings 2');
  lines.push('Scored with Crease 🏏');

  return lines.join('\n');
}
