import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import {
  getClub,
  getClubMember,
  updateClubDetails,
  archiveClub,
  unarchiveClub,
  setMemberRole,
} from '../../services/clubService';
import { getClubSquad } from '../../services/squadService';
import type { Hemisphere } from '../../utils/seasons';

// Keep in sync with the cleanupArchivedClubs Cloud Function.
const ARCHIVE_RETENTION_DAYS = 30;

type Props = NativeStackScreenProps<RootStackParamList, 'EditClub'>;

export default function EditClubScreen({ route, navigation }: Props) {
  const { clubId } = route.params;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hemisphere, setHemisphere] = useState<Hemisphere>('N');
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['editClub', clubId, user?.uid],
    queryFn: async () => {
      const [club, member] = await Promise.all([
        getClub(clubId),
        getClubMember(clubId, user!.uid),
      ]);
      return { club, isAdmin: member?.role === 'admin' };
    },
    enabled: !!user,
  });

  const { data: squad, refetch: refetchSquad } = useQuery({
    queryKey: ['editClubSquad', clubId],
    queryFn: () => getClubSquad(clubId),
    enabled: !!data?.isAdmin,
  });

  const registeredMembers = (squad ?? []).filter(
    (e) => e.player.type === 'registered' && e.player.id !== user?.uid
  );

  // Seed the form once from the loaded club.
  useEffect(() => {
    if (data?.club && !hydrated) {
      setName(data.club.name);
      setDescription(data.club.description ?? '');
      setHemisphere(data.club.hemisphere ?? 'N');
      setHydrated(true);
    }
  }, [data, hydrated]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Club name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateClubDetails(clubId, {
        name: trimmedName,
        description: description.trim(),
        hemisphere,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clubs'] }),
        queryClient.invalidateQueries({ queryKey: ['club', clubId] }),
      ]);
      navigation.goBack();
    } catch (err) {
      console.error('updateClubDetails failed', err);
      setError('Failed to save changes. Please try again.');
      setSaving(false);
    }
  }

  async function refreshAndLeave() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clubs'] }),
      queryClient.invalidateQueries({ queryKey: ['club', clubId] }),
      queryClient.invalidateQueries({ queryKey: ['editClub', clubId] }),
    ]);
    navigation.goBack();
  }

  function handleArchive() {
    Alert.alert(
      'Archive club?',
      `The club will be hidden and permanently deleted — along with all its matches — after ${ARCHIVE_RETENTION_DAYS} days. You can restore it before then.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);
            setError(null);
            try {
              await archiveClub(clubId);
              await refreshAndLeave();
            } catch (err) {
              console.error('archiveClub failed', err);
              setError('Failed to archive the club. Please try again.');
              setArchiving(false);
            }
          },
        },
      ]
    );
  }

  async function handleToggleRole(playerId: string, currentRole: 'admin' | 'member') {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const label = newRole === 'admin' ? 'Make Admin' : 'Remove Admin';
    Alert.alert(
      label,
      newRole === 'admin'
        ? 'This player will be able to manage club settings, matches, and members.'
        : 'This player will no longer have admin access.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: newRole === 'admin' ? 'default' : 'destructive',
          onPress: async () => {
            setTogglingRole(playerId);
            try {
              await setMemberRole(clubId, playerId, newRole);
              await refetchSquad();
            } catch {
              Alert.alert('Error', 'Failed to update role. Please try again.');
            } finally {
              setTogglingRole(null);
            }
          },
        },
      ]
    );
  }

  async function handleRestore() {
    setArchiving(true);
    setError(null);
    try {
      await unarchiveClub(clubId);
      await refreshAndLeave();
    } catch (err) {
      console.error('unarchiveClub failed', err);
      setError('Failed to restore the club. Please try again.');
      setArchiving(false);
    }
  }

  if (isLoading || (data && !hydrated && data.isAdmin)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  if (loadError || !data || !data.club) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#ef4444', textAlign: 'center' }}>Failed to load club.</Text>
      </View>
    );
  }

  if (!data.isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#9ca3af', fontSize: 16, textAlign: 'center' }}>
          Only club admins can edit club details.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#4ade80', fontSize: 15 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a1628' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 24 }}>
          Edit Club
        </Text>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          CLUB NAME *
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Wanderers CC"
          placeholderTextColor="#4b5563"
          style={{
            backgroundColor: '#1e2d45',
            color: '#ffffff',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2d3f58',
          }}
        />

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          DESCRIPTION
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="A short description of your club"
          placeholderTextColor="#4b5563"
          multiline
          numberOfLines={3}
          style={{
            backgroundColor: '#1e2d45',
            color: '#ffffff',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2d3f58',
            textAlignVertical: 'top',
            minHeight: 80,
          }}
        />

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          HEMISPHERE
        </Text>
        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>
          Sets how seasons are named (Summer / Winter).
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
          {(['N', 'S'] as const).map((h) => {
            const selected = hemisphere === h;
            return (
              <TouchableOpacity
                key={h}
                onPress={() => setHemisphere(h)}
                style={{
                  flex: 1,
                  backgroundColor: selected ? '#4ade80' : '#1e2d45',
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: selected ? '#4ade80' : '#2d3f58',
                }}
              >
                <Text
                  style={{
                    color: selected ? '#0a1628' : '#ffffff',
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  {h === 'N' ? 'Northern' : 'Southern'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && (
          <Text style={{ color: '#ef4444', marginBottom: 16, fontSize: 14 }}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>
              Save Changes
            </Text>
          )}
        </TouchableOpacity>

        {/* Members — admin delegation */}
        {registeredMembers.length > 0 && (
          <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: '#2d3f58', paddingTop: 24 }}>
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
              Members
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
              Promote members to admin or revoke admin access.
            </Text>
            {registeredMembers.map(({ player, role }) => (
              <View
                key={player.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#1e2d45',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: '#2d3f58',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>
                    {player.displayName}
                  </Text>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 4,
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
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleRole(player.id, role)}
                  disabled={togglingRole === player.id}
                  style={{
                    backgroundColor: role === 'admin' ? 'transparent' : '#4ade80',
                    borderRadius: 8,
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    borderWidth: role === 'admin' ? 1 : 0,
                    borderColor: '#ef4444',
                    opacity: togglingRole === player.id ? 0.5 : 1,
                  }}
                >
                  {togglingRole === player.id ? (
                    <ActivityIndicator color={role === 'admin' ? '#ef4444' : '#0a1628'} size="small" />
                  ) : (
                    <Text
                      style={{
                        color: role === 'admin' ? '#ef4444' : '#0a1628',
                        fontSize: 13,
                        fontWeight: '700',
                      }}
                    >
                      {role === 'admin' ? 'Revoke' : 'Make Admin'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Danger zone — archive / restore */}
        <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: '#2d3f58', paddingTop: 24 }}>
          {data.club.archivedAt ? (
            <>
              <View style={{ backgroundColor: '#3b1d1d', borderRadius: 8, borderWidth: 1, borderColor: '#7f1d1d', padding: 14, marginBottom: 16 }}>
                <Text style={{ color: '#fca5a5', fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
                  This club is archived
                </Text>
                <Text style={{ color: '#fca5a5', fontSize: 13 }}>
                  It will be permanently deleted, with all its matches, on{' '}
                  {new Date(
                    data.club.archivedAt.toMillis() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000
                  ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  . Restore it to keep it.
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleRestore}
                disabled={archiving}
                style={{
                  borderRadius: 8, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: '#4ade80', opacity: archiving ? 0.6 : 1,
                }}
              >
                {archiving ? (
                  <ActivityIndicator color="#0a1628" />
                ) : (
                  <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>Restore Club</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>
                Archiving hides the club and schedules it — and all its matches — for permanent
                deletion in {ARCHIVE_RETENTION_DAYS} days. You can restore it any time before then.
              </Text>
              <TouchableOpacity
                onPress={handleArchive}
                disabled={archiving}
                style={{
                  borderRadius: 8, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ef4444',
                  opacity: archiving ? 0.6 : 1,
                }}
              >
                {archiving ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '700' }}>Archive Club</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
