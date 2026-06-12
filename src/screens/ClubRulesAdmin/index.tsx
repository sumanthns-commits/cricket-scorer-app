import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Animated,
  Keyboard,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import type {
  ClubRules,
  CustomDismissal,
  ExtrasType,
  FieldingEventConfig,
  FieldingPolarity,
  StandardDismissalType,
} from '../../types';
import {
  getClub,
  getClubMember,
  hasLiveMatch,
  saveClubRules,
} from '../../services/clubService';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubRulesAdmin'>;

const STANDARD_DISMISSALS: { type: StandardDismissalType; label: string }[] = [
  { type: 'caught', label: 'Caught' },
  { type: 'bowled', label: 'Bowled' },
  { type: 'lbw', label: 'LBW' },
  { type: 'run-out', label: 'Run Out' },
  { type: 'stumped', label: 'Stumped' },
  { type: 'hit-wicket', label: 'Hit Wicket' },
  { type: 'obstructing-field', label: 'Obstructing Field' },
  { type: 'timed-out', label: 'Timed Out' },
  { type: 'handled-ball', label: 'Handled Ball' },
  { type: 'hit-ball-twice', label: 'Hit Ball Twice' },
];

const ALL_STANDARD_TYPES = STANDARD_DISMISSALS.map((d) => d.type);

const EXTRAS_LIST: { type: ExtrasType; label: string }[] = [
  { type: 'wide', label: 'Wide' },
  { type: 'no-ball', label: 'No-ball' },
  { type: 'bye', label: 'Bye' },
  { type: 'leg-bye', label: 'Leg-bye' },
];

function resolveRules(raw: Partial<ClubRules>): ClubRules {
  return {
    ballsPerOver: raw.ballsPerOver ?? 6,
    oversPerInnings: raw.oversPerInnings,
    enabledDismissals: raw.enabledDismissals ?? ALL_STANDARD_TYPES,
    customDismissals: raw.customDismissals ?? [],
    enabledExtras: raw.enabledExtras ?? ['wide', 'no-ball', 'bye', 'leg-bye'],
    roverThrowCap: raw.roverThrowCap,
    lastManStands: raw.lastManStands ?? false,
    compulsoryRetirementAt: raw.compulsoryRetirementAt,
    maxBowlerOvers: raw.maxBowlerOvers,
    // Legacy events saved before polarity existed default to 'neutral' (no
    // rating effect) so an admin opts into good/bad deliberately.
    fieldingEvents: (raw.fieldingEvents ?? []).map((e) => ({
      ...e,
      polarity: e.polarity ?? 'neutral',
    })),
  };
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Display + cycle order for the fielding-event polarity control.
const POLARITY_META: Record<
  FieldingPolarity,
  { label: string; color: string; bg: string }
> = {
  positive: { label: '＋ Good', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  negative: { label: '－ Bad', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  neutral: { label: '○ Neutral', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
};
const POLARITY_CYCLE: FieldingPolarity[] = ['positive', 'negative', 'neutral'];

// ─── Sub-components ───────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: '#2d3f58',
        marginTop: 28,
        marginBottom: 14,
        paddingBottom: 6,
      }}
    >
      <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
        {title}
      </Text>
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: checked ? '#4ade80' : '#4b5563',
          backgroundColor: checked ? '#4ade80' : 'transparent',
          marginRight: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <Text style={{ color: '#0a1628', fontSize: 13, fontWeight: '900', lineHeight: 16 }}>
            ✓
          </Text>
        )}
      </View>
      <Text style={{ color: disabled ? '#4b5563' : '#d1d5db', fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  min,
  onFocus,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  disabled: boolean;
  min?: number;
  onFocus?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <Text style={{ color: '#d1d5db', flex: 1, fontSize: 15 }}>{label}</Text>
      <TextInput
        value={value !== undefined ? String(value) : ''}
        onChangeText={(t) => {
          if (t === '') { onChange(undefined); return; }
          const n = parseInt(t, 10);
          if (!isNaN(n) && (min === undefined || n >= min)) onChange(n);
        }}
        onFocus={onFocus}
        keyboardType="numeric"
        editable={!disabled}
        placeholder={placeholder ?? '–'}
        placeholderTextColor="#4b5563"
        style={{
          backgroundColor: disabled ? '#0f1e35' : '#1e2d45',
          color: disabled ? '#4b5563' : '#ffffff',
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          width: 80,
          textAlign: 'center',
          borderWidth: 1,
          borderColor: '#2d3f58',
          fontSize: 16,
        }}
      />
    </View>
  );
}

function CustomDismissalCard({
  item,
  onChange,
  onRemove,
  onFocus,
  disabled,
}: {
  item: CustomDismissal;
  onChange: (patch: Partial<CustomDismissal>) => void;
  onRemove: () => void;
  onFocus?: () => void;
  disabled: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: '#0f1e35',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2d3f58',
      }}
    >
      <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6, fontWeight: '600' }}>
        LABEL
      </Text>
      <TextInput
        value={item.label}
        onChangeText={(t) => onChange({ label: t })}
        onFocus={onFocus}
        placeholder="e.g. Mankad"
        placeholderTextColor="#4b5563"
        editable={!disabled}
        style={{
          backgroundColor: disabled ? '#0a1628' : '#1e2d45',
          color: disabled ? '#4b5563' : '#ffffff',
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          fontSize: 15,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: '#2d3f58',
        }}
      />

      <CheckRow
        label="Batter is out"
        checked={item.batterIsOut}
        onToggle={() => onChange({ batterIsOut: !item.batterIsOut })}
        disabled={disabled}
      />
      <CheckRow
        label="Legal delivery (counts toward over)"
        checked={item.isLegalDelivery}
        onToggle={() => onChange({ isLegalDelivery: !item.isLegalDelivery })}
        disabled={disabled}
      />
      <CheckRow
        label="Bowler gets wicket"
        checked={item.bowlerGetsWicket}
        onToggle={() => onChange({ bowlerGetsWicket: !item.bowlerGetsWicket })}
        disabled={disabled}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: '#d1d5db', flex: 1, fontSize: 15 }}>Runs scored</Text>
        <TextInput
          value={item.runsScored !== undefined ? String(item.runsScored) : ''}
          onChangeText={(t) => {
            if (t === '') { onChange({ runsScored: undefined }); return; }
            const n = parseInt(t, 10);
            if (!isNaN(n) && n >= 0) onChange({ runsScored: n });
          }}
          onFocus={onFocus}
          keyboardType="numeric"
          editable={!disabled}
          placeholder="0"
          placeholderTextColor="#4b5563"
          style={{
            backgroundColor: disabled ? '#0a1628' : '#1e2d45',
            color: disabled ? '#4b5563' : '#ffffff',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
            width: 80,
            textAlign: 'center',
            borderWidth: 1,
            borderColor: '#2d3f58',
            fontSize: 16,
          }}
        />
      </View>

      {!disabled && (
        <TouchableOpacity
          onPress={onRemove}
          style={{ alignSelf: 'flex-end', marginTop: 12 }}
        >
          <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FieldingEventRow({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFocus,
  disabled,
}: {
  item: FieldingEventConfig;
  index: number;
  total: number;
  onChange: (patch: Partial<FieldingEventConfig>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFocus?: () => void;
  disabled: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f1e35',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#2d3f58',
        gap: 8,
      }}
    >
      <TouchableOpacity
        onPress={() => onChange({ enabled: !item.enabled })}
        disabled={disabled}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: item.enabled ? '#4ade80' : '#4b5563',
          backgroundColor: item.enabled ? '#4ade80' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.enabled && (
          <Text style={{ color: '#0a1628', fontSize: 13, fontWeight: '900', lineHeight: 16 }}>
            ✓
          </Text>
        )}
      </TouchableOpacity>

      <TextInput
        value={item.label}
        onChangeText={(t) => onChange({ label: t })}
        onFocus={onFocus}
        placeholder="Event label"
        placeholderTextColor="#4b5563"
        editable={!disabled}
        style={{
          flex: 1,
          backgroundColor: disabled ? '#0a1628' : '#1e2d45',
          color: disabled ? '#4b5563' : '#ffffff',
          borderRadius: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          fontSize: 14,
          borderWidth: 1,
          borderColor: '#2d3f58',
        }}
      />

      {(() => {
        const meta = POLARITY_META[item.polarity ?? 'neutral'];
        return (
          <TouchableOpacity
            onPress={() => {
              const i = POLARITY_CYCLE.indexOf(item.polarity ?? 'neutral');
              onChange({ polarity: POLARITY_CYCLE[(i + 1) % POLARITY_CYCLE.length] });
            }}
            disabled={disabled}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: meta.color,
              backgroundColor: meta.bg,
              minWidth: 78,
              alignItems: 'center',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: meta.color, fontSize: 12, fontWeight: '700' }}>
              {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {!disabled && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            style={{
              padding: 6,
              opacity: index === 0 ? 0.3 : 1,
            }}
          >
            <Text style={{ color: '#9ca3af', fontSize: 14 }}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === total - 1}
            style={{
              padding: 6,
              opacity: index === total - 1 ? 0.3 : 1,
            }}
          >
            <Text style={{ color: '#9ca3af', fontSize: 14 }}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemove} style={{ padding: 6 }}>
            <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Toast({ message, toastKey }: { message: string; toastKey: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastKey]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 100,
        left: 16,
        right: 16,
        backgroundColor: '#1e2d45',
        borderRadius: 10,
        padding: 14,
        opacity,
        borderWidth: 1,
        borderColor: '#4ade80',
        zIndex: 100,
      }}
    >
      <Text style={{ color: '#4ade80', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
        {message}
      </Text>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────

export default function ClubRulesAdminScreen({ route, navigation }: Props) {
  const { clubId } = route.params;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<ClubRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastKey, setToastKey] = useState(0);

  // Keyboard-aware scrolling. Expo Go (no native keyboard libs) + SDK 54
  // edge-to-edge means neither adjustResize nor automaticallyAdjustKeyboardInsets
  // reliably reveals an input near the bottom (e.g. a fielding-event label), so
  // we pad the scroll content by the keyboard height and scroll the focused
  // input into view ourselves. measureInWindow (not measureLayout) is used since
  // the New Architecture rejects measureLayout against a numeric node handle.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);

  // If the focused input sits under (or close to) the keyboard, scroll up by
  // just enough to clear it. Called on keyboard-open and on each input focus.
  function scrollFocusedIntoView(keyboardHeight: number) {
    if (keyboardHeight <= 0) return;
    setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput?.();
      const sv = scrollRef.current;
      if (!focused || !sv) return;
      focused.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const keyboardTop = Dimensions.get('window').height - keyboardHeight;
        const margin = 24;
        const overlap = y + h - (keyboardTop - margin);
        if (overlap > 0) sv.scrollTo({ y: scrollYRef.current + overlap, animated: true });
      });
    }, 60); // let the bottom padding apply first
  }

  function handleInputFocus() {
    scrollFocusedIntoView(kbHeight);
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setKbHeight(h);
      scrollFocusedIntoView(h);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['clubRulesAdmin', clubId, user?.uid],
    queryFn: async () => {
      const [club, member, live] = await Promise.all([
        getClub(clubId),
        getClubMember(clubId, user!.uid),
        hasLiveMatch(clubId),
      ]);
      return { rules: club?.rules ?? null, isAdmin: member?.role === 'admin', isLive: live };
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (data?.rules !== undefined && draft === null) {
      setDraft(resolveRules(data.rules ?? {}));
    }
  }, [data, draft]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastKey((k) => k + 1);
  }

  const locked = data?.isLive ?? false;

  // ── Draft mutators ───────────────────────────────────────────

  function setField<K extends keyof ClubRules>(key: K, value: ClubRules[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleDismissal(type: StandardDismissalType) {
    if (!draft || locked) return;
    const enabled = draft.enabledDismissals.includes(type);
    setField(
      'enabledDismissals',
      enabled
        ? draft.enabledDismissals.filter((d) => d !== type)
        : [...draft.enabledDismissals, type]
    );
  }

  function toggleExtra(type: ExtrasType) {
    if (!draft || locked) return;
    const enabled = draft.enabledExtras.includes(type);
    setField(
      'enabledExtras',
      enabled
        ? draft.enabledExtras.filter((e) => e !== type)
        : [...draft.enabledExtras, type]
    );
  }

  function addCustomDismissal() {
    if (!draft || locked) return;
    const newItem: CustomDismissal = {
      id: genId(),
      label: '',
      batterIsOut: true,
      runsScored: undefined,
      isLegalDelivery: true,
      bowlerGetsWicket: false,
    };
    setField('customDismissals', [...draft.customDismissals, newItem]);
  }

  function updateCustomDismissal(id: string, patch: Partial<CustomDismissal>) {
    if (!draft) return;
    setField(
      'customDismissals',
      draft.customDismissals.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }

  function removeCustomDismissal(id: string) {
    if (!draft) return;
    setField('customDismissals', draft.customDismissals.filter((d) => d.id !== id));
  }

  function addFieldingEvent() {
    if (!draft || locked) return;
    const newItem: FieldingEventConfig = {
      id: genId(),
      label: '',
      enabled: true,
      polarity: 'neutral',
    };
    setField('fieldingEvents', [...draft.fieldingEvents, newItem]);
  }

  function updateFieldingEvent(id: string, patch: Partial<FieldingEventConfig>) {
    if (!draft) return;
    setField(
      'fieldingEvents',
      draft.fieldingEvents.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  function removeFieldingEvent(id: string) {
    if (!draft) return;
    setField('fieldingEvents', draft.fieldingEvents.filter((e) => e.id !== id));
  }

  function moveFieldingEvent(index: number, direction: -1 | 1) {
    if (!draft) return;
    const arr = [...draft.fieldingEvents];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= arr.length) return;
    [arr[index], arr[swapIndex]] = [arr[swapIndex], arr[index]];
    setField('fieldingEvents', arr);
  }

  // ── Save ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!draft || locked || saving) return;

    if (draft.ballsPerOver < 1) {
      setSaveError('Balls per over must be at least 1.');
      return;
    }
    if (draft.customDismissals.some((d) => !d.label.trim())) {
      setSaveError('All custom dismissals must have a label.');
      return;
    }
    if (draft.fieldingEvents.some((e) => !e.label.trim())) {
      setSaveError('All fielding events must have a label.');
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      const clean: ClubRules = {
        ...draft,
        customDismissals: draft.customDismissals.map((d) => ({ ...d, label: d.label.trim() })),
        fieldingEvents: draft.fieldingEvents.map((e) => ({ ...e, label: e.label.trim() })),
      };
      await saveClubRules(clubId, clean);
      await queryClient.invalidateQueries({ queryKey: ['clubs'] });
      showToast('Rules saved — will apply to next match');
    } catch {
      setSaveError('Failed to save rules. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render states ────────────────────────────────────────────

  if (isLoading || (data && !draft)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#ef4444', textAlign: 'center' }}>Failed to load club rules.</Text>
      </View>
    );
  }

  if (!data.isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#9ca3af', fontSize: 16, textAlign: 'center' }}>
          Only club admins can manage rules.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#4ade80', fontSize: 15 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!draft) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 + kbHeight }}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
        >

          {locked && (
            <View
              style={{
                backgroundColor: '#1c1a10',
                borderWidth: 1,
                borderColor: '#ca8a04',
                borderRadius: 10,
                padding: 14,
                marginBottom: 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 18 }}>🔒</Text>
              <Text style={{ color: '#fbbf24', fontSize: 13, flex: 1, lineHeight: 18 }}>
                A match is currently live. Rules are read-only until the match ends.
              </Text>
            </View>
          )}

          {/* ── DELIVERY ── */}
          <SectionHeader title="DELIVERY" />
          <NumberRow
            label="Balls per over"
            value={draft.ballsPerOver}
            onChange={(v) => setField('ballsPerOver', v ?? 6)}
            placeholder="6"
            disabled={locked}
            min={1}
            onFocus={handleInputFocus}
          />
          <NumberRow
            label="Max overs per innings"
            value={draft.oversPerInnings}
            onChange={(v) => setField('oversPerInnings', v)}
            placeholder="unlimited"
            disabled={locked}
            min={1}
            onFocus={handleInputFocus}
          />

          {/* ── DISMISSALS ── */}
          <SectionHeader title="DISMISSALS" />
          <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>Standard</Text>
          {STANDARD_DISMISSALS.map(({ type, label }) => (
            <CheckRow
              key={type}
              label={label}
              checked={draft.enabledDismissals.includes(type)}
              onToggle={() => toggleDismissal(type)}
              disabled={locked}
            />
          ))}

          <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 14, marginBottom: 10 }}>
            Custom
          </Text>
          {draft.customDismissals.map((item) => (
            <CustomDismissalCard
              key={item.id}
              item={item}
              onChange={(patch) => updateCustomDismissal(item.id, patch)}
              onRemove={() => removeCustomDismissal(item.id)}
              onFocus={handleInputFocus}
              disabled={locked}
            />
          ))}
          {!locked && (
            <TouchableOpacity
              onPress={addCustomDismissal}
              style={{
                borderWidth: 1,
                borderColor: '#2d3f58',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#4ade80', fontSize: 14, fontWeight: '600' }}>
                + Add Custom Dismissal
              </Text>
            </TouchableOpacity>
          )}

          {/* ── EXTRAS ── */}
          <SectionHeader title="EXTRAS" />
          {EXTRAS_LIST.map(({ type, label }) => (
            <CheckRow
              key={type}
              label={label}
              checked={draft.enabledExtras.includes(type)}
              onToggle={() => toggleExtra(type)}
              disabled={locked}
            />
          ))}

          {/* ── FIELDING ── */}
          <SectionHeader title="FIELDING" />
          <NumberRow
            label="Rover throw cap (runs)"
            value={draft.roverThrowCap}
            onChange={(v) => setField('roverThrowCap', v)}
            placeholder="no cap"
            disabled={locked}
            min={0}
            onFocus={handleInputFocus}
          />

          {/* ── BATTING ── */}
          <SectionHeader title="BATTING" />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: '#d1d5db', flex: 1, fontSize: 15 }}>Last man stands</Text>
            <Switch
              value={draft.lastManStands}
              onValueChange={(v) => setField('lastManStands', v)}
              disabled={locked}
              trackColor={{ false: '#2d3f58', true: '#166534' }}
              thumbColor={draft.lastManStands ? '#4ade80' : '#6b7280'}
            />
          </View>
          <NumberRow
            label="Compulsory retirement at (runs)"
            value={draft.compulsoryRetirementAt}
            onChange={(v) => setField('compulsoryRetirementAt', v)}
            placeholder="none"
            disabled={locked}
            min={1}
            onFocus={handleInputFocus}
          />

          {/* ── BOWLING ── */}
          <SectionHeader title="BOWLING" />
          <NumberRow
            label="Max overs per bowler"
            value={draft.maxBowlerOvers}
            onChange={(v) => setField('maxBowlerOvers', v)}
            placeholder="no limit"
            disabled={locked}
            min={1}
            onFocus={handleInputFocus}
          />

          {/* ── FIELDING EVENTS ── */}
          <SectionHeader title="FIELDING EVENTS" />
          <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
            Tap the tag to set how each event affects a fielder&apos;s rating:{' '}
            <Text style={{ color: '#4ade80', fontWeight: '700' }}>Good</Text> adds,{' '}
            <Text style={{ color: '#ef4444', fontWeight: '700' }}>Bad</Text> subtracts,{' '}
            <Text style={{ color: '#9ca3af', fontWeight: '700' }}>Neutral</Text> is just tracked.
          </Text>
          {draft.fieldingEvents.map((item, index) => (
            <FieldingEventRow
              key={item.id}
              item={item}
              index={index}
              total={draft.fieldingEvents.length}
              onChange={(patch) => updateFieldingEvent(item.id, patch)}
              onRemove={() => removeFieldingEvent(item.id)}
              onMoveUp={() => moveFieldingEvent(index, -1)}
              onMoveDown={() => moveFieldingEvent(index, 1)}
              onFocus={handleInputFocus}
              disabled={locked}
            />
          ))}
          {!locked && (
            <TouchableOpacity
              onPress={addFieldingEvent}
              style={{
                borderWidth: 1,
                borderColor: '#2d3f58',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#4ade80', fontSize: 14, fontWeight: '600' }}>
                + Add Fielding Event
              </Text>
            </TouchableOpacity>
          )}

          {/* ── SAVE ── */}
          {!locked && (
            <View style={{ marginTop: 32 }}>
              {saveError && (
                <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  {saveError}
                </Text>
              )}
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{
                  backgroundColor: '#4ade80',
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#0a1628" />
                ) : (
                  <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>
                    Save Rules
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

      <Toast message={toastMsg} toastKey={toastKey} />
    </View>
  );
}
