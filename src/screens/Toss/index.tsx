import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, setMatchToss } from '../../services/matchService';
import { getRegisteredClubMembers } from '../../services/clubService';
import { useThemeStore } from '../../store/themeStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Toss'>;

export default function TossScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, matchId } = params;
  const theme = useThemeStore((s) => s.theme);

  const [winnerId, setWinnerId] = useState<'homeTeam' | 'awayTeam' | null>(null);
  const [choice, setChoice] = useState<'bat' | 'field' | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [coin, setCoin] = useState<'Heads' | 'Tails' | null>(null);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', clubId, matchId],
    queryFn: () => getMatch(clubId, matchId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['registeredMembers', clubId],
    queryFn: () => getRegisteredClubMembers(clubId),
  });

  const selectedScorer = members.find(m => m.id === scorerId);

  const flipCoin = () => {
    if (flipping) return;
    setFlipped(false);
    setCoin(null);
    setFlipping(true);
    const result: 'Heads' | 'Tails' = Math.random() < 0.5 ? 'Heads' : 'Tails';
    flipAnim.setValue(0);
    Animated.timing(flipAnim, { toValue: 1, duration: 5000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setCoin(result);
      setFlipped(true);
      setFlipping(false);
    });
  };

  const rotateY = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '3240deg'] });

  const { mutate: confirm, isPending, error } = useMutation({
    mutationFn: () => {
      if (!winnerId || !choice || !match) throw new Error('Select toss winner and choice');
      const winnerName = winnerId === 'homeTeam' ? match.homeTeam : match.awayTeam;
      const scorer = selectedScorer ? { scorerId: selectedScorer.id, scorerName: selectedScorer.displayName } : undefined;
      return setMatchToss(clubId, matchId, { winnerId, winnerName, choice }, scorer);
    },
    onSuccess: () => navigation.replace('LiveScoring', { clubId, matchId }),
  });

  const canConfirm = !!winnerId && !!choice && !isPending;
  const homeTeam = match?.homeTeam ?? 'Team A';
  const awayTeam = match?.awayTeam ?? 'Team B';

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 12, marginBottom: 4 }}>
        {homeTeam} vs {awayTeam}
      </Text>
      {match?.venue ? (
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 28 }}>{match.venue}</Text>
      ) : (
        <View style={{ marginBottom: 28 }} />
      )}

      {/* Coin */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <TouchableOpacity onPress={flipCoin} disabled={flipping} activeOpacity={0.8}>
          <Animated.View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: flipped ? '#fbbf24' : theme.surface, borderWidth: 3, borderColor: '#fbbf24', alignItems: 'center', justifyContent: 'center', transform: [{ rotateY }] }}>
            <Text style={{ fontSize: flipped ? 30 : 36, fontWeight: '800', color: flipped ? '#0a1628' : theme.textMuted }}>
              {flipped ? (coin === 'Heads' ? 'H' : 'T') : '🪙'}
            </Text>
          </Animated.View>
        </TouchableOpacity>
        <Text style={{ color: '#d97706', marginTop: 10, fontSize: 14, fontWeight: '600' }}>
          {flipping ? 'Flipping…' : flipped && coin ? `${coin}!` : 'Tap to flip coin'}
        </Text>
        {flipped && !flipping && (
          <TouchableOpacity onPress={flipCoin} style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}>↻ Flip again</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Toss winner */}
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>TOSS WON BY</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
        {(['homeTeam', 'awayTeam'] as const).map((teamKey) => {
          const name = teamKey === 'homeTeam' ? homeTeam : awayTeam;
          const selected = winnerId === teamKey;
          return (
            <TouchableOpacity
              key={teamKey} onPress={() => setWinnerId(teamKey)}
              style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: selected ? theme.accentDim : theme.surface, borderWidth: 2, borderColor: selected ? theme.accent : theme.border, alignItems: 'center' }}
            >
              <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: '600', fontSize: 15 }}>{name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Choice */}
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>ELECTED TO</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
        {(['bat', 'field'] as const).map((c) => {
          const selected = choice === c;
          return (
            <TouchableOpacity
              key={c} onPress={() => setChoice(c)}
              style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: selected ? theme.accentDim : theme.surface, borderWidth: 2, borderColor: selected ? theme.accent : theme.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            >
              <Text style={{ fontSize: 20 }}>{c === 'bat' ? '🏏' : '🧤'}</Text>
              <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: '600', fontSize: 15, textTransform: 'capitalize' }}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary */}
      {winnerId && choice && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center' }}>
            <Text style={{ color: theme.accent, fontWeight: '700' }}>{winnerId === 'homeTeam' ? homeTeam : awayTeam}</Text>
            {' '}won the toss and elected to{' '}
            <Text style={{ color: theme.accent, fontWeight: '700' }}>{choice}</Text>
            {' '}first
          </Text>
        </View>
      )}

      {/* Scorer picker */}
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>SCORER (OPTIONAL)</Text>
      <TouchableOpacity
        onPress={() => setScorerPickerOpen(o => !o)}
        style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: scorerId ? theme.accent : theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
      >
        <Text style={{ color: scorerId ? theme.accent : theme.textMuted, fontSize: 15, fontWeight: scorerId ? '600' : '400' }}>
          {selectedScorer ? selectedScorer.displayName : 'Assign a scorer…'}
        </Text>
        <Text style={{ color: theme.textMuted }}>{scorerPickerOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {scorerPickerOpen && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 8, borderWidth: 1, borderColor: theme.border, marginBottom: 16, maxHeight: 180, overflow: 'hidden' }}>
          <ScrollView>
            {scorerId !== null && (
              <TouchableOpacity
                onPress={() => { setScorerId(null); setScorerPickerOpen(false); }}
                style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}
              >
                <Text style={{ color: '#dc2626', fontSize: 14 }}>✕ Remove scorer</Text>
              </TouchableOpacity>
            )}
            {members.length === 0 && (
              <Text style={{ color: theme.textMuted, padding: 14, fontSize: 14 }}>No registered members found</Text>
            )}
            {members.map((m, i) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => { setScorerId(m.id); setScorerPickerOpen(false); }}
                style={{ padding: 14, borderBottomWidth: i < members.length - 1 ? 1 : 0, borderBottomColor: theme.border, backgroundColor: scorerId === m.id ? theme.accentDim : 'transparent' }}
              >
                <Text style={{ color: scorerId === m.id ? theme.accent : theme.text, fontSize: 15, fontWeight: scorerId === m.id ? '600' : '400' }}>
                  {m.displayName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!scorerPickerOpen && <View style={{ marginBottom: 16 }} />}

      {error instanceof Error && (
        <Text style={{ color: '#dc2626', textAlign: 'center', marginBottom: 12 }}>{error.message}</Text>
      )}

      <TouchableOpacity
        onPress={() => confirm()} disabled={!canConfirm}
        style={{ backgroundColor: canConfirm ? theme.accent : theme.surface, borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: canConfirm ? 0 : 1, borderColor: theme.border }}
      >
        {isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={{ color: canConfirm ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>Start Match</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
