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
import { useThemeStore } from '../../store/themeStore';
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
  const theme = useThemeStore((s) => s.theme);
  return (
    <TouchableOpacity
      onPress={onMatchesPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>{club.name}</Text>
        {club.archivedAt ? (
          <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 4, borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>ARCHIVED</Text>
          </View>
        ) : null}
      </View>
      {club.description ? (
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 4 }}>{club.description}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 }}>
        <TouchableOpacity onPress={onMatchesPress}>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Matches</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRulesPress}>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>⚙ Rules</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={onRequestsPress}>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Requests</Text>
          </TouchableOpacity>
        )}
        {isAdmin && (
          <TouchableOpacity onPress={onEditPress}>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>✎ Edit</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);
  const theme = useThemeStore((s) => s.theme);

  const { data: clubsWithRoles, isLoading } = useQuery({
    queryKey: ['clubsWithRoles', user?.uid],
    queryFn: () => getUserClubsWithRoles(user!.uid),
    enabled: !!user,
  });

  const handleMatchesPress = (club: Club) => {
    setActiveClubId(club.id);
    navigation.navigate('Matches');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>My Clubs</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('FindClubs')}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>🔍 Find</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateClub')}
            style={{
              backgroundColor: theme.accent,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
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
          <Text style={{ color: theme.textMuted, fontSize: 16, textAlign: 'center' }}>
            No clubs yet.{'\n'}Create your first club to get started.
          </Text>
        </View>
      )}
    </View>
  );
}
