import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getClub } from '../../services/clubService';
import { getClubPlayers, getClubMatches } from '../../services/matchService';
import type { MatchDraft } from '../../navigation/RootNavigator';
import { useThemeStore } from '../../store/themeStore';
import type { MatchFormat } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ScheduleMatch'>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function SpinPicker({
  label,
  value,
  onInc,
  onDec,
}: {
  label: string;
  value: string;
  onInc: () => void;
  onDec: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TouchableOpacity onPress={onInc} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: theme.accent, fontSize: 18 }}>▲</Text>
      </TouchableOpacity>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', marginVertical: 6 }}>
        {value}
      </Text>
      <TouchableOpacity onPress={onDec} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: theme.accent, fontSize: 18 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ScheduleMatchScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId } = params;
  const theme = useThemeStore((s) => s.theme);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [venue, setVenue] = useState('');
  const [day, setDay] = useState(tomorrow.getDate());
  const [month, setMonth] = useState(tomorrow.getMonth());
  const [year, setYear] = useState(tomorrow.getFullYear());
  const [format, setFormat] = useState<MatchFormat>('custom');
  const [customOvers, setCustomOvers] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reuseMode, setReuseMode] = useState<'none' | 'squad' | 'teams-edit' | 'teams'>('squad');
  const [prefilled, setPrefilled] = useState(false);

  const { data: club } = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => getClub(clubId),
  });

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ['clubPlayers', clubId],
    queryFn: () => getClubPlayers(clubId),
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches', clubId],
    queryFn: () => getClubMatches(clubId),
  });

  const prevMatch = useMemo(() => {
    return matches
      .filter((m) => (m.squad?.length ?? 0) > 0 && (m.status === 'completed' || m.status === 'live'))
      .sort((a, b) => {
        const dateDiff = b.date.toMillis() - a.date.toMillis();
        if (dateDiff !== 0) return dateDiff;
        // `date` is only a calendar day — back-to-back quick rematches share
        // one, so fall back to creation order to find the true most recent.
        return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
      })[0] ?? null;
  }, [matches]);

  const activePlayerIds = useMemo(() => new Set(players.map(p => p.id)), [players]);

  // Map ghost IDs from old matches to the registered player who absorbed them.
  const ghostToRegistered = useMemo(
    () => new Map(players.flatMap(p => p.linkedGhost ? [[p.linkedGhost.ghostId, p.id]] : [])),
    [players]
  );
  const resolvePlayerId = (id: string) => ghostToRegistered.get(id) ?? id;

  useEffect(() => {
    if (prevMatch && reuseMode !== 'none' && !prefilled && !loadingPlayers) {
      setSelectedIds(new Set((prevMatch.squad ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id))));
      setPrefilled(true);
    }
  }, [prevMatch, reuseMode, prefilled, loadingPlayers, activePlayerIds, ghostToRegistered]);

  const handleSubmit = () => {
    if (!club) return;
    const matchDate = new Date(year, month, day);

    if (reuseMode === 'teams' && prevMatch) {
      // Quick rematch: clone previous match exactly — teams pre-filled, go straight to Toss
      const rules = { ...club.rules, oversPerInnings: prevMatch.rules.oversPerInnings };
      const draft: MatchDraft = {
        homeTeam: prevMatch.homeTeam,
        awayTeam: prevMatch.awayTeam,
        venue: prevMatch.venue ?? '',
        dateMs: matchDate.getTime(),
        format: prevMatch.format ?? 'custom',
        rules,
        squad: Array.from(new Set((prevMatch.squad ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
        teamA: Array.from(new Set((prevMatch.teamA ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
        teamB: Array.from(new Set((prevMatch.teamB ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
        captainA: prevMatch.captainA && activePlayerIds.has(resolvePlayerId(prevMatch.captainA)) ? resolvePlayerId(prevMatch.captainA) : undefined,
        captainB: prevMatch.captainB && activePlayerIds.has(resolvePlayerId(prevMatch.captainB)) ? resolvePlayerId(prevMatch.captainB) : undefined,
      };
      navigation.navigate('Toss', { clubId, matchDraft: draft });
      return;
    }

    const oversPerInnings =
      format === 'T20' ? 20 : format === 'ODI' ? 50 : parseInt(customOvers, 10) || undefined;
    const rules = { ...club.rules, oversPerInnings };
    const carryTeams = reuseMode === 'teams-edit' && !!prevMatch;
    const draft: MatchDraft = {
      homeTeam: homeTeam.trim() || club.name,
      awayTeam: awayTeam.trim() || 'Opponents',
      venue: venue.trim(),
      dateMs: matchDate.getTime(),
      format,
      rules,
      squad: Array.from(selectedIds).filter(id => activePlayerIds.has(id)),
      teamA: carryTeams ? Array.from(new Set((prevMatch!.teamA ?? []).map(resolvePlayerId).filter(id => selectedIds.has(id) && activePlayerIds.has(id)))) : undefined,
      teamB: carryTeams ? Array.from(new Set((prevMatch!.teamB ?? []).map(resolvePlayerId).filter(id => selectedIds.has(id) && activePlayerIds.has(id)))) : undefined,
      captainA: carryTeams && prevMatch!.captainA && selectedIds.has(resolvePlayerId(prevMatch!.captainA)) ? resolvePlayerId(prevMatch!.captainA) : undefined,
      captainB: carryTeams && prevMatch!.captainB && selectedIds.has(resolvePlayerId(prevMatch!.captainB)) ? resolvePlayerId(prevMatch!.captainB) : undefined,
    };
    navigation.navigate('TeamBuilder', { clubId, matchDraft: draft });
  };

  const adjustDay = (delta: number) => {
    const max = daysInMonth(month, year);
    setDay((d) => Math.max(1, Math.min(max, d + delta)));
  };
  const adjustMonth = (delta: number) => {
    const newMonth = (month + 12 + delta) % 12;
    setMonth(newMonth);
    setDay((d) => Math.min(d, daysInMonth(newMonth, year)));
  };
  const adjustYear = (delta: number) => setYear((y) => Math.max(2020, y + delta));

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(players.map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectReuseMode = (mode: 'none' | 'squad' | 'teams-edit' | 'teams') => {
    setReuseMode(mode);
    if (mode === 'none') {
      clearAll();
    } else if (prevMatch) {
      setSelectedIds(new Set((prevMatch.squad ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id))));
    }
  };

  const customOversValid = format !== 'custom' || parseInt(customOvers, 10) >= 1;
  const isQuickRematch = reuseMode === 'teams';
  const canSubmit = isQuickRematch
    ? !!prevMatch && !!club
    : selectedIds.size >= 2 && !!club && customOversValid;

  const inputStyle = {
    backgroundColor: theme.surface,
    color: theme.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.border,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {prevMatch && (
        <>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>PREVIOUS MATCH</Text>
          {([
            { mode: 'none' as const,       title: 'Fresh squad',         desc: 'Select players and build teams from scratch' },
            { mode: 'squad' as const,      title: 'Previous squad',      desc: 'Reuse player selection, build teams in next step' },
            { mode: 'teams-edit' as const, title: 'Same teams (edit)',   desc: 'Carry over teams, open team builder to adjust' },
            { mode: 'teams' as const,      title: 'Quick rematch',       desc: 'Same setup as last match — only pick the date' },
          ]).map(({ mode, title, desc }) => {
            const active = reuseMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => selectReuseMode(mode)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
                  backgroundColor: theme.surface, borderRadius: 8, padding: 12,
                  borderWidth: 1, borderColor: active ? theme.accent : theme.border,
                }}
              >
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  borderWidth: 2, borderColor: active ? theme.accent : theme.textMuted,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>{desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 8 }} />
        </>
      )}

      {!isQuickRematch && (
        <>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>HOME TEAM</Text>
          <TextInput
            value={homeTeam}
            onChangeText={setHomeTeam}
            placeholder={club?.name ?? 'Home team name'}
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />

          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>AWAY TEAM</Text>
          <TextInput
            value={awayTeam}
            onChangeText={setAwayTeam}
            placeholder="Opponents"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />

          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>VENUE</Text>
          <TextInput
            value={venue}
            onChangeText={setVenue}
            placeholder="Ground name"
            placeholderTextColor={theme.textMuted}
            style={{ ...inputStyle, marginBottom: 20 }}
          />
        </>
      )}

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>DATE</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        <SpinPicker label="Day" value={String(day)} onInc={() => adjustDay(1)} onDec={() => adjustDay(-1)} />
        <SpinPicker label="Month" value={MONTHS[month]} onInc={() => adjustMonth(1)} onDec={() => adjustMonth(-1)} />
        <SpinPicker label="Year" value={String(year)} onInc={() => adjustYear(1)} onDec={() => adjustYear(-1)} />
      </View>

      {!isQuickRematch && (
        <>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>FORMAT</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: format === 'custom' ? 8 : 20 }}>
            {(['T20', 'ODI', 'custom'] as MatchFormat[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFormat(f)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: format === f ? theme.accent : theme.surface,
                  borderWidth: 1,
                  borderColor: format === f ? theme.accent : theme.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: format === f ? '#ffffff' : theme.text, fontWeight: '600', fontSize: 14 }}>
                  {f === 'custom' ? 'Custom' : f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {format === 'custom' && (
            <>
              <TextInput
                value={customOvers}
                onChangeText={setCustomOvers}
                placeholder="Overs per innings (required)"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                style={{
                  ...inputStyle,
                  marginBottom: customOversValid ? 20 : 4,
                  borderColor: customOversValid ? theme.border : '#dc2626',
                }}
              />
              {!customOversValid && (
                <Text style={{ color: '#dc2626', fontSize: 12, marginBottom: 20 }}>
                  Enter the number of overs per innings
                </Text>
              )}
            </>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              SQUAD ({selectedIds.size} of {players.length} selected)
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={selectAll}>
                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll}>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>None</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loadingPlayers ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
          ) : players.length === 0 ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginVertical: 16 }}>
              No players in club yet
            </Text>
          ) : (
            players.map((player) => {
              const selected = selectedIds.has(player.id);
              return (
                <TouchableOpacity
                  key={player.id}
                  onPress={() => togglePlayer(player.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: selected ? theme.accentDim : theme.surface,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: selected ? theme.accent : theme.border,
                  }}
                >
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 4,
                      backgroundColor: selected ? theme.accent : 'transparent',
                      borderWidth: 2,
                      borderColor: selected ? theme.accent : theme.textMuted,
                      marginRight: 12,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected && (
                      <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>✓</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 15 }}>{player.displayName}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, textTransform: 'capitalize' }}>
                      {player.type}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={{
          backgroundColor: canSubmit ? theme.accent : theme.surface,
          borderRadius: 10,
          padding: 16,
          alignItems: 'center',
          marginTop: 12,
          marginBottom: 40,
          borderWidth: canSubmit ? 0 : 1,
          borderColor: theme.border,
        }}
      >
        <Text style={{ color: canSubmit ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>
          {reuseMode === 'teams' ? 'Quick Rematch' : 'Build Teams'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
