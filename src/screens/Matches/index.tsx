import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useClubStore } from '../../store/clubStore';
import { getClubMatches, deleteMatch, getMatchOvers } from '../../services/matchService';
import type { Match } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<Match['status'], string> = {
  scheduled: '#fbbf24',
  live: '#4ade80',
  completed: '#6b7280',
  abandoned: '#ef4444',
};

function MatchCard({ match, onPress, onDelete }: { match: Match; onPress: () => void; onDelete?: () => void }) {
  const dateObj = match.date.toDate();
  const dateStr = dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const hasTeams = (match.teamA?.length ?? 0) > 0;
  const hasToss = !!match.toss;

  const actionLabel =
    match.status === 'live'
      ? 'Live'
      : hasToss
      ? 'View'
      : hasTeams
      ? 'Toss'
      : 'Build Teams';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: '#1e2d45',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#2d3f58',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            {match.homeTeam} vs {match.awayTeam}
          </Text>
          {match.venue ? (
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{match.venue}</Text>
          ) : null}
          <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
            {dateStr}
            {match.format ? ` · ${match.format === 'custom' ? `${match.rules.oversPerInnings ?? '?'} ov` : match.format}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View
            style={{
              backgroundColor: `${STATUS_COLORS[match.status]}22`,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: STATUS_COLORS[match.status],
            }}
          >
            <Text
              style={{
                color: STATUS_COLORS[match.status],
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
            >
              {match.status}
            </Text>
          </View>
          <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: '600' }}>{actionLabel} →</Text>
          {onDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchesScreen() {
  const navigation = useNavigation<Nav>();
  const activeClubId = useClubStore((s) => s.activeClubId);

  const { data: matches, isLoading, refetch } = useQuery({
    queryKey: ['matches', activeClubId],
    queryFn: () => getClubMatches(activeClubId!),
    enabled: !!activeClubId,
  });

  const handleMatchPress = (match: Match) => {
    const clubId = match.clubId;
    const matchId = match.id;
    const hasTeams = (match.teamA?.length ?? 0) > 0;
    const hasToss = !!match.toss;

    if (match.status === 'completed' || match.status === 'abandoned') {
      navigation.navigate('MatchScorecard', { clubId, matchId });
      return;
    }
    if (match.status === 'live' || hasToss) {
      navigation.navigate('Tabs', { screen: 'Live' });
      return;
    }
    if (hasTeams) {
      navigation.navigate('Toss', { clubId, matchId });
    } else {
      navigation.navigate('TeamBuilder', { clubId, matchId });
    }
  };

  // A match can be deleted only before the first ball. Scheduled matches never
  // have overs; for live ones we check, and route started matches to abandon.
  const handleDelete = async (match: Match) => {
    if (match.status === 'live') {
      const overs = await getMatchOvers(match.clubId, match.id).catch(() => []);
      if (overs.length > 0) {
        Alert.alert('Match already started', 'It can only be abandoned (from the Live screen), not deleted.');
        return;
      }
    }
    Alert.alert(
      'Delete match?',
      `Remove ${match.homeTeam} vs ${match.awayTeam}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMatch(match.clubId, match.id)
              .then(() => refetch())
              .catch(() => Alert.alert('Could not delete the match. Please try again.'));
          },
        },
      ]
    );
  };

  if (!activeClubId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#9ca3af', fontSize: 20, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
          Go to Home and tap a club to view its matches.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628', padding: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700' }}>Matches</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('ScheduleMatch', { clubId: activeClubId })}
          style={{
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: '#0a1628', fontSize: 14, fontWeight: '700' }}>+ Schedule</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
      ) : matches && matches.length > 0 ? (
        <FlatList
          data={[...matches].sort((a, b) => b.date.toMillis() - a.date.toMillis())}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              onPress={() => handleMatchPress(item)}
              onDelete={
                item.status === 'scheduled' || item.status === 'live'
                  ? () => handleDelete(item)
                  : undefined
              }
            />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: '#6b7280', fontSize: 16, textAlign: 'center' }}>
            No matches yet.{'\n'}Schedule your first match to get started.
          </Text>
        </View>
      )}
    </View>
  );
}
