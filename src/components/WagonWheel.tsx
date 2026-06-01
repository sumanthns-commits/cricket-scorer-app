import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';

/**
 * Wagon wheel heatmap. Orientation per project spec:
 *   - Viewed from bowler's end. Batsman at BOTTOM (wheel centre), bowler at TOP.
 *   - 0° = top (straight, toward bowler), clockwise positive.
 *   - 12 uniform 30° sectors, 2° gap between each.
 *   - RHB: off side = LEFT, leg side = RIGHT. LHB: labels flip, geometry stays.
 */

const SECTORS = 12;
const SECTOR_DEG = 360 / SECTORS; // 30°
const GAP_DEG = 2;

// Cold → hot heat ramp.
const RAMP = ['#1e2d45', '#1e3a5f', '#3b82f6', '#facc15', '#f97316', '#ef4444'];

function lerpHex(a: string, b: string, t: number): string {
  const ax = parseInt(a.slice(1), 16);
  const bx = parseInt(b.slice(1), 16);
  const ar = (ax >> 16) & 255;
  const ag = (ax >> 8) & 255;
  const ab = ax & 255;
  const br = (bx >> 16) & 255;
  const bg = (bx >> 8) & 255;
  const bb = bx & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function heatColor(intensity: number): string {
  if (intensity <= 0) return RAMP[0];
  const scaled = Math.min(intensity, 1) * (RAMP.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, RAMP.length - 1);
  return lerpHex(RAMP[lo], RAMP[hi], scaled - lo);
}

// angle in degrees, 0 = up, clockwise positive
function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = point(cx, cy, r, startDeg);
  const [ex, ey] = point(cx, cy, r, endDeg);
  // wedge < 180° → large-arc-flag 0; clockwise in screen space → sweep-flag 1
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey} Z`;
}

export default function WagonWheel({
  data,
  batsmanHand = 'RHB',
  size = 260,
}: {
  data: number[];
  batsmanHand?: 'RHB' | 'LHB';
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24;
  const maxRuns = Math.max(1, ...data);
  const totalRuns = data.reduce((sum, v) => sum + v, 0);

  const offLabel = batsmanHand === 'RHB' ? 'OFF' : 'LEG';
  const legLabel = batsmanHand === 'RHB' ? 'LEG' : 'OFF';

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* boundary */}
        <Circle cx={cx} cy={cy} r={r + 4} fill="#0d1d35" stroke="#2d3f58" strokeWidth={1.5} />

        {/* sectors */}
        {data.map((runs, i) => {
          const start = i * SECTOR_DEG + GAP_DEG / 2;
          const end = (i + 1) * SECTOR_DEG - GAP_DEG / 2;
          return (
            <Path
              key={i}
              d={wedgePath(cx, cy, r, start, end)}
              fill={heatColor(runs / maxRuns)}
              stroke="#0a1628"
              strokeWidth={1}
            />
          );
        })}

        {/* pitch line toward bowler + batsman at centre */}
        <Line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" />
        <Circle cx={cx} cy={cy} r={5} fill="#e2e8f0" />

        {/* orientation labels */}
        <G>
          <SvgText x={cx} y={14} fill="#94a3b8" fontSize={11} fontWeight="700" textAnchor="middle">
            BOWLER
          </SvgText>
          <SvgText x={cx} y={size - 4} fill="#94a3b8" fontSize={11} fontWeight="700" textAnchor="middle">
            BATSMAN
          </SvgText>
          <SvgText x={10} y={cy} fill="#64748b" fontSize={10} fontWeight="700" textAnchor="start">
            {offLabel}
          </SvgText>
          <SvgText x={size - 10} y={cy} fill="#64748b" fontSize={10} fontWeight="700" textAnchor="end">
            {legLabel}
          </SvgText>
        </G>
      </Svg>

      {totalRuns === 0 ? (
        <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>No shot data yet</Text>
      ) : (
        <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
          {totalRuns} runs · {batsmanHand}
        </Text>
      )}
    </View>
  );
}
