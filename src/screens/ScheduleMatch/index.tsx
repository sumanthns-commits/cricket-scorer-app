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
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getClub } from '../../services/clubService';
import { getClubPlayers, createMatch, getClubMatches } from '../../services/matchService';
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
  const [reusePrev, setReusePrev] = useState(true);
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
      .filter((m) => (m.squad?.length ?? 0) > 0)
      .sort((a, b) => b.date.toMillis() - a.date.toMillis())[0] ?? null;
  }, [matches]);

  useEffect(() => {
    if (prevMatch && reusePrev && !prefilled) {
      setSelectedIds(new Set(prevMatch.squad));
      setPrefilled(true);
    }
  }, [prevMatch, reusePrev, prefilled]);

  const { mutate: submit, isPending, error } = useMutation({
    mutationFn: async () => {
      if (!club) throw new Error('Club data not loaded');
      const matchDate = new Date(year, month, day);
      const oversPerInnings =
        format === 'T20' ? 20 : format === 'ODI' ? 50 : parseInt(customOvers, 10) || undefined;
      const rules = { ...club.rules, oversPerInnings };
      const carryTeams = reusePrev && prevMatch;
      const prevCaptainA = carryTeams && prevMatch.captainA && selectedIds.has(prevMatch.captainA) ? prevMatch.captainA : undefined;
      const prevCaptainB = carryTeams && prevMatch.captainB && selectedIds.has(prevMatch.captainB) ? prevMatch.captainB : undefined;
      return createMatch({
        clubId,
        homeTeam: homeTeam.trim() || club.name,
        awayTeam: awayTeam.trim() || 'Opponents',
        venue: venue.trim(),
        date: matchDate,
        format,
        rules,
        squad: Array.from(selectedIds),
        teamA: carryTeams ? (prevMatch.teamA ?? []).filter((id) => selectedIds.has(id)) : undefined,
        teamB: carryTeams ? (prevMatch.teamB ?? []).filter((id) => selectedIds.has(id)) : undefined,
        captainA: prevCaptainA,
        captainB: prevCaptainB,
      });
    },
    onSuccess: (matchId) => {
      navigation.navigate('TeamBuilder', { clubId, matchId });
    },
  });

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

  const toggleReuse = () => {
    if (reusePrev) {
      setReusePrev(false);
      clearAll();
    } else {
      setReusePrev(true);
      if (prevMatch) setSelectedIds(new Set(prevMatch.squad));
    }
  };

  const customOversValid = format !== 'custom' || parseInt(customOvers, 10) >= 1;
  const canSubmit = selectedIds.size >= 2 && !isPending && !!club && customOversValid;

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

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>DATE</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        <SpinPicker label="Day" value={String(day)} onInc={() => adjustDay(1)} onDec={() => adjustDay(-1)} />
        <SpinPicker label="Month" value={MONTHS[month]} onInc={() => adjustMonth(1)} onDec={() => adjustMonth(-1)} />
        <SpinPicker label="Year" value={String(year)} onInc={() => adjustYear(1)} onDec={() => adjustYear(-1)} />
      </View>

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

      {prevMatch && (
        <TouchableOpacity
          onPress={toggleReuse}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
            backgroundColor: theme.surface, borderRadius: 8, padding: 12,
            borderWidth: 1, borderColor: reusePrev ? theme.accent : theme.border,
          }}
        >
          <View style={{
            width: 20, height: 20, borderRadius: 4,
            backgroundColor: reusePrev ? theme.accent : 'transparent',
            borderWidth: 2, borderColor: reusePrev ? theme.accent : theme.textMuted,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {reusePrev && <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>Reuse previous squad &amp; teams</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {reusePrev ? 'Teams carried over — adjust or rebuild in the next step' : 'Building a fresh squad'}
            </Text>
          </View>
        </TouchableOpacity>
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

      {error instanceof Error && (
        <Text style={{ color: '#dc2626', textAlign: 'center', marginTop: 8 }}>{error.message}</Text>
      )}

      <TouchableOpacity
        onPress={() => submit()}
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
        {isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={{ color: canSubmit ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>
            Create &amp; Build Teams
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
