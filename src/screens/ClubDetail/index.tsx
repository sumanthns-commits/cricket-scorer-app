import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getClubMatchesBySeason, getMatchOvers, deleteMatch, isMatchScorer } from '../../services/matchService';
import { getClub, getClubMember } from '../../services/clubService';
import { requestToJoin, getMyJoinRequest, cancelJoinRequest } from '../../services/joinRequestService';
import {
  currentSeasonInfo,
  generateSeasonRange,
  type Hemisphere,
  type SeasonInfo,
} from '../../utils/seasons';
import type { Match } from '../../types';
import { SeasonDropdown } from '../../components/SeasonDropdown';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_COLORS: Record<Match['status'], string> = {
  scheduled: '#d97706',
  live: '#16a34a',
  completed: '#64748b',
  abandoned: '#dc2626',
};


function MatchCard({
  match,
  onPress,
  onDelete,
  isAdmin,
  isScorer,
}: {
  match: Match;
  onPress: () => void;
  onDelete?: () => void;
  isAdmin: boolean;
  isScorer: boolean;
}) {
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

  const liveLabel = isScorer ? 'Live' : 'Watch';
  const adminActionLabel =
    match.status === 'live'
      ? liveLabel
      : hasToss
      ? 'View'
      : hasTeams
      ? 'Toss'
      : 'Build Teams';

  const viewerActionLabel = match.status === 'live' ? liveLabel : isFinished ? 'View' : null;
  const actionLabel = isAdmin ? adminActionLabel : viewerActionLabel;
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
            {match.format
              ? ` · ${match.format === 'custom' ? `${match.rules.oversPerInnings ?? '?'} ov` : match.format}`
              : ''}
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

export default function ClubDetailScreen({ navigation }: Props) {
  const route = useRoute<Props['route']>();
  const { clubId } = route.params;
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const queryClient = useQueryClient();
  const [joinBusy, setJoinBusy] = useState(false);

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => getClub(clubId),
    enabled: !!clubId,
  });

  const { data: member } = useQuery({
    queryKey: ['clubMember', clubId, user?.uid],
    queryFn: () => getClubMember(clubId, user!.uid),
    enabled: !!clubId && !!user,
  });

  const isMember = !!member;
  const isAdmin = member?.role === 'admin';

  const { data: joinRequest } = useQuery({
    queryKey: ['joinRequest', clubId, user?.uid],
    queryFn: () => getMyJoinRequest(clubId, user!.uid),
    enabled: !!clubId && !!user && !isMember,
  });

  const isPending = joinRequest?.status === 'pending';

  useEffect(() => {
    if (club) navigation.setOptions({ title: club.name });
  }, [club, navigation]);

  const hemisphere: Hemisphere = club?.hemisphere ?? 'N';

  const seasons = useMemo(() => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 3);
    return generateSeasonRange(from, new Date(), hemisphere);
  }, [hemisphere]);

  const [selectedSeason, setSelectedSeason] = useState<SeasonInfo | null>(null);

  const effectiveSeason = useMemo<SeasonInfo | null>(() => {
    if (!seasons.length) return null;
    if (selectedSeason && seasons.some((s) => s.label === selectedSeason.label)) {
      return selectedSeason;
    }
    const current = currentSeasonInfo(hemisphere);
    const found = seasons.find((s) => s.label === current.label);
    return found ?? seasons[0];
  }, [selectedSeason, seasons, hemisphere]);

  const { data: matches, isLoading, refetch } = useQuery({
    queryKey: ['matches', clubId, effectiveSeason?.label],
    queryFn: () => getClubMatchesBySeason(clubId, effectiveSeason!.start, effectiveSeason!.end),
    enabled: !!clubId && !!effectiveSeason,
  });

  async function handleJoinToggle() {
    if (!user) return;
    setJoinBusy(true);
    try {
      if (isPending) {
        await cancelJoinRequest(clubId, user.uid);
      } else {
        await requestToJoin(clubId, {
          uid: user.uid,
          displayName: user.displayName ?? user.email ?? 'Player',
          photoURL: user.photoURL,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['joinRequest', clubId, user.uid] });
    } finally {
      setJoinBusy(false);
    }
  }

  const handleMatchPress = (match: Match) => {
    const matchId = match.id;
    const hasTeams = (match.teamA?.length ?? 0) > 0;
    const hasToss = !!match.toss;

    if (match.status === 'completed' || match.status === 'abandoned') {
      nav.navigate('MatchScorecard', { clubId, matchId });
      return;
    }
    if (match.status === 'live') {
      // Only the scorer gets the ball-entry screen — everyone else watches
      // via MatchScorecard's real-time subscription.
      nav.navigate(
        isMatchScorer(match, user?.uid, isAdmin) ? 'LiveScoring' : 'MatchScorecard',
        { clubId, matchId }
      );
      return;
    }
    if (hasToss) {
      nav.navigate('LiveScoring', { clubId, matchId });
      return;
    }
    if (!isAdmin) return;
    if (hasTeams) {
      nav.navigate('Toss', { clubId, matchId });
    } else {
      nav.navigate('TeamBuilder', { clubId, matchId });
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
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      {!isMember && (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1, marginRight: 12 }}>
            You're viewing as a guest
          </Text>
          <TouchableOpacity
            onPress={handleJoinToggle}
            disabled={joinBusy}
            style={{
              backgroundColor: isPending ? theme.surface : theme.accent,
              borderWidth: 1,
              borderColor: isPending ? theme.border : theme.accent,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
              opacity: joinBusy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: isPending ? theme.textMuted : '#ffffff', fontSize: 13, fontWeight: '700' }}>
              {isPending ? 'Requested ✕' : 'Request to join'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>Matches</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => nav.navigate('Leaderboard', { clubId })}
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
                onPress={() => nav.navigate('ScheduleMatch', { clubId })}
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
        {effectiveSeason && (
          <SeasonDropdown
            seasons={seasons}
            selected={effectiveSeason}
            onSelect={setSelectedSeason}
          />
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : matches && matches.length > 0 ? (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              isAdmin={isAdmin}
              isScorer={isMatchScorer(item, user?.uid, isAdmin)}
              onPress={() => handleMatchPress(item)}
              onDelete={
                isAdmin && (item.status === 'scheduled' || item.status === 'live' || item.status === 'abandoned')
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
            No matches in {effectiveSeason?.label ?? 'this season'}.
          </Text>
        </View>
      )}
    </View>
  );
}
