import { useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getClubMatches, getClubPlayers } from '../../services/matchService';
import { getClub } from '../../services/clubService';
import { buildSeasonLeaderboard } from '../../services/seasonLeaderboard';
import { seasonLabel, seasonSortValue, type Hemisphere } from '../../utils/seasons';
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
    if (m.status !== 'completed' && m.status !== 'abandoned') continue;
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
  const [seasonIdx, setSeasonIdx] = useState(0);
  const theme = useThemeStore((s) => s.theme);

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => getClub(clubId),
  });

  const { data: base, isLoading } = useQuery({
    queryKey: ['leaderboard-base', clubId],
    queryFn: async () => {
      const [matches, players] = await Promise.all([
        getClubMatches(clubId),
        getClubPlayers(clubId),
      ]);
      const nameMap = Object.fromEntries(players.map((p) => [p.id, p.displayName]));
      const photoMap = Object.fromEntries(
        players.map((p) => [p.id, p.photoURL]),
      ) as Record<string, string | undefined>;
      return { matches, nameMap, photoMap };
    },
  });

  const hemisphere: Hemisphere = club?.hemisphere ?? 'N';
  const seasons = useMemo(
    () => seasonsFrom(base?.matches ?? [], hemisphere),
    [base?.matches, hemisphere],
  );
  const activeSeason = seasons[seasonIdx];

  const { data: board, isFetching } = useQuery({
    queryKey: ['leaderboard', clubId, activeSeason?.label],
    queryFn: () => buildSeasonLeaderboard(clubId, activeSeason!.matches),
    enabled: !!activeSeason,
  });

  const nameOf = (id: string) => base?.nameMap[id] ?? id;
  const photoOf = (id: string) => base?.photoMap[id];

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}
        style={{ flexGrow: 0 }}
      >
        {seasons.map((s, i) => (
          <TouchableOpacity
            key={s.label}
            onPress={() => setSeasonIdx(i)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: i === seasonIdx ? theme.accentDim : theme.surface,
              borderWidth: 1,
              borderColor: i === seasonIdx ? theme.accent : theme.border,
            }}
          >
            <Text style={{ color: i === seasonIdx ? theme.accent : theme.textMuted, fontSize: 13, fontWeight: '600' }}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
            {board.matchesCounted} match{board.matchesCounted === 1 ? '' : 'es'} · {activeSeason.label}
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
              <HeaderRow labels={['Scr', 'Ct', 'St', 'RO', 'Pts']} />
              {board.fielding.length === 0 ? (
                <Text style={{ color: theme.textMuted, marginTop: 16 }}>No fielding recorded.</Text>
              ) : (
                board.fielding.map((f, i) => (
                  <LeaderRow
                    key={f.playerId}
                    rank={i + 1}
                    name={nameOf(f.playerId)}
                    photoURL={photoOf(f.playerId)}
                    primary={f.score}
                    cols={[
                      f.catches,
                      f.stumpings,
                      f.runOuts,
                      f.eventPoints > 0 ? `+${f.eventPoints}` : String(f.eventPoints),
                    ]}
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
