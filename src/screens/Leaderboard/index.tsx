import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getClubMatches, getClubPlayers } from '../../services/matchService';
import { getClub } from '../../services/clubService';
import { getLinkedGhostMap } from '../../services/joinRequestService';
import { buildSeasonLeaderboard } from '../../services/seasonLeaderboard';
import { seasonLabel, seasonSortValue, currentSeasonLabel, type Hemisphere } from '../../utils/seasons';
import { useThemeStore } from '../../store/themeStore';
import PlayerAvatar from '../../components/PlayerAvatar';
import type { Match } from '../../types';

type Route = RouteProp<RootStackParamList, 'Leaderboard'>;
type Discipline = 'batting' | 'bowling' | 'fielding';

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309']; // gold, silver, bronze

interface SeasonOption {
  label: string;
  sortValue: number;
  matches: Match[];
}

function seasonsFrom(matches: Match[], hemisphere: Hemisphere): SeasonOption[] {
  const map = new Map<string, SeasonOption>();
  for (const m of matches) {
    // Abandoned matches never contributed to any player's stats (see
    // buildSeasonLeaderboard) — excluded here too so a season with only
    // abandoned matches doesn't show up as a selectable, empty-looking option.
    if (m.status !== 'completed') continue;
    const date = m.date.toDate();
    const label = seasonLabel(date, hemisphere);
    const existing = map.get(label);
    if (existing) existing.matches.push(m);
    else map.set(label, { label, sortValue: seasonSortValue(date), matches: [m] });
  }
  return [...map.values()].sort((a, b) => b.sortValue - a.sortValue);
}

function StatCol({ value, header }: { value: string | number; header?: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <Text
      style={{
        width: 46,
        textAlign: 'right',
        color: header ? theme.textMuted : theme.textSecondary,
        fontSize: header ? 11 : 13,
        fontWeight: header ? '600' : '400',
      }}
    >
      {value}
    </Text>
  );
}

function PrimaryCol({ value }: { value: string | number }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <Text style={{ width: 46, textAlign: 'right', color: theme.accent, fontSize: 14, fontWeight: '800' }}>
      {value}
    </Text>
  );
}

function LeaderRow({
  rank,
  name,
  photoURL,
  primary,
  cols,
}: {
  rank: number;
  name: string;
  photoURL?: string;
  primary: string | number;
  cols: (string | number)[];
}) {
  const theme = useThemeStore((s) => s.theme);
  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : theme.textMuted;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <Text style={{ width: 24, color: rankColor, fontSize: 13, fontWeight: '800' }}>{rank}</Text>
      <PlayerAvatar name={name} photoURL={photoURL} seed={name} size={30} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 14, marginLeft: 10 }} numberOfLines={1}>
        {name}
      </Text>
      <PrimaryCol value={primary} />
      {cols.map((c, i) => (
        <StatCol key={i} value={c} />
      ))}
    </View>
  );
}

function HeaderRow({ labels }: { labels: string[] }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}>
      <Text style={{ width: 24, color: theme.textMuted, fontSize: 11 }}>#</Text>
      <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11, marginLeft: 40 }}>Player</Text>
      {labels.map((l, i) => (
        <StatCol key={i} value={l} header />
      ))}
    </View>
  );
}

const TABS: { key: Discipline; label: string }[] = [
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'fielding', label: 'Fielding' },
];

export default function LeaderboardScreen() {
  const { params } = useRoute<Route>();
  const { clubId } = params;
  const [discipline, setDiscipline] = useState<Discipline>('batting');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => getClub(clubId),
  });

  const { data: base, isLoading, refetch: refetchBase } = useQuery({
    queryKey: ['leaderboard-base', clubId],
    queryFn: async () => {
      const [matches, players, ghostToMember] = await Promise.all([
        getClubMatches(clubId),
        getClubPlayers(clubId, { includeDeparted: true }),
        getLinkedGhostMap(clubId),
      ]);
      const nameMap = Object.fromEntries(players.map((p) => [p.id, p.displayName]));
      const photoMap = Object.fromEntries(
        players.map((p) => [p.id, p.photoURL]),
      ) as Record<string, string | undefined>;
      return { matches, nameMap, photoMap, ghostToMember };
    },
  });

  const hemisphere: Hemisphere = club?.hemisphere ?? 'N';
  const seasons = useMemo(
    () => seasonsFrom(base?.matches ?? [], hemisphere),
    [base?.matches, hemisphere],
  );
  const activeSeason = useMemo(() => {
    if (!seasons.length) return undefined;
    if (selectedLabel) return seasons.find((s) => s.label === selectedLabel) ?? seasons[0];
    const cur = currentSeasonLabel(hemisphere);
    return seasons.find((s) => s.label === cur) ?? seasons[0];
  }, [selectedLabel, seasons, hemisphere]);

  const { data: board, isFetching, refetch: refetchBoard } = useQuery({
    queryKey: ['leaderboard', clubId, activeSeason?.label],
    queryFn: () => buildSeasonLeaderboard(clubId, activeSeason!.matches, base!.ghostToMember),
    enabled: !!activeSeason && !!base,
  });

  // Refetch on focus rather than relying on a fresh mount — e.g. deleting a
  // match on the Matches screen and coming straight back here should drop it
  // (and re-run buildSeasonLeaderboard on the remaining matches) without a
  // manual pull-to-refresh. base drives `matches`/`activeSeason`; board is
  // re-triggered too since its queryFn closes over whatever base/activeSeason
  // were at the time it last ran, not the just-refetched ones.
  // `refetch()` bypasses `enabled` (unlike the automatic fetch-on-mount), so
  // it's gated on the same `activeSeason && base` condition as the query
  // itself — a club with zero completed matches has no activeSeason, and
  // `board`'s queryFn non-null-asserts it, which would throw on every focus.
  // Read via refs, NOT captured in the useCallback's deps: useFocusEffect's
  // underlying effect re-runs (immediately, while still focused) whenever the
  // callback's identity changes, not just on real navigation focus events —
  // putting activeSeason/base in the deps meant every refetch produced a new
  // base/activeSeason, which changed the callback, which re-triggered the
  // effect, which refetched again — an infinite loop the leaderboard's
  // perpetual loading spinner was a symptom of.
  const activeSeasonRef = useRef(activeSeason);
  activeSeasonRef.current = activeSeason;
  const baseRef = useRef(base);
  baseRef.current = base;
  useFocusEffect(
    useCallback(() => {
      refetchBase().then(() => {
        if (activeSeasonRef.current && baseRef.current) refetchBoard();
      });
    }, [refetchBase, refetchBoard])
  );

  const nameOf = (id: string) => base?.nameMap[id] ?? id;
  const photoOf = (id: string) => base?.photoMap[id];

  // Leaderboard display intentionally ignores score/eventPoints (net fielding
  // rating, negative-polarity events etc.) — those stay in buildSeasonLeaderboard
  // for other consumers (e.g. AI insights) but here we only show and rank by
  // raw dismissal counts, which read unambiguously without needing the rating
  // model explained.
  const fieldingByDismissals = useMemo(() => {
    if (!board) return [];
    // board.fielding also includes eventPoints-only entries (e.g. a player
    // with zero dismissals but a recorded negative event) — irrelevant once
    // this view only shows catches/stumpings/run-outs, so drop them here.
    return board.fielding
      .filter((f) => f.catches + f.stumpings + f.runOuts > 0)
      .sort((a, b) => {
        const total = (b.catches + b.stumpings + b.runOuts) - (a.catches + a.stumpings + a.runOuts);
        if (total !== 0) return total;
        return b.catches - a.catches || b.runOuts - a.runOuts || b.stumpings - a.stumpings;
      });
  }, [board]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (seasons.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 8 }}>No completed matches</Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
          Leaders appear once a match has been played and scored.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Season selector */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <TouchableOpacity
          onPress={() => setDropdownOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
            {activeSeason?.label ?? '—'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 }}
          onPress={() => setDropdownOpen(false)}
        >
          <Pressable>
            <View style={{ backgroundColor: theme.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, letterSpacing: 0.8 }}>
                SEASON
              </Text>
              {seasons.map((s) => {
                const isSelected = s.label === activeSeason?.label;
                return (
                  <TouchableOpacity
                    key={s.label}
                    onPress={() => { setSelectedLabel(s.label); setDropdownOpen(false); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                      backgroundColor: isSelected ? theme.accentDim : 'transparent',
                    }}
                  >
                    <Text style={{ flex: 1, color: isSelected ? theme.accent : theme.text, fontSize: 15, fontWeight: isSelected ? '700' : '400' }}>
                      {s.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Discipline tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 12, marginBottom: 4 }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setDiscipline(t.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: discipline === t.key ? theme.accentDim : theme.surface,
              borderWidth: 1,
              borderColor: discipline === t.key ? theme.accent : theme.border,
            }}
          >
            <Text style={{ color: discipline === t.key ? theme.accent : theme.textMuted, fontWeight: '700', fontSize: 13 }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isFetching || !board ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
            {board.matchesCounted} match{board.matchesCounted === 1 ? '' : 'es'} · {activeSeason?.label}
          </Text>

          {discipline === 'batting' && (
            <>
              <HeaderRow labels={['R', 'I', 'HS', 'Avg', 'SR']} />
              {board.batting.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginTop: 16 }}>No batting data.</Text>
              ) : (
                board.batting.map((b, i) => (
                  <LeaderRow
                    key={b.playerId}
                    rank={i + 1}
                    name={nameOf(b.playerId)}
                    photoURL={photoOf(b.playerId)}
                    primary={b.runs}
                    cols={[
                      b.innings,
                      b.highScore,
                      b.average === null ? '–' : b.average.toFixed(1),
                      b.strikeRate.toFixed(0),
                    ]}
                  />
                ))
              )}
            </>
          )}

          {discipline === 'bowling' && (
            <>
              <HeaderRow labels={['W', 'R', 'Econ', 'Best']} />
              {board.bowling.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginTop: 16 }}>No bowling data.</Text>
              ) : (
                board.bowling.map((b, i) => (
                  <LeaderRow
                    key={b.playerId}
                    rank={i + 1}
                    name={nameOf(b.playerId)}
                    photoURL={photoOf(b.playerId)}
                    primary={b.wickets}
                    cols={[
                      b.runs,
                      b.economy.toFixed(1),
                      b.bestWickets > 0 ? `${b.bestWickets}/${b.bestRuns}` : '–',
                    ]}
                  />
                ))
              )}
            </>
          )}

          {discipline === 'fielding' && (
            <>
              <HeaderRow labels={['Total', 'Ct', 'St', 'RO']} />
              {fieldingByDismissals.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginTop: 16 }}>No fielding recorded.</Text>
              ) : (
                fieldingByDismissals.map((f, i) => (
                  <LeaderRow
                    key={f.playerId}
                    rank={i + 1}
                    name={nameOf(f.playerId)}
                    photoURL={photoOf(f.playerId)}
                    primary={f.catches + f.stumpings + f.runOuts}
                    cols={[f.catches, f.stumpings, f.runOuts]}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
