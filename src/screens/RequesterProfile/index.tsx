import { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getUserProfile } from '../../services/userProfileService';
import {
  getPublicPlayerStats,
  getClubGhosts,
  resolveJoinRequest,
} from '../../services/joinRequestService';
import { computeDerivedStats } from '../../services/playerProfileService';
import PlayerAvatar from '../../components/PlayerAvatar';
import type { Player, PublicPlayerStats } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RequesterProfile'>;

const HAND_LABEL: Record<string, string> = { RHB: 'Right hand bat', LHB: 'Left hand bat' };
const STYLE_LABEL: Record<string, string> = { fast: 'Fast', medium: 'Medium', spin: 'Spin' };
const KEEPING_LABEL: Record<string, string> = { keeper: 'Keeper', 'can-keep': 'Can keep' };

function fmt(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function ClubStatsCard({ entry }: { entry: PublicPlayerStats }) {
  const d = computeDerivedStats(entry.careerStats);
  const rows: [string, string][] = [
    ['Matches', String(d.matchesPlayed)],
    ['Runs', String(d.totalRuns)],
    ['High score', String(d.highScore)],
    ['Bat avg', fmt(d.battingAverage)],
    ['Strike rate', fmt(d.strikeRate)],
    ['Wickets', String(d.totalWickets)],
    ['Bowl avg', fmt(d.bowlingAverage)],
    ['Economy', fmt(d.economy)],
  ];
  return (
    <View
      style={{
        backgroundColor: '#1e2d45',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2d3f58',
      }}
    >
      <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
        {entry.clubName || 'Club'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {rows.map(([label, value]) => (
          <View key={label} style={{ width: '25%', marginBottom: 12 }}>
            <Text style={{ color: '#6b7280', fontSize: 11 }}>{label}</Text>
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600', marginTop: 2 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GhostRow({
  ghost,
  selected,
  onToggle,
}: {
  ghost: Player;
  selected: boolean;
  onToggle: () => void;
}) {
  const d = computeDerivedStats(ghost.careerStats);
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: selected ? '#14361f' : '#1e2d45',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: selected ? '#4ade80' : '#2d3f58',
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? '#4ade80' : '#6b7280',
          backgroundColor: selected ? '#4ade80' : 'transparent',
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>{ghost.displayName}</Text>
        <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
          {d.matchesPlayed} matches · {d.totalRuns} runs · {d.totalWickets} wkts
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RequesterProfileScreen({ route, navigation }: Props) {
  const { clubId, uid, displayName } = route.params;
  const queryClient = useQueryClient();

  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const { data: profile } = useQuery({
    queryKey: ['userProfile', uid],
    queryFn: () => getUserProfile(uid),
  });

  const { data: clubStats, isLoading } = useQuery({
    queryKey: ['publicPlayerStats', uid],
    queryFn: () => getPublicPlayerStats(uid),
  });

  const { data: ghosts } = useQuery({
    queryKey: ['clubGhosts', clubId],
    queryFn: () => getClubGhosts(clubId),
  });

  const name = profile?.displayName ?? displayName;

  async function resolve(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      await resolveJoinRequest(
        clubId,
        uid,
        decision,
        decision === 'approve' && selectedGhostId ? selectedGhostId : undefined
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['joinRequests', clubId] }),
        queryClient.invalidateQueries({ queryKey: ['clubPlayers', clubId] }),
        queryClient.invalidateQueries({ queryKey: ['squad', clubId] }),
      ]);
      navigation.goBack();
    } catch (err) {
      console.error('resolveJoinRequest failed', err);
      setBusy(null);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0a1628' }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <PlayerAvatar name={name} photoURL={profile?.photoURL} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
            {[profile?.battingHand && HAND_LABEL[profile.battingHand],
              profile?.bowlingStyle && STYLE_LABEL[profile.bowlingStyle],
              profile?.wicketKeeping && KEEPING_LABEL[profile.wicketKeeping]]
              .filter(Boolean)
              .join(' · ') || 'No profile details'}
          </Text>
        </View>
      </View>

      {profile?.bio ? (
        <Text style={{ color: '#d1d5db', fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
          {profile.bio}
        </Text>
      ) : null}

      <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 }}>
        STATS ACROSS CLUBS
      </Text>
      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 20 }} />
      ) : clubStats && clubStats.length > 0 ? (
        clubStats.map((entry) => <ClubStatsCard key={entry.clubId} entry={entry} />)
      ) : (
        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>
          No match stats yet in any club.
        </Text>
      )}

      {/* Optional: link an existing ghost into this new member */}
      <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 4 }}>
        LINK AN EXISTING PLAYER (OPTIONAL)
      </Text>
      <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
        If this person already exists as an imported (ghost) player, link them — their
        record merges into this member's stats for this club.
      </Text>
      {ghosts && ghosts.length > 0 ? (
        ghosts.map((g) => (
          <GhostRow
            key={g.id}
            ghost={g}
            selected={selectedGhostId === g.id}
            onToggle={() => setSelectedGhostId(selectedGhostId === g.id ? null : g.id)}
          />
        ))
      ) : (
        <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
          No unlinked ghost players in this club.
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() => resolve('reject')}
          disabled={busy !== null}
          style={{
            flex: 1,
            backgroundColor: '#1e2d45',
            borderWidth: 1,
            borderColor: '#7f1d1d',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'reject' ? (
            <ActivityIndicator color="#fca5a5" />
          ) : (
            <Text style={{ color: '#fca5a5', fontSize: 15, fontWeight: '700' }}>Reject</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => resolve('approve')}
          disabled={busy !== null}
          style={{
            flex: 1,
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy === 'approve' ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={{ color: '#0a1628', fontSize: 15, fontWeight: '700' }}>
              {selectedGhostId ? 'Approve & link' : 'Approve'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
