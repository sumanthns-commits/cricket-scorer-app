import { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { createMatchPoll, sharePoll } from '../../services/matchPollService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'CreateMatchPoll'>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Day/month/year + hour/minute/AM-PM for one candidate match date. Kept as
// plain numbers (not a Date) so each spin picker can adjust its own field
// without fighting Date's rollover behaviour mid-edit.
interface DateParts {
  day: number;
  month: number;
  year: number;
  hour: number; // 1-12
  minute: number;
  isPM: boolean;
}

function tomorrowAt(hour: number, minute: number): DateParts {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return { day: t.getDate(), month: t.getMonth(), year: t.getFullYear(), hour, minute, isPM: hour >= 12 };
}

function partsToDate(p: DateParts): Date {
  const hour24 = p.isPM ? (p.hour % 12) + 12 : p.hour % 12;
  return new Date(p.year, p.month, p.day, hour24, p.minute);
}

function formatParts(p: DateParts): string {
  const d = partsToDate(p);
  const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} · ${timeStr}`;
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
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', marginVertical: 6 }}>{value}</Text>
      <TouchableOpacity onPress={onDec} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: theme.accent, fontSize: 18 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

function DateTimePicker({ parts, onChange }: { parts: DateParts; onChange: (next: DateParts) => void }) {
  const adjustDay = (delta: number) => {
    const max = daysInMonth(parts.month, parts.year);
    onChange({ ...parts, day: Math.max(1, Math.min(max, parts.day + delta)) });
  };
  const adjustMonth = (delta: number) => {
    const newMonth = (parts.month + 12 + delta) % 12;
    onChange({ ...parts, month: newMonth, day: Math.min(parts.day, daysInMonth(newMonth, parts.year)) });
  };
  const adjustYear = (delta: number) => onChange({ ...parts, year: Math.max(2020, parts.year + delta) });
  const adjustHour = (delta: number) => {
    const next = ((parts.hour - 1 + delta + 12) % 12) + 1;
    onChange({ ...parts, hour: next });
  };
  const adjustMinute = (delta: number) => onChange({ ...parts, minute: (parts.minute + delta + 60) % 60 });
  const toggleAMPM = () => onChange({ ...parts, isPM: !parts.isPM });

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <SpinPicker label="Day" value={String(parts.day)} onInc={() => adjustDay(1)} onDec={() => adjustDay(-1)} />
        <SpinPicker label="Month" value={MONTHS[parts.month]} onInc={() => adjustMonth(1)} onDec={() => adjustMonth(-1)} />
        <SpinPicker label="Year" value={String(parts.year)} onInc={() => adjustYear(1)} onDec={() => adjustYear(-1)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SpinPicker label="Hour" value={String(parts.hour)} onInc={() => adjustHour(1)} onDec={() => adjustHour(-1)} />
        <SpinPicker
          label="Min"
          value={String(parts.minute).padStart(2, '0')}
          onInc={() => adjustMinute(5)}
          onDec={() => adjustMinute(-5)}
        />
        <SpinPicker label="" value={parts.isPM ? 'PM' : 'AM'} onInc={toggleAMPM} onDec={toggleAMPM} />
      </View>
    </View>
  );
}

let rowIdCounter = 0;
function nextRowId() {
  rowIdCounter += 1;
  return `date-${rowIdCounter}`;
}

interface DateRow {
  id: string;
  label: string;
  parts: DateParts;
}

export default function CreateMatchPollScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId } = params;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();

  const [template, setTemplate] = useState<'simple' | 'multiDate'>('simple');
  const [question, setQuestion] = useState('Cricket this Sunday at 7 AM?');
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [simpleDate, setSimpleDate] = useState<DateParts>(() => tomorrowAt(7, 0));
  const [dateRows, setDateRows] = useState<DateRow[]>(() => [
    { id: nextRowId(), label: 'Sunday', parts: tomorrowAt(7, 0) },
  ]);

  const addDateRow = () => setDateRows((rows) => [...rows, { id: nextRowId(), label: '', parts: tomorrowAt(7, 0) }]);
  const removeDateRow = (id: string) => setDateRows((rows) => rows.filter((r) => r.id !== id));
  const updateDateRow = (id: string, patch: Partial<DateRow>) =>
    setDateRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const canSubmit =
    !!user &&
    question.trim().length > 0 &&
    (template === 'simple' || dateRows.length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const trimmedQuestion = question.trim();
      const options =
        template === 'simple'
          ? [
              { id: 'yes', label: 'Yes', proposedDate: partsToDate(simpleDate), schedulable: true },
              { id: 'no', label: 'No', schedulable: false },
            ]
          : dateRows.map((row, i) => ({
              id: row.id,
              label: row.label.trim() || `Option ${i + 1}`,
              proposedDate: partsToDate(row.parts),
              schedulable: true,
            }));

      const pollId = await createMatchPoll({
        clubId,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email ?? 'Admin',
        question: trimmedQuestion,
        multiSelect: template === 'multiDate',
        options,
        venue: venue.trim() || undefined,
        note: note.trim() || undefined,
      });

      // User picks the WhatsApp group manually from the OS share sheet — there's
      // no API to post directly into a specific WhatsApp group.
      await sharePoll({ clubId, id: pollId, question: trimmedQuestion, multiSelect: template === 'multiDate', options });
      // Land straight on the results/schedule screen rather than back on the
      // Match Polls list — replace so the create form isn't left on the stack.
      navigation.replace('PollResponse', { clubId, pollId });
    } finally {
      setSubmitting(false);
    }
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>POLL TYPE</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {([
            { key: 'simple' as const, title: 'Simple interest poll', desc: 'One date — Yes / No' },
            { key: 'multiDate' as const, title: 'Multiple dates', desc: 'Pick any day(s) that work' },
          ]).map(({ key, title, desc }) => {
            const active = template === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setTemplate(key)}
                style={{
                  flex: 1,
                  backgroundColor: theme.surface,
                  borderRadius: 8,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.border,
                }}
              >
                <Text style={{ color: active ? theme.accent : theme.text, fontSize: 14, fontWeight: '700' }}>
                  {title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>{desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>QUESTION</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Cricket this Sunday at 7 AM?"
          placeholderTextColor={theme.textMuted}
          style={inputStyle}
          multiline
        />

        {template === 'simple' ? (
          <>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>DATE & TIME</Text>
            <View style={{ marginBottom: 20 }}>
              <DateTimePicker parts={simpleDate} onChange={setSimpleDate} />
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>{formatParts(simpleDate)}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>CANDIDATE DATES</Text>
            {dateRows.map((row, i) => (
              <View
                key={row.id}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <TextInput
                    value={row.label}
                    onChangeText={(text) => updateDateRow(row.id, { label: text })}
                    placeholder={`Option ${i + 1} label (e.g. "Sunday")`}
                    placeholderTextColor={theme.textMuted}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                  />
                  {dateRows.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeDateRow(row.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: 10 }}
                    >
                      <Text style={{ color: theme.textMuted, fontSize: 18, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <DateTimePicker parts={row.parts} onChange={(next) => updateDateRow(row.id, { parts: next })} />
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8 }}>{formatParts(row.parts)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={addDateRow} style={{ marginBottom: 20 }}>
              <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>+ Add another date</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 20 }}>
              No need for a "Both"/"Neither" option — respondents can check any number of
              these, including none.
            </Text>
          </>
        )}

        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>VENUE (OPTIONAL)</Text>
        <TextInput
          value={venue}
          onChangeText={setVenue}
          placeholder="Ground name"
          placeholderTextColor={theme.textMuted}
          style={inputStyle}
        />

        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>NOTE (OPTIONAL)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Anything else players should know"
          placeholderTextColor={theme.textMuted}
          style={{ ...inputStyle, marginBottom: 20 }}
          multiline
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? theme.accent : theme.surface,
            borderRadius: 10,
            padding: 16,
            alignItems: 'center',
            marginBottom: 40 + insets.bottom,
            borderWidth: canSubmit ? 0 : 1,
            borderColor: theme.border,
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={{ color: canSubmit ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>
              Create & Share Poll
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
