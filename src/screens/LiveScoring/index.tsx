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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useClubStore } from '../../store/clubStore';
import {
  getLiveMatch,
  getClubPlayers,
  getMatchOvers,
  saveOver,
} from '../../services/matchService';
import { recordBall } from '../../services/scoringEngine';
import type {
  BallEntry,
  ExtrasType,
  Match,
  Player,
  StandardDismissalType,
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

const RHB_LABELS = [
  'Straight', 'Mid-on', 'Midwicket', 'Sq. leg', 'Fine leg',
  'Leg side', 'Behind', 'Third man', 'Back. pt', 'Point',
  'Mid-off', 'Cover',
];
const LHB_LABELS = [
  'Straight', 'Cover', 'Mid-off', 'Point', 'Back. pt',
  'Third man', 'Behind', 'Leg side', 'Fine leg', 'Sq. leg',
  'Midwicket', 'Mid-on',
];

function WagonWheelModal({
  visible,
  isLHB,
  runs,
  onDone,
}: {
  visible: boolean;
  isLHB: boolean;
  runs: number;
  onDone: (sector: number | null) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const labels = isLHB ? LHB_LABELS : RHB_LABELS;

  useEffect(() => { if (visible) setSel(null); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, alignItems: 'center', width: 340 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
            {runs === 4 ? 'FOUR!' : runs === 6 ? 'SIX!' : `${runs} run${runs !== 1 ? 's' : ''}`}
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Tap sector or skip</Text>

          <View style={{ width: WHEEL, height: WHEEL }}>
            {/* Background */}
            <View style={{ position: 'absolute', width: WHEEL, height: WHEEL, borderRadius: WC, backgroundColor: '#0f1e35' }} />

            {/* Rings */}
            {RINGS.map((r) => (
              <View
                key={r}
                style={{
                  position: 'absolute',
                  width: r * 2, height: r * 2,
                  borderRadius: r,
                  borderWidth: 1, borderColor: '#1e3a5f',
                  left: WC - r, top: WC - r,
                }}
              />
            ))}

            {/* 6 radial lines through center = 12 sectors */}
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  width: OUTER_R * 2, height: 1,
                  backgroundColor: '#1e3a5f',
                  left: WC - OUTER_R, top: WC - 0.5,
                  transform: [{ rotate: `${i * 30}deg` }],
                }}
              />
            ))}

            {/* Sector touch buttons */}
            {labels.map((label, i) => {
              const rad = ((i * 30 - 90) * Math.PI) / 180;
              const r = OUTER_R - 18;
              const x = WC + r * Math.cos(rad) - 24;
              const y = WC + r * Math.sin(rad) - 11;
              const active = sel === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSel(i)}
                  style={{
                    position: 'absolute',
                    left: x, top: y,
                    width: 48, height: 22,
                    backgroundColor: active ? '#4ade80' : 'transparent',
                    borderRadius: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: active ? '#0a1628' : '#6b7280', fontSize: 9, textAlign: 'center' }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}

            {/* Center dot */}
            <View style={{
              position: 'absolute', width: 8, height: 8, borderRadius: 4,
              backgroundColor: '#4ade80', left: WC - 4, top: WC - 4,
            }} />

            {/* Batsman label at bottom */}
            <Text style={{ position: 'absolute', bottom: 6, alignSelf: 'center', color: '#4b5563', fontSize: 10 }}>
              {isLHB ? 'LHB' : 'RHB'} ▲
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18, width: '100%' }}>
            <TouchableOpacity
              onPress={() => onDone(null)}
              style={{ flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#2d3f58', alignItems: 'center' }}
            >
              <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDone(sel)}
              style={{ flex: 1, padding: 13, borderRadius: 10, backgroundColor: '#4ade80', alignItems: 'center' }}
            >
              <Text style={{ color: '#0a1628', fontWeight: '700' }}>
                {sel !== null ? 'Confirm' : 'Skip'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Fielding panel ─────────────────────────────────────────────────

function FieldingPanel({
  visible,
  runs,
  players,
  fieldingEvents,
  onDone,
}: {
  visible: boolean;
  runs: number;
  players: Player[];
  fieldingEvents: Array<{ id: string; label: string }>;
  onDone: (eventId: string | null, fielderId: string | null) => void;
}) {
  const slideY = useRef(new Animated.Value(400)).current;
  const [eventId, setEventId] = useState<string | null>(null);
  const [fielderId, setFielderId] = useState<string | null>(null);
  const isBoundary = runs === 4 || runs === 6;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setEventId(null);
      setFielderId(null);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      if (isBoundary) {
        timerRef.current = setTimeout(() => onDone(null, null), 2500);
      }
    } else {
      Animated.timing(slideY, { toValue: 400, duration: 200, useNativeDriver: true }).start();
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: '#00000066' }}
        activeOpacity={1}
        onPress={() => onDone(eventId, fielderId)}
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
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2d3f58', alignSelf: 'center', marginBottom: 16 }} />

        {isBoundary ? (
          <Text style={{ color: '#fbbf24', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
            {runs === 4 ? '⚡ FOUR!' : '💥 SIX!'}
          </Text>
        ) : (
          <>
            {fieldingEvents.length > 0 && (
              <>
                <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>FIELDING EVENT</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {fieldingEvents.map((ev) => (
                    <TouchableOpacity
                      key={ev.id}
                      onPress={() => setEventId(ev.id === eventId ? null : ev.id)}
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

            <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>FIELDER (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {players.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setFielderId(p.id === fielderId ? null : p.id)}
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
          onPress={() => onDone(eventId, fielderId)}
          style={{ backgroundColor: '#4ade80', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: isBoundary ? 8 : 0 }}
        >
          <Text style={{ color: '#0a1628', fontWeight: '700', fontSize: 15 }}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
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
  onSelect: (type: string, fielderId?: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'type' | 'fielder'>('type');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const slideY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setStep('type');
      setSelectedType(null);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideY, { toValue: 500, duration: 200, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pickType = (type: string, needsFielder: boolean) => {
    if (needsFielder) {
      setSelectedType(type);
      setStep('fielder');
    } else {
      onSelect(type);
    }
  };

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
          {step === 'type' ? 'Wicket — how out?' : 'Select fielder'}
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
        ) : (
          <FlatList
            data={fieldingPlayers}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelect(selectedType!, item.id)}
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
}: {
  visible: boolean;
  title: string;
  players: Player[];
  excludeIds: string[];
  onSelect: (id: string) => void;
}) {
  const available = players.filter((p) => !excludeIds.includes(p.id));
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
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
  return (
    <View style={{ backgroundColor: '#0f1e35', padding: 20, paddingTop: 16 }}>
      <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>{matchName}</Text>
      <Text style={{ color: '#ffffff', fontSize: 52, fontWeight: '800', textAlign: 'center', lineHeight: 58 }}>
        {runs}<Text style={{ color: '#6b7280', fontSize: 32, fontWeight: '600' }}>/{wickets}</Text>
      </Text>
      <Text style={{ color: '#9ca3af', fontSize: 16, textAlign: 'center' }}>
        {oversDisplay} ov{ballsPerOver !== 6 ? ` (${ballsPerOver} ball overs)` : ''}
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
}: {
  player: Player | undefined;
  stats: BatterStats;
  onStrike: boolean;
  hand: 'RHB' | 'LHB';
  onToggleHand: () => void;
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
          {onStrike && (
            <View style={{ backgroundColor: '#164d29', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#4ade80', fontSize: 10, fontWeight: '700' }}>ON STRIKE</Text>
            </View>
          )}
        </View>
        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }}>
          SR {sr} · {stats.fours}×4 · {stats.sixes}×6
        </Text>
      </View>

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
}: {
  player: Player | undefined;
  stats: BowlerStats;
  ballsPerOver: number;
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
      <Text style={{ color: '#9ca3af', fontSize: 13 }}>
        {oversFull.toFixed(1)}-0-{stats.runsConceded}-{stats.wickets}
      </Text>
      <Text style={{ color: '#4b5563', fontSize: 12, marginLeft: 10 }}>econ {economy}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function emptyBatterStats(): BatterStats {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
}

function emptyBowlerStats(): BowlerStats {
  return { legalBalls: 0, completedOvers: 0, runsConceded: 0, wickets: 0 };
}

function buildDismissalConfig(rules: Match['rules']): DismissalConfig {
  return { ballsPerOver: rules.ballsPerOver, customDismissals: rules.customDismissals };
}

// ─── Main screen ─────────────────────────────────────────────────────

type Phase = 'loading' | 'no-match' | 'setup-batsmen' | 'setup-bowler' | 'scoring' | 'new-bowler' | 'new-batter';

export default function LiveScoringScreen() {
  const activeClubId = useClubStore((s) => s.activeClubId);
  const [phase, setPhase] = useState<Phase>('loading');
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [innings, setInnings] = useState<InningsState | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  // Pending ball flow
  const pendingInputRef = useRef<BallInput | null>(null);
  const [showWagon, setShowWagon] = useState(false);
  const [showFielding, setShowFielding] = useState(false);
  const [pendingRuns, setPendingRuns] = useState(0);

  // Modals
  const [showWicket, setShowWicket] = useState(false);
  const [setupOnStrike, setSetupOnStrike] = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activeClubId) { setPhase('no-match'); return; }
    setPhase('loading');
    try {
      const [liveMatch, clubPlayers] = await Promise.all([
        getLiveMatch(activeClubId),
        getClubPlayers(activeClubId),
      ]);
      if (!liveMatch) { setPhase('no-match'); return; }
      setMatch(liveMatch);
      setPlayers(clubPlayers);

      // Try to reconstruct innings from Firestore overs
      const overs = await getMatchOvers(activeClubId, liveMatch.id);
      if (overs.length === 0) {
        setPhase('setup-batsmen');
      } else {
        const reconstructed = reconstructInnings(overs, liveMatch.rules.ballsPerOver, liveMatch);
        setInnings(reconstructed);
        setPhase('scoring');
      }
    } catch {
      setPhase('no-match');
    }
  }, [activeClubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Innings reconstruction ──────────────────────────────────────

  function reconstructInnings(overs: import('../../types').OverDocument[], ballsPerOver: number, m: Match): InningsState {
    const sorted = [...overs].sort((a, b) => a.overNumber - b.overNumber);
    const battingIds = firstInningsBatters(m);
    const bowlingIds = firstInningsBowlers(m);

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
      inningsId: 'innings-1',
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

  // ── Setup handlers ───────────────────────────────────────────────

  function handleSetupOnStrike(id: string) {
    setSetupOnStrike(id);
  }

  function handleSetupOffStrike(id: string) {
    if (!match || !setupOnStrike) return;
    const batting = firstInningsBatters(match);
    const bowling = firstInningsBowlers(match);
    const hs: Record<string, 'RHB' | 'LHB'> = {};
    const initBatterStats: Record<string, BatterStats> = {};
    for (const pid of batting) initBatterStats[pid] = emptyBatterStats();

    setInnings({
      inningsId: 'innings-1',
      battingIds: batting,
      bowlingIds: bowling,
      totalRuns: 0,
      totalWickets: 0,
      overNumber: 0,
      legalBallsInOver: 0,
      onStrikeId: setupOnStrike,
      offStrikeId: id,
      bowlerId: '',
      batterStats: initBatterStats,
      bowlerStats: {},
      currentOverBalls: [],
      handedness: hs,
    });
    setSetupOnStrike(null);
    setPhase('setup-bowler');
  }

  function handleSetupBowler(id: string) {
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

  // ── Ball flow ────────────────────────────────────────────────────

  function startBall(input: BallInput) {
    pendingInputRef.current = input;
    setPendingRuns(input.runs + (input.extras?.runs ?? 0));
    setShowWagon(true);
  }

  function handleWagonDone(_sector: number | null) {
    setShowWagon(false);
    setShowFielding(true);
  }

  function handleFieldingDone(_eventId: string | null, _fielderId: string | null) {
    setShowFielding(false);
    commitBall();
  }

  function commitBall() {
    const input = pendingInputRef.current;
    if (!input || !innings || !match) return;
    pendingInputRef.current = null;

    const config = buildDismissalConfig(match.rules);
    const result = recordBall({ legalBallsInOver: innings.legalBallsInOver }, input, config);

    const snapshot: Snapshot = { ...innings };
    setHistory((h) => [...h, snapshot]);

    const newOverBalls = [...innings.currentOverBalls, result.ballEntry];

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
    if (result.rotateStrike) [newOnStrike, newOffStrike] = [newOffStrike, newOnStrike];

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
      onStrikeId: result.batterIsOut ? innings.onStrikeId : newOnStrike,
      offStrikeId: result.batterIsOut ? innings.offStrikeId : newOffStrike,
      batterStats: newBatterStats,
      bowlerStats: newBowlerStats,
      currentOverBalls: newCurrentOverBalls,
    };

    setInnings(newInnings);

    // Persist
    if (activeClubId && match) {
      saveOver({
        clubId: activeClubId,
        matchId: match.id,
        inningsId: innings.inningsId,
        overNumber: innings.overNumber,
        bowlerId: input.bowlerId,
        balls: newOverBalls,
        isComplete: result.isOverComplete,
      }).catch(() => {/* swallow – UI already updated */});
    }

    if (result.isOverComplete) setPhase('new-bowler');
    else if (result.batterIsOut) setPhase('new-batter');
  }

  // ── Extras ───────────────────────────────────────────────────────

  function handleExtra(type: ExtrasType) {
    if (!innings) return;
    const extraRuns = type === 'wide' || type === 'no-ball' ? 1 : 0;
    startBall({
      batsmanId: innings.onStrikeId,
      bowlerId: innings.bowlerId,
      runs: 0,
      extras: { type, runs: extraRuns },
    });
  }

  // ── Wicket ───────────────────────────────────────────────────────

  function handleWicketSelect(type: string, fielderId?: string) {
    setShowWicket(false);
    if (!innings) return;
    startBall({
      batsmanId: innings.onStrikeId,
      bowlerId: innings.bowlerId,
      runs: 0,
      dismissal: { type, fielderId },
    });
  }

  // ── Undo ────────────────────────────────────────────────────────

  function handleUndo() {
    if (history.length === 0 || !innings || !match || !activeClubId) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setInnings(prev);

    // Rewrite over to Firestore
    saveOver({
      clubId: activeClubId,
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
    setInnings((prev) => {
      if (!prev) return prev;
      return { ...prev, onStrikeId: id };
    });
    setPhase('scoring');
  }

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

  const enabledExtras = match?.rules.enabledExtras ?? [];
  const enabledDismissals = match?.rules.enabledDismissals ?? [];
  const fieldingPlayers = innings
    ? players.filter((p) => innings.bowlingIds.includes(p.id))
    : [];
  const enabledFieldingEvents = (match?.rules.fieldingEvents ?? []).filter((e) => e.enabled);

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
        <Text style={{ color: '#6b7280', fontSize: 18, textAlign: 'center', marginBottom: 8 }}>No live match</Text>
        <Text style={{ color: '#4b5563', fontSize: 14, textAlign: 'center' }}>
          Start a match from the Matches tab to begin scoring.
        </Text>
      </View>
    );
  }

  if (phase === 'setup-batsmen') {
    const batting = match ? firstInningsBatters(match) : [];
    const battingPlayers = players.filter((p) => batting.includes(p.id));
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
        <SelectPlayerModal
          visible={!setupOnStrike}
          title="Opening batsman — on strike"
          players={battingPlayers}
          excludeIds={[]}
          onSelect={handleSetupOnStrike}
        />
        <SelectPlayerModal
          visible={!!setupOnStrike}
          title="Opening batsman — off strike"
          players={battingPlayers}
          excludeIds={setupOnStrike ? [setupOnStrike] : []}
          onSelect={handleSetupOffStrike}
        />
      </View>
    );
  }

  if (phase === 'setup-bowler') {
    const bowling = match ? firstInningsBowlers(match) : [];
    const bowlingPlayers = players.filter((p) => bowling.includes(p.id));
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
        <SelectPlayerModal
          visible
          title="Opening bowler"
          players={bowlingPlayers}
          excludeIds={[]}
          onSelect={handleSetupBowler}
        />
      </View>
    );
  }

  if (!innings) return null;

  const onStrikePlayer = playerMap[innings.onStrikeId];
  const offStrikePlayer = playerMap[innings.offStrikeId];
  const bowlerPlayer = playerMap[innings.bowlerId];
  const onStrikeStat = innings.batterStats[innings.onStrikeId] ?? emptyBatterStats();
  const offStrikeStat = innings.batterStats[innings.offStrikeId] ?? emptyBatterStats();
  const bowlerStat = innings.bowlerStats[innings.bowlerId] ?? emptyBowlerStats();

  const notBowlingPlayers = players.filter((p) => innings.bowlingIds.includes(p.id) && p.id !== innings.bowlerId);
  const notBattingActiveIds = [innings.onStrikeId, innings.offStrikeId, ...Object.keys(innings.batterStats).filter((id) => innings.batterStats[id].isOut)];
  const nextBatters = players.filter((p) => innings.battingIds.includes(p.id) && !notBattingActiveIds.includes(p.id));

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628' }}>
      {/* Score header */}
      <ScoreHeader
        runs={innings.totalRuns}
        wickets={innings.totalWickets}
        overNumber={innings.overNumber}
        legalBalls={innings.legalBallsInOver}
        ballsPerOver={match?.rules.ballsPerOver ?? 6}
        matchName={match ? `${match.homeTeam} vs ${match.awayTeam}` : ''}
      />

      {/* Batter rows */}
      <BatterRow
        player={onStrikePlayer}
        stats={onStrikeStat}
        onStrike
        hand={onStrikeHand}
        onToggleHand={() => toggleHand(innings.onStrikeId)}
      />
      <BatterRow
        player={offStrikePlayer}
        stats={offStrikeStat}
        onStrike={false}
        hand={offStrikeHand}
        onToggleHand={() => toggleHand(innings.offStrikeId)}
      />

      {/* Swap strike */}
      <TouchableOpacity
        onPress={() =>
          setInnings((prev) =>
            prev ? { ...prev, onStrikeId: prev.offStrikeId, offStrikeId: prev.onStrikeId } : prev
          )
        }
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: 6, backgroundColor: '#0c1a2e',
          borderBottomWidth: 1, borderBottomColor: '#1e2d45',
          gap: 6,
        }}
      >
        <Text style={{ color: '#4b5563', fontSize: 12 }}>⇅ Swap strike</Text>
      </TouchableOpacity>

      {/* Bowler row */}
      <BowlerRow
        player={bowlerPlayer}
        stats={bowlerStat}
        ballsPerOver={match?.rules.ballsPerOver ?? 6}
      />

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

      {/* Run buttons */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10 }}>
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
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10 }}>
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
          onPress={() => setShowWicket(true)}
          style={{
            flex: 3, paddingVertical: 14, borderRadius: 10,
            backgroundColor: '#2d1515', borderWidth: 1.5, borderColor: '#dc2626',
            alignItems: 'center',
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
        onDone={handleFieldingDone}
      />

      <WicketSheet
        visible={showWicket}
        enabledDismissals={enabledDismissals}
        customDismissals={match?.rules.customDismissals ?? []}
        fieldingPlayers={fieldingPlayers}
        onSelect={handleWicketSelect}
        onClose={() => setShowWicket(false)}
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
    </View>
  );
}
