import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolvePlayerStats } from '../services/statsResolver';
import { linkGhost, unlinkGhost, getClubGhosts, getClubRegisteredMembers } from '../services/joinRequestService';
import { leaveClub, removeMember } from '../services/clubService';
import {
  computeDerivedStats,
  computeSkillRating,
  getActiveClaim,
  getBattingInsights,
  getPlayer,
  getPlayerForm,
  updatePlayerAttributes,
  updateStrengthOverride,
} from '../services/playerProfileService';
import PlayerAvatar from './PlayerAvatar';
import FormChart from './FormChart';
import WagonWheel from './WagonWheel';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { useClubStore } from '../store/clubStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { BattingHand, BowlingStyle, Player, PlayerType, StrengthOverride, WicketKeepingAbility } from '../types';

const BATTING_HANDS: { value: BattingHand; label: string }[] = [
  { value: 'RHB', label: 'Right hand' },
  { value: 'LHB', label: 'Left hand' },
];
const BOWLING_STYLES: { value: BowlingStyle; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
  { value: 'spin', label: 'Spin' },
];
const WICKET_KEEPING_OPTIONS: { value: WicketKeepingAbility; label: string }[] = [
  { value: 'keeper', label: 'Primary keeper' },
  { value: 'can-keep', label: 'Can keep' },
];

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  onDeselect,
}: {
  options: { value: T; label: string }[];
  selected: T | undefined;
  onSelect: (v: T) => void;
  onDeselect?: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = selected === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => (active && onDeselect ? onDeselect() : onSelect(o.value))}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              backgroundColor: active ? theme.accent : theme.surface,
              borderWidth: 1, borderColor: active ? theme.accent : theme.border,
            }}
          >
            <Text style={{ color: active ? '#ffffff' : theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const TYPE_BADGE: Record<PlayerType, { label: string; color: string }> = {
  ghost: { label: 'GHOST', color: '#a78bfa' },
  registered: { label: 'REGISTERED', color: '#16a34a' },
  linked: { label: 'LINKED', color: '#2563eb' },
};

function fmt(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Text style={{ color: valueColor ?? theme.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function StrengthSlider({
  label,
  value,
  onCommit,
  editable = false,
}: {
  label: string;
  value: number;
  onCommit?: (v: number) => void;
  editable?: boolean;
}) {
  const theme = useThemeStore((s) => s.theme);
  const [displayValue, setDisplayValue] = useState(value);
  useEffect(() => { setDisplayValue(value); }, [value]);

  const barColor = displayValue >= 70 ? theme.accent : displayValue >= 40 ? '#d97706' : '#dc2626';

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: barColor, fontSize: 13, fontWeight: '700' }}>{displayValue}</Text>
      </View>
      {editable ? (
        <Slider
          value={value}
          minimumValue={0}
          maximumValue={100}
          step={1}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.border}
          thumbTintColor={theme.accent}
          onValueChange={(v: number) => setDisplayValue(Math.round(v))}
          onSlidingComplete={(v: number) => onCommit?.(Math.round(v))}
          style={{ height: 36, marginHorizontal: -6 }}
        />
      ) : (
        <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
          <View style={{ flex: displayValue, backgroundColor: barColor }} />
          <View style={{ flex: 100 - displayValue, backgroundColor: theme.border }} />
        </View>
      )}
    </View>
  );
}

type StrengthDraft = Required<StrengthOverride>;

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Merging…';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function CooldownBanner({ mergeAtMs }: { mergeAtMs: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      style={{
        backgroundColor: '#fefce8',
        borderRadius: 10,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#d97706',
      }}
    >
      <Text style={{ color: '#92400e', fontSize: 13, fontWeight: '700' }}>Provisional stats</Text>
      <Text style={{ color: '#78350f', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
        A claim is in cooldown — these figures preview the pending merge and may change.
        {mergeAtMs !== null ? ` Merges in ${formatCountdown(mergeAtMs - now)}.` : ''}
      </Text>
    </View>
  );
}

export default function PlayerProfileView({
  clubId,
  playerId,
  canEdit = false,
  isAdmin = false,
}: {
  clubId: string;
  playerId: string;
  canEdit?: boolean;
  isAdmin?: boolean;
}) {
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showRatingInfo, setShowRatingInfo] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  // Ghost-side picker: link this ghost to a chosen registered member
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const { data: ghosts } = useQuery({
    queryKey: ['clubGhosts', clubId],
    queryFn: () => getClubGhosts(clubId),
    enabled: showLinkPicker,
  });

  const { data: members } = useQuery({
    queryKey: ['clubRegisteredMembers', clubId],
    queryFn: () => getClubRegisteredMembers(clubId),
    enabled: showMemberPicker,
  });

  const handleLink = () => {
    if (!selectedGhostId) return;
    setLinking(true);
    linkGhost(clubId, playerId, selectedGhostId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['resolvedStats', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['clubSquad', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['clubGhosts', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['leaderboard-base', clubId] }),
        ])
      )
      .then(() => { setShowLinkPicker(false); setSelectedGhostId(null); })
      .catch((e) => console.error('linkGhost failed', e))
      .finally(() => setLinking(false));
  };

  const handleLinkToMember = () => {
    if (!selectedMemberId) return;
    setLinking(true);
    linkGhost(clubId, selectedMemberId, playerId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['resolvedStats', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['player', clubId, selectedMemberId] }),
          queryClient.invalidateQueries({ queryKey: ['clubSquad', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['clubGhosts', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['clubRegisteredMembers', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['leaderboard-base', clubId] }),
        ])
      )
      .then(() => { setShowMemberPicker(false); setSelectedMemberId(null); })
      .catch((e) => console.error('linkGhost (from ghost) failed', e))
      .finally(() => setLinking(false));
  };

  const handleUnlink = () => {
    setUnlinking(true);
    unlinkGhost(clubId, playerId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['resolvedStats', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['clubSquad', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['clubGhosts', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['leaderboard-base', clubId] }),
        ])
      )
      .catch((e) => console.error('unlinkGhost failed', e))
      .finally(() => setUnlinking(false));
  };

  const authUser = useAuthStore((s) => s.user);
  const activeClubId = useClubStore((s) => s.activeClubId);
  const setActiveClubId = useClubStore((s) => s.setActiveClubId);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isSelf = !!authUser && authUser.uid === playerId;
  const [leavingOrRemoving, setLeavingOrRemoving] = useState(false);

  const invalidateMembershipQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }),
      queryClient.invalidateQueries({ queryKey: ['resolvedStats', clubId, playerId] }),
      queryClient.invalidateQueries({ queryKey: ['clubSquad', clubId] }),
      queryClient.invalidateQueries({ queryKey: ['clubGhosts', clubId] }),
      queryClient.invalidateQueries({ queryKey: ['clubRegisteredMembers', clubId] }),
      queryClient.invalidateQueries({ queryKey: ['leaderboard-base', clubId] }),
    ]);

  const afterMembershipChange = async () => {
    await invalidateMembershipQueries();
    if (activeClubId === clubId) setActiveClubId(null);
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave club',
      'Are you sure you want to leave this club? Your stats are kept, and you can rejoin later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            setLeavingOrRemoving(true);
            leaveClub(clubId)
              .then(afterMembershipChange)
              .catch((e) =>
                Alert.alert('Could not leave', e instanceof Error ? e.message : 'Please try again.')
              )
              .finally(() => setLeavingOrRemoving(false));
          },
        },
      ]
    );
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove from club',
      `Remove ${player?.displayName ?? 'this player'} from the club? Their stats are kept, and they can rejoin later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setLeavingOrRemoving(true);
            removeMember(clubId, playerId)
              .then(afterMembershipChange)
              .catch((e) =>
                Alert.alert('Could not remove', e instanceof Error ? e.message : 'Please try again.')
              )
              .finally(() => setLeavingOrRemoving(false));
          },
        },
      ]
    );
  };

  const { data: player, isLoading: loadingPlayer } = useQuery({
    queryKey: ['player', clubId, playerId],
    queryFn: () => getPlayer(clubId, playerId),
  });

  const saveAttr = (attrs: { displayName?: string; battingHand?: BattingHand; bowlingStyle?: BowlingStyle; wicketKeeping?: WicketKeepingAbility | null }) => {
    updatePlayerAttributes(clubId, playerId, attrs)
      .then(() => queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }))
      .catch(() => {});
  };

  // Name edits happen in a small overlay with its own explicit Save button
  // (rather than an always-editable inline field) so it's unambiguous when
  // the change has actually been committed.
  const [showEditName, setShowEditName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(false);

  const openEditName = () => {
    setNameDraft(player?.displayName ?? '');
    setNameError(false);
    setShowEditName(true);
  };
  const saveName = () => {
    const next = nameDraft.trim();
    if (!next || next === player?.displayName) {
      setShowEditName(false);
      return;
    }
    setSavingName(true);
    setNameError(false);
    updatePlayerAttributes(clubId, playerId, { displayName: next })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] });
        setSavingName(false);
        setShowEditName(false);
      })
      .catch(() => {
        setSavingName(false);
        setNameError(true);
      });
  };

  const [keepingDraft, setKeepingDraft] = useState<WicketKeepingAbility | undefined>(undefined);
  useEffect(() => { setKeepingDraft(player?.wicketKeeping); }, [player?.wicketKeeping]);

  const defaultStrength: StrengthDraft = { batting: 50, fielding: 50, bowling: 50, keeping: 50 };
  const [strengthDraft, setStrengthDraft] = useState<StrengthDraft>(defaultStrength);
  const strengthDraftRef = useRef<StrengthDraft>(defaultStrength);
  useEffect(() => {
    if (player?.strengthOverride) {
      const next: StrengthDraft = {
        batting: player.strengthOverride.batting ?? 50,
        fielding: player.strengthOverride.fielding ?? 50,
        bowling: player.strengthOverride.bowling ?? 50,
        keeping: player.strengthOverride.keeping ?? 50,
      };
      strengthDraftRef.current = next;
      setStrengthDraft(next);
    }
  }, [player?.strengthOverride]);

  const commitStrength = (field: keyof StrengthDraft, v: number) => {
    const next = { ...strengthDraftRef.current, [field]: v };
    strengthDraftRef.current = next;
    setStrengthDraft(next);
    updateStrengthOverride(clubId, playerId, next)
      .then(() => queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }))
      .catch(() => {});
  };

  const { data: resolved, isLoading: loadingStats } = useQuery({
    queryKey: ['resolvedStats', clubId, playerId],
    queryFn: () => resolvePlayerStats(clubId, playerId),
  });

  const { data: form = [] } = useQuery({
    queryKey: ['playerForm', clubId, playerId],
    queryFn: () => getPlayerForm(clubId, playerId, 5),
    retry: false,
  });

  const { data: insights } = useQuery({
    queryKey: ['battingInsights', clubId, playerId],
    queryFn: () => getBattingInsights(clubId, playerId),
    retry: false,
  });

  const { data: claim } = useQuery({
    queryKey: ['claim', clubId, player?.activeClaim],
    queryFn: () => getActiveClaim(clubId, player!.activeClaim!),
    enabled: !!player?.activeClaim,
  });

  if (loadingPlayer || loadingStats) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!player || !resolved) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>Player not found</Text>
      </View>
    );
  }

  const derived = computeDerivedStats(resolved.stats);
  const badge = TYPE_BADGE[player.type] ?? TYPE_BADGE.registered;
  const rating = player.skillRating ?? computeSkillRating(resolved.stats);
  const showProvisional = !!player.activeClaim && claim?.status === 'cooldown';
  const mergeAtMs = claim?.mergeScheduledAt ? claim.mergeScheduledAt.toMillis() : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom }} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PlayerAvatar name={player.displayName} photoURL={player.photoURL} seed={player.id} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{player.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <View
              style={{
                backgroundColor: `${badge.color}22`,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: badge.color,
              }}
            >
              <Text style={{ color: badge.color, fontSize: 10, fontWeight: '800' }}>{badge.label}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowRatingInfo(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: `${theme.accent}22`,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.accent,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '800' }}>{rating}</Text>
              <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>RATING</Text>
              <Text style={{ color: theme.accent, fontSize: 11, opacity: 0.7 }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showProvisional && <CooldownBanner mergeAtMs={mergeAtMs} />}

      {isAdmin && player.linkedGhost ? (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 10,
            padding: 12,
            marginTop: 16,
            borderWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1 }}>
            Linked from ghost <Text style={{ color: theme.text, fontWeight: '700' }}>{player.linkedGhost.displayName}</Text>. Its stats are merged in.
          </Text>
          <TouchableOpacity
            onPress={handleUnlink}
            disabled={unlinking}
            style={{
              backgroundColor: theme.surfaceAlt,
              borderWidth: 1,
              borderColor: '#dc2626',
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 12,
              opacity: unlinking ? 0.6 : 1,
            }}
          >
            {unlinking ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '700' }}>Unlink</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {isAdmin && player.type === 'ghost' && player.status !== 'departed' ? (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 10,
            marginTop: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
          }}
        >
          <TouchableOpacity
            onPress={() => { setShowMemberPicker((v) => !v); setSelectedMemberId(null); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>Link to member</Text>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>{showMemberPicker ? 'Cancel' : 'Choose'}</Text>
          </TouchableOpacity>
          {showMemberPicker ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                Select a registered member to merge this ghost's historical stats into their record.
              </Text>
              {!members ? (
                <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />
              ) : members.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>No eligible registered members in this club.</Text>
              ) : (
                members.map((m: Player) => {
                  const sel = selectedMemberId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setSelectedMemberId(sel ? null : m.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: sel ? theme.accentDim : theme.surfaceAlt,
                        borderRadius: 8, padding: 10, marginBottom: 6,
                        borderWidth: 1, borderColor: sel ? theme.accent : theme.border,
                      }}
                    >
                      <View
                        style={{
                          width: 18, height: 18, borderRadius: 9,
                          borderWidth: 2, borderColor: sel ? theme.accent : theme.textMuted,
                          backgroundColor: sel ? theme.accent : 'transparent',
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{m.displayName}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                          {m.careerStats.matchesPlayed} matches · {m.careerStats.totalRuns} runs · {m.careerStats.totalWickets} wkts
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <TouchableOpacity
                onPress={handleLinkToMember}
                disabled={!selectedMemberId || linking}
                style={{
                  marginTop: 6,
                  backgroundColor: selectedMemberId ? theme.accent : theme.border,
                  borderRadius: 8, paddingVertical: 11, alignItems: 'center',
                  opacity: linking ? 0.6 : 1,
                }}
              >
                {linking ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    {selectedMemberId ? 'Link to member' : 'Select a member'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {isAdmin && player.type === 'registered' && !player.linkedGhost ? (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 10,
            marginTop: 16,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
          }}
        >
          <TouchableOpacity
            onPress={() => { setShowLinkPicker((v) => !v); setSelectedGhostId(null); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>Link to ghost player</Text>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>{showLinkPicker ? 'Cancel' : 'Choose'}</Text>
          </TouchableOpacity>
          {showLinkPicker ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                Select an imported ghost player to merge their historical stats into this member's record.
              </Text>
              {!ghosts ? (
                <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />
              ) : ghosts.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>No unlinked ghost players in this club.</Text>
              ) : (
                ghosts.map((g: Player) => {
                  const sel = selectedGhostId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => setSelectedGhostId(sel ? null : g.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: sel ? theme.accentDim : theme.surfaceAlt,
                        borderRadius: 8, padding: 10, marginBottom: 6,
                        borderWidth: 1, borderColor: sel ? theme.accent : theme.border,
                      }}
                    >
                      <View
                        style={{
                          width: 18, height: 18, borderRadius: 9,
                          borderWidth: 2, borderColor: sel ? theme.accent : theme.textMuted,
                          backgroundColor: sel ? theme.accent : 'transparent',
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{g.displayName}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                          {g.careerStats.matchesPlayed} matches · {g.careerStats.totalRuns} runs · {g.careerStats.totalWickets} wkts
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <TouchableOpacity
                onPress={handleLink}
                disabled={!selectedGhostId || linking}
                style={{
                  marginTop: 6,
                  backgroundColor: selectedGhostId ? theme.accent : theme.border,
                  borderRadius: 8, paddingVertical: 11, alignItems: 'center',
                  opacity: linking ? 0.6 : 1,
                }}
              >
                {linking ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    {selectedGhostId ? 'Link ghost' : 'Select a ghost to link'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {(isSelf || isAdmin) && player.type === 'registered' ? (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={isSelf ? handleLeave : handleRemove}
            disabled={leavingOrRemoving}
            style={{
              backgroundColor: theme.surfaceAlt,
              borderWidth: 1,
              borderColor: '#dc2626',
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: leavingOrRemoving ? 0.6 : 1,
            }}
          >
            {leavingOrRemoving ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '700' }}>
                {isSelf ? 'Leave club' : 'Remove from club'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {canEdit ? (
        <>
          <Section title="NAME">
            <TouchableOpacity
              onPress={openEditName}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: theme.surface, borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 10,
                borderWidth: 1, borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 15 }}>{player.displayName}</Text>
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Edit</Text>
            </TouchableOpacity>
          </Section>
          <Section title="BATTING HAND">
            <ChipRow options={BATTING_HANDS} selected={player.battingHand} onSelect={(v) => saveAttr({ battingHand: v })} />
          </Section>
          <Section title="BOWLING STYLE">
            <ChipRow options={BOWLING_STYLES} selected={player.bowlingStyle} onSelect={(v) => saveAttr({ bowlingStyle: v })} />
          </Section>
          <Section title="WICKET KEEPING">
            <ChipRow
              options={WICKET_KEEPING_OPTIONS}
              selected={keepingDraft}
              onSelect={(v) => { setKeepingDraft(v); saveAttr({ wicketKeeping: v }); }}
              onDeselect={() => { setKeepingDraft(undefined); saveAttr({ wicketKeeping: null }); }}
            />
          </Section>
          <Section title="STRENGTH OVERRIDE">
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }}>
              Drag bars to set subjective skill levels for AI team balancing. Does not affect recorded stats.
            </Text>
            <View
              style={{
                backgroundColor: theme.surfaceAlt,
                borderRadius: 10,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <StrengthSlider label="Batting" value={strengthDraft.batting} onCommit={(v) => commitStrength('batting', v)} editable />
              <StrengthSlider label="Bowling" value={strengthDraft.bowling} onCommit={(v) => commitStrength('bowling', v)} editable />
              <StrengthSlider label="Fielding" value={strengthDraft.fielding} onCommit={(v) => commitStrength('fielding', v)} editable />
              <StrengthSlider label="Wicket keeping" value={strengthDraft.keeping} onCommit={(v) => commitStrength('keeping', v)} editable />
            </View>
          </Section>
        </>
      ) : (
        <>
          <Section title="PLAYER INFO">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatBox label="Batting" value={BATTING_HANDS.find((h) => h.value === player.battingHand)?.label ?? '—'} />
              <StatBox label="Bowling" value={BOWLING_STYLES.find((s) => s.value === player.bowlingStyle)?.label ?? '—'} />
              <StatBox label="Keeping" value={WICKET_KEEPING_OPTIONS.find((k) => k.value === player.wicketKeeping)?.label ?? '—'} />
            </View>
          </Section>
          {player.strengthOverride && (
            <Section title="STRENGTHS">
              <View
                style={{
                  backgroundColor: theme.surfaceAlt,
                  borderRadius: 10,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                {player.strengthOverride.batting !== undefined && (
                  <StrengthSlider label="Batting" value={player.strengthOverride.batting} />
                )}
                {player.strengthOverride.bowling !== undefined && (
                  <StrengthSlider label="Bowling" value={player.strengthOverride.bowling} />
                )}
                {player.strengthOverride.fielding !== undefined && (
                  <StrengthSlider label="Fielding" value={player.strengthOverride.fielding} />
                )}
                {player.strengthOverride.keeping !== undefined && (
                  <StrengthSlider label="Wicket keeping" value={player.strengthOverride.keeping} />
                )}
              </View>
            </Section>
          )}
        </>
      )}

      {/* Batting */}
      <Section title="BATTING">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatBox label="Runs" value={String(derived.totalRuns)} />
          <StatBox label="Average" value={fmt(derived.battingAverage)} />
          <StatBox label="Strike rate" value={fmt(derived.strikeRate)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <StatBox label="High score" value={String(derived.highScore)} />
          <StatBox label="Matches" value={String(derived.matchesPlayed)} />
        </View>
      </Section>

      {/* Bowling */}
      <Section title="BOWLING">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatBox label="Wickets" value={String(derived.totalWickets)} />
          <StatBox label="Average" value={fmt(derived.bowlingAverage)} />
          <StatBox label="Economy" value={fmt(derived.economy, 2)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <StatBox label="Overs" value={fmt(derived.oversBowled)} />
          <StatBox label="Strike rate" value={fmt(derived.bowlingStrikeRate)} />
        </View>
      </Section>

      {/* Fielding */}
      {(() => {
        const fe = resolved.stats.fieldingEventCounts ?? {};
        const events = Object.entries(fe).filter(([, n]) => n > 0);
        const catches = resolved.stats.totalCatches;
        const runOuts = resolved.stats.totalRunOuts;
        const stumpings = resolved.stats.totalStumpings ?? 0;
        const netPoints = resolved.stats.fieldingPoints ?? 0;
        if (catches === 0 && runOuts === 0 && stumpings === 0 && netPoints === 0 && events.length === 0)
          return null;
        const netColor = netPoints > 0 ? theme.accent : netPoints < 0 ? '#dc2626' : theme.text;
        return (
          <Section title="FIELDING">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatBox label="Catches" value={String(catches)} />
              <StatBox label="Run-outs" value={String(runOuts)} />
              <StatBox label="Stumpings" value={String(stumpings)} />
            </View>
            {netPoints !== 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <StatBox
                  label="Net fielding score"
                  value={netPoints > 0 ? `+${netPoints}` : String(netPoints)}
                  valueColor={netColor}
                />
              </View>
            )}
            {events.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {events.map(([label, n]) => (
                  <View key={label} style={{ flexGrow: 1, minWidth: '30%' }}>
                    <StatBox label={label} value={String(n)} />
                  </View>
                ))}
              </View>
            )}
          </Section>
        );
      })()}

      {/* As captain */}
      {player.captainStats && player.captainStats.matches > 0 && (() => {
        const c = player.captainStats;
        const winPct = c.matches > 0 ? Math.round((c.wins / c.matches) * 100) : 0;
        const avg = c.dismissals > 0 ? c.runs / c.dismissals : null;
        const econ = c.ballsBowled > 0 ? (c.runsConceded / (c.ballsBowled / 6)) : null;
        return (
          <Section title="AS CAPTAIN">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatBox label="Played" value={String(c.matches)} />
              <StatBox label="Won" value={String(c.wins)} />
              <StatBox label="Win %" value={`${winPct}%`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <StatBox label="Lost" value={String(c.losses)} />
              <StatBox label="Tied" value={String(c.ties)} />
              <StatBox label="HS" value={String(c.highScore)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <StatBox label="Runs (capt)" value={String(c.runs)} />
              <StatBox label="Avg (capt)" value={fmt(avg)} />
              <StatBox label="Wkts (capt)" value={String(c.wickets)} />
              <StatBox label="Econ (capt)" value={fmt(econ, 2)} />
            </View>
          </Section>
        );
      })()}

      {/* Form */}
      <Section title="FORM · LAST 5">
        <View
          style={{
            backgroundColor: theme.surfaceAlt,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <FormChart form={form} />
        </View>
      </Section>

      {/* Wagon wheel */}
      <Section title="SHOT DISTRIBUTION">
        <View
          style={{
            backgroundColor: theme.surfaceAlt,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
          }}
        >
          <WagonWheel
            data={insights?.wagonWheel ?? new Array<number>(12).fill(0)}
            batsmanHand={insights?.batsmanHand ?? 'RHB'}
          />
        </View>
      </Section>
    </ScrollView>

    <Modal visible={showRatingInfo} transparent animationType="fade" onRequestClose={() => setShowRatingInfo(false)}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
        activeOpacity={1}
        onPress={() => setShowRatingInfo(false)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 20, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>How Rating is calculated</Text>
              <TouchableOpacity onPress={() => setShowRatingInfo(false)}>
                <Text style={{ color: theme.textMuted, fontSize: 20, lineHeight: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
              The rating is a 0–100 score built from four components:
            </Text>

            {[
              {
                label: 'Batting  (max 50)',
                color: '#3b82f6',
                desc: 'Based on strike rate — how many runs scored per 100 balls. Counts only after 30+ balls faced. SR 175 or above maxes this out.',
              },
              {
                label: 'Bowling  (max 30)',
                color: '#10b981',
                desc: 'Two parts: wicket volume (30 wickets = full base) plus a quality bonus for a low bowling average. Taking wickets cheaply earns more than just taking lots.',
              },
              {
                label: 'Experience  (max 10)',
                color: '#f59e0b',
                desc: 'Grows with matches played, capping at 30 matches. A newer player is rated more cautiously until they have a meaningful sample.',
              },
              {
                label: 'Fielding  (max 10)',
                color: '#a855f7',
                desc: 'Catches, run-outs, and stumpings each contribute. Club-specific fielding events (great stops, drops) can also add or subtract points.',
              },
            ].map(({ label, color, desc }) => (
              <View key={label} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: color, marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{label}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>{desc}</Text>
                </View>
              </View>
            ))}

            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 12, gap: 4 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Typical ranges: </Text>
                Newcomer 25–40 · Club regular 45–65 · Strong player 65–80 · Elite 80+
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    <Modal visible={showEditName} transparent animationType="fade" onRequestClose={() => setShowEditName(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
          activeOpacity={1}
          onPress={() => setShowEditName(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Edit name</Text>
                <TouchableOpacity onPress={() => setShowEditName(false)}>
                  <Text style={{ color: theme.textMuted, fontSize: 20, lineHeight: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                onSubmitEditing={saveName}
                autoFocus
                placeholder="Player name"
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.surfaceAlt, color: theme.text, borderRadius: 8,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                  borderWidth: 1, borderColor: nameError ? '#dc2626' : theme.border,
                }}
              />
              {nameError && (
                <Text style={{ color: '#dc2626', fontSize: 12 }}>Couldn't save. Please try again.</Text>
              )}
              <TouchableOpacity
                onPress={saveName}
                disabled={savingName || !nameDraft.trim()}
                style={{
                  backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
                  opacity: (savingName || !nameDraft.trim()) ? 0.6 : 1,
                }}
              >
                {savingName ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>

    </KeyboardAvoidingView>
  );
}
