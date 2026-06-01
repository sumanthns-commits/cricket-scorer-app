import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, getClubPlayers, setMatchTeams } from '../../services/matchService';
import { askCricketAssistant } from '../../ai/cricketAssistant';
import { TEAM_SELECTION_SYSTEM_PROMPT } from '../../constants/teamSelectionPrompt';
import type { TeamSelectionResult } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TeamBuilder'>;

function parseTeamSelection(text: string): TeamSelectionResult | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<TeamSelectionResult>;
    if (!Array.isArray(parsed.team_a) || !Array.isArray(parsed.team_b)) return null;
    return {
      team_a: parsed.team_a,
      team_b: parsed.team_b,
      rationale: parsed.rationale ?? '',
      keyDecisions: parsed.keyDecisions ?? [],
    };
  } catch {
    return null;
  }
}

function PlayerRow({
  name,
  badge,
  onMoveA,
  onMoveB,
}: {
  name: string;
  badge: 'A' | 'B' | null;
  onMoveA: () => void;
  onMoveB: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e2d45',
        borderRadius: 8,
        padding: 10,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: badge === 'A' ? '#60a5fa' : badge === 'B' ? '#f97316' : '#2d3f58',
      }}
    >
      {badge && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: badge === 'A' ? '#60a5fa' : '#f97316',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Text style={{ color: '#0a1628', fontWeight: '800', fontSize: 12 }}>{badge}</Text>
        </View>
      )}
      {!badge && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#2d3f58',
            marginRight: 10,
          }}
        />
      )}
      <Text style={{ flex: 1, color: '#ffffff', fontSize: 14 }}>{name}</Text>
      <TouchableOpacity
        onPress={onMoveA}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: badge === 'A' ? '#1e3a5f' : '#0d2040',
          marginRight: 6,
        }}
      >
        <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '700' }}>A</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onMoveB}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: badge === 'B' ? '#4a1f0a' : '#2d1a00',
        }}
      >
        <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }}>B</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TeamBuilderScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, matchId } = params;

  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [rationale, setRationale] = useState('');
  const [keyDecisions, setKeyDecisions] = useState<string[]>([]);

  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ['match', clubId, matchId],
    queryFn: () => getMatch(clubId, matchId),
  });

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ['clubPlayers', clubId],
    queryFn: () => getClubPlayers(clubId),
  });

  useEffect(() => {
    if (match?.teamA?.length) setTeamA(match.teamA);
    if (match?.teamB?.length) setTeamB(match.teamB);
  }, [match]);

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.id, p.displayName);
    return map;
  }, [players]);

  const squad = match?.squad ?? [];
  const unassigned = squad.filter((id) => !teamA.includes(id) && !teamB.includes(id));

  const moveToA = (id: string) => {
    setTeamA((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setTeamB((prev) => prev.filter((p) => p !== id));
  };

  const moveToB = (id: string) => {
    setTeamB((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setTeamA((prev) => prev.filter((p) => p !== id));
  };

  const runAI = async () => {
    setAiThinking(true);
    setAiError('');
    try {
      const { text } = await askCricketAssistant(
        `Select balanced teams for match ID: ${matchId}`,
        clubId,
        TEAM_SELECTION_SYSTEM_PROMPT
      );
      const parsed = parseTeamSelection(text);
      if (!parsed) throw new Error('Could not parse team selection from AI response');
      setTeamA(parsed.team_a);
      setTeamB(parsed.team_b);
      setRationale(parsed.rationale);
      setKeyDecisions(parsed.keyDecisions);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI selection failed');
    } finally {
      setAiThinking(false);
    }
  };

  const { mutate: confirm, isPending } = useMutation({
    mutationFn: () => setMatchTeams({ clubId, matchId, teamA, teamB }),
    onSuccess: () => navigation.replace('Toss', { clubId, matchId }),
  });

  const canConfirm = teamA.length > 0 && teamB.length > 0 && !isPending;

  if (loadingMatch || loadingPlayers) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0a1628' }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>
            {match?.homeTeam ?? 'Home'} vs {match?.awayTeam ?? 'Away'}
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
            {squad.length} players · {teamA.length}A / {teamB.length}B / {unassigned.length} unassigned
          </Text>
        </View>
        <TouchableOpacity
          onPress={runAI}
          disabled={aiThinking}
          style={{
            backgroundColor: aiThinking ? '#2d3f58' : '#7c3aed',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {aiThinking ? (
            <ActivityIndicator size="small" color="#a78bfa" />
          ) : (
            <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700' }}>AI Balance</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* AI Error */}
      {aiError !== '' && (
        <View
          style={{
            backgroundColor: '#2d1515',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#7f1d1d',
          }}
        >
          <Text style={{ color: '#f87171', fontSize: 13 }}>{aiError}</Text>
        </View>
      )}

      {/* Rationale */}
      {rationale !== '' && (
        <View
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#7c3aed',
          }}
        >
          <Text style={{ color: '#a78bfa', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
            AI Rationale
          </Text>
          <Text style={{ color: '#c4b5fd', fontSize: 13, lineHeight: 18 }}>{rationale}</Text>
          {keyDecisions.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {keyDecisions.map((kd, i) => (
                <Text key={i} style={{ color: '#8b5cf6', fontSize: 12, marginTop: 2 }}>
                  • {kd}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Team A */}
      {teamA.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 6,
              gap: 8,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#60a5fa',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#0a1628', fontWeight: '800', fontSize: 11 }}>A</Text>
            </View>
            <Text style={{ color: '#60a5fa', fontSize: 14, fontWeight: '600' }}>
              Team A ({teamA.length})
            </Text>
          </View>
          {teamA.map((id) => (
            <PlayerRow
              key={id}
              name={playerMap.get(id) ?? id}
              badge="A"
              onMoveA={() => moveToA(id)}
              onMoveB={() => moveToB(id)}
            />
          ))}
        </View>
      )}

      {/* Team B */}
      {teamB.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 6,
              gap: 8,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#f97316',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#0a1628', fontWeight: '800', fontSize: 11 }}>B</Text>
            </View>
            <Text style={{ color: '#f97316', fontSize: 14, fontWeight: '600' }}>
              Team B ({teamB.length})
            </Text>
          </View>
          {teamB.map((id) => (
            <PlayerRow
              key={id}
              name={playerMap.get(id) ?? id}
              badge="B"
              onMoveA={() => moveToA(id)}
              onMoveB={() => moveToB(id)}
            />
          ))}
        </View>
      )}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
            UNASSIGNED ({unassigned.length})
          </Text>
          {unassigned.map((id) => (
            <PlayerRow
              key={id}
              name={playerMap.get(id) ?? id}
              badge={null}
              onMoveA={() => moveToA(id)}
              onMoveB={() => moveToB(id)}
            />
          ))}
        </View>
      )}

      {squad.length === 0 && (
        <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 32 }}>
          No squad selected for this match
        </Text>
      )}

      {/* Confirm */}
      <TouchableOpacity
        onPress={() => confirm()}
        disabled={!canConfirm}
        style={{
          backgroundColor: canConfirm ? '#4ade80' : '#2d3f58',
          borderRadius: 10,
          padding: 16,
          alignItems: 'center',
          marginTop: 8,
          marginBottom: 40,
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
            Confirm Teams
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
