import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useClubStore } from '../../store/clubStore';
import { getClubSquad, type SquadEntry } from '../../services/squadService';
import { computeSkillRating } from '../../services/playerProfileService';
import PlayerAvatar from '../../components/PlayerAvatar';
import type { PlayerType } from '../../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

const TYPE_DOT: Record<PlayerType, string> = {
  ghost: '#a78bfa',
  registered: '#4ade80',
  linked: '#60a5fa',
};

function SquadRow({ entry, onPress }: { entry: SquadEntry; onPress: () => void }) {
  const { player, role } = entry;
  const rating = player.skillRating ?? computeSkillRating(player.careerStats);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e2d45',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#2d3f58',
        gap: 12,
      }}
    >
      <PlayerAvatar name={player.displayName} photoURL={player.photoURL} seed={player.id} size={44} />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>{player.displayName}</Text>
          {/* playerType indicator */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: TYPE_DOT[player.type] }} />
            <Text style={{ color: TYPE_DOT[player.type], fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
              {player.type}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {/* role badge */}
          <View
            style={{
              backgroundColor: role === 'admin' ? '#3b1d4a' : '#13314a',
              borderRadius: 5,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: role === 'admin' ? '#a78bfa' : '#2d3f58',
            }}
          >
            <Text
              style={{
                color: role === 'admin' ? '#c4b5fd' : '#9ca3af',
                fontSize: 10,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
            >
              {role}
            </Text>
          </View>
          <Text style={{ color: '#6b7280', fontSize: 12 }}>
            {player.careerStats.matchesPlayed} matches
          </Text>
        </View>
      </View>

      {/* skill rating */}
      <View style={{ alignItems: 'center', minWidth: 44 }}>
        <Text style={{ color: '#4ade80', fontSize: 20, fontWeight: '800' }}>{rating}</Text>
        <Text style={{ color: '#6b7280', fontSize: 9, fontWeight: '600' }}>RATING</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SquadScreen() {
  const navigation = useNavigation<Nav>();
  const activeClubId = useClubStore((s) => s.activeClubId);

  const { data: squad, isLoading, refetch } = useQuery({
    queryKey: ['clubSquad', activeClubId],
    queryFn: () => getClubSquad(activeClubId!),
    enabled: !!activeClubId,
  });

  if (!activeClubId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#9ca3af', fontSize: 20, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
          Go to Home and tap a club to view its squad.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628', padding: 16 }}>
      <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 16 }}>
        Squad{squad ? ` · ${squad.length}` : ''}
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
      ) : squad && squad.length > 0 ? (
        <FlatList
          data={[...squad].sort((a, b) => a.player.displayName.localeCompare(b.player.displayName))}
          keyExtractor={(item) => item.player.id}
          renderItem={({ item }) => (
            <SquadRow
              entry={item}
              onPress={() =>
                navigation.navigate('PlayerProfile', { clubId: activeClubId, playerId: item.player.id })
              }
            />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: '#6b7280', fontSize: 16, textAlign: 'center' }}>
            No players yet.
          </Text>
        </View>
      )}
    </View>
  );
}
