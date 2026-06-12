import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import Slider from '@react-native-community/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolvePlayerStats } from '../services/statsResolver';
import { unlinkGhost } from '../services/joinRequestService';
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
import type { BattingHand, BowlingStyle, PlayerType, StrengthOverride, WicketKeepingAbility } from '../types';

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
}: {
  options: { value: T; label: string }[];
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = selected === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onSelect(o.value)}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              backgroundColor: active ? '#4ade80' : '#1e2d45',
              borderWidth: 1, borderColor: active ? '#4ade80' : '#2d3f58',
            }}
          >
            <Text style={{ color: active ? '#0a1628' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const TYPE_BADGE: Record<PlayerType, { label: string; color: string }> = {
  ghost: { label: 'GHOST', color: '#a78bfa' },
  registered: { label: 'REGISTERED', color: '#4ade80' },
  linked: { label: 'LINKED', color: '#60a5fa' },
};

function fmt(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function StatBox({
  label,
  value,
  valueColor = '#ffffff',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e2d45',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#2d3f58',
      }}
    >
      <Text style={{ color: valueColor, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
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
  const [displayValue, setDisplayValue] = useState(value);
  useEffect(() => { setDisplayValue(value); }, [value]);

  const barColor = displayValue >= 70 ? '#4ade80' : displayValue >= 40 ? '#facc15' : '#f87171';

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: barColor, fontSize: 13, fontWeight: '700' }}>{displayValue}</Text>
      </View>
      {editable ? (
        <Slider
          value={value}
          minimumValue={0}
          maximumValue={100}
          step={1}
          minimumTrackTintColor="#4ade80"
          maximumTrackTintColor="#1e2d45"
          thumbTintColor="#4ade80"
          onValueChange={(v: number) => setDisplayValue(Math.round(v))}
          onSlidingComplete={(v: number) => onCommit?.(Math.round(v))}
          style={{ height: 36, marginHorizontal: -6 }}
        />
      ) : (
        <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
          <View style={{ flex: displayValue, backgroundColor: barColor }} />
          <View style={{ flex: 100 - displayValue, backgroundColor: '#1e2d45' }} />
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
        backgroundColor: '#2d1f0a',
        borderRadius: 10,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#b45309',
      }}
    >
      <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: '700' }}>Provisional stats</Text>
      <Text style={{ color: '#fcd34d', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
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
  const queryClient = useQueryClient();
  const [unlinking, setUnlinking] = useState(false);
  const handleUnlink = () => {
    setUnlinking(true);
    unlinkGhost(clubId, playerId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }),
          queryClient.invalidateQueries({ queryKey: ['resolvedStats', clubId, playerId] }),
        ])
      )
      .catch((e) => console.error('unlinkGhost failed', e))
      .finally(() => setUnlinking(false));
  };
  const { data: player, isLoading: loadingPlayer } = useQuery({
    queryKey: ['player', clubId, playerId],
    queryFn: () => getPlayer(clubId, playerId),
  });

  const saveAttr = (attrs: { displayName?: string; battingHand?: BattingHand; bowlingStyle?: BowlingStyle; wicketKeeping?: WicketKeepingAbility }) => {
    updatePlayerAttributes(clubId, playerId, attrs)
      .then(() => queryClient.invalidateQueries({ queryKey: ['player', clubId, playerId] }))
      .catch(() => {/* keep last value on failure */});
  };

  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => { if (player) setNameDraft(player.displayName); }, [player?.displayName]);
  const saveName = () => {
    const next = nameDraft.trim();
    if (next && next !== player?.displayName) saveAttr({ displayName: next });
  };

  const [keepingDraft, setKeepingDraft] = useState<WicketKeepingAbility | undefined>(undefined);
  useEffect(() => { setKeepingDraft(player?.wicketKeeping); }, [player?.wicketKeeping]);

  const defaultStrength: StrengthDraft = { batting: 50, fielding: 50, bowling: 50, keeping: 50 };
  const [strengthDraft, setStrengthDraft] = useState<StrengthDraft>(defaultStrength);
  // Ref so saveStrength always reads the latest value even when called in the same
  // event loop tick as the last setStrengthDraft (onResponderRelease fires before
  // the deferred state update flushes).
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
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  if (!player || !resolved) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#9ca3af', fontSize: 16 }}>Player not found</Text>
      </View>
    );
  }

  const derived = computeDerivedStats(resolved.stats);
  const badge = TYPE_BADGE[player.type] ?? TYPE_BADGE.registered;
  const rating = player.skillRating ?? computeSkillRating(resolved.stats);
  const showProvisional = !!player.activeClaim && claim?.status === 'cooldown';
  const mergeAtMs = claim?.mergeScheduledAt ? claim.mergeScheduledAt.toMillis() : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0a1628' }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PlayerAvatar name={player.displayName} photoURL={player.photoURL} seed={player.id} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800' }}>{player.displayName}</Text>
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
            <Text style={{ color: '#9ca3af', fontSize: 12 }}>Rating {rating}</Text>
          </View>
        </View>
      </View>

      {showProvisional && <CooldownBanner mergeAtMs={mergeAtMs} />}

      {isAdmin && player.linkedGhost ? (
        <View
          style={{
            backgroundColor: '#0e2436',
            borderRadius: 10,
            padding: 12,
            marginTop: 16,
            borderWidth: 1,
            borderColor: '#2d3f58',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: '#9ca3af', fontSize: 12, flex: 1 }}>
            Linked from ghost <Text style={{ color: '#ffffff', fontWeight: '700' }}>{player.linkedGhost.displayName}</Text>. Its stats are merged in.
          </Text>
          <TouchableOpacity
            onPress={handleUnlink}
            disabled={unlinking}
            style={{
              backgroundColor: '#1e2d45',
              borderWidth: 1,
              borderColor: '#7f1d1d',
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 12,
              opacity: unlinking ? 0.6 : 1,
            }}
          >
            {unlinking ? (
              <ActivityIndicator color="#fca5a5" />
            ) : (
              <Text style={{ color: '#fca5a5', fontSize: 13, fontWeight: '700' }}>Unlink</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Player info — editable for admins (any player) or for your own profile */}
      {canEdit ? (
        <>
          <Section title="NAME">
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={saveName}
              onSubmitEditing={saveName}
              placeholder="Player name"
              placeholderTextColor="#4b5563"
              style={{
                backgroundColor: '#1e2d45', color: '#ffffff', borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                borderWidth: 1, borderColor: '#2d3f58',
              }}
            />
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
            />
          </Section>
          <Section title="STRENGTH OVERRIDE">
            <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
              Drag bars to set subjective skill levels for AI team balancing. Does not affect recorded stats.
            </Text>
            <View
              style={{
                backgroundColor: '#0d1d35',
                borderRadius: 10,
                padding: 14,
                borderWidth: 1,
                borderColor: '#2d3f58',
              }}
            >
              <StrengthSlider
                label="Batting"
                value={strengthDraft.batting}
                onCommit={(v) => commitStrength('batting', v)}
                editable
              />
              <StrengthSlider
                label="Bowling"
                value={strengthDraft.bowling}
                onCommit={(v) => commitStrength('bowling', v)}
                editable
              />
              <StrengthSlider
                label="Fielding"
                value={strengthDraft.fielding}
                onCommit={(v) => commitStrength('fielding', v)}
                editable
              />
              <StrengthSlider
                label="Wicket keeping"
                value={strengthDraft.keeping}
                onCommit={(v) => commitStrength('keeping', v)}
                editable
              />
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
                  backgroundColor: '#0d1d35',
                  borderRadius: 10,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#2d3f58',
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
        if (
          catches === 0 &&
          runOuts === 0 &&
          stumpings === 0 &&
          netPoints === 0 &&
          events.length === 0
        )
          return null;
        const netColor = netPoints > 0 ? '#4ade80' : netPoints < 0 ? '#ef4444' : '#ffffff';
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
            backgroundColor: '#0d1d35',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: '#2d3f58',
          }}
        >
          <FormChart form={form} />
        </View>
      </Section>

      {/* Wagon wheel */}
      <Section title="SHOT DISTRIBUTION">
        <View
          style={{
            backgroundColor: '#0d1d35',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: '#2d3f58',
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
  );
}
