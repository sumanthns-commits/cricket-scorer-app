import { useMemo } from 'react';
import { View, Text, TouchableOpacity, SectionList, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useClubStore } from '../../store/clubStore';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getClubMatches, deleteMatch, getMatchOvers } from '../../services/matchService';
import { getClub, getClubMember } from '../../services/clubService';
import { seasonLabel, seasonSortValue, type Hemisphere } from '../../utils/seasons';
import type { Match } from '../../types';

interface MatchSection {
  title: string;
  sortValue: number;
  data: Match[];
}

function groupBySeason(matches: Match[], hemisphere: Hemisphere): MatchSection[] {
  const sorted = [...matches].sort((a, b) => b.date.toMillis() - a.date.toMillis());
  const sections = new Map<string, MatchSection>();

  for (const match of sorted) {
    const date = match.date.toDate();
    const title = seasonLabel(date, hemisphere);
    const existing = sections.get(title);
    if (existing) {
      existing.data.push(match);
    } else {
      sections.set(title, { title, sortValue: seasonSortValue(date), data: [match] });
    }
  }

  return [...sections.values()].sort((a, b) => b.sortValue - a.sortValue);
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<Match['status'], string> = {
  scheduled: '#d97706',
  live: '#16a34a',
  completed: '#64748b',
  abandoned: '#dc2626',
};

function MatchCard({ match, onPress, onDelete, isAdmin }: { match: Match; onPress: () => void; onDelete?: () => void; isAdmin: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const dateObj = match.date.toDate();
  const dateStr = dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const hasTeams = (match.teamA?.length ?? 0) > 0;
  const hasToss = !!match.toss;
  const isFinished = match.status === 'completed' || match.status === 'abandoned';

  const adminActionLabel =
    match.status === 'live'
      ? 'Live'
      : hasToss
      ? 'View'
      : hasTeams
      ? 'Toss'
      : 'Build Teams';

  const memberActionLabel =
    match.status === 'live' ? 'Live' : isFinished ? 'View' : null;

  const actionLabel = isAdmin ? adminActionLabel : memberActionLabel;
  const statusColor = STATUS_COLORS[match.status];

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
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>
            {match.homeTeam} vs {match.awayTeam}
          </Text>
          {match.venue ? (
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{match.venue}</Text>
          ) : null}
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            {dateStr}
            {match.format ? ` · ${match.format === 'custom' ? `${match.rules.oversPerInnings ?? '?'} ov` : match.format}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View
            style={{
              backgroundColor: `${statusColor}18`,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: statusColor,
            }}
          >
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              {match.status}
            </Text>
          </View>
          {actionLabel && (
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>{actionLabel} →</Text>
          )}
          {onDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchesScreen() {
  const navigation = useNavigation<Nav>();
  const activeClubId = useClubStore((s) => s.activeClubId);
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);

  const { data: matches, isLoading, refetch } = useQuery({
    queryKey: ['matches', activeClubId],
    queryFn: () => getClubMatches(activeClubId!),
    enabled: !!activeClubId,
  });

  const { data: club } = useQuery({
    queryKey: ['club', activeClubId],
    queryFn: () => getClub(activeClubId!),
    enabled: !!activeClubId,
  });

  const { data: member } = useQuery({
    queryKey: ['clubMember', activeClubId, user?.uid],
    queryFn: () => getClubMember(activeClubId!, user!.uid),
    enabled: !!activeClubId && !!user,
  });

  const isAdmin = member?.role === 'admin';
  const hemisphere: Hemisphere = club?.hemisphere ?? 'N';

  const sections = useMemo(
    () => groupBySeason(matches ?? [], hemisphere),
    [matches, hemisphere]
  );

  const handleMatchPress = (match: Match) => {
    const clubId = match.clubId;
    const matchId = match.id;
    const hasTeams = (match.teamA?.length ?? 0) > 0;
    const hasToss = !!match.toss;

    if (match.status === 'completed' || match.status === 'abandoned') {
      navigation.navigate('MatchScorecard', { clubId, matchId });
      return;
    }
    if (match.status === 'live' || hasToss) {
      navigation.navigate('LiveScoring', { clubId, matchId });
      return;
    }
    if (!isAdmin) return;
    if (hasTeams) {
      navigation.navigate('Toss', { clubId, matchId });
    } else {
      navigation.navigate('TeamBuilder', { clubId, matchId });
    }
  };

  const handleDelete = async (match: Match) => {
    if (match.status === 'live') {
      const overs = await getMatchOvers(match.clubId, match.id).catch(() => []);
      if (overs.length > 0) {
        Alert.alert('Match already started', 'It can only be abandoned (from the Live screen), not deleted.');
        return;
      }
    }
    Alert.alert(
      'Delete match?',
      `Remove ${match.homeTeam} vs ${match.awayTeam}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMatch(match.clubId, match.id)
              .then(() => refetch())
              .catch(() => Alert.alert('Could not delete the match. Please try again.'));
          },
        },
      ]
    );
  };

  if (!activeClubId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 20, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
          Go to Home and tap a club to view its matches.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>Matches</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Leaderboard', { clubId: activeClubId })}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>🏆 Leaders</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => navigation.navigate('ScheduleMatch', { clubId: activeClubId })}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 8,
                paddingVertical: 8,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>+ Schedule</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 13,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                backgroundColor: theme.bg,
                paddingTop: 12,
                paddingBottom: 8,
              }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              isAdmin={isAdmin}
              onPress={() => handleMatchPress(item)}
              onDelete={
                isAdmin && (item.status === 'scheduled' || item.status === 'live')
                  ? () => handleDelete(item)
                  : undefined
              }
            />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: theme.textMuted, fontSize: 16, textAlign: 'center' }}>
            No matches yet.{'\n'}Schedule your first match to get started.
          </Text>
        </View>
      )}
    </View>
  );
}
