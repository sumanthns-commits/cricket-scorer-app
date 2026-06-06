import { View, Text } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import PlayerProfileView from '../../components/PlayerProfileView';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const activeClubId = useClubStore((s) => s.activeClubId);

  if (!activeClubId || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
          Go to Home and tap a club to view your profile.
        </Text>
      </View>
    );
  }

  // Your own profile — always editable (name, handedness, bowling style).
  return <PlayerProfileView clubId={activeClubId} playerId={user.uid} canEdit />;
}
