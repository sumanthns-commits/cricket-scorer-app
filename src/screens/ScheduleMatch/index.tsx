import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getClub } from '../../services/clubService';
import { getClubPlayers, getClubMatches, createMatch } from '../../services/matchService';
import type { MatchDraft } from '../../navigation/RootNavigator';
import { useThemeStore } from '../../store/themeStore';
import { useKeyboardScrollIntoView } from '../../hooks/useKeyboardScrollIntoView';
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
  const insets = useSafeAreaInsets();
  const { scrollRef, kbHeight, handleInputFocus, onScroll } = useKeyboardScrollIntoView();

  const today = new Date();

  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [venue, setVenue] = useState('');
  const [day, setDay] = useState(today.getDate());
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  // Overs per innings, as typed. Source of truth for the limit in every mode
  // (incl. Quick rematch); `format` is purely derived from it below, so the
  // two can never disagree (e.g. 'custom' saved alongside 20 overs).
  const [overs, setOvers] = useState('');
  const [oversTouched, setOversTouched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reuseMode, setReuseMode] = useState<'none' | 'squad' | 'teams-edit' | 'teams'>('squad');
  const [prefilled, setPrefilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async () => {
    if (!club) return;
    const matchDate = new Date(year, month, day);

    if (reuseMode === 'teams' && prevMatch) {
      // Quick rematch: clone previous match exactly — teams pre-filled, create
      // as scheduled immediately (same as the TeamBuilder path) and go to Toss.
      const rules = { ...club.rules, oversPerInnings: parseInt(overs, 10) };
      setSubmitting(true);
      try {
        const newMatchId = await createMatch({
          clubId,
          homeTeam: prevMatch.homeTeam,
          awayTeam: prevMatch.awayTeam,
          venue: prevMatch.venue ?? '',
          date: matchDate,
          format,
          rules,
          squad: Array.from(new Set((prevMatch.squad ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
          teamA: Array.from(new Set((prevMatch.teamA ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
          teamB: Array.from(new Set((prevMatch.teamB ?? []).map(resolvePlayerId).filter(id => activePlayerIds.has(id)))),
          captainA: prevMatch.captainA && activePlayerIds.has(resolvePlayerId(prevMatch.captainA)) ? resolvePlayerId(prevMatch.captainA) : undefined,
          captainB: prevMatch.captainB && activePlayerIds.has(resolvePlayerId(prevMatch.captainB)) ? resolvePlayerId(prevMatch.captainB) : undefined,
        });
        navigation.navigate('Toss', { clubId, matchId: newMatchId });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const rules = { ...club.rules, oversPerInnings: parseInt(overs, 10) };
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

  const oversValid = parseInt(overs, 10) >= 1;
  const isQuickRematch = reuseMode === 'teams';
  const canSubmit = (isQuickRematch
    ? !!prevMatch && !!club && oversValid
    : selectedIds.size >= 2 && !!club && oversValid) && !submitting;

  const formatForOvers = (n: number): MatchFormat => (n === 20 ? 'T20' : n === 50 ? 'ODI' : 'custom');
  const format = formatForOvers(parseInt(overs, 10));

  // Prefill from the previous match (Quick rematch / reuse), else the club's
  // default — until the user edits the field. Re-runs as the club/matches
  // queries resolve, so whichever arrives last still wins while untouched.
  useEffect(() => {
    if (oversTouched) return;
    const initial = prevMatch?.rules.oversPerInnings ?? club?.rules.oversPerInnings;
    if (initial == null) return;
    setOvers(String(initial));
  }, [prevMatch, club, oversTouched]);

  const handleOversChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setOversTouched(true);
    setOvers(digits);
  };

  const handleFormatPress = (f: MatchFormat) => {
    if (f === format) return;
    setOversTouched(true);
    // T20/ODI fill the field; Custom clears a preset value so a different
    // number can be typed (a non-preset value is already "custom").
    setOvers(f === 'T20' ? '20' : f === 'ODI' ? '50' : '');
  };

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
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + kbHeight }}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={onScroll}
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
            onFocus={handleInputFocus}
            placeholder={club?.name ?? 'Home team name'}
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />

          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>AWAY TEAM</Text>
          <TextInput
            value={awayTeam}
            onChangeText={setAwayTeam}
            onFocus={handleInputFocus}
            placeholder="Opponents"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />

          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>VENUE</Text>
          <TextInput
            value={venue}
            onChangeText={setVenue}
            onFocus={handleInputFocus}
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
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['T20', 'ODI', 'custom'] as MatchFormat[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => handleFormatPress(f)}
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
        </>
      )}

      {/* Shown in every mode, Quick rematch included — prefilled from the
          previous match / club default, editable before scheduling. */}
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>OVERS PER INNINGS</Text>
      <TextInput
        value={overs}
        onChangeText={handleOversChange}
        onFocus={handleInputFocus}
        placeholder="e.g. 6 (required)"
        placeholderTextColor={theme.textMuted}
        keyboardType="numeric"
        maxLength={3}
        style={{
          ...inputStyle,
          marginBottom: oversValid ? 20 : 4,
          borderColor: oversValid ? theme.border : '#dc2626',
        }}
      />
      {!oversValid && (
        <Text style={{ color: '#dc2626', fontSize: 12, marginBottom: 20 }}>
          Enter the number of overs per innings
        </Text>
      )}

      {!isQuickRematch && (
        <>
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
          marginBottom: 40 + insets.bottom,
          borderWidth: canSubmit ? 0 : 1,
          borderColor: theme.border,
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={{ color: canSubmit ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>
            {reuseMode === 'teams' ? 'Quick Rematch' : 'Build Teams'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
