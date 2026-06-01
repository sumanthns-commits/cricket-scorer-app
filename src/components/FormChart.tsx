import { View, Text } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Polyline, Circle } from 'react-native-svg';
import type { FormEntry } from '../services/playerProfileService';

/** Bar chart of runs across recent matches, with a trend line. */
export default function FormChart({
  form,
  width = 320,
  height = 160,
}: {
  form: FormEntry[];
  width?: number;
  height?: number;
}) {
  if (form.length === 0) {
    return (
      <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
        No recent matches
      </Text>
    );
  }

  const padX = 24;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxRuns = Math.max(10, ...form.map((f) => f.runs));
  const slotW = plotW / form.length;
  const barW = Math.min(slotW * 0.5, 28);

  const x = (i: number) => padX + slotW * i + slotW / 2;
  const y = (runs: number) => padTop + plotH - (runs / maxRuns) * plotH;

  const trendPoints = form.map((f, i) => `${x(i)},${y(f.runs)}`).join(' ');

  return (
    <View>
      <Svg width={width} height={height}>
        {/* baseline */}
        <Line
          x1={padX}
          y1={padTop + plotH}
          x2={width - padX}
          y2={padTop + plotH}
          stroke="#2d3f58"
          strokeWidth={1}
        />

        {form.map((f, i) => {
          const barH = (f.runs / maxRuns) * plotH;
          return (
            <Rect
              key={f.matchId}
              x={x(i) - barW / 2}
              y={padTop + plotH - barH}
              width={barW}
              height={Math.max(barH, 1)}
              rx={3}
              fill={f.notOut ? '#4ade80' : '#60a5fa'}
            />
          );
        })}

        {/* trend line */}
        <Polyline points={trendPoints} fill="none" stroke="#facc15" strokeWidth={1.5} />
        {form.map((f, i) => (
          <Circle key={`d-${f.matchId}`} cx={x(i)} cy={y(f.runs)} r={3} fill="#facc15" />
        ))}

        {/* value + label */}
        {form.map((f, i) => (
          <SvgText
            key={`v-${f.matchId}`}
            x={x(i)}
            y={y(f.runs) - 8}
            fill="#e2e8f0"
            fontSize={11}
            fontWeight="700"
            textAnchor="middle"
          >
            {f.runs}
            {f.notOut ? '*' : ''}
          </SvgText>
        ))}
        {form.map((f, i) => (
          <SvgText
            key={`l-${f.matchId}`}
            x={x(i)}
            y={height - 8}
            fill="#6b7280"
            fontSize={10}
            textAnchor="middle"
          >
            {f.label.length > 6 ? f.label.slice(0, 6) : f.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
