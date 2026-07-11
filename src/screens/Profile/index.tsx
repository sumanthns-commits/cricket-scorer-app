import { View, Text, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import { useThemeStore } from '../../store/themeStore';
import { THEMES } from '../../constants/themes';
import PlayerProfileView from '../../components/PlayerProfileView';
import { signOut } from '../../services/authService';
import { getUserProfile, updateUserProfile } from '../../services/userProfileService';
import type { AppUser } from '../../types';

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

// Account-level, not club-scoped, so this renders in both the
// no-active-club and normal render branches below. Opt-out only affects
// match-live/match-finished pushes — join-request/approval pushes always
// send regardless of this toggle. Missing/undefined means ON (default).
function NotificationSettings() {
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: () => getUserProfile(user!.uid),
    enabled: !!user,
  });
  const matchNotifications = profile?.notificationPrefs?.matchNotifications ?? true;

  async function handleToggle(value: boolean) {
    if (!user) return;
    queryClient.setQueryData(['userProfile', user.uid], (prev: AppUser | null | undefined) =>
      prev ? { ...prev, notificationPrefs: { matchNotifications: value } } : prev
    );
    try {
      await updateUserProfile(user.uid, { matchNotifications: value });
    } finally {
      queryClient.invalidateQueries({ queryKey: ['userProfile', user.uid] });
    }
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
        Notifications
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary, flex: 1, fontSize: 15 }}>Match notifications</Text>
        <Switch
          value={matchNotifications}
          onValueChange={handleToggle}
          trackColor={{ false: theme.border, true: theme.accentDim }}
          thumbColor={matchNotifications ? theme.accent : theme.textMuted}
        />
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
        <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16 }} />
        <NotificationSettings />
        <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16, marginTop: 8 }} />
        <TouchableOpacity
          onPress={handleSignOut}
          style={{ margin: 16, paddingVertical: 14, alignItems: 'center', borderRadius: 8, backgroundColor: '#dc2626' }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Sign Out</Text>
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
      <NotificationSettings />
      <View style={{ height: 1, backgroundColor: theme.border }} />
      <PlayerProfileView clubId={activeClubId} playerId={user.uid} canEdit />
      <TouchableOpacity
        onPress={handleSignOut}
        style={{ margin: 16, paddingVertical: 14, alignItems: 'center', borderRadius: 8, backgroundColor: '#dc2626' }}
      >
        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Sign Out</Text>
      </TouchableOpacity>
      <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: 11, marginBottom: 16, opacity: 0.5 }}>
        v{Constants.expoConfig?.version ?? '—'}
      </Text>
    </View>
  );
}
