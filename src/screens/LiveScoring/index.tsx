import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  ActivityIndicator,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  getMatch,
  getClubPlayers,
  newBallRef,
  saveBallDoc,
  updateBallNextBatsman,
  getMatchBalls,
  deleteLastBall,
  completeMatch,
  abandonMatch,
  deleteMatch,
  updateMatchOvers,
  addSubstitute,
  removeSubstitute,
} from '../../services/matchService';
import { getClub, getClubMember } from '../../services/clubService';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { recordBall } from '../../services/scoringEngine';
import { MatchStatsContent } from '../MatchStats';
import type {
  BallDoc,
  BallEntry,
  ClubRules,
  CustomDismissal,
  DismissalEntry,
  ExtrasType,
  Match,
  Player,
  StandardDismissalType,
  WagonShot,
} from '../../types';
import type { BallInput, DismissalConfig } from '../../services/scoringEngine';

// ─── Local types ────────────────────────────────────────────────────

interface BatterStats {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalText?: string;
}

interface BowlerStats {
  legalBalls: number;
  completedOvers: number;
  runsConceded: number;
  wickets: number;
}

interface InningsState {
  inningsId: string;
  battingIds: string[];
  bowlingIds: string[];
  totalRuns: number;
  totalWickets: number;
  overNumber: number;
  legalBallsInOver: number;
  onStrikeId: string;
  offStrikeId: string;
  bowlerId: string;
  batterStats: Record<string, BatterStats>;
  bowlerStats: Record<string, BowlerStats>;
  currentOverBalls: BallEntry[];
  handedness: Record<string, 'RHB' | 'LHB'>;
}

// Snapshot includes the ball ID that produced this state so undo can
// restore lastBallIdRef correctly (needed for subsequent handleNewBatter calls).
type Snapshot = InningsState & { _ballId: string | null };

// ─── Wagon wheel ────────────────────────────────────────────────────

const WHEEL = 280;
const WC = WHEEL / 2;
const OUTER_R = 126;
const RINGS = [42, 84, 126];

// Canonical fielding positions, clockwise from 0 = straight (toward bowler).
// Keeper's view (batsman at bottom): RHB off side = right (sectors 1–5),
// leg side = left (sectors 7–11).
const RHB_LABELS = [
  'Straight', 'Mid-off', 'Cover', 'Point', 'Gully', 'Third man',
  'Behind', 'Fine leg', 'Bwd sq leg', 'Sq. leg', 'Midwicket', 'Mid-on',
];
// LHB: mirror of RHB across the vertical axis (sector i ↔ 12 − i).
const LHB_LABELS = [
  'Straight', 'Mid-on', 'Midwicket', 'Sq. leg', 'Bwd sq leg', 'Fine leg',
  'Behind', 'Third man', 'Gully', 'Point', 'Cover', 'Mid-off',
];

// depth: 0 = infield, 1 = mid, 2 = boundary. Radius bands = the ring radii.
const DEPTH_LABELS = ['Infield', 'Mid', 'Boundary'];

type WheelSel = { sector: number; depth: number; x: number; y: number };

// Map a tap (relative to the wheel's top-left) to a sector + depth.
// sector: round((angle + 90°) / 30) — matches the label geometry where
//   sector i sits at screen-angle (i·30 − 90)°. depth: which ring band the
//   radius falls in. Returns null for taps on the centre dot or outside the wheel.
function tapToSel(x: number, y: number): WheelSel | null {
  const dx = x - WC;
  const dy = y - WC;
  const r = Math.hypot(dx, dy);
  if (r < 8 || r > OUTER_R + 16) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const sector = ((Math.round((angle + 90) / 30) % 12) + 12) % 12;
  const depth = r <= RINGS[0] ? 0 : r <= RINGS[1] ? 1 : 2;
  return { sector, depth, x, y };
}

function WagonWheelModal({ visible, isLHB, runs, onDone }: { visible: boolean; isLHB: boolean; runs: number; onDone: (shot: WagonShot | null) => void }) {
  const theme = useThemeStore((s) => s.theme);
  const [sel, setSel] = useState<WheelSel | null>(null);
  const labels = isLHB ? LHB_LABELS : RHB_LABELS;

  useEffect(() => { if (visible) setSel(null); }, [visible]);

  const onWheelPress = (e: GestureResponderEvent) => {
    const next = tapToSel(e.nativeEvent.locationX, e.nativeEvent.locationY);
    if (next) setSel(next);
  };

  const canConfirm = sel !== null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 20, alignItems: 'center', width: 340 }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
            {runs === 4 ? 'FOUR!' : runs === 6 ? 'SIX!' : `${runs} run${runs !== 1 ? 's' : ''}`}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 4 }}>
            Tap where the ball went — closer to the edge = deeper
          </Text>
          <Text style={{ color: sel ? theme.accent : theme.border, fontSize: 12, fontWeight: '600', marginBottom: 12, height: 16 }}>
            {sel ? `${labels[sel.sector]} · ${DEPTH_LABELS[sel.depth]}` : ' '}
          </Text>

          <Pressable onPress={onWheelPress} style={{ width: WHEEL, height: WHEEL }}>
            <View pointerEvents="none" style={{ position: 'absolute', width: WHEEL, height: WHEEL, borderRadius: WC, backgroundColor: theme.surfaceAlt }} />

            {RINGS.map((r, di) => (
              <View key={r} pointerEvents="none" style={{ position: 'absolute', width: r * 2, height: r * 2, borderRadius: r, borderWidth: sel?.depth === di ? 2 : 1, borderColor: sel?.depth === di ? theme.accent : theme.border, left: WC - r, top: WC - r }} />
            ))}

            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} pointerEvents="none" style={{ position: 'absolute', width: OUTER_R * 2, height: 1, backgroundColor: theme.border, left: WC - OUTER_R, top: WC - 0.5, transform: [{ rotate: `${i * 30}deg` }] }} />
            ))}

            {labels.map((label, i) => {
              const rad = ((i * 30 - 90) * Math.PI) / 180;
              const r = OUTER_R - 16;
              const x = WC + r * Math.cos(rad) - 26;
              const y = WC + r * Math.sin(rad) - 11;
              const active = sel?.sector === i;
              return (
                <View key={i} pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width: 52, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: active ? theme.accent : theme.textMuted, fontSize: 9, textAlign: 'center', fontWeight: active ? '700' : '400' }}>{label}</Text>
                </View>
              );
            })}

            {sel && (
              <View pointerEvents="none" style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: theme.accent, borderWidth: 2, borderColor: theme.surface, left: sel.x - 7, top: sel.y - 7 }} />
            )}

            <View pointerEvents="none" style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: theme.textMuted, left: WC - 4, top: WC - 4 }} />

            <Text pointerEvents="none" style={{ position: 'absolute', bottom: 6, alignSelf: 'center', color: theme.textMuted, fontSize: 10 }}>
              {isLHB ? 'LHB' : 'RHB'} ▲
            </Text>
          </Pressable>

          <TouchableOpacity
            onPress={() => onDone(sel ? { sector: sel.sector, depth: sel.depth } : null)}
            style={{ width: '100%', padding: 14, borderRadius: 10, marginTop: 18, alignItems: 'center', backgroundColor: canConfirm ? theme.accent : theme.surface, borderWidth: canConfirm ? 0 : 1, borderColor: theme.border }}
          >
            <Text style={{ color: canConfirm ? '#ffffff' : theme.textMuted, fontWeight: '700' }}>
              {canConfirm ? 'Confirm' : 'Skip'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Fielding panel ─────────────────────────────────────────────────

const FIELDING_AUTO_MS = 6000;

function FieldingPanel({
  visible,
  runs,
  players,
  fieldingEvents,
  hideFielders,
  onDone,
}: {
  visible: boolean;
  runs: number;
  players: Player[];
  fieldingEvents: Array<{ id: string; label: string; wicketTypes?: string[] }>;
  hideFielders: boolean;
  onDone: (eventId: string | null, fielderIds: string[]) => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(400)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const [eventId, setEventId] = useState<string | null>(null);
  const [fielderIds, setFielderIds] = useState<string[]>([]);
  const isBoundary = runs === 4 || runs === 6;

  // Keep the latest selection + callback for the auto-dismiss timer.
  const selRef = useRef<{ eventId: string | null; fielderIds: string[] }>({ eventId: null, fielderIds: [] });
  selRef.current = { eventId, fielderIds };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Restart the auto-dismiss countdown (and progress bar). Called on open and
  // on every interaction so the panel only closes after the user is idle.
  const startCountdown = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(1);
    Animated.timing(progress, { toValue: 0, duration: FIELDING_AUTO_MS, useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished) onDoneRef.current(selRef.current.eventId, selRef.current.fielderIds);
      }
    );
  }, [progress]);

  useEffect(() => {
    if (visible) {
      setEventId(null);
      setFielderIds([]);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      startCountdown();
    } else {
      Animated.timing(slideY, { toValue: 400, duration: 200, useNativeDriver: true }).start();
      progress.stopAnimation();
    }
    return () => progress.stopAnimation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pickEvent = (id: string) => { setEventId((c) => (c === id ? null : id)); startCountdown(); };
  const toggleFielder = (id: string) => {
    setFielderIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    startCountdown();
  };
  const finish = () => { progress.stopAnimation(); onDone(eventId, fielderIds); };

  if (!visible) return null;

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const fielderSummary = fielderIds.length === 0
    ? 'None'
    : fielderIds.length === 1
      ? (players.find((p) => p.id === fielderIds[0])?.displayName ?? fielderIds[0])
      : `${players.find((p) => p.id === fielderIds[0])?.displayName?.split(' ')[0] ?? ''}${fielderIds.length > 1 ? ` +${fielderIds.length - 1}` : ''}`;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: '#00000066' }}
        activeOpacity={1}
        onPress={finish}
      />
      <Animated.View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 20 + insets.bottom, transform: [{ translateY: slideY }], maxHeight: 480 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 14 }} />

        <View style={{ height: 3, backgroundColor: theme.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
          <Animated.View style={{ height: 3, width: barWidth, backgroundColor: theme.accent }} />
        </View>

        {isBoundary && (
          <Text style={{ color: '#d97706', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 14 }}>
            {runs === 4 ? '⚡ FOUR!' : '💥 SIX!'}
          </Text>
        )}

        {fieldingEvents.length > 0 && (
          <>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>FIELDING EVENT</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {fieldingEvents.map((ev) => (
                <TouchableOpacity key={ev.id} onPress={() => pickEvent(ev.id)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: eventId === ev.id ? theme.accent : theme.surfaceAlt, borderWidth: 1, borderColor: eventId === ev.id ? theme.accent : theme.border }}>
                  <Text style={{ color: eventId === ev.id ? '#ffffff' : theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{ev.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {!hideFielders && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', flex: 1 }}>FIELDER(S) (optional)</Text>
              {fielderIds.length > 0 && (
                <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>{fielderSummary}</Text>
              )}
            </View>
            <ScrollView style={{ maxHeight: 160, marginBottom: 14 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {players.map((p) => {
                const selected = fielderIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => toggleFielder(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: selected ? theme.accentDim : theme.surfaceAlt, borderWidth: 1, borderColor: selected ? theme.accent : theme.border, marginBottom: 5 }}
                  >
                    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: selected ? theme.accent : theme.textMuted, backgroundColor: selected ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                      {selected && <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '900', lineHeight: 13 }}>✓</Text>}
                    </View>
                    <Text style={{ color: selected ? theme.accent : theme.textSecondary, fontSize: 14 }}>{p.displayName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <TouchableOpacity onPress={finish} style={{ backgroundColor: theme.accent, borderRadius: 10, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 15 }}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Extras runs picker ─────────────────────────────────────────────

const EXTRA_LABELS: Record<ExtrasType, string> = {
  wide: 'Wide',
  'no-ball': 'No ball',
  bye: 'Bye',
  'leg-bye': 'Leg bye',
};

function ExtrasRunsModal({
  type,
  onConfirm,
  onCancel,
}: {
  type: ExtrasType | null;
  onConfirm: (runRuns: number, runOut: boolean) => void;
  onCancel: () => void;
}) {
  const [runOut, setRunOut] = useState(false);
  useEffect(() => { if (type) setRunOut(false); }, [type]);

  if (!type) return null;
  const hasPenalty = type === 'wide' || type === 'no-ball';
  const prompt =
    type === 'wide' ? 'Runs completed before run-out (+1 wide)'
    : type === 'no-ball' ? 'Runs off the bat (+1 no-ball added)'
    : 'Runs taken';
  const normalPrompt =
    type === 'wide' ? 'Runs the batsmen ran (+1 wide added)'
    : type === 'no-ball' ? 'Runs off the bat (+1 no-ball added)'
    : 'Runs taken';
  // Byes/leg-byes are only signalled when runs are run, so default the picker to 1.
  const options = hasPenalty ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, width: 320 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            {EXTRA_LABELS[type]}{runOut ? ' + Run-out' : ''}
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 18 }}>
            {runOut ? prompt : normalPrompt}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {options.map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => onConfirm(n, runOut)}
                style={{
                  width: 56, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#1e2d45', borderWidth: 1.5, borderColor: '#2d3f58',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>
                  {hasPenalty ? `+${n}` : n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setRunOut((v) => !v)}
            style={{
              marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1,
              borderColor: runOut ? '#f87171' : '#2d3f58',
              backgroundColor: runOut ? '#2d0a0a' : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: runOut ? '#f87171' : '#9ca3af', fontWeight: '600' }}>
              {runOut ? 'Run-out  ✓' : 'Run-out?'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCancel}
            style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2d3f58', alignItems: 'center' }}
          >
            <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit overs modal ───────────────────────────────────────────────
// Mid-innings overs adjustment. minOvers is the number already bowled, so the
// limit can be raised freely but never cut below overs that have been played.

function EditOversModal({
  visible,
  current,
  minOvers,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  current: number;
  minOvers: number;
  onConfirm: (overs: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(current);

  useEffect(() => { if (visible) setValue(Math.max(current, minOvers)); }, [visible, current, minOvers]);

  const dec = () => setValue((v) => Math.max(minOvers, v - 1));
  const inc = () => setValue((v) => v + 1);
  const canDec = value > minOvers;
  const changed = value !== current;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, width: 320 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            Overs per innings
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
            Can be raised any time, but not below the {minOvers} over{minOvers !== 1 ? 's' : ''} already bowled.
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <TouchableOpacity
              onPress={dec}
              disabled={!canDec}
              style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1e2d45', borderWidth: 1.5, borderColor: canDec ? '#2d3f58' : '#162033',
              }}
            >
              <Text style={{ color: canDec ? '#ffffff' : '#374151', fontSize: 28, fontWeight: '800' }}>−</Text>
            </TouchableOpacity>

            <Text style={{ color: '#ffffff', fontSize: 44, fontWeight: '800', minWidth: 70, textAlign: 'center' }}>
              {value}
            </Text>

            <TouchableOpacity
              onPress={inc}
              style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1e2d45', borderWidth: 1.5, borderColor: '#2d3f58',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800' }}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => onConfirm(value)}
            disabled={!changed}
            style={{
              marginTop: 24, padding: 14, borderRadius: 10, alignItems: 'center',
              backgroundColor: changed ? '#4ade80' : '#1e2d45',
              borderWidth: changed ? 0 : 1, borderColor: '#2d3f58',
            }}
          >
            <Text style={{ color: changed ? '#0a1628' : '#9ca3af', fontWeight: '700' }}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} style={{ marginTop: 10, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Wicket sheet ───────────────────────────────────────────────────

const STD_LABELS: Record<StandardDismissalType, string> = {
  caught: 'Caught',
  bowled: 'Bowled',
  lbw: 'LBW',
  'run-out': 'Run Out',
  stumped: 'Stumped',
  'hit-wicket': 'Hit Wicket',
  'obstructing-field': 'Obstructing',
  'timed-out': 'Timed Out',
  'handled-ball': 'Handled Ball',
  'hit-ball-twice': 'Hit Twice',
};

const FIELDER_NEEDED: StandardDismissalType[] = ['caught', 'stumped', 'run-out'];
// These dismissals have no shot to plot, so the wagon wheel is skipped.
const NO_WAGON: StandardDismissalType[] = ['bowled', 'caught', 'run-out', 'stumped', 'hit-wicket'];
// Dismissals where a fielder is already captured on the wicket sheet, so the
// fielding overlay shouldn't ask for the fielder again.
const FIELDER_ALREADY_RECORDED: StandardDismissalType[] = ['caught', 'run-out', 'stumped'];

function WicketSheet({
  visible,
  enabledDismissals,
  customDismissals,
  fieldingPlayers,
  fieldingEvents,
  onSelect,
  onClose,
  forceRunOut,
  onStrikePlayer,
  offStrikePlayer,
}: {
  visible: boolean;
  enabledDismissals: StandardDismissalType[];
  customDismissals: Array<{ id: string; label: string; batterIsOut: boolean }>;
  fieldingPlayers: Player[];
  fieldingEvents: Array<{ id: string; label: string; wicketTypes?: string[] }>;
  onSelect: (type: string, fielderIds?: string[], completedRuns?: number, eventId?: string, dismissedId?: string) => void;
  onClose: () => void;
  forceRunOut?: boolean;
  onStrikePlayer?: { id: string; name: string };
  offStrikePlayer?: { id: string; name: string };
}) {
  const [step, setStep] = useState<'type' | 'fielder'>(forceRunOut ? 'fielder' : 'type');
  const [selectedType, setSelectedType] = useState<string | null>(forceRunOut ? 'run-out' : null);
  const [pickedFielders, setPickedFielders] = useState<string[]>([]);
  const [completedRuns, setCompletedRuns] = useState(0);
  const [catchFielderId, setCatchFielderId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | undefined>(onStrikePlayer?.id);
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(500)).current;
  const multiFielder = selectedType === 'run-out'; // run-outs can involve several fielders
  const isCaught = selectedType === 'caught';
  // Filter events by wicketTypes association: empty/absent means all supported types.
  const applicableEvents = fieldingEvents.filter((e) =>
    !e.wicketTypes || e.wicketTypes.length === 0 || e.wicketTypes.includes(selectedType ?? '')
  );
  // Only caught supports inline fielding event chip selection
  const hasSingleFielderEvents = isCaught && applicableEvents.length > 0;

  useEffect(() => {
    if (visible) {
      setStep(forceRunOut ? 'fielder' : 'type');
      setSelectedType(forceRunOut ? 'run-out' : null);
      setPickedFielders([]);
      setCompletedRuns(0);
      setCatchFielderId(null);
      setSelectedEventId(null);
      setDismissedId(onStrikePlayer?.id);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideY, { toValue: 500, duration: 200, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pickType = (type: string, needsFielder: boolean) => {
    if (needsFielder) {
      setSelectedType(type);
      setPickedFielders([]);
      setStep('fielder');
    } else {
      onSelect(type);
    }
  };

  const toggleFielder = (id: string) =>
    setPickedFielders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000066' }} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={{
          backgroundColor: '#0f1e35',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 20 + insets.bottom,
          transform: [{ translateY: slideY }],
          maxHeight: '70%',
        }}
      >
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2d3f58', alignSelf: 'center', marginBottom: 16 }} />
        <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
          {step === 'type' ? 'Wicket — how out?' : forceRunOut ? 'Run-out — select fielders' : multiFielder ? 'Select fielders involved' : 'Select fielder'}
        </Text>
        {step === 'fielder' && isCaught && (
          <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
            {hasSingleFielderEvents ? 'Select catcher, then optionally a fielding event' : 'Select catcher'}
          </Text>
        )}

        {step === 'type' ? (
          <ScrollView>
            {enabledDismissals.map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => pickType(type, FIELDER_NEEDED.includes(type))}
                style={{
                  padding: 14, borderRadius: 8, marginBottom: 8,
                  backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 15 }}>{STD_LABELS[type]}</Text>
              </TouchableOpacity>
            ))}
            {customDismissals.map((cd) => (
              <TouchableOpacity
                key={cd.id}
                onPress={() => onSelect(cd.id)}
                style={{
                  padding: 14, borderRadius: 8, marginBottom: 8,
                  backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 15 }}>{cd.label}</Text>
                {!cd.batterIsOut && (
                  <Text style={{ color: '#fbbf24', fontSize: 11 }}>batter stays</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : multiFielder ? (
          <>
            {onStrikePlayer && offStrikePlayer && (
              <>
                <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 8 }}>WHO WAS RUN OUT?</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[onStrikePlayer, offStrikePlayer].map((p) => {
                    const active = dismissedId === p.id;
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setDismissedId(p.id)} style={{
                        flex: 1, padding: 10, borderRadius: 8, alignItems: 'center',
                        backgroundColor: active ? '#2d0a0a' : '#1e2d45',
                        borderWidth: 1, borderColor: active ? '#f87171' : '#2d3f58',
                      }}>
                        <Text style={{ color: active ? '#f87171' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>{p.name}</Text>
                        <Text style={{ color: active ? '#f87171' : '#6b7280', fontSize: 10, marginTop: 2 }}>{active ? 'dismissed' : p.id === onStrikePlayer.id ? 'on strike' : 'non-striker'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {!forceRunOut && (
              <>
                <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>RUNS COMPLETED</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[0, 1, 2, 3].map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setCompletedRuns(r)}
                      style={{
                        width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: completedRuns === r ? '#4ade80' : '#1e2d45',
                        borderWidth: 1, borderColor: completedRuns === r ? '#4ade80' : '#2d3f58',
                      }}
                    >
                      <Text style={{ color: completedRuns === r ? '#0a1628' : '#d1d5db', fontSize: 16, fontWeight: '700' }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <FlatList
              data={fieldingPlayers}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const picked = pickedFielders.includes(item.id);
                return (
                  <TouchableOpacity
                    onPress={() => toggleFielder(item.id)}
                    style={{
                      padding: 14, borderRadius: 8, marginBottom: 8,
                      backgroundColor: picked ? '#0d2e1a' : '#1e2d45',
                      borderWidth: 1, borderColor: picked ? '#4ade80' : '#2d3f58',
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 15 }}>{item.displayName}</Text>
                    {picked && <Text style={{ color: '#4ade80', fontSize: 14, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            {pickedFielders.length > 0 && applicableEvents.length > 0 && (
              <>
                <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
                  FIELDING EVENT (OPTIONAL)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {applicableEvents.map((ev) => {
                    const active = selectedEventId === ev.id;
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        onPress={() => setSelectedEventId(active ? null : ev.id)}
                        style={{
                          paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
                          backgroundColor: active ? '#4ade80' : '#1e2d45',
                          borderWidth: 1, borderColor: active ? '#4ade80' : '#2d3f58',
                        }}
                      >
                        <Text style={{ color: active ? '#0a1628' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>
                          {ev.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <TouchableOpacity
              onPress={() => onSelect(selectedType!, pickedFielders, completedRuns, selectedEventId ?? undefined, dismissedId)}
              disabled={pickedFielders.length === 0}
              style={{
                backgroundColor: pickedFielders.length > 0 ? '#4ade80' : '#2d3f58',
                borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4,
              }}
            >
              <Text style={{ color: pickedFielders.length > 0 ? '#0a1628' : '#6b7280', fontWeight: '700', fontSize: 15 }}>
                Done ({pickedFielders.length})
              </Text>
            </TouchableOpacity>
          </>
        ) : hasSingleFielderEvents ? (
          <>
            <FlatList
              data={fieldingPlayers}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const picked = catchFielderId === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => { setCatchFielderId(item.id); setSelectedEventId(null); }}
                    style={{
                      padding: 14, borderRadius: 8, marginBottom: 8,
                      backgroundColor: picked ? '#0d2e1a' : '#1e2d45',
                      borderWidth: 1, borderColor: picked ? '#4ade80' : '#2d3f58',
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 15 }}>{item.displayName}</Text>
                    {picked && <Text style={{ color: '#4ade80', fontSize: 14, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            {catchFielderId && (
              <>
                <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: 4 }}>
                  FIELDING EVENT (OPTIONAL)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {applicableEvents.map((ev) => {
                    const active = selectedEventId === ev.id;
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        onPress={() => setSelectedEventId(active ? null : ev.id)}
                        style={{
                          paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
                          backgroundColor: active ? '#4ade80' : '#1e2d45',
                          borderWidth: 1, borderColor: active ? '#4ade80' : '#2d3f58',
                        }}
                      >
                        <Text style={{ color: active ? '#0a1628' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>
                          {ev.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <TouchableOpacity
              onPress={() => onSelect(selectedType!, catchFielderId ? [catchFielderId] : [], undefined, selectedEventId ?? undefined)}
              disabled={!catchFielderId}
              style={{
                backgroundColor: catchFielderId ? '#4ade80' : '#2d3f58',
                borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4,
              }}
            >
              <Text style={{ color: catchFielderId ? '#0a1628' : '#6b7280', fontWeight: '700', fontSize: 15 }}>
                Done
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <FlatList
            data={fieldingPlayers}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelect(selectedType!, [item.id])}
                style={{
                  padding: 14, borderRadius: 8, marginBottom: 8,
                  backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 15 }}>{item.displayName}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Select player modal ─────────────────────────────────────────────

function SelectPlayerModal({
  visible,
  title,
  players,
  excludeIds,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  players: Player[];
  excludeIds: string[];
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const available = players.filter((p) => !excludeIds.includes(p.id));
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
        {onClose && <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />}
        <View style={{ backgroundColor: '#0f1e35', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 24 + insets.bottom, maxHeight: '60%' }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2d3f58', alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 16 }}>{title}</Text>
          <FlatList
            data={available}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelect(item.id)}
                style={{
                  padding: 14, borderRadius: 8, marginBottom: 8,
                  backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 15 }}>{item.displayName}</Text>
              </TouchableOpacity>
            )}
          />
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ padding: 12, alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Ball circles ────────────────────────────────────────────────────

function BallCircle({ ball }: { ball: BallEntry }) {
  const theme = useThemeStore((s) => s.theme);
  const isDot = ball.runs === 0 && !ball.extras && !ball.dismissal;
  const isWicket = !!ball.dismissal;
  const isWide = ball.extras?.type === 'wide';
  const isNoBall = ball.extras?.type === 'no-ball';
  const isFour = ball.runs === 4 && !ball.extras;
  const isSix = ball.runs === 6 && !ball.extras;

  const sixBg = theme.id === 'light' ? '#ede9fe' : '#2d1a5f';
  const bg = isWicket ? '#dc2626' : isSix ? sixBg : isFour ? theme.accentDim : theme.surface;
  const border = isWicket ? '#dc2626' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.border;
  const textColor = isWicket ? '#ffffff' : isSix ? '#a78bfa' : isFour ? theme.accent : theme.textSecondary;
  const label = isWicket
    ? 'W'
    : isWide
    ? `W${ball.extras!.runs > 1 ? ball.extras!.runs : ''}`
    : isNoBall
    ? `NB${ball.runs > 0 ? `+${ball.runs}` : ''}`
    : isDot
    ? '•'
    : String(ball.runs + (ball.extras?.runs ?? 0));

  return (
    <View
      style={{
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: bg,
        borderWidth: 1.5, borderColor: border,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 6,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Score header ─────────────────────────────────────────────────────

function ScoreHeader({
  runs, wickets, overNumber, legalBalls, ballsPerOver, matchName,
}: {
  runs: number; wickets: number; overNumber: number; legalBalls: number; ballsPerOver: number; matchName: string;
}) {
  const theme = useThemeStore((s) => s.theme);
  const oversDisplay = `${overNumber}.${legalBalls}`;
  const ballsBowled = overNumber * ballsPerOver + legalBalls;
  const crr = ballsBowled > 0 ? ((runs * ballsPerOver) / ballsBowled).toFixed(2) : '0.00';
  return (
    <View style={{ backgroundColor: theme.surface, padding: 20, paddingTop: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 4 }}>{matchName}</Text>
      <Text style={{ color: theme.text, fontSize: 52, fontWeight: '800', textAlign: 'center', lineHeight: 58 }}>
        {runs}<Text style={{ color: theme.textMuted, fontSize: 32, fontWeight: '600' }}>/{wickets}</Text>
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 16, textAlign: 'center' }}>
        {oversDisplay} ov{ballsPerOver !== 6 ? ` (${ballsPerOver} ball overs)` : ''} · CRR {crr}
      </Text>
    </View>
  );
}

// ─── Batter row ───────────────────────────────────────────────────────

function BatterRow({
  player,
  stats,
  onStrike,
  hand,
  onToggleHand,
  onEdit,
  showStrikeHint,
}: {
  player: Player | undefined;
  stats: BatterStats;
  onStrike: boolean;
  hand: 'RHB' | 'LHB';
  onToggleHand: () => void;
  onEdit?: () => void;
  showStrikeHint?: boolean;
}) {
  const theme = useThemeStore((s) => s.theme);
  const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '–';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      {/* Strike bar */}
      <View
        style={{
          width: 4, height: 36, borderRadius: 2,
          backgroundColor: onStrike ? theme.accent : 'transparent',
          marginRight: 10,
          shadowColor: onStrike ? theme.accent : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: onStrike ? 0.9 : 0,
          shadowRadius: 6,
        }}
      />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
            {player?.displayName ?? '–'}
          </Text>
          {onStrike ? (
            <View style={{ backgroundColor: theme.accentDim, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '700' }}>ON STRIKE</Text>
            </View>
          ) : showStrikeHint ? (
            <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '600', fontStyle: 'italic' }}>tap to face</Text>
          ) : null}
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
          SR {sr} · {stats.fours}×4 · {stats.sixes}×6
        </Text>
      </View>

      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 4 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={onToggleHand}
        style={{
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
          marginRight: 14,
        }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>{hand}</Text>
      </TouchableOpacity>

      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', minWidth: 36, textAlign: 'right' }}>
        {stats.runs}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, marginLeft: 2, minWidth: 28 }}>
        ({stats.balls})
      </Text>
    </View>
  );
}

// ─── Bowler row ───────────────────────────────────────────────────────

function BowlerRow({
  player,
  stats,
  ballsPerOver,
  onEdit,
}: {
  player: Player | undefined;
  stats: BowlerStats;
  ballsPerOver: number;
  onEdit?: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const oversFull = stats.completedOvers + (stats.legalBalls % ballsPerOver) / 10;
  const economy = stats.legalBalls > 0
    ? ((stats.runsConceded / stats.legalBalls) * ballsPerOver).toFixed(1)
    : '–';
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: theme.surfaceAlt,
        borderBottomWidth: 1, borderBottomColor: theme.border,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 13, marginRight: 8 }}>🎯</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1 }}>{player?.displayName ?? '–'}</Text>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 6 }}>
          <Text style={{ color: theme.accent, fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        {oversFull.toFixed(1)}-0-{stats.runsConceded}-{stats.wickets}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 10 }}>econ {economy}</Text>
    </View>
  );
}

// ─── Dismissal text ──────────────────────────────────────────────────

function buildDismissalText(d: DismissalEntry, getName: (id: string) => string): string {
  const bowler = d.bowlerId ? getName(d.bowlerId) : '';
  const fielderIds = d.fielderIds ?? (d.fielderId ? [d.fielderId] : []);
  const fielder = fielderIds.map(getName).join(' & ');
  switch (d.type) {
    case 'bowled': return `b ${bowler}`;
    case 'lbw': return `lbw b ${bowler}`;
    case 'caught': return fielder ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`;
    case 'stumped': return `st ${fielder} b ${bowler}`;
    case 'run-out': return fielder ? `run out (${fielder})` : 'run out';
    case 'hit-wicket': return `hit wkt b ${bowler}`;
    case 'obstructing-field': return 'obstructing field';
    case 'timed-out': return 'timed out';
    default: return d.type;
  }
}

// ─── Scorecard ───────────────────────────────────────────────────────

function Scorecard({
  inn,
  playerMap,
  ballsPerOver,
}: {
  inn: InningsState;
  playerMap: Record<string, Player | undefined>;
  ballsPerOver: number;
}) {
  const theme = useThemeStore((s) => s.theme);
  const oversBowled = `${inn.overNumber}.${inn.legalBallsInOver}`;
  const batters = inn.battingIds.filter((id) => {
    const s = inn.batterStats[id];
    return !!s && (s.balls > 0 || s.runs > 0 || s.isOut || id === inn.onStrikeId || id === inn.offStrikeId);
  });
  const bowlers = inn.bowlingIds.filter((id) => !!inn.bowlerStats[id]);
  const num = { width: 38, textAlign: 'right' as const, color: theme.textSecondary, fontSize: 13 };
  const bnum = { width: 44, textAlign: 'right' as const, color: theme.textSecondary, fontSize: 13 };
  const head = { textAlign: 'right' as const, color: theme.textMuted, fontSize: 11 };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>
        {inn.totalRuns}/{inn.totalWickets}{' '}
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>({oversBowled} ov)</Text>
      </Text>

      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>BATTING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11 }}>Batter</Text>
        {['R', 'B', '4s', '6s', 'SR'].map((h) => <Text key={h} style={{ ...head, width: 38 }}>{h}</Text>)}
      </View>
      {batters.map((id) => {
        const s = inn.batterStats[id];
        const onStrike = id === inn.onStrikeId;
        const atCrease = onStrike || id === inn.offStrikeId;
        const status = s.isOut ? (s.dismissalText ?? 'out') : atCrease ? 'not out' : '';
        const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(0) : '–';
        return (
          <View key={id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {playerMap[id]?.displayName ?? id}
                {onStrike ? <Text style={{ color: theme.accent, fontWeight: '700' }}> *</Text> : null}
              </Text>
              {status ? <Text style={{ color: s.isOut ? theme.textMuted : theme.accent, fontSize: 10 }}>{status}</Text> : null}
            </View>
            <Text style={num}>{s.runs}</Text>
            <Text style={num}>{s.balls}</Text>
            <Text style={num}>{s.fours}</Text>
            <Text style={num}>{s.sixes}</Text>
            <Text style={num}>{sr}</Text>
          </View>
        );
      })}

      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 6 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: theme.textMuted, fontSize: 11 }}>Bowler</Text>
        {['O', 'R', 'W', 'Econ'].map((h) => <Text key={h} style={{ ...head, width: 44 }}>{h}</Text>)}
      </View>
      {bowlers.map((id) => {
        const b = inn.bowlerStats[id];
        const overs = `${Math.floor(b.legalBalls / ballsPerOver)}.${b.legalBalls % ballsPerOver}`;
        const econ = b.legalBalls > 0 ? (b.runsConceded / (b.legalBalls / ballsPerOver)).toFixed(1) : '–';
        return (
          <View key={id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: 13 }}>{playerMap[id]?.displayName ?? id}</Text>
            <Text style={bnum}>{overs}</Text>
            <Text style={bnum}>{b.runsConceded}</Text>
            <Text style={bnum}>{b.wickets}</Text>
            <Text style={bnum}>{econ}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Teams tab ───────────────────────────────────────────────────────

function TeamsTab({
  match,
  players,
  isAdmin,
  matchHasStarted,
  clubId,
  matchId,
  navigation,
  showSubPicker,
  setShowSubPicker,
  onSubstituteAdded,
  onSubstituteRemoved,
}: {
  match: Match | null;
  players: Player[];
  isAdmin: boolean;
  matchHasStarted: boolean;
  clubId: string;
  matchId: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  showSubPicker: boolean;
  setShowSubPicker: (v: boolean) => void;
  onSubstituteAdded: (playerId: string) => void;
  onSubstituteRemoved: (playerId: string) => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const playerMap = new Map([
    ...players.map((p): [string, string] => [p.id, p.displayName]),
    ...players.flatMap((p): [string, string][] => p.linkedGhost ? [[p.linkedGhost.ghostId, p.displayName]] : []),
  ]);
  const teamA = match?.teamA ?? [];
  const teamB = match?.teamB ?? [];
  const captainA = match?.captainA;
  const captainB = match?.captainB;
  const substituteIds = match?.substitutes ?? [];

  const substituteablePlayers = players.filter(
    (p) => !substituteIds.includes(p.id)
  );

  async function handleAddSub(playerId: string) {
    if (!match) return;
    try {
      await addSubstitute(clubId, matchId, playerId);
      onSubstituteAdded(playerId);
    } catch { /* ignore */ }
    setShowSubPicker(false);
  }

  async function handleRemoveSub(playerId: string) {
    if (!match) return;
    try {
      await removeSubstitute(clubId, matchId, playerId);
      onSubstituteRemoved(playerId);
    } catch { /* ignore */ }
  }

  function renderTeam(ids: string[], label: string, color: string, captainId?: string) {
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12 }}>{label}</Text>
          </View>
          <Text style={{ color: color === '#60a5fa' ? '#2563eb' : '#f97316', fontSize: 15, fontWeight: '700' }}>
            {label === 'A' ? (match?.homeTeam ?? 'Team A') : (match?.awayTeam ?? 'Team B')} ({ids.length})
          </Text>
        </View>
        {ids.length === 0 ? (
          <Text style={{ color: theme.textMuted, fontSize: 13, paddingLeft: 30 }}>No players assigned</Text>
        ) : (
          ids.map((id) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{playerMap.get(id) ?? id}</Text>
              {captainId === id && (
                <View style={{ backgroundColor: theme.id === 'light' ? '#fef9c3' : '#3b2f0a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#fbbf24' }}>
                  <Text style={{ color: '#d97706', fontSize: 10, fontWeight: '700' }}>C</Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}>
      {isAdmin && !matchHasStarted && (
        <TouchableOpacity
          onPress={() => navigation.navigate('TeamBuilder', { clubId, matchId, returnTo: 'LiveScoring' })}
          style={{ backgroundColor: theme.accentDim, borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: theme.accent }}
        >
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14 }}>Edit Teams</Text>
        </TouchableOpacity>
      )}

      {renderTeam(teamA, 'A', '#60a5fa', captainA)}
      {renderTeam(teamB, 'B', '#f97316', captainB)}

      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }}>
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>SUBSTITUTES</Text>
        {substituteIds.length === 0 && (
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 10 }}>No substitutes added</Text>
        )}
        {substituteIds.map((id) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{playerMap.get(id) ?? id}</Text>
            <View style={{ backgroundColor: theme.id === 'light' ? '#f0fdf4' : '#0a2a1a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#22c55e', marginRight: 8 }}>
              <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '700' }}>SUB</Text>
            </View>
            {isAdmin && (
              <TouchableOpacity onPress={() => handleRemoveSub(id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: theme.textMuted, fontSize: 16, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {isAdmin && (
          <TouchableOpacity
            onPress={() => setShowSubPicker(true)}
            style={{ borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>+ Add Substitute</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showSubPicker} transparent animationType="slide" onRequestClose={() => setShowSubPicker(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 20 + insets.bottom, maxHeight: '70%' }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>Add Substitute</Text>
            <ScrollView>
              {substituteablePlayers.length === 0 ? (
                <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>All players are already substitutes</Text>
              ) : (
                substituteablePlayers.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleAddSub(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: theme.surfaceAlt, borderRadius: 8, marginBottom: 6 }}
                  >
                    <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{p.displayName}</Text>
                    {teamA.includes(p.id) && <Text style={{ color: '#60a5fa', fontSize: 11, fontWeight: '700' }}>Team A</Text>}
                    {teamB.includes(p.id) && <Text style={{ color: '#f97316', fontSize: 11, fontWeight: '700' }}>Team B</Text>}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowSubPicker(false)} style={{ marginTop: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function emptyBatterStats(): BatterStats {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
}

function emptyBowlerStats(): BowlerStats {
  return { legalBalls: 0, completedOvers: 0, runsConceded: 0, wickets: 0 };
}

// ─── Main screen ─────────────────────────────────────────────────────

type Phase = 'loading' | 'no-match' | 'scoring' | 'new-bowler' | 'new-batter' | 'innings-over';

export default function LiveScoringScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'LiveScoring'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { clubId, matchId } = route.params;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const [isAdmin, setIsAdmin] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  // Rules read live from the club — match.rules is a snapshot taken at schedule
  // time, so dismissals / fielding events edited later wouldn't otherwise show.
  const [clubRules, setClubRules] = useState<ClubRules | null>(null);
  const [innings, setInnings] = useState<InningsState | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  // Innings tracking. firstInningsRuns is the total to chase in the 2nd innings.
  const [inningsNumber, setInningsNumber] = useState<1 | 2>(1);
  const [firstInningsRuns, setFirstInningsRuns] = useState<number | null>(null);
  const [firstInnings, setFirstInnings] = useState<InningsState | null>(null);
  // Top-of-screen tab + which innings the scorecard shows.
  const [tab, setTab] = useState<'scoring' | 'scorecard' | 'stats' | 'teams'>('scoring');
  const [cardInnings, setCardInnings] = useState<1 | 2>(1);
  useEffect(() => { setCardInnings(inningsNumber); }, [inningsNumber]);
  const [showSubPicker, setShowSubPicker] = useState(false);

  // Pending ball flow
  const pendingInputRef = useRef<BallInput | null>(null);
  const pendingWagonRef = useRef<WagonShot | null>(null);
  const pendingFieldingRef = useRef<{ eventId?: string; eventLabel?: string; fielderIds?: string[] } | null>(null);
  const [showWagon, setShowWagon] = useState(false);
  const [showFielding, setShowFielding] = useState(false);
  // Hide the fielder picker when the wicket sheet already captured the fielder
  // (caught / run-out) so we don't ask for it twice.
  const [hideFieldingFielders, setHideFieldingFielders] = useState(false);
  const [pendingRuns, setPendingRuns] = useState(0);
  // Which end a replacement batter enters at — flips to 'offStrike' when an odd
  // number of runs is completed on a run-out (the batters crossed).
  const newBatterEndRef = useRef<'onStrike' | 'offStrike'>('onStrike');
  // Set when a wicket falls on the last ball of an over — handleNewBatter
  // chains to 'new-bowler' instead of 'scoring' after selecting the batter.
  const needsNewBowlerAfterBatterRef = useRef(false);
  // Monotonic counter written onto every BallDoc so they can be sorted
  // without relying on Firestore server timestamps.
  const seqRef = useRef(0);
  // ID of the last saved ball doc — used by handleNewBatter to updateDoc
  // with nextBatsmanId without needing to re-fetch from Firestore.
  const lastBallIdRef = useRef<string | null>(null);
  // Guards against writing status:'completed' more than once for this match
  // (e.g. re-focusing the screen while phase is still 'innings-over').
  const sealedRef = useRef(false);
  // Set right before an undo that deletes the sole ball of the active over,
  // landing back on the previous over's last ball. Firestore has no memory of
  // *why* the last ball is isLastBallOfOver=true, so without this the reload
  // would re-show the bowler-selection overlay even though we're undoing, not
  // advancing. Consumed once by the next load() to resume 'scoring' with the
  // same bowler instead — the overlay reappears normally once the scorer
  // re-completes the over going forward.
  const undoBowlerOverrideRef = useRef<string | null>(null);

  // Modals
  const [showWicket, setShowWicket] = useState(false);
  const [pendingExtra, setPendingExtra] = useState<ExtrasType | null>(null);
  const [pendingExtraRunOut, setPendingExtraRunOut] = useState<{ extraType: ExtrasType; extraRuns: number } | null>(null);
  const [changeTarget, setChangeTarget] = useState<'onStrike' | 'offStrike' | 'bowler' | null>(null);
  const [showEditOvers, setShowEditOvers] = useState(false);

  // ── Load data ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const [liveMatch, clubPlayers, club, member] = await Promise.all([
        getMatch(clubId, matchId),
        getClubPlayers(clubId),
        getClub(clubId),
        user ? getClubMember(clubId, user.uid) : Promise.resolve(null),
      ]);
      setIsAdmin(member?.role === 'admin');
      if (!liveMatch || (liveMatch.status !== 'live' && liveMatch.status !== 'scheduled')) {
        setPhase('no-match');
        return;
      }
      setMatch(liveMatch);
      setPlayers(clubPlayers);
      setClubRules(club?.rules ?? liveMatch.rules);

      const lastManStands = club?.rules.lastManStands ?? liveMatch.rules.lastManStands;
      const oversPerInnings = liveMatch.rules.oversPerInnings;

      const allBalls = await getMatchBalls(clubId, liveMatch.id);

      if (allBalls.length === 0) {
        setInningsNumber(1);
        beginInnings(liveMatch, 1);
        return;
      }

      // Initialise the monotonic counter from the last stored seq so writes
      // that follow never collide with existing ball docs.
      seqRef.current = allBalls[allBalls.length - 1].seq + 1;
      lastBallIdRef.current = allBalls[allBalls.length - 1].id;

      const autoRotateEoO = club?.rules.autoRotateStrikeEoO ?? liveMatch.rules.autoRotateStrikeEoO ?? true;
      const firstBalls = allBalls.filter((b) => b.inningsId === 'innings-1');
      const secondBalls = allBalls.filter((b) => b.inningsId === 'innings-2');

      if (secondBalls.length > 0) {
        const firstInn = buildInningsFromBalls(firstBalls, liveMatch, 1, clubPlayers, autoRotateEoO);
        setFirstInnings(firstInn);
        setFirstInningsRuns(firstInn.totalRuns);
        setInningsNumber(2);
        const reconstructed = buildInningsFromBalls(secondBalls, liveMatch, 2, clubPlayers, autoRotateEoO);
        const chased = reconstructed.totalRuns >= firstInn.totalRuns + 1;
        const resolvedPhase = resumePhaseFromBalls(secondBalls, reconstructed, chased || isInningsComplete(reconstructed, lastManStands, oversPerInnings));
        applyResolvedPhase(reconstructed, resolvedPhase);
      } else {
        setInningsNumber(1);
        const reconstructed = buildInningsFromBalls(firstBalls, liveMatch, 1, clubPlayers, autoRotateEoO);
        const resolvedPhase = resumePhaseFromBalls(firstBalls, reconstructed, isInningsComplete(reconstructed, lastManStands, oversPerInnings));
        applyResolvedPhase(reconstructed, resolvedPhase);
      }
    } catch {
      setPhase('no-match');
    }
  }, [clubId, matchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A new matchId means a different match instance — allow it to be sealed too.
  useEffect(() => { sealedRef.current = false; }, [clubId, matchId]);

  // Second innings complete (all out / overs done / target chased) → the match
  // itself is over. Persist status:'completed' so onMatchCompleted can
  // aggregate career stats — previously this only ever changed local phase
  // state, leaving matches stuck as 'live' in Firestore forever.
  useEffect(() => {
    if (phase !== 'innings-over' || inningsNumber !== 2 || !match || sealedRef.current) return;
    sealedRef.current = true;
    completeMatch(clubId, match.id, computeResultLine() || undefined).catch(() => {
      sealedRef.current = false;
    });
  }, [phase, inningsNumber, match, clubId]);

  function isInningsComplete(inn: InningsState, lastManStands: boolean, oversPerInnings?: number): boolean {
    const wicketsToEnd = inn.battingIds.length - (lastManStands ? 0 : 1);
    const allOut = inn.totalWickets >= wicketsToEnd;
    const oversDone = oversPerInnings != null && inn.overNumber >= oversPerInnings;
    return allOut || oversDone;
  }

  // Determines the phase to resume after reloading ball docs.
  function resumePhaseFromBalls(balls: BallDoc[], inn: InningsState, isComplete: boolean): Phase {
    if (isComplete) return 'innings-over';
    const last = balls[balls.length - 1];
    if (!last) return 'scoring';
    if (last.dismissal) {
      const replacementNeeded = !last.dismissal.nextBatsmanId;
      if (replacementNeeded) {
        // computeNextBatsmen puts the survivor in the non-empty slot and leaves
        // the dismissed player's slot empty ('').  The replacement fills that slot.
        newBatterEndRef.current = inn.onStrikeId === '' ? 'onStrike' : 'offStrike';
        needsNewBowlerAfterBatterRef.current = last.isLastBallOfOver;
        return 'new-batter';
      }
    }
    if (last.isLastBallOfOver) return 'new-bowler';
    return 'scoring';
  }

  // Commits a reconstructed innings + resumed phase, applying the pending
  // undo-bowler-override (if any) so undoing back into a completed over
  // doesn't re-prompt for a bowler (see undoBowlerOverrideRef).
  function applyResolvedPhase(reconstructed: InningsState, resolvedPhase: Phase) {
    const overrideBowlerId = undoBowlerOverrideRef.current;
    undoBowlerOverrideRef.current = null;
    if (resolvedPhase === 'new-bowler' && overrideBowlerId) {
      setInnings({ ...reconstructed, bowlerId: overrideBowlerId });
      setPhase('scoring');
      return;
    }
    setInnings(reconstructed);
    setPhase(resolvedPhase);
  }

  // Builds InningsState from BallDocs.
  // Stats are replayed from ball documents; crease state is computed from the last ball.
  function buildInningsFromBalls(
    balls: BallDoc[],
    m: Match,
    n: number,
    localPlayers: Player[] = [],
    autoRotateEoO: boolean,
  ): InningsState {
    const battingIds = battingForInnings(m, n);
    const bowlingIds = bowlingForInnings(m, n);
    const localNameMap = Object.fromEntries(localPlayers.map((p) => [p.id, p.displayName]));

    const batterStats: Record<string, BatterStats> = {};
    const bowlerStats: Record<string, BowlerStats> = {};
    const bowlerCompletedOvers = new Map<string, Set<number>>();

    for (const ball of balls) {
      // Runs and balls credited to the on-striker (batsmanId)
      if (!batterStats[ball.batsmanId]) batterStats[ball.batsmanId] = emptyBatterStats();
      const bat = batterStats[ball.batsmanId];
      const isLegal = ball.extras?.type !== 'wide' && ball.extras?.type !== 'no-ball';
      bat.runs += ball.runs;
      if (isLegal) bat.balls++;
      if (ball.runs === 4 && !ball.extras) bat.fours++;
      if (ball.runs === 6 && !ball.extras) bat.sixes++;

      // Dismissal attributed to outBatsmanId (on-striker or non-striker)
      if (ball.dismissal) {
        const outId = ball.dismissal.outBatsmanId;
        if (!batterStats[outId]) batterStats[outId] = emptyBatterStats();
        const dismissedBat = batterStats[outId];
        dismissedBat.isOut = true;
        const getName = (id: string) => localNameMap[id] ?? id;
        dismissedBat.dismissalText = buildDismissalText(
          { type: ball.dismissal.type, fielderIds: ball.dismissal.fielderIds, bowlerId: ball.bowlerId },
          getName,
        );
      }

      // Bowler stats
      if (!bowlerStats[ball.bowlerId]) bowlerStats[ball.bowlerId] = emptyBowlerStats();
      const bow = bowlerStats[ball.bowlerId];
      const extrasType = ball.extras?.type;
      const byeLB = (extrasType === 'bye' || extrasType === 'leg-bye') ? (ball.extras?.runs ?? 0) : 0;
      const isWideNoBall = extrasType === 'wide' || extrasType === 'no-ball';
      bow.runsConceded += ball.runs + (isWideNoBall ? (ball.extras?.runs ?? 0) : 0) - byeLB;
      if (isLegal) bow.legalBalls++;
      if (ball.dismissal) bow.wickets++;
      if (ball.isLastBallOfOver) {
        if (!bowlerCompletedOvers.has(ball.bowlerId)) bowlerCompletedOvers.set(ball.bowlerId, new Set());
        bowlerCompletedOvers.get(ball.bowlerId)!.add(ball.overNumber);
      }
    }

    for (const [bowlerId, overs] of bowlerCompletedOvers) {
      if (!bowlerStats[bowlerId]) bowlerStats[bowlerId] = emptyBowlerStats();
      bowlerStats[bowlerId].completedOvers = overs.size;
    }

    const lastBall = balls[balls.length - 1];

    // Compute crease state from the last ball using rotation logic
    const lastOverNumber = lastBall?.overNumber ?? 0;
    const activeOverNumber = lastBall?.isLastBallOfOver ? lastOverNumber + 1 : lastOverNumber;

    // Count legal balls in the current (active) over
    const legalBallsInCurrentOver = balls.filter(
      (b) => b.overNumber === activeOverNumber && b.extras?.type !== 'wide' && b.extras?.type !== 'no-ball',
    ).length;

    // Derive on-striker and non-striker after the last ball
    let onStrikeId = '';
    let offStrikeId = '';
    let currentBowlerId = '';

    if (lastBall) {
      const isLoneBatter = lastBall.nonStrikerId === '';
      const next = computeNextBatsmen(lastBall, autoRotateEoO, isLoneBatter);
      onStrikeId = next.onStrikeId;
      offStrikeId = next.offStrikeId;
      currentBowlerId = lastBall.isLastBallOfOver ? '' : lastBall.bowlerId;
    }

    // Seed empty stats for current crease pair
    if (onStrikeId && !batterStats[onStrikeId]) batterStats[onStrikeId] = emptyBatterStats();
    if (offStrikeId && !batterStats[offStrikeId]) batterStats[offStrikeId] = emptyBatterStats();

    // Current over balls (for display in the scoring row)
    const currentOverBalls: BallEntry[] = balls
      .filter((b) => b.overNumber === activeOverNumber && !b.isLastBallOfOver)
      .map((b) => ({
        batsmanId: b.dismissal?.nonStrikerOut ? b.nonStrikerId : b.batsmanId,
        runs: b.runs,
        extras: b.extras as BallEntry['extras'],
        dismissal: b.dismissal ? { type: b.dismissal.type, fielderIds: b.dismissal.fielderIds } : undefined,
        wagon: b.wagon,
        fielding: b.fielding,
        onStrikeId: b.dismissal?.nonStrikerOut ? b.batsmanId : undefined,
      }));

    // Count total wickets = number of balls with dismissals
    const totalWickets = balls.filter((b) => !!b.dismissal).length;
    // Count total runs = sum of all runs + extras
    const totalRuns = balls.reduce((acc, b) => acc + b.runs + (b.extras?.runs ?? 0), 0);

    return {
      inningsId: `innings-${n}`,
      battingIds,
      bowlingIds,
      totalRuns,
      totalWickets,
      overNumber: activeOverNumber,
      legalBallsInOver: legalBallsInCurrentOver,
      onStrikeId,
      offStrikeId,
      bowlerId: currentBowlerId,
      batterStats,
      bowlerStats,
      currentOverBalls,
      handedness: {},
    };
  }

  // Computes who should face the next delivery after a given ball.
  function computeNextBatsmen(
    ball: BallDoc,
    autoRotateEoO: boolean,
    isLoneBatter: boolean,
  ): { onStrikeId: string; offStrikeId: string } {
    const physRuns = (ball.extras?.type === 'wide' || ball.extras?.type === 'no-ball')
      ? ball.runs + (ball.extras?.runs ?? 0) - 1
      : ball.runs;

    if (ball.dismissal && !isLoneBatter) {
      const isNonStrikerOut = ball.dismissal.nonStrikerOut;
      const crossedOnRunOut = physRuns % 2 !== 0;
      const eooSwap = ball.isLastBallOfOver && autoRotateEoO;
      const survivorIsOnStrike = (isNonStrikerOut !== crossedOnRunOut) !== eooSwap;
      const survivorId = isNonStrikerOut ? ball.batsmanId : ball.nonStrikerId;
      const replacementId = ball.dismissal.nextBatsmanId ?? '';
      return survivorIsOnStrike
        ? { onStrikeId: survivorId, offStrikeId: replacementId }
        : { onStrikeId: replacementId, offStrikeId: survivorId };
    }

    let onStrike = ball.batsmanId;
    let offStrike = ball.nonStrikerId;
    if (!isLoneBatter) {
      const runRotate = physRuns % 2 !== 0;
      const eooRotate = ball.isLastBallOfOver && autoRotateEoO;
      if (runRotate !== eooRotate) [onStrike, offStrike] = [offStrike, onStrike];
    }
    return { onStrikeId: onStrike, offStrikeId: offStrike };
  }

  function firstInningsBatters(m: Match): string[] {
    if (!m.toss) return m.teamA ?? [];
    const tossWinnerBats =
      (m.toss.winnerId === 'homeTeam' && m.toss.choice === 'bat') ||
      (m.toss.winnerId === 'awayTeam' && m.toss.choice === 'field');
    return tossWinnerBats ? (m.teamA ?? []) : (m.teamB ?? []);
  }

  function firstInningsBowlers(m: Match): string[] {
    if (!m.toss) return m.teamB ?? [];
    const tossWinnerBats =
      (m.toss.winnerId === 'homeTeam' && m.toss.choice === 'bat') ||
      (m.toss.winnerId === 'awayTeam' && m.toss.choice === 'field');
    return tossWinnerBats ? (m.teamB ?? []) : (m.teamA ?? []);
  }

  // Teams swap for the 2nd innings: who bowled first now bats, and vice versa.
  function battingForInnings(m: Match, n: number): string[] {
    return n === 1 ? firstInningsBatters(m) : firstInningsBowlers(m);
  }
  function bowlingForInnings(m: Match, n: number): string[] {
    return n === 1 ? firstInningsBowlers(m) : firstInningsBatters(m);
  }

  // 2nd-innings match result, e.g. "Team <captain name> won by 12 runs 🏆".
  // Falls back to the home/away team name when no captain is set. Shared by
  // the innings-over screen and the auto-complete effect (written to match.result).
  function computeResultLine(): string {
    if (!match || firstInningsRuns == null || !innings) return '';
    if (innings.totalRuns === firstInningsRuns) return 'Match tied';
    const secondInningsWon = innings.totalRuns > firstInningsRuns;
    const winningTeamIds = secondInningsWon ? battingForInnings(match, 2) : battingForInnings(match, 1);
    const winningIsTeamA = winningTeamIds === match.teamA;
    const captainId = winningIsTeamA ? match.captainA : match.captainB;
    const captainName = captainId ? playerMap[captainId]?.displayName : undefined;
    const teamLabel = captainName
      ? `Team ${captainName}`
      : (winningIsTeamA ? match.homeTeam : match.awayTeam) || 'Winning team';
    return secondInningsWon
      ? `${teamLabel} won 🏆`
      : `${teamLabel} won by ${firstInningsRuns - innings.totalRuns} run${firstInningsRuns - innings.totalRuns !== 1 ? 's' : ''} 🏆`;
  }

  // ── Setup handlers ───────────────────────────────────────────────

  // Start an innings with the crease BLANK — the scorer picks the openers and
  // bowler via the edit buttons before the first ball.
  function beginInnings(m: Match, n: number) {
    const batting = battingForInnings(m, n);
    const bowling = bowlingForInnings(m, n);
    const initBatterStats: Record<string, BatterStats> = {};
    for (const pid of batting) initBatterStats[pid] = emptyBatterStats();
    setInnings({
      inningsId: `innings-${n}`,
      battingIds: batting,
      bowlingIds: bowling,
      totalRuns: 0,
      totalWickets: 0,
      overNumber: 0,
      legalBallsInOver: 0,
      onStrikeId: '',
      offStrikeId: '',
      bowlerId: '',
      batterStats: initBatterStats,
      bowlerStats: {},
      currentOverBalls: [],
      handedness: {},
    });
    setPhase('scoring');
  }

  function startSecondInnings(firstInn: InningsState) {
    if (!match) return;
    setFirstInnings(firstInn);
    setFirstInningsRuns(firstInn.totalRuns);
    setInningsNumber(2);
    setHistory([]);
    beginInnings(match, 2);
  }

  // ── Ball flow ────────────────────────────────────────────────────

  function startBall(input: BallInput) {
    // Block scoring until both openers + a bowler are chosen.
    if (!innings || !innings.onStrikeId || !innings.bowlerId) return;
    if (!innings.offStrikeId && innings.totalWickets === 0) return;
    pendingInputRef.current = input;
    pendingWagonRef.current = null;
    pendingFieldingRef.current = null;
    setPendingRuns(input.runs + (input.extras?.runs ?? 0));
    // Skip wagon wheel + fielding overlay for pure extras (wide, no-ball, bye, leg-bye)
    // and for dot balls — no shot to plot and no fielding event to record.
    // Extras WITH a dismissal (run-out) fall through to the normal wicket path.
    const isDotBall = input.runs === 0 && !input.extras && !input.dismissal;
    if ((!!input.extras && !input.dismissal) || isDotBall) {
      commitBall();
      return;
    }
    // Custom dismissals and specific standard dismissals skip the wagon wheel.
    const d = input.dismissal;
    const isCustomDismissal = !!d && !(d.type in STD_LABELS);
    const skipWagon = isCustomDismissal || (!!d && NO_WAGON.includes(d.type as StandardDismissalType));
    if (skipWagon) {
      proceedAfterWagon();
    } else {
      setShowWagon(true);
    }
  }

  function handleWagonDone(shot: WagonShot | null) {
    pendingWagonRef.current = shot;
    setShowWagon(false);
    proceedAfterWagon();
  }

  function proceedAfterWagon() {
    // Skip the fielding overlay for wickets where no fielder is involved
    // (bowled, lbw, hit-wicket, etc.) — only caught/stumped/run-out need one.
    const d = pendingInputRef.current?.dismissal;
    const isCustomDismissal = !!d && !(d.type in STD_LABELS);
    const isNoFielderWicket =
      !!d && d.type in STD_LABELS && !FIELDER_NEEDED.includes(d.type as StandardDismissalType);
    // Caught / run-out already recorded the fielder on the wicket sheet.
    const fielderAlreadyRecorded =
      !!d && FIELDER_ALREADY_RECORDED.includes(d.type as StandardDismissalType);
    const isCatch = !!d && d.type === 'caught';
    const isRunOut = !!d && d.type === 'run-out';
    const isStumped = !!d && d.type === 'stumped';
    const fieldingOverlayEveryBall = clubRules?.fieldingOverlayEveryBall ?? match?.rules.fieldingOverlayEveryBall ?? false;
    if (isCustomDismissal || isNoFielderWicket || isStumped) {
      pendingFieldingRef.current = null;
      commitBall();
    } else if (isCatch || isRunOut) {
      // Fielding event (if any) was pre-set in pendingFieldingRef from WicketSheet — preserve it.
      commitBall();
    } else if (fieldingOverlayEveryBall) {
      setHideFieldingFielders(fielderAlreadyRecorded);
      setShowFielding(true);
    } else {
      commitBall();
    }
  }

  function handleFieldingDone(eventId: string | null, fielderIds: string[]) {
    // Snapshot the event label so counts survive later rule edits.
    const eventLabel = eventId
      ? clubRules?.fieldingEvents.find((e) => e.id === eventId)?.label
      : undefined;
    pendingFieldingRef.current = {
      eventId: eventId ?? undefined,
      eventLabel,
      fielderIds: fielderIds.length > 0 ? fielderIds : undefined,
    };
    setShowFielding(false);
    commitBall();
  }

  function commitBall() {
    const input = pendingInputRef.current;
    if (!input || !innings || !match) return;
    pendingInputRef.current = null;

    // ballsPerOver is match-specific (over structure); custom dismissals come
    // live from the club so the engine matches what the wicket sheet offered.
    const config: DismissalConfig = {
      ballsPerOver: match.rules.ballsPerOver,
      customDismissals: clubRules?.customDismissals ?? match.rules.customDismissals,
    };
    const result = recordBall({ legalBallsInOver: innings.legalBallsInOver }, input, config);

    const snapshot: Snapshot = { ...innings, _ballId: lastBallIdRef.current };
    setHistory((h) => [...h, snapshot]);

    // Attach wagon-wheel + fielding metadata collected during the ball flow.
    // (ignoreUndefinedProperties is enabled, so absent fields are dropped.)
    const ballEntry: BallEntry = { ...result.ballEntry };
    if (pendingWagonRef.current) ballEntry.wagon = pendingWagonRef.current;
    const fielding = pendingFieldingRef.current;
    if (fielding && (fielding.eventId || (fielding.fielderIds && fielding.fielderIds.length > 0))) {
      ballEntry.fielding = fielding;
    }
    pendingWagonRef.current = null;
    pendingFieldingRef.current = null;

    const newOverBalls = [...innings.currentOverBalls, ballEntry];

    // Update batter stats
    // For a non-striker run-out, input.batsmanId is the dismissed off-striker;
    // ball-facing credits (runs, balls, fours, sixes) still belong to the on-striker.
    const isNonStrikerRunOut = result.batterIsOut && input.dismissal?.type === 'run-out' && input.batsmanId === innings.offStrikeId;
    const facingBatsmanId = isNonStrikerRunOut ? innings.onStrikeId : input.batsmanId;
    // Stamp the actual on-striker so undo can restore the correct end.
    if (isNonStrikerRunOut) ballEntry.onStrikeId = innings.onStrikeId;
    const newBatterStats = { ...innings.batterStats };
    if (!newBatterStats[facingBatsmanId]) newBatterStats[facingBatsmanId] = emptyBatterStats();
    const bat = { ...newBatterStats[facingBatsmanId] };
    bat.runs += input.runs;
    if (result.isLegalDelivery) bat.balls++;
    if (input.runs === 4 && !input.extras) bat.fours++;
    if (input.runs === 6 && !input.extras) bat.sixes++;
    newBatterStats[facingBatsmanId] = bat;
    if (result.batterIsOut) {
      if (!newBatterStats[input.batsmanId]) newBatterStats[input.batsmanId] = emptyBatterStats();
      const dismissedBat = { ...newBatterStats[input.batsmanId] };
      dismissedBat.isOut = true;
      if (input.dismissal) {
        const getName = (id: string) => playerMap[id]?.displayName ?? id;
        dismissedBat.dismissalText = buildDismissalText(
          { ...input.dismissal, bowlerId: input.bowlerId },
          getName
        );
      }
      newBatterStats[input.batsmanId] = dismissedBat;
    }

    // Update bowler stats
    const newBowlerStats = { ...innings.bowlerStats };
    if (!newBowlerStats[input.bowlerId]) newBowlerStats[input.bowlerId] = emptyBowlerStats();
    const bow = { ...newBowlerStats[input.bowlerId] };
    const extrasType = input.extras?.type;
    const byeLB = (extrasType === 'bye' || extrasType === 'leg-bye') ? (input.extras?.runs ?? 0) : 0;
    bow.runsConceded += result.runsScored - byeLB;
    if (result.isLegalDelivery) bow.legalBalls++;
    if (result.bowlerGetsWicket) bow.wickets++;

    const newTotalRuns = innings.totalRuns + result.runsScored;
    const newWickets = innings.totalWickets + (result.batterIsOut ? 1 : 0);

    let newOnStrike = innings.onStrikeId;
    let newOffStrike = innings.offStrikeId;
    // A lone (last man standing) batter always keeps strike — no partner to rotate to.
    const isLoneBatter = innings.offStrikeId === '';
    const autoRotateEoO = clubRules?.autoRotateStrikeEoO ?? match?.rules.autoRotateStrikeEoO ?? true;
    // When auto-rotate is off, flip the engine's decision for end-of-over balls
    // so only the run-based rotation applies (not the end-of-over swap).
    const effectiveRotate = (result.isOverComplete && !autoRotateEoO)
      ? !result.rotateStrike
      : result.rotateStrike;
    if (effectiveRotate && !isLoneBatter) [newOnStrike, newOffStrike] = [newOffStrike, newOnStrike];

    // Run-out with an odd number of completed runs → the batters crossed, so the
    // surviving partner is now on strike and the replacement comes in off strike.
    const crossedOnRunOut =
      result.batterIsOut &&
      input.dismissal?.type === 'run-out' &&
      result.physicalRuns % 2 !== 0 &&
      !isLoneBatter;

    // End-of-over swap applies to wicket balls just as it does to normal balls.
    // XOR chain: non-striker surviving puts them off-strike; crossing flips it;
    // end-of-over flips it again. Result: where the survivor ends up for next ball.
    const eooSwap = result.isOverComplete && autoRotateEoO && !isLoneBatter;
    const survivorIsOnStrike = (isNonStrikerRunOut !== crossedOnRunOut) !== eooSwap;
    const survivorId = isNonStrikerRunOut ? innings.onStrikeId : innings.offStrikeId;
    const dismissedSlotId = isNonStrikerRunOut ? innings.offStrikeId : innings.onStrikeId;

    let newOverNumber = innings.overNumber;
    let newLegalBalls = result.newLegalBallsInOver;
    let newCurrentOverBalls = newOverBalls;

    if (result.isOverComplete) {
      bow.completedOvers++;
      newBowlerStats[input.bowlerId] = bow;
      newOverNumber++;
      newLegalBalls = 0;
      newCurrentOverBalls = [];
    } else {
      newBowlerStats[input.bowlerId] = bow;
    }

    const newInnings: InningsState = {
      ...innings,
      totalRuns: newTotalRuns,
      totalWickets: newWickets,
      overNumber: newOverNumber,
      legalBallsInOver: newLegalBalls,
      onStrikeId: result.batterIsOut ? (survivorIsOnStrike ? survivorId : dismissedSlotId) : newOnStrike,
      offStrikeId: result.batterIsOut ? (survivorIsOnStrike ? dismissedSlotId : survivorId) : newOffStrike,
      batterStats: newBatterStats,
      bowlerStats: newBowlerStats,
      currentOverBalls: newCurrentOverBalls,
    };

    setInnings(newInnings);

    // Persist as a BallDoc — the single source of truth for this delivery.
    if (clubId && match) {
      const ref = newBallRef(clubId, match.id);
      lastBallIdRef.current = ref.id;
      const ballDoc: Omit<BallDoc, 'id'> = {
        seq: seqRef.current++,
        inningsId: innings.inningsId,
        overNumber: innings.overNumber,
        bowlerId: input.bowlerId,
        batsmanId: innings.onStrikeId,          // always the facing batter
        nonStrikerId: innings.offStrikeId,       // always the non-striker
        runs: input.runs,
        isLastBallOfOver: result.isOverComplete,
        ...(input.extras && { extras: input.extras }),
        ...(ballEntry.wagon && { wagon: ballEntry.wagon }),
        ...(ballEntry.fielding && {
          fielding: {
            eventId: ballEntry.fielding.eventId,
            eventLabel: ballEntry.fielding.eventLabel,
            fielderIds: ballEntry.fielding.fielderIds,
          },
        }),
        ...(input.dismissal && {
          dismissal: {
            type: input.dismissal.type,
            nonStrikerOut: isNonStrikerRunOut,
            outBatsmanId: input.batsmanId,      // who got out (on or non-striker)
            ...(input.dismissal.fielderIds && { fielderIds: input.dismissal.fielderIds }),
          },
        }),
      };
      saveBallDoc(ref, ballDoc).catch(() => {});
    }

    // Decide what happens next. End-of-innings checks take priority, in order:
    // chase complete → all out → overs exhausted.
    const target = inningsNumber === 2 && firstInningsRuns != null ? firstInningsRuns + 1 : null;
    const oversPerInnings = match.rules.oversPerInnings;
    const oversDone =
      result.isOverComplete && oversPerInnings != null && newOverNumber >= oversPerInnings;

    if (target != null && newTotalRuns >= target) {
      setPhase('innings-over');
      return;
    }

    if (result.batterIsOut) {
      const dismissedId = input.batsmanId;
      const partnerId = isNonStrikerRunOut ? innings.onStrikeId : innings.offStrikeId;
      const partnerOut = partnerId ? !!newBatterStats[partnerId]?.isOut : true;
      const replacements = innings.battingIds.filter(
        (id) => id !== dismissedId && id !== partnerId && !newBatterStats[id]?.isOut
      );
      const allOut = replacements.length === 0 && !(match.rules.lastManStands && partnerId && !partnerOut);

      if (allOut) {
        setPhase('innings-over');
        return;
      }
      if (replacements.length === 0) {
        // Last man stands: the surviving partner bats on alone (unless overs are done).
        setInnings((li) => (li ? { ...li, onStrikeId: partnerId, offStrikeId: '' } : li));
        setPhase(oversDone ? 'innings-over' : result.isOverComplete ? 'new-bowler' : 'scoring');
        return;
      }
      newBatterEndRef.current = survivorIsOnStrike ? 'offStrike' : 'onStrike';
      if (oversDone) {
        setPhase('innings-over');
      } else if (result.isOverComplete) {
        // Need both a new batter AND a new bowler — pick batter first, then bowler.
        needsNewBowlerAfterBatterRef.current = true;
        setPhase('new-batter');
      } else {
        setPhase('new-batter');
      }
      return;
    }

    if (oversDone) setPhase('innings-over');
    else if (result.isOverComplete) setPhase('new-bowler');
  }

  // ── Extras ───────────────────────────────────────────────────────

  function handleExtra(type: ExtrasType) {
    if (!innings) return;
    setPendingExtra(type);
  }

  function confirmExtra(runRuns: number, runOut: boolean) {
    const type = pendingExtra;
    setPendingExtra(null);
    if (!type || !innings) return;
    // wide: 1 penalty + runs ran, all as extras, none off the bat.
    // no-ball: 1 penalty extra + runs off the bat (credited to the batter).
    // bye / leg-bye: runs taken, all as extras.
    const runsOffBat = type === 'no-ball' && !runOut ? runRuns : 0;
    const extraRuns =
      type === 'wide' ? 1 + runRuns
      : type === 'no-ball' ? 1
      : runRuns;

    if (runOut) {
      // Store the extra details; WicketSheet will capture fielders.
      setPendingExtraRunOut({ extraType: type, extraRuns });
      setShowWicket(true);
      return;
    }

    startBall({
      batsmanId: innings.onStrikeId,
      bowlerId: innings.bowlerId,
      runs: runsOffBat,
      extras: { type, runs: extraRuns },
    });
  }

  // ── Wicket ───────────────────────────────────────────────────────

  function handleWicketSelect(type: string, fielderIds?: string[], completedRuns?: number, eventId?: string, dismissedBatsmanId?: string) {
    setShowWicket(false);
    if (!innings) return;
    // For caught/run-out: pre-populate the fielding event captured inline on the wicket sheet.
    // Run-outs also carry fielderIds so event points are credited to the correct fielders.
    if ((type === 'caught' || type === 'run-out') && eventId) {
      const eventLabel = clubRules?.fieldingEvents.find((e) => e.id === eventId)?.label;
      const eventFielderIds = type === 'run-out' && fielderIds && fielderIds.length > 0 ? fielderIds : undefined;
      pendingFieldingRef.current = { eventId, eventLabel, fielderIds: eventFielderIds };
    }
    const extraRunOut = pendingExtraRunOut;
    if (extraRunOut) {
      setPendingExtraRunOut(null);
      // Run-out on an extra: combine the stored extra with the dismissal.
      startBall({
        batsmanId: dismissedBatsmanId ?? innings.onStrikeId,
        bowlerId: innings.bowlerId,
        runs: 0,
        extras: { type: extraRunOut.extraType, runs: extraRunOut.extraRuns },
        dismissal: {
          type: 'run-out',
          fielderId: fielderIds?.[0],
          fielderIds: fielderIds && fielderIds.length > 1 ? fielderIds : undefined,
        },
      });
      return;
    }
    startBall({
      batsmanId: type === 'run-out' ? (dismissedBatsmanId ?? innings.onStrikeId) : innings.onStrikeId,
      bowlerId: innings.bowlerId,
      // Run-outs can be completed after the batters have run; those runs count.
      runs: type === 'run-out' ? completedRuns ?? 0 : 0,
      dismissal: {
        type,
        fielderId: fielderIds?.[0],
        fielderIds: fielderIds && fielderIds.length > 1 ? fielderIds : undefined,
      },
    });
  }

  // ── Undo ────────────────────────────────────────────────────────

  function handleSaveOvers(newOvers: number) {
    if (!match) return;
    setShowEditOvers(false);
    if (newOvers === match.rules.oversPerInnings) return;
    // Optimistically apply so the over-limit / chase maths update immediately.
    const updated: Match = { ...match, rules: { ...match.rules, oversPerInnings: newOvers } };
    setMatch(updated);
    updateMatchOvers(clubId, match.id, newOvers).catch(() => {
      Alert.alert('Could not update overs. Please try again.');
      load();
    });
  }

  function handleAbandon() {
    if (!match || !clubId) return;
    Alert.alert(
      'Abandon match?',
      'This ends the match with no result and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: () => {
            abandonMatch(clubId, match.id)
              .then(() => navigation.goBack())
              .catch(() => Alert.alert('Could not abandon the match. Please try again.'));
          },
        },
      ]
    );
  }

  function handleDeleteMatch() {
    if (!match || !clubId) return;
    Alert.alert(
      'Delete match?',
      'No ball has been bowled — this removes the match entirely and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMatch(clubId, match.id)
              .then(() => navigation.goBack())
              .catch(() => Alert.alert('Could not delete the match. Please try again.'));
          },
        },
      ]
    );
  }

  function handleUndo() {
    if (!innings || !match || !clubId) return;

    if (history.length > 0) {
      // Fast path: restore from in-memory snapshot and delete the last ball doc.
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      const { _ballId, ...prevInnings } = prev;
      setInnings(prevInnings as InningsState);
      lastBallIdRef.current = _ballId;
      setPhase('scoring');
      deleteLastBall(clubId, match.id, innings.inningsId).catch(() => {});
      seqRef.current--;
      return;
    }

    // Cross-session fallback: delete from Firestore and reload.
    // If the ball being deleted is the only one bowled in the active over,
    // undoing it lands back on the previous over's last ball — reconstruction
    // would otherwise read that as "over just completed" and re-prompt for a
    // bowler. Capture the current bowler so the reload can resume scoring
    // with it instead (see undoBowlerOverrideRef).
    if (innings.currentOverBalls.length === 1 && innings.bowlerId) {
      undoBowlerOverrideRef.current = innings.bowlerId;
    }
    deleteLastBall(clubId, match.id, innings.inningsId)
      .then(() => load())
      .catch(() => {});
  }

  // ── New bowler / new batter handlers ────────────────────────────

  function handleNewBowler(id: string) {
    if (!innings) return;
    setInnings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bowlerId: id,
        bowlerStats: { ...prev.bowlerStats, [id]: prev.bowlerStats[id] ?? emptyBowlerStats() },
      };
    });
    // Bowler selection is ephemeral — stored only in memory, not in Firestore.
    // The bowlerId appears on the next ball doc once a delivery is bowled.
    setPhase('scoring');
  }

  function handleNewBatter(id: string) {
    if (!innings) return;
    const end = newBatterEndRef.current;
    newBatterEndRef.current = 'onStrike';
    const newOnStrikeId = end === 'offStrike' ? innings.onStrikeId : id;
    const newOffStrikeId = end === 'offStrike' ? id : innings.offStrikeId;
    setInnings((prev) => {
      if (!prev) return prev;
      return { ...prev, onStrikeId: newOnStrikeId, offStrikeId: newOffStrikeId };
    });
    // Patch the last ball doc with the replacement batsman's ID so reload
    // can reconstruct crease state purely from ball documents.
    if (clubId && match && lastBallIdRef.current) {
      updateBallNextBatsman(clubId, match.id, lastBallIdRef.current, id).catch(() => {});
    }
    if (needsNewBowlerAfterBatterRef.current) {
      needsNewBowlerAfterBatterRef.current = false;
      setPhase('new-bowler');
    } else {
      setPhase('scoring');
    }
  }

  // Mid-innings change of a batter/bowler (corrections, retirements, swaps).
  function handleChangePlayer(id: string) {
    const target = changeTarget;
    setChangeTarget(null);
    if (!target) return;
    setInnings((prev) => {
      if (!prev) return prev;
      if (target === 'bowler') {
        return {
          ...prev,
          bowlerId: id,
          bowlerStats: { ...prev.bowlerStats, [id]: prev.bowlerStats[id] ?? emptyBowlerStats() },
        };
      }
      const key = target === 'onStrike' ? 'onStrikeId' : 'offStrikeId';
      // Seed the batter's handedness from their profile (drives wagon-wheel orientation).
      const battingHand = players.find((p) => p.id === id)?.battingHand;
      return {
        ...prev,
        [key]: id,
        batterStats: { ...prev.batterStats, [id]: prev.batterStats[id] ?? emptyBatterStats() },
        handedness: { ...prev.handedness, [id]: prev.handedness[id] ?? battingHand ?? 'RHB' },
      };
    });
  }

  const maxBowlerOvers = clubRules?.maxBowlerOvers ?? match?.rules.maxBowlerOvers;
  const isAtOverCap = (id: string) =>
    maxBowlerOvers != null && (innings?.bowlerStats[id]?.completedOvers ?? 0) >= maxBowlerOvers;

  const changePlayers = !innings || !changeTarget ? [] :
    changeTarget === 'bowler'
      ? players.filter((p) => innings.bowlingIds.includes(p.id) && p.id !== innings.bowlerId && !isAtOverCap(p.id))
      : players.filter((p) =>
          innings.battingIds.includes(p.id) &&
          !innings.batterStats[p.id]?.isOut &&
          p.id !== (changeTarget === 'onStrike' ? innings.offStrikeId : innings.onStrikeId)
        );

  // ── Derived ──────────────────────────────────────────────────────

  const playerMap = Object.fromEntries([
    ...players.map((p): [string, typeof p] => [p.id, p]),
    ...players.flatMap((p): [string, typeof p][] => p.linkedGhost ? [[p.linkedGhost.ghostId, p]] : []),
  ]);
  const onStrikeHand = innings ? (innings.handedness[innings.onStrikeId] ?? 'RHB') : 'RHB';
  const offStrikeHand = innings ? (innings.handedness[innings.offStrikeId] ?? 'RHB') : 'RHB';

  function toggleHand(id: string) {
    setInnings((prev) => {
      if (!prev) return prev;
      const cur = prev.handedness[id] ?? 'RHB';
      return { ...prev, handedness: { ...prev.handedness, [id]: cur === 'RHB' ? 'LHB' : 'RHB' } };
    });
  }

  // Tap the non-striker's row to hand them strike (no-op for a lone batter).
  function swapStrike() {
    setInnings((prev) =>
      prev && prev.offStrikeId
        ? { ...prev, onStrikeId: prev.offStrikeId, offStrikeId: prev.onStrikeId }
        : prev
    );
  }

  const enabledExtras = match?.rules.enabledExtras ?? [];
  const enabledDismissals = clubRules?.enabledDismissals ?? match?.rules.enabledDismissals ?? [];
  const liveCustomDismissals: CustomDismissal[] =
    clubRules?.customDismissals ?? match?.rules.customDismissals ?? [];
  const substituteIds = match?.substitutes ?? [];
  const fieldingPlayers = innings
    ? players.filter((p) => innings.bowlingIds.includes(p.id) || substituteIds.includes(p.id))
    : [];
  const enabledFieldingEvents = (clubRules?.fieldingEvents ?? []).filter((e) => e.enabled);
  // Scope 'both' (and absent/legacy) appears in both contexts; 'wicket' only on the
  // wicket sheet; 'non-wicket' only in the fielding overlay for normal balls.
  const wicketFieldingEvents = enabledFieldingEvents.filter((e) => !e.scope || e.scope === 'both' || e.scope === 'wicket');
  const nonWicketFieldingEvents = enabledFieldingEvents.filter((e) => !e.scope || e.scope === 'both' || e.scope === 'non-wicket');

  // ── Render phases ────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (phase === 'no-match') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 18, textAlign: 'center', marginBottom: 8 }}>Match not available</Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
          This match is no longer live. Go back to Matches to pick another.
        </Text>
      </View>
    );
  }


  if (!innings) return null;

  if (phase === 'innings-over') {
    const overs = `${innings.overNumber}.${innings.legalBallsInOver}`;
    const isFirstInnings = inningsNumber === 1;
    // 2nd-innings result.
    const resultLine = isFirstInnings ? '' : computeResultLine();
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>
          {isFirstInnings ? '1ST INNINGS COMPLETE' : 'MATCH COMPLETE'}
        </Text>
        <Text style={{ color: theme.text, fontSize: 44, fontWeight: '800' }}>
          {innings.totalRuns}
          <Text style={{ color: theme.textMuted, fontSize: 30, fontWeight: '600' }}>/{innings.totalWickets}</Text>
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 15, marginTop: 6 }}>
          {innings.overNumber} overs · {overs} balls
        </Text>

        {isFirstInnings ? (
          isAdmin ? (
          <TouchableOpacity
            onPress={() => startSecondInnings(innings)}
            style={{ marginTop: 32, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
              Start 2nd innings (target {innings.totalRuns + 1})
            </Text>
          </TouchableOpacity>
          ) : (
          <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 24, textAlign: 'center' }}>
            Waiting for 2nd innings...
          </Text>
          )
        ) : (
          <Text style={{ color: '#d97706', fontSize: 16, fontWeight: '700', marginTop: 24, textAlign: 'center' }}>
            {resultLine}
          </Text>
        )}

        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 24, textAlign: 'center' }}>
          {match ? `${match.homeTeam} vs ${match.awayTeam}` : ''}
        </Text>
      </View>
    );
  }

  // Truly last man standing only once a wicket has fallen — at the start both
  // crease slots are simply unselected (blank), not "batting alone".
  const isLoneBatter = innings.offStrikeId === '' && innings.totalWickets > 0;
  const onStrikePlayer = playerMap[innings.onStrikeId];
  const offStrikePlayer = playerMap[innings.offStrikeId];
  const bowlerPlayer = playerMap[innings.bowlerId];
  const onStrikeStat = innings.batterStats[innings.onStrikeId] ?? emptyBatterStats();
  const offStrikeStat = innings.batterStats[innings.offStrikeId] ?? emptyBatterStats();
  const bowlerStat = innings.bowlerStats[innings.bowlerId] ?? emptyBowlerStats();

  // Need both openers + a bowler before scoring (off-strike may be blank only
  // once a wicket has fallen, i.e. last man standing).
  const scoringReady =
    !!innings.onStrikeId && !!innings.bowlerId && (!!innings.offStrikeId || innings.totalWickets > 0);

  // Before the first ball a match can be deleted; afterwards only abandoned.
  const firstBallBowled =
    innings.overNumber > 0 || innings.currentOverBalls.length > 0 ||
    innings.totalRuns > 0 || innings.totalWickets > 0;

  const notBowlingPlayers = players.filter((p) => innings.bowlingIds.includes(p.id) && p.id !== innings.bowlerId && !isAtOverCap(p.id));
  const notBattingActiveIds = [innings.onStrikeId, innings.offStrikeId, ...Object.keys(innings.batterStats).filter((id) => innings.batterStats[id].isOut)];
  const nextBatters = players.filter((p) => innings.battingIds.includes(p.id) && !notBattingActiveIds.includes(p.id));

  // Which innings the scorecard tab shows (innings 1 lives in firstInnings once the chase starts).
  const scorecardInn = inningsNumber === 2 ? (cardInnings === 1 ? firstInnings : innings) : innings;

  // Overs can only be edited while the 1st innings is in progress, and never
  // below the overs already bowled (a part-bowled over counts as one).
  const oversFloor = Math.max(1, innings.overNumber + (innings.legalBallsInOver > 0 ? 1 : 0));
  const canEditOvers = isAdmin && inningsNumber === 1 && phase === 'scoring' && match?.rules.oversPerInnings != null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Top tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.surfaceAlt }}>
        {(['scoring', 'scorecard', 'teams', 'stats'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? theme.accent : 'transparent' }}
          >
            <Text style={{ color: tab === t ? theme.accent : theme.textMuted, fontWeight: '700', fontSize: 11 }}>
              {t === 'scoring' ? 'SCORING' : t === 'scorecard' ? 'SCORECARD' : t === 'teams' ? 'TEAMS' : 'STATS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'scorecard' ? (
        <View style={{ flex: 1 }}>
          {inningsNumber === 2 && (
            <View style={{ flexDirection: 'row', padding: 8, gap: 8 }}>
              {([1, 2] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setCardInnings(n)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: cardInnings === n ? theme.accentDim : theme.surface, borderWidth: 1, borderColor: cardInnings === n ? theme.accent : theme.border, alignItems: 'center' }}
                >
                  <Text style={{ color: cardInnings === n ? theme.accent : theme.textMuted, fontWeight: '600' }}>Innings {n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {scorecardInn ? (
            <Scorecard inn={scorecardInn} playerMap={playerMap} ballsPerOver={match?.rules.ballsPerOver ?? 6} />
          ) : (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>No data yet</Text>
          )}
        </View>
      ) : tab === 'teams' ? (
        <TeamsTab
          match={match}
          players={players}
          isAdmin={isAdmin}
          matchHasStarted={firstBallBowled}
          clubId={clubId}
          matchId={matchId}
          navigation={navigation}
          showSubPicker={showSubPicker}
          setShowSubPicker={setShowSubPicker}
          onSubstituteAdded={(playerId) => setMatch((m) => m ? { ...m, substitutes: [...(m.substitutes ?? []), playerId] } : m)}
          onSubstituteRemoved={(playerId) => setMatch((m) => m ? { ...m, substitutes: (m.substitutes ?? []).filter((id) => id !== playerId) } : m)}
        />
      ) : tab === 'stats' ? (
        <MatchStatsContent clubId={clubId} matchId={matchId} />
      ) : (
      <>
      {/* Score header */}
      <ScoreHeader
        runs={innings.totalRuns}
        wickets={innings.totalWickets}
        overNumber={innings.overNumber}
        legalBalls={innings.legalBallsInOver}
        ballsPerOver={match?.rules.ballsPerOver ?? 6}
        matchName={match ? `${match.homeTeam} vs ${match.awayTeam}` : ''}
      />

      {/* Overs limit — editable during the 1st innings */}
      {match?.rules.oversPerInnings != null && (
        <TouchableOpacity
          disabled={!canEditOvers}
          onPress={() => setShowEditOvers(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 6, backgroundColor: theme.surfaceAlt,
            borderBottomWidth: 1, borderBottomColor: theme.border,
          }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {match.rules.oversPerInnings} over match
          </Text>
          {canEditOvers && <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>✎ Edit</Text>}
        </TouchableOpacity>
      )}

      {/* Chase target (2nd innings) */}
      {inningsNumber === 2 && firstInningsRuns != null && (() => {
        const target = firstInningsRuns + 1;
        const need = Math.max(0, target - innings.totalRuns);
        const ballsPerOver = match?.rules.ballsPerOver ?? 6;
        const oversLimit = match?.rules.oversPerInnings;
        const ballsBowled = innings.overNumber * ballsPerOver + innings.legalBallsInOver;
        const ballsLeft = oversLimit != null ? oversLimit * ballsPerOver - ballsBowled : null;
        const rrr =
          ballsLeft != null && ballsLeft > 0 ? ((need * ballsPerOver) / ballsLeft).toFixed(2) : null;
        return (
          <View style={{ backgroundColor: theme.surface, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: '#d97706', fontSize: 13, fontWeight: '700' }}>
              Need {need} run{need !== 1 ? 's' : ''}
              {ballsLeft != null ? ` from ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}` : ''}
            </Text>
            {rrr != null && (
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>
                Target {target} · RRR {rrr}
              </Text>
            )}
          </View>
        );
      })()}

      {/* Batter rows — tap the non-striker to give them strike;
          tap ✎ (or long-press) to select / change a batter */}
      <TouchableOpacity activeOpacity={1} onLongPress={() => isAdmin && setChangeTarget('onStrike')}>
        <BatterRow
          player={onStrikePlayer}
          stats={onStrikeStat}
          onStrike
          hand={onStrikeHand}
          onToggleHand={() => isAdmin && toggleHand(innings.onStrikeId)}
          onEdit={isAdmin ? () => setChangeTarget('onStrike') : undefined}
        />
      </TouchableOpacity>
      {isLoneBatter ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>Last man standing — batting alone</Text>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={isAdmin ? swapStrike : undefined}
          onLongPress={() => isAdmin && setChangeTarget('offStrike')}
        >
          <BatterRow
            player={offStrikePlayer}
            stats={offStrikeStat}
            onStrike={false}
            hand={offStrikeHand}
            onToggleHand={() => isAdmin && toggleHand(innings.offStrikeId)}
            onEdit={isAdmin ? () => setChangeTarget('offStrike') : undefined}
            showStrikeHint={isAdmin}
          />
        </TouchableOpacity>
      )}

      {/* Bowler row — tap ✎ (or long-press) to select / change */}
      <TouchableOpacity activeOpacity={1} onLongPress={() => isAdmin && setChangeTarget('bowler')}>
        <BowlerRow
          player={bowlerPlayer}
          stats={bowlerStat}
          ballsPerOver={match?.rules.ballsPerOver ?? 6}
          onEdit={isAdmin ? () => setChangeTarget('bowler') : undefined}
        />
      </TouchableOpacity>

      {isAdmin && !scoringReady && (
        <Text style={{ color: '#d97706', fontSize: 13, textAlign: 'center', paddingVertical: 10 }}>
          Select both batsmen and the bowler (✎) to start scoring
        </Text>
      )}

      {/* Ball log */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginRight: 8 }}>This over:</Text>
        {innings.currentOverBalls.length === 0 ? (
          <Text style={{ color: theme.border, fontSize: 13 }}>–</Text>
        ) : (
          innings.currentOverBalls.map((ball, i) => <BallCircle key={i} ball={ball} />)
        )}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16, marginBottom: 12 }} />

      {isAdmin ? (
        <>
        {/* Run buttons */}
        <View pointerEvents={scoringReady ? 'auto' : 'none'} style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10, opacity: scoringReady ? 1 : 0.4 }}>
          {[0, 1, 2, 3, 4, 6].map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() =>
                startBall({ batsmanId: innings.onStrikeId, bowlerId: innings.bowlerId, runs: r })
              }
              style={{
                flex: 1, paddingVertical: 16, borderRadius: 10,
                backgroundColor: r === 4 ? theme.accentDim : r === 6 ? (theme.id === 'light' ? '#ede9fe' : '#2d1a5f') : theme.surface,
                borderWidth: 1.5,
                borderColor: r === 4 ? theme.accent : r === 6 ? '#a78bfa' : theme.border,
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: r === 4 ? theme.accent : r === 6 ? '#a78bfa' : theme.text,
                fontSize: 20, fontWeight: '800',
              }}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Extras row */}
        {enabledExtras.length > 0 && (
          <View pointerEvents={scoringReady ? 'auto' : 'none'} style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10, opacity: scoringReady ? 1 : 0.4 }}>
            {enabledExtras.map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => handleExtra(type)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8,
                  backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                  {type === 'no-ball' ? 'NB' : type === 'leg-bye' ? 'LB' : type === 'wide' ? 'Wd' : 'Bye'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Wicket + Undo */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8 }}>
          <TouchableOpacity
            onPress={() => scoringReady && setShowWicket(true)}
            disabled={!scoringReady}
            style={{
              flex: 3, paddingVertical: 14, borderRadius: 10,
              backgroundColor: theme.id === 'light' ? '#fef2f2' : '#2d1515',
              borderWidth: 1.5, borderColor: '#dc2626',
              alignItems: 'center', opacity: scoringReady ? 1 : 0.4,
            }}
          >
            <Text style={{ color: '#dc2626', fontSize: 16, fontWeight: '800' }}>Wicket ▼</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleUndo}
            disabled={!firstBallBowled && history.length === 0}
            style={{
              flex: 1, paddingVertical: 14, borderRadius: 10,
              backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
              alignItems: 'center',
              opacity: (firstBallBowled || history.length > 0) ? 1 : 0.4,
            }}
          >
            <Text style={{ color: theme.textMuted, fontSize: 15, fontWeight: '700' }}>↩ Undo</Text>
          </TouchableOpacity>
        </View>

        {/* Delete (before first ball) or Abandon (after) */}
        <TouchableOpacity
          onPress={firstBallBowled ? handleAbandon : handleDeleteMatch}
          style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}>
            {firstBallBowled ? 'Abandon match' : 'Delete match'}
          </Text>
        </TouchableOpacity>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Watching live</Text>
        </View>
      )}
      </>
      )}

      {/* ── Modals ── */}

      <WagonWheelModal
        visible={showWagon}
        isLHB={onStrikeHand === 'LHB'}
        runs={pendingRuns}
        onDone={handleWagonDone}
      />

      <FieldingPanel
        visible={showFielding}
        runs={pendingRuns}
        players={fieldingPlayers}
        fieldingEvents={nonWicketFieldingEvents}
        hideFielders={hideFieldingFielders}
        onDone={handleFieldingDone}
      />

      <WicketSheet
        visible={showWicket}
        enabledDismissals={enabledDismissals}
        customDismissals={liveCustomDismissals}
        fieldingPlayers={fieldingPlayers}
        fieldingEvents={wicketFieldingEvents}
        onSelect={handleWicketSelect}
        onClose={() => { setShowWicket(false); setPendingExtraRunOut(null); }}
        forceRunOut={!!pendingExtraRunOut}
        onStrikePlayer={onStrikePlayer ? { id: innings.onStrikeId, name: onStrikePlayer.displayName } : undefined}
        offStrikePlayer={offStrikePlayer && innings.offStrikeId ? { id: innings.offStrikeId, name: offStrikePlayer.displayName } : undefined}
      />

      <ExtrasRunsModal
        type={pendingExtra}
        onConfirm={confirmExtra}
        onCancel={() => setPendingExtra(null)}
      />

      <SelectPlayerModal
        visible={phase === 'new-bowler'}
        title="New bowler"
        players={notBowlingPlayers}
        excludeIds={[]}
        onSelect={handleNewBowler}
      />

      <SelectPlayerModal
        visible={phase === 'new-batter'}
        title="New batsman"
        players={nextBatters}
        excludeIds={[]}
        onSelect={handleNewBatter}
      />

      <SelectPlayerModal
        visible={changeTarget !== null}
        title={changeTarget === 'bowler' ? 'Change bowler' : 'Change batsman'}
        players={changePlayers}
        excludeIds={[]}
        onSelect={handleChangePlayer}
        onClose={() => setChangeTarget(null)}
      />

      <EditOversModal
        visible={showEditOvers}
        current={match?.rules.oversPerInnings ?? oversFloor}
        minOvers={oversFloor}
        onConfirm={handleSaveOvers}
        onCancel={() => setShowEditOvers(false)}
      />
    </View>
  );
}
