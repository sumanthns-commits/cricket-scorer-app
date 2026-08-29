import { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getClubMember } from '../../services/clubService';
import { getClubPolls } from '../../services/matchPollService';
import type { MatchPoll } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'MatchPolls'>;

function statusFor(poll: MatchPoll): { label: string; color: string } {
  const schedulableCount = poll.options.filter((o) => o.schedulable).length;
  const convertedCount = poll.convertedMatches.length;
  if (schedulableCount > 0 && convertedCount >= schedulableCount) {
    return { label: 'All scheduled', color: '#64748b' };
  }
  if (convertedCount > 0) {
    return { label: `${convertedCount} of ${schedulableCount} scheduled`, color: '#d97706' };
  }
  return { label: 'Open', color: '#16a34a' };
}

function PollCard({ poll, onPress }: { poll: MatchPoll; onPress: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const status = statusFor(poll);
  const dateStr = poll.createdAt?.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{poll.question}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            {poll.multiSelect ? 'Multiple dates' : 'Yes / No'}
            {dateStr ? ` · ${dateStr}` : ''}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: `${status.color}18`,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: status.color,
          }}
        >
          <Text style={{ color: status.color, fontSize: 11, fontWeight: '700' }}>{status.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchPollsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId } = params;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);

  const { data: member } = useQuery({
    queryKey: ['clubMember', clubId, user?.uid],
    queryFn: () => getClubMember(clubId, user!.uid),
    enabled: !!clubId && !!user,
  });
  const isAdmin = member?.role === 'admin';

  const { data: polls, isLoading, refetch } = useQuery({
    queryKey: ['matchPolls', clubId],
    queryFn: () => getClubPolls(clubId),
    enabled: !!clubId,
  });

  // Picks up a poll just created (or just converted) without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>Match Polls</Text>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateMatchPoll', { clubId })}
            style={{ backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>+ New Poll</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : polls && polls.length > 0 ? (
        <FlatList
          data={polls}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PollCard poll={item} onPress={() => navigation.navigate('PollResponse', { clubId, pollId: item.id })} />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: theme.textMuted, fontSize: 16, textAlign: 'center' }}>
            No match polls yet.{isAdmin ? '\nCreate one to gauge interest before scheduling.' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}
