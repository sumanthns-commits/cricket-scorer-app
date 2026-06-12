import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, getMatchOvers, getClubPlayers } from '../../services/matchService';
import { buildInningsCard, type InningsCard } from '../../services/scorecard';
import { useThemeStore } from '../../store/themeStore';

type Route = RouteProp<RootStackParamList, 'MatchScorecard'>;

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
}: {
  card: InningsCard;
  nameOf: (id: string) => string;
  captains: Set<string>;
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
                {b.out ? 'out' : 'not out'}
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

export default function MatchScorecardScreen() {
  const { params } = useRoute<Route>();
  const { clubId, matchId } = params;
  const [innings, setInnings] = useState<1 | 2>(1);
  const theme = useThemeStore((s) => s.theme);

  const { data, isLoading } = useQuery({
    queryKey: ['scorecard', clubId, matchId],
    queryFn: async () => {
      const [match, overs, players] = await Promise.all([
        getMatch(clubId, matchId),
        getMatchOvers(clubId, matchId),
        getClubPlayers(clubId),
      ]);
      const ballsPerOver = match?.rules.ballsPerOver ?? 6;
      const first = overs.filter((o) => o.inningsId === 'innings-1');
      const second = overs.filter((o) => o.inningsId === 'innings-2');
      return {
        match,
        nameMap: Object.fromEntries(players.map((p) => [p.id, p.displayName])) as Record<string, string>,
        card1: first.length ? buildInningsCard(first, ballsPerOver) : null,
        card2: second.length ? buildInningsCard(second, ballsPerOver) : null,
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

  const { match, nameMap, card1, card2 } = data;
  const nameOf = (id: string) => nameMap[id] ?? id;
  const hasBoth = !!card1 && !!card2;
  const card = innings === 1 ? card1 : card2;
  const captains = new Set([match?.captainA, match?.captainB].filter(Boolean) as string[]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
          {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match'}
        </Text>
        {match?.result ? (
          <Text style={{ color: '#d97706', fontSize: 13, marginTop: 2 }}>{match.result}</Text>
        ) : null}
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
          <InningsView card={card} nameOf={nameOf} captains={captains} />
        ) : (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>No scorecard data.</Text>
        )}
      </ScrollView>
    </View>
  );
}
