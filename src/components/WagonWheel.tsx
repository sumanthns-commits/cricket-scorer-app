import { View, Text } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { useThemeStore } from '../store/themeStore';

/**
 * Wagon wheel heatmap. Orientation per project spec:
 *   - Keeper's view. Batsman at BOTTOM (wheel centre), bowler at TOP.
 *   - 0° = top (straight, toward bowler), clockwise positive.
 *   - 12 uniform 30° sectors, 2° gap between each.
 *   - RHB: off side = RIGHT, leg side = LEFT. LHB: labels flip, geometry stays.
 */

const SECTORS = 12;
const SECTOR_DEG = 360 / SECTORS; // 30°
const GAP_DEG = 2;

const DARK_RAMP  = ['#1e2d45', '#1e3a5f', '#3b82f6', '#facc15', '#f97316', '#ef4444'];
const LIGHT_RAMP = ['#bbf7d0', '#86efac', '#fbbf24', '#f97316', '#ef4444', '#dc2626'];

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

function heatColor(intensity: number, ramp: string[]): string {
  if (intensity <= 0) return ramp[0];
  const scaled = Math.min(intensity, 1) * (ramp.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, ramp.length - 1);
  return lerpHex(ramp[lo], ramp[hi], scaled - lo);
}

// angle in degrees, 0 = up, clockwise positive
function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = point(cx, cy, r, startDeg);
  const [ex, ey] = point(cx, cy, r, endDeg);
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
  const theme = useThemeStore((s) => s.theme);
  const isLight = theme.id === 'light';

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24;
  const maxRuns = Math.max(1, ...data);
  const totalRuns = data.reduce((sum, v) => sum + v, 0);

  const ramp = isLight ? LIGHT_RAMP : DARK_RAMP;
  const groundFill   = isLight ? '#22c55e' : '#0d1d35';
  const groundStroke = isLight ? '#15803d' : '#2d3f58';
  const sectorStroke = isLight ? '#15803d' : '#0a1628';
  const pitchStroke  = isLight ? '#166534' : '#64748b';
  const centerFill   = isLight ? '#ffffff' : '#e2e8f0';
  const labelFill    = isLight ? '#14532d' : '#94a3b8';
  const sideFill     = isLight ? '#166534' : '#64748b';

  const leftLabel  = batsmanHand === 'RHB' ? 'LEG' : 'OFF';
  const rightLabel = batsmanHand === 'RHB' ? 'OFF' : 'LEG';

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* ground */}
        <Circle cx={cx} cy={cy} r={r + 4} fill={groundFill} stroke={groundStroke} strokeWidth={1.5} />

        {/* sectors */}
        {data.map((runs, i) => {
          const start = i * SECTOR_DEG + GAP_DEG / 2;
          const end = (i + 1) * SECTOR_DEG - GAP_DEG / 2;
          const midDeg = (start + end) / 2;
          const labelR = r * 0.62;
          const [lx, ly] = point(cx, cy, labelR, midDeg);
          const pct = totalRuns > 0 ? Math.round((runs / totalRuns) * 100) : 0;
          const intensity = runs / maxRuns;
          return (
            <G key={i}>
              <Path
                d={wedgePath(cx, cy, r, start, end)}
                fill={heatColor(intensity, ramp)}
                stroke={sectorStroke}
                strokeWidth={1}
              />
              {runs > 0 && (
                <SvgText
                  x={lx}
                  y={ly + 4}
                  fill={intensity > 0.5 ? '#ffffff' : (isLight ? '#14532d' : '#cbd5e1')}
                  fontSize={9}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {pct}%
                </SvgText>
              )}
            </G>
          );
        })}

        {/* pitch line toward bowler + batsman at centre */}
        <Line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke={pitchStroke} strokeWidth={1} strokeDasharray="3 3" />
        <Circle cx={cx} cy={cy} r={5} fill={centerFill} />

        {/* orientation labels */}
        <G>
          <SvgText x={cx} y={14} fill={labelFill} fontSize={11} fontWeight="700" textAnchor="middle">
            BOWLER
          </SvgText>
          <SvgText x={cx} y={size - 4} fill={labelFill} fontSize={11} fontWeight="700" textAnchor="middle">
            BATSMAN
          </SvgText>
          <SvgText x={10} y={cy} fill={sideFill} fontSize={10} fontWeight="700" textAnchor="start">
            {leftLabel}
          </SvgText>
          <SvgText x={size - 10} y={cy} fill={sideFill} fontSize={10} fontWeight="700" textAnchor="end">
            {rightLabel}
          </SvgText>
        </G>
      </Svg>

      {totalRuns === 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>No shot data yet</Text>
      ) : (
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
          {totalRuns} runs · {batsmanHand}
        </Text>
      )}
    </View>
  );
}
