import { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { getMatch, getClubPlayers, setMatchTeams, getRecentCaptainIds, createMatch } from '../../services/matchService';
import { askCricketAssistant } from '../../ai/cricketAssistant';
import { TEAM_ASSIGNMENT_PROMPT, TEAM_RATIONALE_PROMPT } from '../../constants/teamSelectionPrompt';
import { callCallableFunction } from '../../services/functionsClient';
import { useThemeStore } from '../../store/themeStore';
import type { TeamSelectionResult } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TeamBuilder'>;

function parseTeamSelection(text: string): TeamSelectionResult | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    // New per-player format: { players: [{ id, team }], captainA, captainB, rationale, keyDecisions }
    if (Array.isArray(parsed.players)) {
      const rows = parsed.players as Array<{ id: string; team: string }>;
      const team_a = rows.filter((r) => r.team === 'A').map((r) => r.id);
      const team_b = rows.filter((r) => r.team === 'B').map((r) => r.id);
      if (team_a.length === 0 || team_b.length === 0) return null;
      return {
        team_a, team_b,
        captain_a: typeof parsed.captainA === 'string' ? parsed.captainA : undefined,
        captain_b: typeof parsed.captainB === 'string' ? parsed.captainB : undefined,
        rationale: (parsed.rationale as string) ?? '',
        keyDecisions: (parsed.keyDecisions as string[]) ?? [],
      };
    }

    // Legacy fallback: { team_a, team_b, rationale, keyDecisions }
    if (!Array.isArray(parsed.team_a) || !Array.isArray(parsed.team_b)) return null;
    return { team_a: parsed.team_a as string[], team_b: parsed.team_b as string[], rationale: (parsed.rationale as string) ?? '', keyDecisions: (parsed.keyDecisions as string[]) ?? [] };
  } catch { return null; }
}

function PlayerRow({ name, badge, shared, isCaptain, onSetCaptain, onMoveA, onMoveB, onRemove }: {
  name: string; badge: 'A' | 'B' | null; shared?: boolean; isCaptain?: boolean;
  onSetCaptain?: () => void; onMoveA: () => void; onMoveB: () => void; onRemove?: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: badge === 'A' ? '#60a5fa' : badge === 'B' ? '#f97316' : theme.border }}>
      {badge ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: badge === 'A' ? '#60a5fa' : '#f97316', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{badge}</Text>
        </View>
      ) : (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.border, marginRight: 10 }} />
      )}
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, flex: 1 }}>{name}</Text>
      {shared && (
        <View style={{ backgroundColor: theme.id === 'light' ? '#fef9c3' : '#3b2f0a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginRight: 6, borderWidth: 1, borderColor: '#fbbf24' }}>
          <Text style={{ color: '#d97706', fontSize: 9, fontWeight: '700' }}>SH</Text>
        </View>
      )}
      {onSetCaptain && (
        <TouchableOpacity
          onPress={onSetCaptain}
          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: isCaptain ? (theme.id === 'light' ? '#fef9c3' : '#3b2f0a') : theme.surfaceAlt, borderWidth: 1, borderColor: isCaptain ? '#fbbf24' : theme.border, marginRight: 6 }}
        >
          <Text style={{ color: isCaptain ? '#d97706' : theme.textMuted, fontSize: 12, fontWeight: '700' }}>C</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onMoveA} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: badge === 'A' ? '#dbeafe' : theme.surfaceAlt, marginRight: 6 }}>
        <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '700' }}>A</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onMoveB} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: badge === 'B' ? '#ffedd5' : theme.surfaceAlt }}>
        <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }}>B</Text>
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 6 }}>
          <Text style={{ color: theme.textMuted, fontSize: 16, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TeamBuilderScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, matchId, returnTo, matchDraft } = params;
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();

  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [captainA, setCaptainA] = useState<string | null>(null);
  const [captainB, setCaptainB] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [rationale, setRationale] = useState('');
  const [keyDecisions, setKeyDecisions] = useState<string[]>([]);
  const [showRationale, setShowRationale] = useState(false);

  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ['match', clubId, matchId],
    queryFn: () => getMatch(clubId, matchId!),
    enabled: !!matchId,
  });
  const { data: players = [], isLoading: loadingPlayers } = useQuery({ queryKey: ['clubPlayers', clubId], queryFn: () => getClubPlayers(clubId) });

  // Existing match: pre-fill teams from Firestore
  useEffect(() => {
    if (match?.teamA?.length) setTeamA(match.teamA);
    if (match?.teamB?.length) setTeamB(match.teamB);
    if (match?.captainA) setCaptainA(match.captainA);
    if (match?.captainB) setCaptainB(match.captainB);
  }, [match]);

  // Draft mode: pre-fill teams from matchDraft (carried from previous reuse mode)
  useEffect(() => {
    if (!matchDraft) return;
    if (matchDraft.teamA?.length) setTeamA(matchDraft.teamA);
    if (matchDraft.teamB?.length) setTeamB(matchDraft.teamB);
    if (matchDraft.captainA) setCaptainA(matchDraft.captainA);
    if (matchDraft.captainB) setCaptainB(matchDraft.captainB);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loadingPlayers || !match) return;
    const validIds = new Set(players.map(p => p.id));
    setCaptainA((prev) => prev && !validIds.has(prev) ? null : prev);
    setCaptainB((prev) => prev && !validIds.has(prev) ? null : prev);
  }, [loadingPlayers, players, match]);

  const playerMap = useMemo(() => { const m = new Map<string, string>(); for (const p of players) m.set(p.id, p.displayName); return m; }, [players]);

  const squad = matchDraft ? matchDraft.squad : (match?.squad ?? []);
  const unassigned = squad.filter((id) => !teamA.includes(id) && !teamB.includes(id));
  const allowShared = squad.length % 2 === 1;

  const moveToA = (id: string) => { setTeamA((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); if (!allowShared) setTeamB((p) => p.filter((x) => x !== id)); };
  const moveToB = (id: string) => { setTeamB((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); if (!allowShared) setTeamA((p) => p.filter((x) => x !== id)); };
  const unassign = (id: string) => { setTeamA((p) => p.filter((x) => x !== id)); setTeamB((p) => p.filter((x) => x !== id)); };
  const toggleCaptainA = (id: string) => setCaptainA((c) => c === id ? null : id);
  const toggleCaptainB = (id: string) => setCaptainB((c) => c === id ? null : id);

  useEffect(() => { if (captainA && !teamA.includes(captainA)) setCaptainA(null); }, [teamA, captainA]);
  useEffect(() => { if (captainB && !teamB.includes(captainB)) setCaptainB(null); }, [teamB, captainB]);

  const runAI = async () => {
    setAiThinking(true); setAiError(''); setRationale(''); setKeyDecisions([]);
    try {
      // Pre-fetch squad stats — avoids a Gemini tool-call round trip.
      // In draft mode (no matchId) fetch all club players and filter by squad client-side.
      const [allStats, recentCaptainIds] = await Promise.all([
        callCallableFunction('get_club_player_stats', matchId ? { matchId, clubId } : { clubId }) as Promise<Array<Record<string, unknown>>>,
        getRecentCaptainIds(clubId),
      ]);
      const squadSet = new Set(squad);
      const rawStats: Array<Record<string, unknown>> = (matchId ? allStats : allStats.filter(p => squadSet.has(p.id as string)))
        .map((p) => ({ ...p, recentlyCaptained: recentCaptainIds.has(p.id as string) }));

      // Short keys (p1, p2, …) prevent the model from confusing long Firebase IDs
      const keyToId: Record<string, string> = {};
      const statsWithKeys: Array<Record<string, unknown>> = rawStats.map((p, i) => {
        const key = `p${i + 1}`;
        keyToId[key] = p.id as string;
        return { ...p, id: key };
      });
      const mapIds = (keys: string[]) => keys.map((k) => keyToId[k] ?? k);
      const mapId = (k?: string) => (k ? keyToId[k] ?? k : undefined);

      // ── Pass 1: team assignments + captains ──────────────────────────
      const assignMsg = `Squad data:\n${JSON.stringify(statsWithKeys)}\n\nAssign each player to Team A or Team B, and pick a captain for each team.`;
      const { text: assignText } = await askCricketAssistant(assignMsg, clubId, TEAM_ASSIGNMENT_PROMPT, { noTools: true, thinkingBudget: 0 });
      const parsedRaw = parseTeamSelection(assignText);
      if (!parsedRaw) throw new Error('Could not parse team selection from AI response');

      const team_a = mapIds(parsedRaw.team_a);
      const team_b = mapIds(parsedRaw.team_b);
      setTeamA(team_a); setTeamB(team_b);

      // Captain must belong to its own team — fall back to that team's first
      // player if the model returned something invalid or omitted it.
      const aiCaptainA = mapId(parsedRaw.captain_a);
      const aiCaptainB = mapId(parsedRaw.captain_b);
      setCaptainA((aiCaptainA && team_a.includes(aiCaptainA)) ? aiCaptainA : (team_a[0] ?? null));
      setCaptainB((aiCaptainB && team_b.includes(aiCaptainB)) ? aiCaptainB : (team_b[0] ?? null));

      // ── Pass 2: rationale from actual assignments (async, non-blocking) ─
      const nameFor = (id: string) => (rawStats.find((s) => s.id === id)?.displayName as string | undefined) ?? id;
      const teamAList = team_a.map(nameFor).join(', ');
      const teamBList = team_b.map(nameFor).join(', ');
      const rationaleMsg = `Team A: ${teamAList}\nTeam B: ${teamBList}\n\nPlayer data:\n${JSON.stringify(statsWithKeys)}`;
      const { text: rationaleText } = await askCricketAssistant(rationaleMsg, clubId, TEAM_RATIONALE_PROMPT, { noTools: true, thinkingBudget: 0 });

      // Parse the rationale JSON
      const rm = rationaleText.match(/\{[\s\S]*\}/);
      if (rm) {
        try {
          const rp = JSON.parse(rm[0]) as { rationale?: string; keyDecisions?: string[] };
          setRationale(rp.rationale ?? '');
          setKeyDecisions(rp.keyDecisions ?? []);
        } catch { setRationale(rationaleText); }
      } else {
        setRationale(rationaleText);
      }
    } catch (e) {
      console.error('[AI full error]', JSON.stringify(e, Object.getOwnPropertyNames(e as object)));
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      if (lower.includes('429') || lower.includes('quota') || lower.includes('rate') || lower.includes('resource_exhausted')) {
        setAiError('Too many requests — please wait a moment and try again.');
      } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused')) {
        setAiError('Network error — check your connection and try again.');
      } else if (lower.includes('403') || lower.includes('401') || lower.includes('permission') || lower.includes('api key') || lower.includes('unauthenticated')) {
        setAiError('AI is not available — Vertex AI API may not be enabled in the Firebase project.');
      } else if (lower.includes('could not parse')) {
        setAiError('AI responded but could not produce a valid team split. Try again.');
      } else {
        setAiError(`AI selection failed: ${msg}`);
      }
    }
    finally { setAiThinking(false); }
  };

  const { mutate: confirm, isPending: isSavingTeams } = useMutation({
    mutationFn: () => {
      const captainAName = captainA ? playerMap.get(captainA) : undefined;
      const captainBName = captainB ? playerMap.get(captainB) : undefined;
      return setMatchTeams({
        clubId, matchId: matchId!, teamA, teamB,
        captainA: captainA ?? undefined,
        captainB: captainB ?? undefined,
        homeTeam: captainAName ? `Team ${captainAName}` : undefined,
        awayTeam: captainBName ? `Team ${captainBName}` : undefined,
      });
    },
    onSuccess: () => {
      if (returnTo === 'LiveScoring') {
        navigation.replace('LiveScoring', { clubId, matchId: matchId! });
      } else {
        navigation.navigate('Toss', { clubId, matchId: matchId! });
      }
    },
  });

  // Draft mode: creates the match doc (status:'scheduled') now that teams are
  // set, instead of deferring creation to Toss — so the scorer can back out to
  // Matches and see/delete/re-edit this match before the toss is confirmed.
  const { mutate: createAndProceed, isPending: isCreatingMatch } = useMutation({
    mutationFn: () => {
      const captainAName = captainA ? playerMap.get(captainA) : undefined;
      const captainBName = captainB ? playerMap.get(captainB) : undefined;
      return createMatch({
        clubId,
        homeTeam: captainAName ? `Team ${captainAName}` : matchDraft!.homeTeam,
        awayTeam: captainBName ? `Team ${captainBName}` : matchDraft!.awayTeam,
        venue: matchDraft!.venue,
        date: new Date(matchDraft!.dateMs),
        format: matchDraft!.format,
        rules: matchDraft!.rules,
        squad: matchDraft!.squad,
        teamA, teamB,
        captainA: captainA ?? undefined,
        captainB: captainB ?? undefined,
      });
    },
    onSuccess: (newMatchId) => navigation.navigate('Toss', { clubId, matchId: newMatchId }),
  });

  const isSaving = isSavingTeams || isCreatingMatch;

  const handleConfirm = () => {
    if (matchDraft) createAndProceed();
    else confirm();
  };

  const canConfirm = teamA.length > 0 && teamB.length > 0 && !!captainA && !!captainB && !isSaving;

  if ((loadingMatch && !!matchId) || loadingPlayers) {
    return <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{match?.homeTeam ?? 'Home'} vs {match?.awayTeam ?? 'Away'}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{squad.length} players · {teamA.length}A / {teamB.length}B / {unassigned.length} unassigned</Text>
          {allowShared && <Text style={{ color: '#d97706', fontSize: 11, marginTop: 2 }}>Odd squad — tap A and B on one player to share them across both teams</Text>}
          {(!captainA || !captainB) && (teamA.length > 0 || teamB.length > 0) && (
            <Text style={{ color: '#d97706', fontSize: 11, marginTop: 2 }}>
              {!captainA && !captainB ? 'Set a captain for both teams to confirm' : !captainA ? 'Set a captain for Team A to confirm' : 'Set a captain for Team B to confirm'}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {rationale !== '' && (
            <TouchableOpacity onPress={() => setShowRationale(true)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700' }}>i</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={runAI} disabled={aiThinking} style={{ backgroundColor: aiThinking ? theme.surface : '#7c3aed', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {aiThinking ? <ActivityIndicator size="small" color="#a78bfa" /> : <Text style={{ color: '#a78bfa', fontSize: 14, fontWeight: '700' }}>AI Balance</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {aiError !== '' && (
        <View style={{ backgroundColor: theme.id === 'light' ? '#fef2f2' : '#2d1515', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#dc2626' }}>
          <Text style={{ color: '#dc2626', fontSize: 13 }}>{aiError}</Text>
        </View>
      )}

      <Modal visible={showRationale} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowRationale(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: theme.id === 'light' ? '#f5f3ff' : '#1a1a2e', borderRadius: 14, padding: 20, width: '100%', borderWidth: 1, borderColor: '#7c3aed' }}>
            <Text style={{ color: '#7c3aed', fontSize: 15, fontWeight: '700', marginBottom: 10 }}>AI Rationale</Text>
            <Text style={{ color: theme.id === 'light' ? '#4c1d95' : '#a78bfa', fontSize: 13, lineHeight: 20 }}>{rationale}</Text>
            {keyDecisions.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {keyDecisions.map((kd, i) => (
                  <Text key={i} style={{ color: theme.id === 'light' ? '#6d28d9' : '#8b5cf6', fontSize: 12, marginTop: 6, lineHeight: 18 }}>• {kd}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity onPress={() => setShowRationale(false)} style={{ marginTop: 16, alignSelf: 'flex-end' }}>
              <Text style={{ color: '#7c3aed', fontSize: 13, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {teamA.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#60a5fa', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 11 }}>A</Text>
            </View>
            <Text style={{ color: '#2563eb', fontSize: 14, fontWeight: '600' }}>Team A ({teamA.length})</Text>
          </View>
          {teamA.map((id) => <PlayerRow key={id} name={playerMap.get(id) ?? id} badge="A" shared={teamB.includes(id)} isCaptain={captainA === id} onSetCaptain={() => toggleCaptainA(id)} onMoveA={() => moveToA(id)} onMoveB={() => moveToB(id)} onRemove={() => unassign(id)} />)}
        </View>
      )}

      {teamB.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 11 }}>B</Text>
            </View>
            <Text style={{ color: '#f97316', fontSize: 14, fontWeight: '600' }}>Team B ({teamB.length})</Text>
          </View>
          {teamB.map((id) => <PlayerRow key={id} name={playerMap.get(id) ?? id} badge="B" shared={teamA.includes(id)} isCaptain={captainB === id} onSetCaptain={() => toggleCaptainB(id)} onMoveA={() => moveToA(id)} onMoveB={() => moveToB(id)} onRemove={() => unassign(id)} />)}
        </View>
      )}

      {unassigned.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>UNASSIGNED ({unassigned.length})</Text>
          {unassigned.map((id) => <PlayerRow key={id} name={playerMap.get(id) ?? id} badge={null} onMoveA={() => moveToA(id)} onMoveB={() => moveToB(id)} />)}
        </View>
      )}

      {squad.length === 0 && <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 32 }}>No squad selected for this match</Text>}

      <TouchableOpacity
        onPress={handleConfirm} disabled={!canConfirm}
        style={{ backgroundColor: canConfirm ? theme.accent : theme.surface, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 40 + insets.bottom, borderWidth: canConfirm ? 0 : 1, borderColor: theme.border }}
      >
        {isSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: canConfirm ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>Confirm Teams</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
