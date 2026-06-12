import { useState, useEffect, useRef, useCallback } from 'react';
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
  getMatchOvers,
  saveOver,
  completeMatch,
  abandonMatch,
  deleteMatch,
  updateMatchOvers,
} from '../../services/matchService';
import { getClub, getClubMember } from '../../services/clubService';
import { useAuthStore } from '../../store/authStore';
import { recordBall } from '../../services/scoringEngine';
import type {
  BallEntry,
  ClubRules,
  CustomDismissal,
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

type Snapshot = InningsState;

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

function WagonWheelModal({
  visible,
  isLHB,
  runs,
  onDone,
}: {
  visible: boolean;
  isLHB: boolean;
  runs: number;
  onDone: (shot: WagonShot | null) => void;
}) {
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
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, alignItems: 'center', width: 340 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
            {runs === 4 ? 'FOUR!' : runs === 6 ? 'SIX!' : `${runs} run${runs !== 1 ? 's' : ''}`}
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 4 }}>
            Tap where the ball went — closer to the edge = deeper
          </Text>
          <Text style={{ color: sel ? '#4ade80' : '#374151', fontSize: 12, fontWeight: '600', marginBottom: 12, height: 16 }}>
            {sel ? `${labels[sel.sector]} · ${DEPTH_LABELS[sel.depth]}` : ' '}
          </Text>

          {/* One tappable surface — sector from angle, depth from radius */}
          <Pressable onPress={onWheelPress} style={{ width: WHEEL, height: WHEEL }}>
            {/* Background */}
            <View pointerEvents="none" style={{ position: 'absolute', width: WHEEL, height: WHEEL, borderRadius: WC, backgroundColor: '#0f1e35' }} />

            {/* Rings — highlight the selected depth band */}
            {RINGS.map((r, di) => (
              <View
                key={r}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: r * 2, height: r * 2,
                  borderRadius: r,
                  borderWidth: sel?.depth === di ? 2 : 1,
                  borderColor: sel?.depth === di ? '#4ade80' : '#1e3a5f',
                  left: WC - r, top: WC - r,
                }}
              />
            ))}

            {/* 6 radial lines through center = 12 sectors */}
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: OUTER_R * 2, height: 1,
                  backgroundColor: '#1e3a5f',
                  left: WC - OUTER_R, top: WC - 0.5,
                  transform: [{ rotate: `${i * 30}deg` }],
                }}
              />
            ))}

            {/* Non-interactive sector labels (guides) at a fixed radius */}
            {labels.map((label, i) => {
              const rad = ((i * 30 - 90) * Math.PI) / 180;
              const r = OUTER_R - 16;
              const x = WC + r * Math.cos(rad) - 26;
              const y = WC + r * Math.sin(rad) - 11;
              const active = sel?.sector === i;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{ position: 'absolute', left: x, top: y, width: 52, height: 22, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: active ? '#4ade80' : '#6b7280', fontSize: 9, textAlign: 'center', fontWeight: active ? '700' : '400' }}>
                    {label}
                  </Text>
                </View>
              );
            })}

            {/* Marker at the tapped point */}
            {sel && (
              <View pointerEvents="none" style={{
                position: 'absolute', width: 14, height: 14, borderRadius: 7,
                backgroundColor: '#4ade80', borderWidth: 2, borderColor: '#0a1628',
                left: sel.x - 7, top: sel.y - 7,
              }} />
            )}

            {/* Center dot */}
            <View pointerEvents="none" style={{
              position: 'absolute', width: 8, height: 8, borderRadius: 4,
              backgroundColor: '#64748b', left: WC - 4, top: WC - 4,
            }} />

            {/* Batsman label at bottom */}
            <Text pointerEvents="none" style={{ position: 'absolute', bottom: 6, alignSelf: 'center', color: '#4b5563', fontSize: 10 }}>
              {isLHB ? 'LHB' : 'RHB'} ▲
            </Text>
          </Pressable>

          {/* Single action: confirms the shot, or skips if nothing tapped */}
          <TouchableOpacity
            onPress={() => onDone(sel ? { sector: sel.sector, depth: sel.depth } : null)}
            style={{
              width: '100%', padding: 14, borderRadius: 10, marginTop: 18, alignItems: 'center',
              backgroundColor: canConfirm ? '#4ade80' : '#1e2d45',
              borderWidth: canConfirm ? 0 : 1, borderColor: '#2d3f58',
            }}
          >
            <Text style={{ color: canConfirm ? '#0a1628' : '#9ca3af', fontWeight: '700' }}>
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
  fieldingEvents: Array<{ id: string; label: string }>;
  hideFielders: boolean;
  onDone: (eventId: string | null, fielderId: string | null) => void;
}) {
  const slideY = useRef(new Animated.Value(400)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const [eventId, setEventId] = useState<string | null>(null);
  const [fielderId, setFielderId] = useState<string | null>(null);
  const isBoundary = runs === 4 || runs === 6;

  // Keep the latest selection + callback for the auto-dismiss timer.
  const selRef = useRef<{ eventId: string | null; fielderId: string | null }>({ eventId: null, fielderId: null });
  selRef.current = { eventId, fielderId };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Restart the auto-dismiss countdown (and progress bar). Called on open and
  // on every interaction so the panel only closes after the user is idle.
  const startCountdown = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(1);
    Animated.timing(progress, { toValue: 0, duration: FIELDING_AUTO_MS, useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished) onDoneRef.current(selRef.current.eventId, selRef.current.fielderId);
      }
    );
  }, [progress]);

  useEffect(() => {
    if (visible) {
      setEventId(null);
      setFielderId(null);
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
  const pickFielder = (id: string) => { setFielderId((c) => (c === id ? null : id)); startCountdown(); };
  const finish = () => { progress.stopAnimation(); onDone(eventId, fielderId); };

  if (!visible) return null;

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: '#00000066' }}
        activeOpacity={1}
        onPress={finish}
      />
      <Animated.View
        style={{
          backgroundColor: '#0f1e35',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 36,
          transform: [{ translateY: slideY }],
          maxHeight: 420,
        }}
      >
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2d3f58', alignSelf: 'center', marginBottom: 14 }} />

        {/* Auto-dismiss progress */}
        <View style={{ height: 3, backgroundColor: '#1e2d45', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
          <Animated.View style={{ height: 3, width: barWidth, backgroundColor: '#4ade80' }} />
        </View>

        {/* Celebrate the boundary, but still offer fielding-event chips below
            so a misfield/drop that leaked to the rope can be credited. */}
        {isBoundary && (
          <Text style={{ color: '#fbbf24', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 14 }}>
            {runs === 4 ? '⚡ FOUR!' : '💥 SIX!'}
          </Text>
        )}

        {fieldingEvents.length > 0 && (
          <>
            <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>FIELDING EVENT</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {fieldingEvents.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => pickEvent(ev.id)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: eventId === ev.id ? '#4ade80' : '#1e2d45',
                    borderWidth: 1, borderColor: eventId === ev.id ? '#4ade80' : '#2d3f58',
                  }}
                >
                  <Text style={{ color: eventId === ev.id ? '#0a1628' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>
                    {ev.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {!hideFielders && (
          <>
            <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>FIELDER (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {players.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => pickFielder(p.id)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: fielderId === p.id ? '#1e3a5f' : '#1e2d45',
                      borderWidth: 1, borderColor: fielderId === p.id ? '#4ade80' : '#2d3f58',
                    }}
                  >
                    <Text style={{ color: fielderId === p.id ? '#4ade80' : '#d1d5db', fontSize: 13 }}>
                      {p.displayName.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <TouchableOpacity
          onPress={finish}
          style={{ backgroundColor: '#4ade80', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: isBoundary ? 8 : 0 }}
        >
          <Text style={{ color: '#0a1628', fontWeight: '700', fontSize: 15 }}>Done</Text>
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
  onConfirm: (runRuns: number) => void;
  onCancel: () => void;
}) {
  if (!type) return null;
  const hasPenalty = type === 'wide' || type === 'no-ball';
  const prompt =
    type === 'wide' ? 'Runs the batsmen ran (+1 wide added)'
    : type === 'no-ball' ? 'Runs off the bat (+1 no-ball added)'
    : 'Runs taken';
  // Byes/leg-byes are only signalled when runs are run, so default the picker to 1.
  const options = hasPenalty ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, width: 320 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            {EXTRA_LABELS[type]}
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 18 }}>
            {prompt}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {options.map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => onConfirm(n)}
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
            onPress={onCancel}
            style={{ marginTop: 18, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2d3f58', alignItems: 'center' }}
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
const NO_WAGON: StandardDismissalType[] = ['stumped', 'hit-wicket'];
// Dismissals where a fielder is already captured on the wicket sheet, so the
// fielding overlay shouldn't ask for the fielder again.
const FIELDER_ALREADY_RECORDED: StandardDismissalType[] = ['caught', 'run-out', 'stumped'];

function WicketSheet({
  visible,
  enabledDismissals,
  customDismissals,
  fieldingPlayers,
  onSelect,
  onClose,
}: {
  visible: boolean;
  enabledDismissals: StandardDismissalType[];
  customDismissals: Array<{ id: string; label: string; batterIsOut: boolean }>;
  fieldingPlayers: Player[];
  onSelect: (type: string, fielderIds?: string[], completedRuns?: number) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'type' | 'fielder'>('type');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [pickedFielders, setPickedFielders] = useState<string[]>([]);
  const [completedRuns, setCompletedRuns] = useState(0);
  const slideY = useRef(new Animated.Value(500)).current;
  const multiFielder = selectedType === 'run-out'; // run-outs can involve several fielders

  useEffect(() => {
    if (visible) {
      setStep('type');
      setSelectedType(null);
      setPickedFielders([]);
      setCompletedRuns(0);
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
          paddingBottom: 36,
          transform: [{ translateY: slideY }],
          maxHeight: '70%',
        }}
      >
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2d3f58', alignSelf: 'center', marginBottom: 16 }} />
        <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
          {step === 'type' ? 'Wicket — how out?' : multiFielder ? 'Select fielders involved' : 'Select fielder'}
        </Text>

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
            <TouchableOpacity
              onPress={() => onSelect(selectedType!, pickedFielders, completedRuns)}
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
  const available = players.filter((p) => !excludeIds.includes(p.id));
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
        {onClose && <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />}
        <View style={{ backgroundColor: '#0f1e35', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '60%' }}>
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
  const isDot = ball.runs === 0 && !ball.extras && !ball.dismissal;
  const isWicket = !!ball.dismissal;
  const isWide = ball.extras?.type === 'wide';
  const isNoBall = ball.extras?.type === 'no-ball';
  const isFour = ball.runs === 4 && !ball.extras;
  const isSix = ball.runs === 6 && !ball.extras;

  const bg = isWicket ? '#dc2626' : isFour || isSix ? '#1e3a5f' : '#1e2d45';
  const border = isWicket ? '#dc2626' : isFour || isSix ? '#4ade80' : '#2d3f58';
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
      <Text style={{ color: isWicket ? '#ffffff' : '#d1d5db', fontSize: 12, fontWeight: '700' }}>
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
  const oversDisplay = `${overNumber}.${legalBalls}`;
  const ballsBowled = overNumber * ballsPerOver + legalBalls;
  const crr = ballsBowled > 0 ? ((runs * ballsPerOver) / ballsBowled).toFixed(2) : '0.00';
  return (
    <View style={{ backgroundColor: '#0f1e35', padding: 20, paddingTop: 16 }}>
      <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>{matchName}</Text>
      <Text style={{ color: '#ffffff', fontSize: 52, fontWeight: '800', textAlign: 'center', lineHeight: 58 }}>
        {runs}<Text style={{ color: '#6b7280', fontSize: 32, fontWeight: '600' }}>/{wickets}</Text>
      </Text>
      <Text style={{ color: '#9ca3af', fontSize: 16, textAlign: 'center' }}>
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
  const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '–';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#1e2d45',
      }}
    >
      {/* Strike bar */}
      <View
        style={{
          width: 4, height: 36, borderRadius: 2,
          backgroundColor: onStrike ? '#4ade80' : 'transparent',
          marginRight: 10,
          shadowColor: onStrike ? '#4ade80' : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: onStrike ? 0.9 : 0,
          shadowRadius: 6,
        }}
      />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
            {player?.displayName ?? '–'}
          </Text>
          {onStrike ? (
            <View style={{ backgroundColor: '#164d29', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#4ade80', fontSize: 10, fontWeight: '700' }}>ON STRIKE</Text>
            </View>
          ) : showStrikeHint ? (
            <Text style={{ color: '#4b5563', fontSize: 10, fontWeight: '600', fontStyle: 'italic' }}>tap to face</Text>
          ) : null}
        </View>
        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }}>
          SR {sr} · {stats.fours}×4 · {stats.sixes}×6
        </Text>
      </View>

      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 4 }}>
          <Text style={{ color: '#60a5fa', fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={onToggleHand}
        style={{
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
          backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
          marginRight: 14,
        }}
      >
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>{hand}</Text>
      </TouchableOpacity>

      <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800', minWidth: 36, textAlign: 'right' }}>
        {stats.runs}
      </Text>
      <Text style={{ color: '#6b7280', fontSize: 13, marginLeft: 2, minWidth: 28 }}>
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
  const oversFull = stats.completedOvers + (stats.legalBalls % ballsPerOver) / 10;
  const economy = stats.legalBalls > 0
    ? ((stats.runsConceded / stats.legalBalls) * 6).toFixed(1)
    : '–';
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: '#0c1a2e',
        borderBottomWidth: 1, borderBottomColor: '#1e2d45',
      }}
    >
      <Text style={{ color: '#6b7280', fontSize: 13, marginRight: 8 }}>🎯</Text>
      <Text style={{ color: '#d1d5db', fontSize: 14, flex: 1 }}>{player?.displayName ?? '–'}</Text>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 8, marginRight: 6 }}>
          <Text style={{ color: '#60a5fa', fontSize: 15 }}>✎</Text>
        </TouchableOpacity>
      )}
      <Text style={{ color: '#9ca3af', fontSize: 13 }}>
        {oversFull.toFixed(1)}-0-{stats.runsConceded}-{stats.wickets}
      </Text>
      <Text style={{ color: '#4b5563', fontSize: 12, marginLeft: 10 }}>econ {economy}</Text>
    </View>
  );
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
  const oversBowled = `${inn.overNumber}.${inn.legalBallsInOver}`;
  const batters = inn.battingIds.filter((id) => {
    const s = inn.batterStats[id];
    return !!s && (s.balls > 0 || s.runs > 0 || s.isOut || id === inn.onStrikeId || id === inn.offStrikeId);
  });
  const bowlers = inn.bowlingIds.filter((id) => !!inn.bowlerStats[id]);
  const num = { width: 38, textAlign: 'right' as const, color: '#d1d5db', fontSize: 13 };
  const bnum = { width: 44, textAlign: 'right' as const, color: '#d1d5db', fontSize: 13 };
  const head = { textAlign: 'right' as const, color: '#4b5563', fontSize: 11 };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>
        {inn.totalRuns}/{inn.totalWickets}{' '}
        <Text style={{ color: '#6b7280', fontSize: 14 }}>({oversBowled} ov)</Text>
      </Text>

      <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 6 }}>BATTING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: '#4b5563', fontSize: 11 }}>Batter</Text>
        {['R', 'B', '4s', '6s', 'SR'].map((h) => <Text key={h} style={{ ...head, width: 38 }}>{h}</Text>)}
      </View>
      {batters.map((id) => {
        const s = inn.batterStats[id];
        const atCrease = id === inn.onStrikeId || id === inn.offStrikeId;
        const status = s.isOut ? 'out' : atCrease ? 'not out' : '';
        const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(0) : '–';
        return (
          <View key={id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1e2d45' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#ffffff', fontSize: 13 }}>{playerMap[id]?.displayName ?? id}</Text>
              {status ? <Text style={{ color: s.isOut ? '#6b7280' : '#4ade80', fontSize: 10 }}>{status}</Text> : null}
            </View>
            <Text style={num}>{s.runs}</Text>
            <Text style={num}>{s.balls}</Text>
            <Text style={num}>{s.fours}</Text>
            <Text style={num}>{s.sixes}</Text>
            <Text style={num}>{sr}</Text>
          </View>
        );
      })}

      <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 6 }}>BOWLING</Text>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={{ flex: 1, color: '#4b5563', fontSize: 11 }}>Bowler</Text>
        {['O', 'R', 'W', 'Econ'].map((h) => <Text key={h} style={{ ...head, width: 44 }}>{h}</Text>)}
      </View>
      {bowlers.map((id) => {
        const b = inn.bowlerStats[id];
        const overs = `${Math.floor(b.legalBalls / ballsPerOver)}.${b.legalBalls % ballsPerOver}`;
        const econ = b.legalBalls > 0 ? (b.runsConceded / (b.legalBalls / ballsPerOver)).toFixed(1) : '–';
        return (
          <View key={id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1e2d45' }}>
            <Text style={{ flex: 1, color: '#ffffff', fontSize: 13 }}>{playerMap[id]?.displayName ?? id}</Text>
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
  const [tab, setTab] = useState<'scoring' | 'scorecard'>('scoring');
  const [cardInnings, setCardInnings] = useState<1 | 2>(1);

  // Pending ball flow
  const pendingInputRef = useRef<BallInput | null>(null);
  const pendingWagonRef = useRef<WagonShot | null>(null);
  const pendingFieldingRef = useRef<{ eventId?: string; eventLabel?: string; fielderId?: string } | null>(null);
  const [showWagon, setShowWagon] = useState(false);
  const [showFielding, setShowFielding] = useState(false);
  // Hide the fielder picker when the wicket sheet already captured the fielder
  // (caught / run-out) so we don't ask for it twice.
  const [hideFieldingFielders, setHideFieldingFielders] = useState(false);
  const [pendingRuns, setPendingRuns] = useState(0);
  // Which end a replacement batter enters at — flips to 'offStrike' when an odd
  // number of runs is completed on a run-out (the batters crossed).
  const newBatterEndRef = useRef<'onStrike' | 'offStrike'>('onStrike');

  // Modals
  const [showWicket, setShowWicket] = useState(false);
  const [pendingExtra, setPendingExtra] = useState<ExtrasType | null>(null);
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

      // Try to reconstruct innings from Firestore overs
      const overs = await getMatchOvers(clubId, liveMatch.id);
      const ballsPerOver = liveMatch.rules.ballsPerOver;
      const lastManStands = club?.rules.lastManStands ?? liveMatch.rules.lastManStands;
      const oversPerInnings = liveMatch.rules.oversPerInnings;
      const firstOvers = overs.filter((o) => o.inningsId === 'innings-1');
      const secondOvers = overs.filter((o) => o.inningsId === 'innings-2');

      if (overs.length === 0) {
        setInningsNumber(1);
        beginInnings(liveMatch, 1);
      } else if (secondOvers.length > 0) {
        // Resuming the 2nd innings (a chase).
        const firstRuns = sumInningsRuns(firstOvers);
        setFirstInnings(reconstructInnings(firstOvers, ballsPerOver, liveMatch, 1));
        setFirstInningsRuns(firstRuns);
        setInningsNumber(2);
        const reconstructed = reconstructInnings(secondOvers, ballsPerOver, liveMatch, 2);
        setInnings(reconstructed);
        const chased = reconstructed.totalRuns >= firstRuns + 1;
        setPhase(chased || isInningsComplete(reconstructed, lastManStands, oversPerInnings) ? 'innings-over' : 'scoring');
      } else {
        // 1st innings (possibly already all out and awaiting the 2nd).
        setInningsNumber(1);
        const reconstructed = reconstructInnings(firstOvers, ballsPerOver, liveMatch, 1);
        setInnings(reconstructed);
        setPhase(isInningsComplete(reconstructed, lastManStands, oversPerInnings) ? 'innings-over' : 'scoring');
      }
    } catch {
      setPhase('no-match');
    }
  }, [clubId, matchId]);

  function sumInningsRuns(overs: import('../../types').OverDocument[]): number {
    let total = 0;
    for (const o of overs) for (const b of o.balls) total += b.runs + (b.extras?.runs ?? 0);
    return total;
  }

  function isInningsComplete(inn: InningsState, lastManStands: boolean, oversPerInnings?: number): boolean {
    const wicketsToEnd = inn.battingIds.length - (lastManStands ? 0 : 1);
    const allOut = inn.totalWickets >= wicketsToEnd;
    const oversDone = oversPerInnings != null && inn.overNumber >= oversPerInnings;
    return allOut || oversDone;
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Seal the match once the 2nd innings is over so it stops being 'live'
  // (otherwise the Live tab keeps loading it and scoring could continue).
  const sealedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'innings-over' || inningsNumber !== 2) return;
    if (!innings || !match || !clubId || sealedRef.current) return;
    sealedRef.current = true;
    let result = '';
    if (firstInningsRuns != null) {
      if (innings.totalRuns > firstInningsRuns) result = 'Team batting second won';
      else if (innings.totalRuns === firstInningsRuns) result = 'Match tied';
      else result = `Team batting first won by ${firstInningsRuns - innings.totalRuns} runs`;
    }
    completeMatch(clubId, match.id, result).catch(() => {/* UI already updated */});
  }, [phase, inningsNumber, innings, match, clubId, firstInningsRuns]);

  // ── Innings reconstruction ──────────────────────────────────────

  function reconstructInnings(overs: import('../../types').OverDocument[], ballsPerOver: number, m: Match, n: number): InningsState {
    const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);
    const battingIds = battingForInnings(m, n);
    const bowlingIds = bowlingForInnings(m, n);

    const batterStats: Record<string, BatterStats> = {};
    const bowlerStats: Record<string, BowlerStats> = {};

    let totalRuns = 0;
    let totalWickets = 0;
    let onStrikeId = battingIds[0] ?? '';
    let offStrikeId = battingIds[1] ?? '';
    let nextBatterIdx = 2;
    const handedness: Record<string, 'RHB' | 'LHB'> = {};

    for (const over of sorted) {
      if (!bowlerStats[over.bowlerId]) bowlerStats[over.bowlerId] = emptyBowlerStats();
      const bs = bowlerStats[over.bowlerId];
      let legalInOver = 0;

      for (const ball of over.balls) {
        if (!batterStats[ball.batsmanId]) batterStats[ball.batsmanId] = emptyBatterStats();
        const bat = batterStats[ball.batsmanId];

        const isLegal = ball.extras?.type !== 'wide' && ball.extras?.type !== 'no-ball';
        const runs = ball.runs + (ball.extras?.runs ?? 0);
        const isOut = !!ball.dismissal;

        totalRuns += runs;
        if (isOut) totalWickets++;

        if (isLegal) { bat.balls++; legalInOver++; }
        bat.runs += ball.runs;
        if (ball.runs === 4 && !ball.extras) bat.fours++;
        if (ball.runs === 6 && !ball.extras) bat.sixes++;
        if (isOut) bat.isOut = true;

        bs.runsConceded += runs;
        if (isLegal) bs.legalBalls++;
        if (ball.dismissal && isOut) bs.wickets++;

        // Strike rotation (simplified replay)
        if (isOut) {
          const nextBatter = battingIds[nextBatterIdx++] ?? '';
          onStrikeId = nextBatter;
        } else if ((runs % 2 !== 0) !== (legalInOver >= ballsPerOver)) {
          [onStrikeId, offStrikeId] = [offStrikeId, onStrikeId];
        }
      }

      if (over.isComplete) {
        bs.completedOvers++;
        [onStrikeId, offStrikeId] = [offStrikeId, onStrikeId]; // end-of-over rotation already baked in above
      }
    }

    const lastOver = sorted[sorted.length - 1];
    const legalBallsInOver = lastOver?.isComplete ? 0 : (lastOver?.balls.filter(
      (b) => b.extras?.type !== 'wide' && b.extras?.type !== 'no-ball'
    ).length ?? 0);

    return {
      inningsId: `innings-${n}`,
      battingIds,
      bowlingIds,
      totalRuns,
      totalWickets,
      overNumber: lastOver?.isComplete
        ? (lastOver.overNumber + 1)
        : (lastOver?.overNumber ?? 0),
      legalBallsInOver,
      onStrikeId,
      offStrikeId,
      bowlerId: lastOver?.bowlerId ?? bowlingIds[0] ?? '',
      batterStats,
      bowlerStats,
      currentOverBalls: lastOver?.isComplete ? [] : (lastOver?.balls ?? []),
      handedness,
    };
  }

  function firstInningsBatters(m: Match): string[] {
    if (!m.toss) return m.teamA ?? [];
    const tossWinnerBats =
      (m.toss.winnerId === 'homeTeam' && m.toss.choice === 'bat') ||
      (m.toss.winnerId === 'awayTeam' && m.toss.choice === 'field');
    return tossWinnerBats ? (m.teamA ?? []) : (m.teamB ?? []);
  }

  function firstInningsBowlers(m: Match): string[] {
    const batters = firstInningsBatters(m);
    const all = [...(m.teamA ?? []), ...(m.teamB ?? [])];
    return all.filter((id) => !batters.includes(id));
  }

  // Teams swap for the 2nd innings: who bowled first now bats, and vice versa.
  function battingForInnings(m: Match, n: number): string[] {
    return n === 1 ? firstInningsBatters(m) : firstInningsBowlers(m);
  }
  function bowlingForInnings(m: Match, n: number): string[] {
    return n === 1 ? firstInningsBowlers(m) : firstInningsBatters(m);
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
    // Stumped / hit-wicket have no shot to plot — skip the wagon wheel.
    const d = input.dismissal;
    const skipWagon = !!d && NO_WAGON.includes(d.type as StandardDismissalType);
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
    const isNoFielderWicket =
      !!d && d.type in STD_LABELS && !FIELDER_NEEDED.includes(d.type as StandardDismissalType);
    // Caught / run-out already recorded the fielder on the wicket sheet.
    const fielderAlreadyRecorded =
      !!d && FIELDER_ALREADY_RECORDED.includes(d.type as StandardDismissalType);
    if (isNoFielderWicket || (fielderAlreadyRecorded && enabledFieldingEvents.length === 0)) {
      // Nothing left to collect — skip the overlay entirely.
      pendingFieldingRef.current = null;
      commitBall();
    } else {
      // Hide the fielder picker when it's already recorded; only offer the
      // fielding-event chips.
      setHideFieldingFielders(fielderAlreadyRecorded);
      setShowFielding(true);
    }
  }

  function handleFieldingDone(eventId: string | null, fielderId: string | null) {
    // Snapshot the event label so counts survive later rule edits.
    const eventLabel = eventId
      ? clubRules?.fieldingEvents.find((e) => e.id === eventId)?.label
      : undefined;
    pendingFieldingRef.current = {
      eventId: eventId ?? undefined,
      eventLabel,
      fielderId: fielderId ?? undefined,
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

    const snapshot: Snapshot = { ...innings };
    setHistory((h) => [...h, snapshot]);

    // Attach wagon-wheel + fielding metadata collected during the ball flow.
    // (ignoreUndefinedProperties is enabled, so absent fields are dropped.)
    const ballEntry: BallEntry = { ...result.ballEntry };
    if (pendingWagonRef.current) ballEntry.wagon = pendingWagonRef.current;
    const fielding = pendingFieldingRef.current;
    if (fielding && (fielding.eventId || fielding.fielderId)) {
      ballEntry.fielding = fielding;
    }
    pendingWagonRef.current = null;
    pendingFieldingRef.current = null;

    const newOverBalls = [...innings.currentOverBalls, ballEntry];

    // Update batter stats
    const newBatterStats = { ...innings.batterStats };
    if (!newBatterStats[input.batsmanId]) newBatterStats[input.batsmanId] = emptyBatterStats();
    const bat = { ...newBatterStats[input.batsmanId] };
    bat.runs += input.runs;
    if (result.isLegalDelivery) bat.balls++;
    if (input.runs === 4 && !input.extras) bat.fours++;
    if (input.runs === 6 && !input.extras) bat.sixes++;
    if (result.batterIsOut) bat.isOut = true;
    newBatterStats[input.batsmanId] = bat;

    // Update bowler stats
    const newBowlerStats = { ...innings.bowlerStats };
    if (!newBowlerStats[input.bowlerId]) newBowlerStats[input.bowlerId] = emptyBowlerStats();
    const bow = { ...newBowlerStats[input.bowlerId] };
    bow.runsConceded += result.runsScored;
    if (result.isLegalDelivery) bow.legalBalls++;
    if (result.bowlerGetsWicket) bow.wickets++;

    const newTotalRuns = innings.totalRuns + result.runsScored;
    const newWickets = innings.totalWickets + (result.batterIsOut ? 1 : 0);

    let newOnStrike = innings.onStrikeId;
    let newOffStrike = innings.offStrikeId;
    // A lone (last man standing) batter always keeps strike — no partner to rotate to.
    const isLoneBatter = innings.offStrikeId === '';
    if (result.rotateStrike && !isLoneBatter) [newOnStrike, newOffStrike] = [newOffStrike, newOnStrike];

    // Run-out with an odd number of completed runs → the batters crossed, so the
    // surviving partner is now on strike and the replacement comes in off strike.
    const crossedOnRunOut =
      result.batterIsOut &&
      input.dismissal?.type === 'run-out' &&
      result.runsScored % 2 !== 0 &&
      !isLoneBatter;

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
      onStrikeId: result.batterIsOut ? (crossedOnRunOut ? innings.offStrikeId : innings.onStrikeId) : newOnStrike,
      offStrikeId: result.batterIsOut ? (crossedOnRunOut ? innings.onStrikeId : innings.offStrikeId) : newOffStrike,
      batterStats: newBatterStats,
      bowlerStats: newBowlerStats,
      currentOverBalls: newCurrentOverBalls,
    };

    setInnings(newInnings);

    // Persist
    if (clubId && match) {
      saveOver({
        clubId,
        matchId: match.id,
        inningsId: innings.inningsId,
        overNumber: innings.overNumber,
        bowlerId: input.bowlerId,
        balls: newOverBalls,
        isComplete: result.isOverComplete,
      }).catch(() => {/* swallow – UI already updated */});
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
      const dismissedId = input.batsmanId; // the on-strike batter
      const partnerId = innings.offStrikeId; // '' if already last man standing
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
      // Replacement available. On a crossed run-out the out batter now sits at
      // the off-strike slot, so the replacement fills that end instead.
      newBatterEndRef.current = crossedOnRunOut ? 'offStrike' : 'onStrike';
      setPhase(oversDone ? 'innings-over' : result.isOverComplete ? 'new-bowler' : 'new-batter');
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

  function confirmExtra(runRuns: number) {
    const type = pendingExtra;
    setPendingExtra(null);
    if (!type || !innings) return;
    // wide: 1 penalty + runs ran, all as extras, none off the bat.
    // no-ball: 1 penalty extra + runs off the bat (credited to the batter).
    // bye / leg-bye: runs taken, all as extras.
    const runsOffBat = type === 'no-ball' ? runRuns : 0;
    const extraRuns =
      type === 'wide' ? 1 + runRuns
      : type === 'no-ball' ? 1
      : runRuns;
    startBall({
      batsmanId: innings.onStrikeId,
      bowlerId: innings.bowlerId,
      runs: runsOffBat,
      extras: { type, runs: extraRuns },
    });
  }

  // ── Wicket ───────────────────────────────────────────────────────

  function handleWicketSelect(type: string, fielderIds?: string[], completedRuns?: number) {
    setShowWicket(false);
    if (!innings) return;
    startBall({
      batsmanId: innings.onStrikeId,
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
    if (history.length === 0 || !innings || !match || !clubId) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setInnings(prev);

    // Rewrite over to Firestore
    saveOver({
      clubId,
      matchId: match.id,
      inningsId: prev.inningsId,
      overNumber: prev.overNumber,
      bowlerId: prev.bowlerId,
      balls: prev.currentOverBalls,
      isComplete: false,
    }).catch(() => {});

    setPhase('scoring');
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
    setPhase('scoring');
  }

  function handleNewBatter(id: string) {
    if (!innings) return;
    const end = newBatterEndRef.current;
    newBatterEndRef.current = 'onStrike';
    setInnings((prev) => {
      if (!prev) return prev;
      return { ...prev, [end === 'offStrike' ? 'offStrikeId' : 'onStrikeId']: id };
    });
    setPhase('scoring');
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

  const changePlayers = !innings || !changeTarget ? [] :
    changeTarget === 'bowler'
      ? players.filter((p) => innings.bowlingIds.includes(p.id) && p.id !== innings.bowlerId)
      : players.filter((p) =>
          innings.battingIds.includes(p.id) &&
          !innings.batterStats[p.id]?.isOut &&
          p.id !== (changeTarget === 'onStrike' ? innings.offStrikeId : innings.onStrikeId)
        );

  // ── Derived ──────────────────────────────────────────────────────

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));
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
  const fieldingPlayers = innings
    ? players.filter((p) => innings.bowlingIds.includes(p.id))
    : [];
  const enabledFieldingEvents = (clubRules?.fieldingEvents ?? []).filter((e) => e.enabled);

  // ── Render phases ────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  if (phase === 'no-match') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#6b7280', fontSize: 18, textAlign: 'center', marginBottom: 8 }}>Match not available</Text>
        <Text style={{ color: '#4b5563', fontSize: 14, textAlign: 'center' }}>
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
    let resultLine = '';
    if (!isFirstInnings && firstInningsRuns != null) {
      if (innings.totalRuns > firstInningsRuns) {
        resultLine = 'Team batting second won 🏆';
      } else if (innings.totalRuns === firstInningsRuns) {
        resultLine = 'Match tied';
      } else {
        resultLine = `Team batting first won by ${firstInningsRuns - innings.totalRuns} run${firstInningsRuns - innings.totalRuns !== 1 ? 's' : ''} 🏆`;
      }
    }
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#4ade80', fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>
          {isFirstInnings ? '1ST INNINGS COMPLETE' : 'MATCH COMPLETE'}
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 44, fontWeight: '800' }}>
          {innings.totalRuns}
          <Text style={{ color: '#6b7280', fontSize: 30, fontWeight: '600' }}>/{innings.totalWickets}</Text>
        </Text>
        <Text style={{ color: '#9ca3af', fontSize: 15, marginTop: 6 }}>
          {innings.overNumber} overs · {overs} balls
        </Text>

        {isFirstInnings ? (
          isAdmin ? (
          <TouchableOpacity
            onPress={() => startSecondInnings(innings)}
            style={{ marginTop: 32, backgroundColor: '#4ade80', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 }}
          >
            <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>
              Start 2nd innings (target {innings.totalRuns + 1})
            </Text>
          </TouchableOpacity>
          ) : (
          <Text style={{ color: '#9ca3af', fontSize: 14, marginTop: 24, textAlign: 'center' }}>
            Waiting for 2nd innings...
          </Text>
          )
        ) : (
          <Text style={{ color: '#fbbf24', fontSize: 16, fontWeight: '700', marginTop: 24, textAlign: 'center' }}>
            {resultLine}
          </Text>
        )}

        <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 24, textAlign: 'center' }}>
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

  const notBowlingPlayers = players.filter((p) => innings.bowlingIds.includes(p.id) && p.id !== innings.bowlerId);
  const notBattingActiveIds = [innings.onStrikeId, innings.offStrikeId, ...Object.keys(innings.batterStats).filter((id) => innings.batterStats[id].isOut)];
  const nextBatters = players.filter((p) => innings.battingIds.includes(p.id) && !notBattingActiveIds.includes(p.id));

  // Which innings the scorecard tab shows (innings 1 lives in firstInnings once the chase starts).
  const scorecardInn = inningsNumber === 2 ? (cardInnings === 1 ? firstInnings : innings) : innings;

  // Overs can only be edited while the 1st innings is in progress, and never
  // below the overs already bowled (a part-bowled over counts as one).
  const oversFloor = Math.max(1, innings.overNumber + (innings.legalBallsInOver > 0 ? 1 : 0));
  const canEditOvers = isAdmin && inningsNumber === 1 && phase === 'scoring' && match?.rules.oversPerInnings != null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
      {/* Top tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#0c1a2e' }}>
        {(['scoring', 'scorecard'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? '#4ade80' : 'transparent' }}
          >
            <Text style={{ color: tab === t ? '#4ade80' : '#9ca3af', fontWeight: '700', fontSize: 13 }}>
              {t === 'scoring' ? 'SCORING' : 'SCORECARD'}
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
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: cardInnings === n ? '#1e3a5f' : '#11203a', borderWidth: 1, borderColor: cardInnings === n ? '#4ade80' : '#2d3f58', alignItems: 'center' }}
                >
                  <Text style={{ color: cardInnings === n ? '#4ade80' : '#9ca3af', fontWeight: '600' }}>Innings {n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {scorecardInn ? (
            <Scorecard inn={scorecardInn} playerMap={playerMap} ballsPerOver={match?.rules.ballsPerOver ?? 6} />
          ) : (
            <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 40 }}>No data yet</Text>
          )}
        </View>
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
            paddingVertical: 6, backgroundColor: '#0c1a2e',
            borderBottomWidth: 1, borderBottomColor: '#1e2d45',
          }}
        >
          <Text style={{ color: '#6b7280', fontSize: 12 }}>
            {match.rules.oversPerInnings} over match
          </Text>
          {canEditOvers && <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '600' }}>✎ Edit</Text>}
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
          <View style={{ backgroundColor: '#11203a', paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' }}>
            <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: '700' }}>
              Need {need} run{need !== 1 ? 's' : ''}
              {ballsLeft != null ? ` from ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}` : ''}
            </Text>
            {rrr != null && (
              <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>
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
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e2d45' }}>
          <Text style={{ color: '#6b7280', fontSize: 12, fontStyle: 'italic' }}>Last man standing — batting alone</Text>
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
        <Text style={{ color: '#fbbf24', fontSize: 13, textAlign: 'center', paddingVertical: 10 }}>
          Select both batsmen and the bowler (✎) to start scoring
        </Text>
      )}

      {/* Ball log */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ color: '#4b5563', fontSize: 12, marginRight: 8 }}>This over:</Text>
        {innings.currentOverBalls.length === 0 ? (
          <Text style={{ color: '#2d3f58', fontSize: 13 }}>–</Text>
        ) : (
          innings.currentOverBalls.map((ball, i) => <BallCircle key={i} ball={ball} />)
        )}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#1e2d45', marginHorizontal: 16, marginBottom: 12 }} />

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
                backgroundColor: r === 4 ? '#1e3a5f' : r === 6 ? '#2d1a5f' : '#1e2d45',
                borderWidth: 1.5,
                borderColor: r === 4 ? '#4ade80' : r === 6 ? '#a78bfa' : '#2d3f58',
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: r === 4 ? '#4ade80' : r === 6 ? '#a78bfa' : '#ffffff',
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
                  backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
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
              backgroundColor: '#2d1515', borderWidth: 1.5, borderColor: '#dc2626',
              alignItems: 'center', opacity: scoringReady ? 1 : 0.4,
            }}
          >
            <Text style={{ color: '#dc2626', fontSize: 16, fontWeight: '800' }}>Wicket ▼</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleUndo}
            disabled={history.length === 0}
            style={{
              flex: 1, paddingVertical: 14, borderRadius: 10,
              backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#2d3f58',
              alignItems: 'center',
              opacity: history.length === 0 ? 0.4 : 1,
            }}
          >
            <Text style={{ color: '#9ca3af', fontSize: 15, fontWeight: '700' }}>↩ Undo</Text>
          </TouchableOpacity>
        </View>

        {/* Delete (before first ball) or Abandon (after) */}
        <TouchableOpacity
          onPress={firstBallBowled ? handleAbandon : handleDeleteMatch}
          style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}
        >
          <Text style={{ color: '#6b7280', fontSize: 13, fontWeight: '600' }}>
            {firstBallBowled ? 'Abandon match' : 'Delete match'}
          </Text>
        </TouchableOpacity>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Text style={{ color: '#4b5563', fontSize: 13 }}>Watching live</Text>
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
        fieldingEvents={enabledFieldingEvents}
        hideFielders={hideFieldingFielders}
        onDone={handleFieldingDone}
      />

      <WicketSheet
        visible={showWicket}
        enabledDismissals={enabledDismissals}
        customDismissals={liveCustomDismissals}
        fieldingPlayers={fieldingPlayers}
        onSelect={handleWicketSelect}
        onClose={() => setShowWicket(false)}
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
