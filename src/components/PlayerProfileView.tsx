import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { resolvePlayerStats } from '../services/statsResolver';
import {
  computeDerivedStats,
  computeSkillRating,
  getActiveClaim,
  getBattingInsights,
  getPlayer,
  getPlayerForm,
} from '../services/playerProfileService';
import PlayerAvatar from './PlayerAvatar';
import FormChart from './FormChart';
import WagonWheel from './WagonWheel';
import type { PlayerType } from '../types';

const TYPE_BADGE: Record<PlayerType, { label: string; color: string }> = {
  ghost: { label: 'GHOST', color: '#a78bfa' },
  registered: { label: 'REGISTERED', color: '#4ade80' },
  linked: { label: 'LINKED', color: '#60a5fa' },
};

function fmt(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function StatBox({ label, value }: { label: string; value: string }) {
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
      <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>{value}</Text>
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
}: {
  clubId: string;
  playerId: string;
}) {
  const { data: player, isLoading: loadingPlayer } = useQuery({
    queryKey: ['player', clubId, playerId],
    queryFn: () => getPlayer(clubId, playerId),
  });

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
  const badge = TYPE_BADGE[player.type];
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
