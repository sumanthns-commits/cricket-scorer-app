import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Share } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Timestamp } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getClub, getClubMember } from '../../services/clubService';
import { requestToJoin, getMyJoinRequest, cancelJoinRequest } from '../../services/joinRequestService';
import {
  subscribeMatchPoll,
  subscribeMatchPollResponses,
  respondToPoll,
  sharePoll,
  buildPollShareContent,
  deletePoll,
} from '../../services/matchPollService';
import PlayerAvatar from '../../components/PlayerAvatar';
import type { MatchPoll, PollResponse } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'PollResponse'>;

// Same branded palette as MatchScorecard's shareable snapshot, for visual
// consistency across the app's "share as image" cards.
const SNAPSHOT_WIDTH = 390;
const SNAP_BG = '#0f172a';
const SNAP_SURFACE = '#1e293b';
const SNAP_BORDER = '#334155';
const SNAP_TEXT = '#f1f5f9';
const SNAP_MUTED = '#94a3b8';
const SNAP_ACCENT = '#22c55e';

function formatOptionDate(ts?: Timestamp): string | null {
  if (!ts) return null;
  const d = ts.toDate();
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} · ${timeStr}`;
}

// Offscreen-rendered card captured via react-native-view-shot for the image
// share — question + each option's current vote count and who picked it, so
// the shared image itself is a live snapshot of poll state, not just the
// question text.
function PollSnapshot({ poll, responses }: { poll: MatchPoll; responses: PollResponse[] }) {
  const dateStr = poll.createdAt
    ? poll.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const respondentsFor = (optionId: string) => responses.filter((r) => r.optionIds.includes(optionId));
  const maxCount = Math.max(1, ...poll.options.map((o) => respondentsFor(o.id).length));

  return (
    <View style={{ width: SNAPSHOT_WIDTH, backgroundColor: SNAP_BG, padding: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: SNAP_ACCENT, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Crease</Text>
        <Text style={{ color: SNAP_MUTED, fontSize: 11 }}>{dateStr}</Text>
      </View>

      <View style={{ backgroundColor: SNAP_SURFACE, borderRadius: 10, padding: 14, marginBottom: 4 }}>
        <Text style={{ color: SNAP_TEXT, fontSize: 17, fontWeight: '800' }}>🏏 {poll.question}</Text>
        {poll.venue ? <Text style={{ color: SNAP_MUTED, fontSize: 12, marginTop: 4 }}>📍 {poll.venue}</Text> : null}
      </View>

      <View style={{ height: 1, backgroundColor: SNAP_BORDER, marginVertical: 14 }} />

      {poll.options.map((option) => {
        const respondents = respondentsFor(option.id);
        const barPct = respondents.length > 0 ? (respondents.length / maxCount) * 100 : 0;
        return (
          <View key={option.id} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: SNAP_TEXT, fontSize: 14, fontWeight: '700' }}>{option.label}</Text>
              <Text style={{ color: SNAP_MUTED, fontSize: 12 }}>
                {respondents.length} {respondents.length === 1 ? 'vote' : 'votes'}
              </Text>
            </View>
            <View style={{ height: 5, backgroundColor: SNAP_BORDER, borderRadius: 3, marginBottom: 6 }}>
              <View style={{ height: 5, width: `${barPct}%`, backgroundColor: SNAP_ACCENT, borderRadius: 3 }} />
            </View>
            {respondents.length > 0 && (
              <Text style={{ color: SNAP_MUTED, fontSize: 11 }} numberOfLines={2}>
                {respondents.map((r) => r.displayName).join(', ')}
              </Text>
            )}
          </View>
        );
      })}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          marginTop: 8,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: SNAP_BORDER,
        }}
      >
        <Text style={{ color: SNAP_MUTED, fontSize: 10 }}>Polled with </Text>
        <Text style={{ color: SNAP_ACCENT, fontSize: 10, fontWeight: '700' }}>Crease</Text>
      </View>
    </View>
  );
}

export default function PollResponseScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, pollId } = params;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const queryClient = useQueryClient();

  // undefined = still loading; null = doesn't exist (or not signed in yet).
  const [poll, setPoll] = useState<MatchPoll | null | undefined>(undefined);
  const [responses, setResponses] = useState<PollResponse[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [respondBusy, setRespondBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const snapshotRef = useRef<ViewShot>(null);
  // Which options have their voter list expanded — WhatsApp-poll style
  // (collapsed count by default, tap to reveal who voted).
  const [expandedOptionIds, setExpandedOptionIds] = useState<Set<string>>(new Set());

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => getClub(clubId),
    enabled: !!clubId && !!user,
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

  // Poll doc is readable by any signed-in user (not just members) — a
  // non-member still sees the question before being asked to join.
  useEffect(() => {
    if (!user) {
      setPoll(null);
      return;
    }
    return subscribeMatchPoll(clubId, pollId, setPoll);
  }, [clubId, pollId, user]);

  // Response subcollection is member-only at the security layer.
  useEffect(() => {
    if (!user || !isMember) {
      setResponses([]);
      return;
    }
    return subscribeMatchPollResponses(clubId, pollId, setResponses);
  }, [clubId, pollId, user, isMember]);

  const myResponse = responses.find((r) => r.uid === user?.uid);

  useEffect(() => {
    if (myResponse) setSelected(myResponse.optionIds);
  }, [myResponse]);

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

  // Shares a live snapshot image of the poll (question + each option's
  // current votes/names) as the primary content — richer and more "alive"
  // than a link alone. Neither platform can cleanly combine a local image
  // with a separate tappable link the way plain-text sharing can, so:
  // iOS puts the link inside the caption text alongside the image (iOS can
  // combine a local file + text in one share sheet); Android shares the
  // image alone via expo-sharing (no caption field in that API at all —
  // WhatsApp still lets the sender type their own text before sending from
  // there, same as sharing any photo). Falls back to the plain text+link
  // share if the snapshot can't be captured for some reason.
  async function handleShare() {
    if (!poll) return;
    if (!snapshotRef.current) {
      await sharePoll(poll);
      return;
    }
    setShareBusy(true);
    try {
      const uri = await captureRef(snapshotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const { message, url } = buildPollShareContent(poll);
      if (Platform.OS === 'ios') {
        await Share.share({ message: `${message}\n${url}`, url: uri });
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Poll', UTI: 'public.png' });
        } else {
          await sharePoll(poll);
        }
      }
    } catch {
      // user cancelled or capture/share failed — nothing to do
    } finally {
      setShareBusy(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete poll?',
      'This removes the poll and everyone\'s responses. Matches already scheduled from it are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleteBusy(true);
            deletePoll(clubId, pollId)
              .then(() => navigation.goBack())
              .catch(() => {
                setDeleteBusy(false);
                Alert.alert('Could not delete the poll. Please try again.');
              });
          },
        },
      ],
    );
  }

  function toggleExpanded(optionId: string) {
    setExpandedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  // Tapping an option records the response immediately (poll-app style — no
  // separate submit step). Optimistically updates local selection first so
  // the tap feels instant, then writes; rolls back on failure.
  async function toggleOption(optionId: string) {
    if (!poll || !user || respondBusy) return;
    const next = poll.multiSelect
      ? selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      : [optionId];
    const previous = selected;
    setSelected(next);
    setRespondBusy(true);
    try {
      await respondToPoll(
        clubId,
        pollId,
        { uid: user.uid, displayName: user.displayName ?? user.email ?? 'Player' },
        next,
      );
    } catch {
      setSelected(previous);
      Alert.alert('Could not save your response. Please try again.');
    } finally {
      setRespondBusy(false);
    }
  }

  function handleSchedule(optionId: string) {
    if (!poll || !club) return;
    const option = poll.options.find((o) => o.id === optionId);
    if (!option) return;
    const squad = Array.from(new Set(responses.filter((r) => r.optionIds.includes(optionId)).map((r) => r.uid)));
    if (squad.length === 0) {
      Alert.alert('No respondents yet', `Nobody has said they're in for "${option.label}" yet.`);
      return;
    }
    navigation.navigate('TeamBuilder', {
      clubId,
      matchDraft: {
        homeTeam: club.name,
        awayTeam: 'Opponents',
        venue: poll.venue ?? '',
        dateMs: (option.proposedDate?.toDate() ?? new Date()).getTime(),
        format: 'custom',
        rules: club.rules,
        squad,
      },
      pollId: poll.id,
      pollOptionId: optionId,
    });
  }

  const respondentsFor = (optionId: string) => responses.filter((r) => r.optionIds.includes(optionId));

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.text, fontSize: 16, textAlign: 'center' }}>Sign in to view this match poll.</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('SignIn')}
          style={{ marginTop: 16, backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700' }}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (poll === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (poll === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: 'center' }}>This poll no longer exists.</Text>
      </View>
    );
  }

  if (!isMember) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>{poll.question}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 20 }}>
          You need to be a member of {club?.name ?? 'this club'} to respond.
        </Text>
        <TouchableOpacity
          onPress={handleJoinToggle}
          disabled={joinBusy}
          style={{
            backgroundColor: isPending ? theme.surface : theme.accent,
            borderWidth: 1,
            borderColor: isPending ? theme.border : theme.accent,
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: joinBusy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: isPending ? theme.textMuted : '#ffffff', fontSize: 15, fontWeight: '700' }}>
            {isPending ? 'Requested ✕' : `Request to join ${club?.name ?? 'club'}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20 }}>
      {/* Off-screen snapshot for the image share (rendered but positioned off-viewport) */}
      <View style={{ position: 'absolute', top: -9999, left: 0 }} pointerEvents="none">
        <ViewShot ref={snapshotRef} options={{ format: 'png', quality: 1 }}>
          <PollSnapshot poll={poll} responses={responses} />
        </ViewShot>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', flex: 1, marginRight: 12 }}>
          {poll.question}
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          disabled={shareBusy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            backgroundColor: theme.surface,
            borderRadius: 8,
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
            opacity: shareBusy ? 0.6 : 1,
          }}
        >
          {shareBusy ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={{ fontSize: 16 }}>🔗</Text>}
        </TouchableOpacity>
      </View>
      {poll.venue ? <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 4 }}>📍 {poll.venue}</Text> : null}
      {poll.note ? <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>{poll.note}</Text> : null}

      <View style={{ marginTop: 12, marginBottom: 20 }}>
        {(() => {
          const maxCount = Math.max(1, ...poll.options.map((o) => respondentsFor(o.id).length));
          return poll.options.map((option) => {
            const isSelected = selected.includes(option.id);
            const dateLabel = formatOptionDate(option.proposedDate);
            const respondents = respondentsFor(option.id);
            const converted = poll.convertedMatches.find((c) => c.optionId === option.id);
            const expanded = expandedOptionIds.has(option.id);
            const barPct = respondents.length > 0 ? (respondents.length / maxCount) * 100 : 0;

            return (
              <View
                key={option.id}
                style={{
                  backgroundColor: isSelected ? theme.accentDim : theme.surface,
                  borderRadius: 10,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: isSelected ? theme.accent : theme.border,
                  overflow: 'hidden',
                }}
              >
                <TouchableOpacity
                  onPress={() => toggleOption(option.id)}
                  disabled={respondBusy}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10, opacity: respondBusy ? 0.7 : 1 }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: poll.multiSelect ? 4 : 10,
                      backgroundColor: isSelected ? theme.accent : 'transparent',
                      borderWidth: 2,
                      borderColor: isSelected ? theme.accent : theme.textMuted,
                      marginRight: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected && <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{option.label}</Text>
                    {dateLabel ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{dateLabel}</Text> : null}
                  </View>
                  {converted && (
                    <TouchableOpacity onPress={() => navigation.navigate('MatchScorecard', { clubId, matchId: converted.matchId })}>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Scheduled →</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* Vote share bar — WhatsApp-poll style, scaled against this poll's most-picked option. */}
                <View style={{ height: 5, backgroundColor: theme.border, marginHorizontal: 14, borderRadius: 3 }}>
                  <View style={{ height: 5, width: `${barPct}%`, backgroundColor: theme.accent, borderRadius: 3 }} />
                </View>

                <TouchableOpacity
                  onPress={() => respondents.length > 0 && toggleExpanded(option.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 8 }}
                >
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
                    {respondents.length} {respondents.length === 1 ? 'vote' : 'votes'}
                  </Text>
                  {respondents.length > 0 && (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 6 }}>{expanded ? '▾' : '▸'}</Text>
                  )}
                </TouchableOpacity>

                {expanded && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                    {respondents.map((r) => (
                      <View key={r.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <PlayerAvatar name={r.displayName} seed={r.uid} size={26} />
                        <Text style={{ color: theme.text, fontSize: 13 }}>{r.displayName}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          });
        })()}
      </View>

      {isAdmin && (
        <View>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>ADMIN</Text>
          {poll.options
            .filter((o) => o.schedulable && !poll.convertedMatches.some((c) => c.optionId === o.id))
            .map((option) => (
              <TouchableOpacity
                key={option.id}
                onPress={() => handleSchedule(option.id)}
                disabled={deleteBusy}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  opacity: deleteBusy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>
                  Schedule {option.label}'s match ({respondentsFor(option.id).length} in)
                </Text>
              </TouchableOpacity>
            ))}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={deleteBusy}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 10,
              padding: 14,
              marginTop: 4,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#dc2626',
              opacity: deleteBusy ? 0.6 : 1,
            }}
          >
            {deleteBusy ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '700' }}>🗑 Delete Poll</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
