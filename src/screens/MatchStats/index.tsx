import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, getMatchOvers, getClubPlayers } from '../../services/matchService';
import {
  getPerOverStats,
  getWormSeries,
  getWagonWheelData,
  getInningsParticipants,
  type WagonWheelFilter,
  type WormPoint,
} from '../../services/matchStatsService';
import PerOverChart from '../../components/PerOverChart';
import WormChart from '../../components/WormChart';
import WagonWheel from '../../components/WagonWheel';
import { useThemeStore } from '../../store/themeStore';
import type { BattingHand, OverDocument } from '../../types';

type Route = RouteProp<RootStackParamList, 'MatchStats'>;

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
        backgroundColor: selected ? theme.accentDim : theme.surface,
        borderWidth: 1, borderColor: selected ? theme.accent : theme.border,
      }}
    >
      <Text style={{ color: selected ? theme.accent : theme.textMuted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ marginTop: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Ionicons name={icon} size={14} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>{title}</Text>
      </View>
      <View
        style={{
          backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 14,
          borderWidth: 1, borderColor: theme.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function PlayerDropdown({
  options,
  selected,
  onSelect,
  nameOf,
}: {
  options: string[];
  selected: string | null;
  onSelect: (id: string) => void;
  nameOf: (id: string) => string;
}) {
  const theme = useThemeStore((s) => s.theme);
  const [open, setOpen] = useState(false);
  const effectiveSelected = selected && options.includes(selected) ? selected : options[0] ?? null;
  const displayName = effectiveSelected ? nameOf(effectiveSelected) : 'No players';

  return (
    <>
      <TouchableOpacity
        onPress={() => options.length > 0 && setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{displayName}</Text>
        <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              backgroundColor: theme.surfaceAlt, borderTopLeftRadius: 16, borderTopRightRadius: 16,
              paddingBottom: 32, maxHeight: '60%',
            }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12, letterSpacing: 0.6 }}>SELECT PLAYER</Text>
            </View>
            <ScrollView bounces={false}>
              {options.map((id) => (
                <TouchableOpacity
                  key={id}
                  onPress={() => { onSelect(id); setOpen(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 16, paddingVertical: 14,
                    borderBottomWidth: 1, borderColor: theme.border,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 15 }}>{nameOf(id)}</Text>
                  {id === effectiveSelected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function scoreOf(worm: WormPoint[]) {
  const last = worm[worm.length - 1];
  const wickets = worm.reduce((sum, p) => sum + p.wickets, 0);
  return `${last.cumRuns}/${wickets}`;
}

export function MatchStatsContent({ clubId, matchId }: { clubId: string; matchId: string }) {
  const theme = useThemeStore((s) => s.theme);
  const [innings, setInnings] = useState<1 | 2>(1);
  const [wagonInnings, setWagonInnings] = useState<1 | 2>(1);
  const [wagonRole, setWagonRole] = useState<'batsman' | 'bowler'>('batsman');
  const [wagonPlayerId, setWagonPlayerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['matchStats', clubId, matchId],
    queryFn: async () => {
      const [match, overs, players] = await Promise.all([
        getMatch(clubId, matchId),
        getMatchOvers(clubId, matchId),
        getClubPlayers(clubId),
      ]);
      return {
        match,
        nameMap: Object.fromEntries(players.map((p) => [p.id, p.displayName])) as Record<string, string>,
        handMap: Object.fromEntries(players.map((p) => [p.id, p.battingHand ?? 'RHB'])) as Record<string, BattingHand>,
        innings1Overs: overs.filter((o) => o.inningsId === 'innings-1'),
        innings2Overs: overs.filter((o) => o.inningsId === 'innings-2'),
      };
    },
  });

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const { match, nameMap, handMap, innings1Overs, innings2Overs } = data;

  if (innings1Overs.length === 0) {
    // A completed match with no overs has no ball-by-ball data at all — most
    // commonly an imported PDF/CSV scorecard, which only ever carries
    // match-level totals (inningsSummary), never per-ball/per-over detail.
    const noDataRecorded = match?.status === 'completed';
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.textMuted, textAlign: 'center' }}>
          {noDataRecorded
            ? 'Stats aren’t available for this match — only matches scored ball-by-ball in the app have wagon wheels, over charts, and worm charts.'
            : 'No stats yet — start scoring to see stats here.'}
        </Text>
      </View>
    );
  }

  const hasInnings2 = innings2Overs.length > 0;
  const selectedOvers: OverDocument[] = innings === 2 && hasInnings2 ? innings2Overs : innings1Overs;

  const perOver = getPerOverStats(selectedOvers);
  const worm1 = getWormSeries(innings1Overs);
  const worm2 = hasInnings2 ? getWormSeries(innings2Overs) : undefined;

  const wagonOvers = wagonInnings === 2 && hasInnings2 ? innings2Overs : innings1Overs;
  const { batsmen, bowlers } = getInningsParticipants(wagonOvers);
  const wagonIds = wagonRole === 'batsman' ? batsmen : bowlers;
  const activeWagonId = wagonPlayerId && wagonIds.includes(wagonPlayerId) ? wagonPlayerId : wagonIds[0];
  const wagonFilter: WagonWheelFilter | null = activeWagonId ? { role: wagonRole, playerId: activeWagonId } : null;
  const wagonData = wagonFilter ? getWagonWheelData(wagonOvers, wagonFilter) : new Array(12).fill(0);
  const wagonHand: BattingHand = wagonRole === 'batsman' ? (handMap[activeWagonId ?? ''] ?? 'RHB') : 'RHB';

  const nameOf = (id: string) => nameMap[id] ?? id;

  const inningsToggle = hasInnings2 ? (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {([1, 2] as const).map((n) => (
        <Pill key={n} label={`Inn ${n}`} selected={innings === n} onPress={() => setInnings(n)} />
      ))}
    </View>
  ) : undefined;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Match header */}
      <View>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
          {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
          <View>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>Innings 1</Text>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{scoreOf(worm1)}</Text>
          </View>
          {worm2 && (
            <View>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>Innings 2</Text>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{scoreOf(worm2)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Worm chart — both innings */}
      <Section title="WORM CHART" icon="trending-up-outline">
        <WormChart innings1={worm1} innings2={worm2} width={296} />
      </Section>

      {/* Innings selector — scopes the two sections below */}
      {hasInnings2 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>SHOWING</Text>
          {inningsToggle}
        </View>
      )}

      {/* Per-over bar chart */}
      <Section title="RUNS PER OVER" icon="bar-chart-outline">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <PerOverChart data={perOver} minWidth={296} />
        </ScrollView>
      </Section>

      {/* Wagon wheel */}
      <Section title="WAGON WHEEL" icon="locate-outline">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label="Batsman" selected={wagonRole === 'batsman'} onPress={() => { setWagonRole('batsman'); setWagonPlayerId(null); }} />
            <Pill label="Bowler" selected={wagonRole === 'bowler'} onPress={() => { setWagonRole('bowler'); setWagonPlayerId(null); }} />
          </View>
          {hasInnings2 && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([1, 2] as const).map((n) => (
                <Pill key={n} label={`Inn ${n}`} selected={wagonInnings === n} onPress={() => { setWagonInnings(n); setWagonPlayerId(null); }} />
              ))}
            </View>
          )}
        </View>
        <PlayerDropdown options={wagonIds} selected={activeWagonId ?? null} onSelect={setWagonPlayerId} nameOf={nameOf} />
        {activeWagonId ? (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <WagonWheel data={wagonData} batsmanHand={wagonHand} />
          </View>
        ) : (
          <Text style={{ color: theme.textMuted, textAlign: 'center', paddingVertical: 16 }}>No data for this innings.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

export default function MatchStatsScreen() {
  const { params } = useRoute<Route>();
  return <MatchStatsContent clubId={params.clubId} matchId={params.matchId} />;
}
