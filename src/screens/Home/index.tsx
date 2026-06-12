import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import { getUserClubsWithRoles } from '../../services/clubService';
import type { Club } from '../../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function ClubCard({
  club,
  isAdmin,
  onRulesPress,
  onMatchesPress,
  onEditPress,
  onRequestsPress,
}: {
  club: Club;
  isAdmin: boolean;
  onRulesPress: () => void;
  onMatchesPress: () => void;
  onEditPress: () => void;
  onRequestsPress: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#1e2d45',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2d3f58',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600' }}>{club.name}</Text>
        {club.archivedAt ? (
          <View style={{ backgroundColor: '#3b1d1d', borderRadius: 4, borderWidth: 1, borderColor: '#7f1d1d', paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#fca5a5', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>ARCHIVED</Text>
          </View>
        ) : null}
      </View>
      {club.description ? (
        <Text style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>{club.description}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 }}>
        <TouchableOpacity onPress={onMatchesPress}>
          <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: '600' }}>Matches</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRulesPress}>
          <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '600' }}>⚙ Rules</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={onRequestsPress}>
            <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '600' }}>Requests</Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <TouchableOpacity onPress={onEditPress}>
            <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '600' }}>✎ Edit</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);

  const { data: clubsWithRoles, isLoading } = useQuery({
    queryKey: ['clubs', user?.uid],
    queryFn: () => getUserClubsWithRoles(user!.uid),
    enabled: !!user,
  });

  const handleMatchesPress = (club: Club) => {
    setActiveClubId(club.id);
    navigation.navigate('Matches');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628', padding: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700' }}>My Clubs</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FindClubs')}
            style={{
              backgroundColor: '#1e2d45',
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: '#2d3f58',
            }}
          >
            <Text style={{ color: '#60a5fa', fontSize: 14, fontWeight: '700' }}>🔍 Find</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateClub')}
            style={{
              backgroundColor: '#4ade80',
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: '#0a1628', fontSize: 14, fontWeight: '700' }}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
      ) : clubsWithRoles && clubsWithRoles.length > 0 ? (
        <FlatList
          data={clubsWithRoles}
          keyExtractor={({ club }) => club.id}
          renderItem={({ item: { club, isAdmin } }) => (
            <ClubCard
              club={club}
              isAdmin={isAdmin}
              onMatchesPress={() => handleMatchesPress(club)}
              onRequestsPress={() => navigation.navigate('JoinRequests', { clubId: club.id })}
              onRulesPress={() => navigation.navigate('ClubRulesAdmin', { clubId: club.id })}
              onEditPress={() => navigation.navigate('EditClub', { clubId: club.id })}
            />
          )}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: '#6b7280', fontSize: 16, textAlign: 'center' }}>
            No clubs yet.{'\n'}Create your first club to get started.
          </Text>
        </View>
      )}
    </View>
  );
}
