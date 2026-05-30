import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, setMatchToss } from '../../services/matchService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Toss'>;

export default function TossScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, matchId } = params;

  const [winnerId, setWinnerId] = useState<'homeTeam' | 'awayTeam' | null>(null);
  const [choice, setChoice] = useState<'bat' | 'field' | null>(null);
  const [flipped, setFlipped] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', clubId, matchId],
    queryFn: () => getMatch(clubId, matchId),
  });

  const flipCoin = () => {
    setFlipped(false);
    flipAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flipAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(flipAnim, {
        toValue: 2,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setFlipped(true));
  };

  const rotateY = flipAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '90deg', '0deg'],
  });

  const scale = flipAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [1, 0.7, 1],
  });

  const { mutate: confirm, isPending, error } = useMutation({
    mutationFn: () => {
      if (!winnerId || !choice || !match) throw new Error('Select toss winner and choice');
      const winnerName = winnerId === 'homeTeam' ? match.homeTeam : match.awayTeam;
      return setMatchToss(clubId, matchId, { winnerId, winnerName, choice });
    },
    onSuccess: () => {
      navigation.dispatch(CommonActions.navigate({ name: 'Tabs' }));
    },
  });

  const canConfirm = !!winnerId && !!choice && !isPending;

  const homeTeam = match?.homeTeam ?? 'Team A';
  const awayTeam = match?.awayTeam ?? 'Team B';

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628', padding: 16 }}>
      {/* Match title */}
      <Text
        style={{
          color: '#ffffff',
          fontSize: 20,
          fontWeight: '700',
          textAlign: 'center',
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        {homeTeam} vs {awayTeam}
      </Text>
      {match?.venue ? (
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
          {match.venue}
        </Text>
      ) : (
        <View style={{ marginBottom: 28 }} />
      )}

      {/* Coin */}
      <TouchableOpacity onPress={flipCoin} style={{ alignItems: 'center', marginBottom: 32 }}>
        <Animated.View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: flipped ? '#fbbf24' : '#1e2d45',
            borderWidth: 3,
            borderColor: '#fbbf24',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotateY }, { scale }],
          }}
        >
          <Text style={{ fontSize: 36 }}>{flipped ? '🏏' : '🪙'}</Text>
        </Animated.View>
        <Text style={{ color: '#fbbf24', marginTop: 10, fontSize: 14, fontWeight: '600' }}>
          {flipped ? 'Flipped!' : 'Tap to flip coin'}
        </Text>
      </TouchableOpacity>

      {/* Toss winner */}
      <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>TOSS WON BY</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
        {(['homeTeam', 'awayTeam'] as const).map((teamKey) => {
          const name = teamKey === 'homeTeam' ? homeTeam : awayTeam;
          const selected = winnerId === teamKey;
          return (
            <TouchableOpacity
              key={teamKey}
              onPress={() => setWinnerId(teamKey)}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 8,
                backgroundColor: selected ? '#0d2e1a' : '#1e2d45',
                borderWidth: 2,
                borderColor: selected ? '#4ade80' : '#2d3f58',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: selected ? '#4ade80' : '#ffffff',
                  fontWeight: '600',
                  fontSize: 15,
                }}
              >
                {name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Choice */}
      <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>ELECTED TO</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
        {(['bat', 'field'] as const).map((c) => {
          const selected = choice === c;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => setChoice(c)}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 8,
                backgroundColor: selected ? '#0d2e1a' : '#1e2d45',
                borderWidth: 2,
                borderColor: selected ? '#4ade80' : '#2d3f58',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 20 }}>{c === 'bat' ? '🏏' : '🧤'}</Text>
              <Text
                style={{
                  color: selected ? '#4ade80' : '#ffffff',
                  fontWeight: '600',
                  fontSize: 15,
                  textTransform: 'capitalize',
                }}
              >
                {c}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary */}
      {winnerId && choice && (
        <View
          style={{
            backgroundColor: '#1e2d45',
            borderRadius: 8,
            padding: 12,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2d3f58',
          }}
        >
          <Text style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
            <Text style={{ color: '#4ade80', fontWeight: '700' }}>
              {winnerId === 'homeTeam' ? homeTeam : awayTeam}
            </Text>
            {' '}won the toss and elected to{' '}
            <Text style={{ color: '#4ade80', fontWeight: '700' }}>{choice}</Text>
            {' '}first
          </Text>
        </View>
      )}

      {error instanceof Error && (
        <Text style={{ color: '#f87171', textAlign: 'center', marginBottom: 12 }}>
          {error.message}
        </Text>
      )}

      <TouchableOpacity
        onPress={() => confirm()}
        disabled={!canConfirm}
        style={{
          backgroundColor: canConfirm ? '#4ade80' : '#2d3f58',
          borderRadius: 10,
          padding: 16,
          alignItems: 'center',
        }}
      >
        {isPending ? (
          <ActivityIndicator color="#0a1628" />
        ) : (
          <Text
            style={{
              color: canConfirm ? '#0a1628' : '#6b7280',
              fontSize: 16,
              fontWeight: '700',
            }}
          >
            Start Match
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
