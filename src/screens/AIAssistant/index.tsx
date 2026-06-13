import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { Content } from 'firebase/ai';
import { useClubStore } from '../../store/clubStore';
import { useThemeStore } from '../../store/themeStore';
import { askCricketAssistant } from '../../ai/cricketAssistant';
import { ASSISTANT_SYSTEM_PROMPT } from '../../constants/assistantPrompt';
import { getClubPlayers } from '../../services/matchService';
import type { TeamSelectionResult } from '../../types';

const TOOL_LABELS: Record<string, string> = {
  get_available_players: 'Listing available players…',
  get_player_stats: 'Fetching player stats…',
  get_player_form: 'Checking recent form…',
  get_batting_insights: 'Analysing batting…',
  get_bowling_insights: 'Analysing bowling…',
  get_head_to_head: 'Looking up head-to-head…',
  get_match_context: 'Loading match context…',
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  teams: TeamSelectionResult | null;
}

function parseTeams(text: string): TeamSelectionResult | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<TeamSelectionResult>;
    if (!Array.isArray(parsed.team_a) || !Array.isArray(parsed.team_b)) return null;
    return { team_a: parsed.team_a, team_b: parsed.team_b, rationale: parsed.rationale ?? '', keyDecisions: parsed.keyDecisions ?? [] };
  } catch { return null; }
}

function stripJson(text: string): string {
  return text.replace(/```json[\s\S]*?```/g, '').replace(/\{[\s\S]*\}/, '').trim();
}

function TeamColumn({ title, color, ids, nameOf }: { title: string; color: string; ids: string[]; nameOf: (id: string) => string }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{title} ({ids.length})</Text>
      {ids.map((id) => <Text key={id} style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 4 }}>{nameOf(id)}</Text>)}
    </View>
  );
}

function TeamCards({ teams, nameOf }: { teams: TeamSelectionResult; nameOf: (id: string) => string }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TeamColumn title="Team A" color="#2563eb" ids={teams.team_a} nameOf={nameOf} />
        <TeamColumn title="Team B" color="#f97316" ids={teams.team_b} nameOf={nameOf} />
      </View>
      {teams.rationale !== '' && <Text style={{ color: '#7c3aed', fontSize: 13, lineHeight: 18, marginTop: 10 }}>{teams.rationale}</Text>}
      {teams.keyDecisions.map((kd, i) => <Text key={i} style={{ color: '#8b5cf6', fontSize: 12, marginTop: 4 }}>• {kd}</Text>)}
    </View>
  );
}

function Bubble({ msg, nameOf }: { msg: ChatMessage; nameOf: (id: string) => string }) {
  const theme = useThemeStore((s) => s.theme);
  const isUser = msg.role === 'user';
  return (
    <View style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '88%',
      backgroundColor: isUser ? theme.accentDim : theme.surface,
      borderRadius: 14,
      borderTopRightRadius: isUser ? 4 : 14,
      borderTopLeftRadius: isUser ? 14 : 4,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isUser ? theme.accent : theme.border,
    }}>
      {msg.text !== '' && <Text style={{ color: isUser ? theme.accent : theme.text, fontSize: 14, lineHeight: 20 }}>{msg.text}</Text>}
      {msg.teams && <TeamCards teams={msg.teams} nameOf={nameOf} />}
    </View>
  );
}

export default function AIAssistantScreen() {
  const activeClubId = useClubStore((s) => s.activeClubId);
  const theme = useThemeStore((s) => s.theme);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolLabel, setToolLabel] = useState('');
  const [error, setError] = useState('');
  const historyRef = useRef<Content[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const { data: players = [] } = useQuery({
    queryKey: ['clubPlayers', activeClubId],
    queryFn: () => getClubPlayers(activeClubId!),
    enabled: !!activeClubId,
  });

  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? id;

  if (!activeClubId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 20, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>Go to Home and tap a club to use the assistant.</Text>
      </View>
    );
  }

  const send = async () => {
    const text = input.trim();
    if (text === '' || busy) return;
    setInput(''); setError('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text, teams: null }]);
    setBusy(true); setToolLabel('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      const result = await askCricketAssistant(text, activeClubId, ASSISTANT_SYSTEM_PROMPT, { history: historyRef.current, onToolCall: (name) => setToolLabel(TOOL_LABELS[name] ?? 'Working…') });
      historyRef.current = result.history;
      const teams = parseTeams(result.text);
      const body = teams ? stripJson(result.text) : result.text;
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: body || (teams ? 'Here are balanced teams:' : ''), teams }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant failed to respond.');
    } finally {
      setBusy(false); setToolLabel('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const sendDisabled = busy || input.trim() === '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Cricket Assistant</Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              Ask about player form, match-ups, or say{'\n'}"pick two balanced teams".
            </Text>
          </View>
        )}
        {messages.map((m) => <Bubble key={m.id} msg={m} nameOf={nameOf} />)}
        {busy && (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, borderRadius: 14, borderTopLeftRadius: 4, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: theme.border }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>{toolLabel || 'Thinking…'}</Text>
          </View>
        )}
        {error !== '' && (
          <View style={{ backgroundColor: theme.id === 'light' ? '#fef2f2' : '#2d1515', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#dc2626' }}>
            <Text style={{ color: '#dc2626', fontSize: 13 }}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
        <TextInput
          value={input} onChangeText={setInput}
          placeholder="Ask the assistant…" placeholderTextColor={theme.textMuted}
          multiline editable={!busy}
          style={{ flex: 1, color: theme.text, backgroundColor: theme.surface, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxHeight: 120, fontSize: 14, borderWidth: 1, borderColor: theme.border }}
        />
        <TouchableOpacity
          onPress={send} disabled={sendDisabled}
          style={{ backgroundColor: sendDisabled ? theme.surface : theme.accent, borderRadius: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: sendDisabled ? 1 : 0, borderColor: theme.border }}
        >
          <Text style={{ color: sendDisabled ? theme.textMuted : '#ffffff', fontSize: 18, fontWeight: '800' }}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
