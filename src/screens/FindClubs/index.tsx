import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { searchClubsByName, getUserClubs, type ClubSearchResult } from '../../services/clubService';
import { requestToJoin, getMyJoinRequest, cancelJoinRequest } from '../../services/joinRequestService';

function ResultRow({ result, isMember, uid }: { result: ClubSearchResult; isMember: boolean; uid: string }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const [busy, setBusy] = useState(false);

  const { data: request, isLoading } = useQuery({
    queryKey: ['joinRequest', result.clubId, uid],
    queryFn: () => getMyJoinRequest(result.clubId, uid),
    enabled: !isMember,
  });

  const pending = request?.status === 'pending';

  async function toggle() {
    if (!user) return;
    setBusy(true);
    try {
      if (pending) {
        await cancelJoinRequest(result.clubId, uid);
      } else {
        await requestToJoin(result.clubId, { uid, displayName: user.displayName ?? user.email ?? 'Player', photoURL: user.photoURL });
      }
      await queryClient.invalidateQueries({ queryKey: ['joinRequest', result.clubId, uid] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', flex: 1, marginRight: 12 }}>{result.name}</Text>
      {isMember ? (
        <View style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}>Member</Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <TouchableOpacity
          onPress={toggle} disabled={busy}
          style={{ backgroundColor: pending ? theme.surface : theme.accent, borderWidth: 1, borderColor: pending ? theme.border : theme.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ color: pending ? theme.textMuted : '#ffffff', fontSize: 13, fontWeight: '700' }}>
            {pending ? 'Requested ✕' : 'Request to join'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function FindClubsScreen() {
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data: myClubs } = useQuery({
    queryKey: ['clubs', user?.uid],
    queryFn: () => getUserClubs(user!.uid),
    enabled: !!user,
  });
  const memberIds = new Set((myClubs ?? []).map((c) => c.id));

  const { data: results, isFetching } = useQuery({
    queryKey: ['clubSearch', submitted],
    queryFn: () => searchClubsByName(submitted),
    enabled: submitted.trim().length > 0,
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <TextInput
          value={term} onChangeText={setTerm}
          onSubmitEditing={() => setSubmitted(term)}
          returnKeyType="search" placeholder="Search clubs by name"
          placeholderTextColor={theme.textMuted} autoCapitalize="none"
          style={{ flex: 1, backgroundColor: theme.surface, color: theme.text, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: theme.border }}
        />
        <TouchableOpacity onPress={() => setSubmitted(term)} style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Search</Text>
        </TouchableOpacity>
      </View>

      {isFetching ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : submitted && results && results.length === 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: 'center', marginTop: 40 }}>No clubs found matching "{submitted}".</Text>
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(item) => item.clubId}
          renderItem={({ item }) => <ResultRow result={item} isMember={memberIds.has(item.clubId)} uid={user!.uid} />}
          ListEmptyComponent={submitted ? null : <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: 'center', marginTop: 40 }}>Search for a club to request to join.</Text>}
        />
      )}
    </View>
    </KeyboardAvoidingView>
  );
}
