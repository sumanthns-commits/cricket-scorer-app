import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import { useThemeStore } from '../../store/themeStore';
import { THEMES } from '../../constants/themes';
import PlayerProfileView from '../../components/PlayerProfileView';
import { signOut } from '../../services/authService';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function ThemePicker() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
        Appearance
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {THEMES.map((t) => {
          const active = t.id === theme.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTheme(t.id)}
              style={{ alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: t.bg,
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? t.accent : t.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: t.accent,
                  }}
                />
              </View>
              <Text
                style={{
                  color: active ? theme.accent : theme.textMuted,
                  fontSize: 10,
                  fontWeight: active ? '700' : '400',
                }}
              >
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function EditProfileButton() {
  const navigation = useNavigation<Nav>();
  const theme = useThemeStore((s) => s.theme);
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('EditProfile')}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>Edit Profile</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const activeClubId = useClubStore((s) => s.activeClubId);
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);
  const theme = useThemeStore((s) => s.theme);

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setActiveClubId(null);
          signOut().catch(() => {});
        },
      },
    ]);
  }

  if (!activeClubId || !user) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 48 }}>
          <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 8 }}>No club selected</Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
            Go to Home and tap a club to view your club profile.
          </Text>
          <EditProfileButton />
        </View>
        <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16 }} />
        <ThemePicker />
        <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16, marginTop: 8 }} />
        <TouchableOpacity
          onPress={handleSignOut}
          style={{ margin: 16, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#dc2626' }}
        >
          <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <EditProfileButton />
      </View>
      <ThemePicker />
      <View style={{ height: 1, backgroundColor: theme.border }} />
      <PlayerProfileView
        clubId={activeClubId}
        playerId={user.uid}
        canEdit
        footer={
          <TouchableOpacity
            onPress={handleSignOut}
            style={{ marginTop: 24, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#dc2626' }}
          >
            <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}
