import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useKeyboardScrollIntoView } from '../../hooks/useKeyboardScrollIntoView';
import { HourPicker, TimePicker, DayOfWeekPicker } from '../../components/TimePicker';
import { createPollSchedule, updatePollSchedule, getPollSchedule } from '../../services/pollScheduleService';
import type { PollScheduleTemplate } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditPollSchedule'>;

export default function EditPollScheduleScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId, scheduleId } = params;
  const isEditing = !!scheduleId;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const { scrollRef, kbHeight, handleInputFocus, onScroll } = useKeyboardScrollIntoView();

  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);

  const [template, setTemplate] = useState<PollScheduleTemplate>('simple');
  const [question, setQuestion] = useState('Cricket this Sunday at 7 AM?');
  const [venue, setVenue] = useState('');
  const [note, setNote] = useState('');
  const [minResponses, setMinResponses] = useState('');
  const [createDay, setCreateDay] = useState(0); // Sunday
  const [createHour, setCreateHour] = useState(18);
  const [eventDays, setEventDays] = useState<number[]>([6]); // Saturday
  const [eventHour, setEventHour] = useState(7);
  const [eventMinute, setEventMinute] = useState(0);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      const schedule = await getPollSchedule(clubId, scheduleId!);
      if (schedule) {
        setTemplate(schedule.template);
        setQuestion(schedule.question);
        setVenue(schedule.venue ?? '');
        setNote(schedule.note ?? '');
        setMinResponses(schedule.minResponses ? String(schedule.minResponses) : '');
        setCreateDay(schedule.createDayOfWeek);
        setCreateHour(schedule.createHour);
        setEventDays(schedule.eventDaysOfWeek);
        setEventHour(schedule.eventHour);
        setEventMinute(schedule.eventMinute);
      }
      setLoading(false);
    })();
  }, [isEditing, clubId, scheduleId]);

  const toggleEventDay = (day: number) => {
    if (template === 'simple') {
      setEventDays([day]);
      return;
    }
    setEventDays((days) => {
      if (days.includes(day)) return days.length > 1 ? days.filter((d) => d !== day) : days;
      return [...days, day].sort((a, b) => a - b);
    });
  };

  const canSubmit = !!user && question.trim().length > 0 && eventDays.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const trimmedQuestion = question.trim();
      const parsedMin = parseInt(minResponses, 10);
      const minResponsesValue = Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : undefined;
      const fields = {
        question: trimmedQuestion,
        venue: venue.trim() || undefined,
        note: note.trim() || undefined,
        minResponses: minResponsesValue,
        createDayOfWeek: createDay,
        createHour,
        eventDaysOfWeek: eventDays,
        eventHour,
        eventMinute,
      };

      if (isEditing) {
        await updatePollSchedule(clubId, scheduleId!, fields);
      } else {
        await createPollSchedule({
          clubId,
          createdBy: user.uid,
          createdByName: user.displayName ?? user.email ?? 'Admin',
          template,
          ...fields,
        });
      }
      navigation.goBack();
    } catch (err) {
      // Previously unhandled — a rejected write (e.g. Firestore
      // permission-denied) left the button "doing nothing" with no feedback.
      console.error('[EditPollSchedule] save failed', err);
      Alert.alert(
        isEditing ? 'Could not save schedule' : 'Could not create schedule',
        err instanceof Error ? err.message : 'Please try again.',
      );
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 + kbHeight + insets.bottom }}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>POLL TYPE</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(
          [
            { key: 'simple' as const, title: 'Simple interest poll', desc: 'One date — Yes / No' },
            { key: 'multiDate' as const, title: 'Multiple dates', desc: 'Pick any day(s) that work' },
          ]
        ).map(({ key, title, desc }) => {
          const active = template === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => {
                if (isEditing) return;
                setTemplate(key);
                setEventDays((days) => (key === 'simple' ? [days[0] ?? 6] : days));
              }}
              disabled={isEditing}
              style={{
                flex: 1,
                backgroundColor: theme.surface,
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: active ? theme.accent : theme.border,
                opacity: isEditing && !active ? 0.5 : 1,
              }}
            >
              <Text style={{ color: active ? theme.accent : theme.text, fontSize: 14, fontWeight: '700' }}>{title}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>{desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {isEditing && (
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 20 }}>
          Poll type can&apos;t be changed after creation — delete and recreate instead.
        </Text>
      )}

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>QUESTION</Text>
      <TextInput
        value={question}
        onChangeText={setQuestion}
        onFocus={handleInputFocus}
        placeholder="Cricket this Sunday at 7 AM?"
        placeholderTextColor={theme.textMuted}
        style={inputStyle}
        multiline
      />

      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 8, marginBottom: 8 }}>POLL GOES OUT ON</Text>
      <View style={{ marginBottom: 12 }}>
        <DayOfWeekPicker selected={[createDay]} onToggle={setCreateDay} />
      </View>
      <View style={{ marginBottom: 20 }}>
        <HourPicker hour={createHour} onChange={setCreateHour} />
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>
        {template === 'simple' ? 'MATCH DAY' : 'CANDIDATE MATCH DAYS'}
      </Text>
      <View style={{ marginBottom: 12 }}>
        <DayOfWeekPicker selected={eventDays} onToggle={toggleEventDay} />
      </View>
      <View style={{ marginBottom: 20 }}>
        <TimePicker
          hour={eventHour}
          minute={eventMinute}
          onChange={(h, m) => {
            setEventHour(h);
            setEventMinute(m);
          }}
        />
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>MINIMUM PLAYERS NEEDED (OPTIONAL)</Text>
      <TextInput
        value={minResponses}
        onChangeText={setMinResponses}
        onFocus={handleInputFocus}
        placeholder="e.g. 11"
        placeholderTextColor={theme.textMuted}
        keyboardType="numeric"
        style={inputStyle}
      />

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>VENUE (OPTIONAL)</Text>
      <TextInput
        value={venue}
        onChangeText={setVenue}
        onFocus={handleInputFocus}
        placeholder="Ground name"
        placeholderTextColor={theme.textMuted}
        style={inputStyle}
      />

      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>NOTE (OPTIONAL)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        onFocus={handleInputFocus}
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
          borderWidth: canSubmit ? 0 : 1,
          borderColor: theme.border,
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={{ color: canSubmit ? '#ffffff' : theme.textMuted, fontSize: 16, fontWeight: '700' }}>
            {isEditing ? 'Save Schedule' : 'Create Schedule'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
