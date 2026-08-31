import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { signOut, deleteAccount } from '../../services/authService';
import { getUserProfile, updateUserProfile } from '../../services/userProfileService';
import type { AppUser } from '../../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// One grouped card for account-level settings (not club-scoped, so this
// renders in both the no-active-club and normal branches below) — a single
// bordered card with row dividers reads as far less cluttered than three
// separately-labeled, separately-bordered blocks stacked on top of each other.
function SettingsCard() {
  const navigation = useNavigation<Nav>();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: () => getUserProfile(user!.uid),
    enabled: !!user,
  });
  // Opt-out only affects match-live/match-finished/poll pushes — join-request/
  // approval pushes always send regardless of this toggle. Missing/undefined
  // means ON (default).
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

  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, padding: 14 };
  const divider = <View style={{ height: 1, backgroundColor: theme.border }} />;

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
      <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={rowStyle}>
        <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>Edit default profile</Text>
        <Text style={{ color: theme.textMuted, fontSize: 18 }}>›</Text>
      </TouchableOpacity>
      {divider}
      <View style={rowStyle}>
        <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>Appearance</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {THEMES.map((t) => {
            const active = t.id === theme.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setTheme(t.id)}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: t.bg,
                    borderWidth: active ? 2 : 1.5,
                    borderColor: active ? t.accent : t.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.accent }} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {divider}
      <View style={rowStyle}>
        <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>Match notifications</Text>
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

function AccountActions() {
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);
  const theme = useThemeStore((s) => s.theme);
  const [deleting, setDeleting] = useState(false);

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

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      "This permanently deletes your account and sign-in. Your match history stays on record under your club(s), but your profile and personal data are erased. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            deleteAccount()
              .then(() => setActiveClubId(null))
              .catch((err: unknown) => {
                setDeleting(false);
                const message = err instanceof Error ? err.message : 'Please try again.';
                Alert.alert("Couldn't delete account", message);
              });
          },
        },
      ]
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <TouchableOpacity
        onPress={handleSignOut}
        style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
      >
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Sign Out</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDeleteAccount}
        disabled={deleting}
        style={{
          paddingVertical: 14,
          alignItems: 'center',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#dc2626',
          opacity: deleting ? 0.6 : 1,
        }}
      >
        <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '700' }}>
          {deleting ? 'Deleting…' : 'Delete Account'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const activeClubId = useClubStore((s) => s.activeClubId);
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', marginBottom: 16 }}>Profile</Text>

        <SettingsCard />

        {!activeClubId || !user ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 16, marginBottom: 8 }}>No club selected</Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
              Go to Home and tap a club to view your club profile.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 20, marginHorizontal: -16 }}>
            <PlayerProfileView clubId={activeClubId} playerId={user.uid} canEdit embedded />
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <AccountActions />
        </View>

        <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: 11, marginTop: 20, opacity: 0.5 }}>
          v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
