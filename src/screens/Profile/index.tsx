import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import PlayerProfileView from '../../components/PlayerProfileView';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function EditProfileButton() {
  const navigation = useNavigation<Nav>();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('EditProfile')}
      style={{
        backgroundColor: '#1e2d45',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#2d3f58',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#60a5fa', fontSize: 14, fontWeight: '700' }}>Edit Profile</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const activeClubId = useClubStore((s) => s.activeClubId);

  if (!activeClubId || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Go to Home and tap a club to view your club profile.
        </Text>
        <EditProfileButton />
      </View>
    );
  }

  // Your own profile — club-specific stats above, global profile editable below.
  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <EditProfileButton />
      </View>
      <PlayerProfileView clubId={activeClubId} playerId={user.uid} canEdit />
    </View>
  );
}
