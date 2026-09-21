import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../store/themeStore';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDayOfWeek(day: number): string {
  return WEEKDAY_LONG[day] ?? '';
}

export function formatTime(hour: number, minute: number): string {
  const isPM = hour >= 12;
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
}

export function SpinPicker({
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

// hour is 0-23 (24h, club-local); displayed as 12h + AM/PM to match this
// app's other time pickers (CreateMatchPoll, ScheduleMatch).
export function HourPicker({ hour, onChange }: { hour: number; onChange: (hour: number) => void }) {
  const isPM = hour >= 12;
  const hour12 = hour % 12 || 12;

  const adjustHour = (delta: number) => {
    const nextHour12 = ((hour12 - 1 + delta + 12) % 12) + 1;
    onChange(isPM ? (nextHour12 % 12) + 12 : nextHour12 % 12);
  };
  const toggleAMPM = () => onChange(isPM ? hour - 12 : hour + 12);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <SpinPicker label="Hour" value={String(hour12)} onInc={() => adjustHour(1)} onDec={() => adjustHour(-1)} />
      <SpinPicker label="" value={isPM ? 'PM' : 'AM'} onInc={toggleAMPM} onDec={toggleAMPM} />
    </View>
  );
}

export function TimePicker({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const isPM = hour >= 12;
  const hour12 = hour % 12 || 12;

  const adjustHour = (delta: number) => {
    const nextHour12 = ((hour12 - 1 + delta + 12) % 12) + 1;
    onChange(isPM ? (nextHour12 % 12) + 12 : nextHour12 % 12, minute);
  };
  const adjustMinute = (delta: number) => onChange(hour, (minute + delta + 60) % 60);
  const toggleAMPM = () => onChange(isPM ? hour - 12 : hour + 12, minute);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <SpinPicker label="Hour" value={String(hour12)} onInc={() => adjustHour(1)} onDec={() => adjustHour(-1)} />
      <SpinPicker
        label="Min"
        value={String(minute).padStart(2, '0')}
        onInc={() => adjustMinute(5)}
        onDec={() => adjustMinute(-5)}
      />
      <SpinPicker label="" value={isPM ? 'PM' : 'AM'} onInc={toggleAMPM} onDec={toggleAMPM} />
    </View>
  );
}

// `onToggle` decides single- vs multi-select behavior — pass a handler that
// replaces the selection for a single-pick day, or adds/removes a day for a
// multi-pick set (see EditPollSchedule's "fires on" day vs "event days").
export function DayOfWeekPicker({ selected, onToggle }: { selected: number[]; onToggle: (day: number) => void }) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {WEEKDAY_SHORT.map((label, day) => {
        const active = selected.includes(day);
        return (
          <TouchableOpacity
            key={day}
            onPress={() => onToggle(day)}
            style={{
              width: 44,
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: active ? theme.accent : theme.surface,
              borderWidth: 1,
              borderColor: active ? theme.accent : theme.border,
            }}
          >
            <Text style={{ color: active ? '#ffffff' : theme.text, fontSize: 13, fontWeight: '700' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
