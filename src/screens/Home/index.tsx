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
import { getUserClubs } from '../../services/clubService';
import type { Club } from '../../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function ClubCard({
  club,
  onRulesPress,
  onMatchesPress,
}: {
  club: Club;
  onRulesPress: () => void;
  onMatchesPress: () => void;
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
      <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600' }}>{club.name}</Text>
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
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);

  const { data: clubs, isLoading } = useQuery({
    queryKey: ['clubs', user?.uid],
    queryFn: () => getUserClubs(user!.uid),
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
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateClub')}
          style={{
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: '#0a1628', fontSize: 14, fontWeight: '700' }}>+ Create Club</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
      ) : clubs && clubs.length > 0 ? (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ClubCard
              club={item}
              onMatchesPress={() => handleMatchesPress(item)}
              onRulesPress={() => navigation.navigate('ClubRulesAdmin', { clubId: item.id })}
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
