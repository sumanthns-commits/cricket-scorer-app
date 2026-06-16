import { View, Text } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import type { PerOverStat } from '../services/matchStatsService';

const MIN_SLOT_W = 30;

/** Bar chart of runs conceded per over, with a wicket-count badge above any over a wicket fell. */
export default function PerOverChart({
  data,
  minWidth = 320,
  height = 180,
}: {
  data: PerOverStat[];
  minWidth?: number;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
        No overs bowled yet
      </Text>
    );
  }

  const padX = 20;
  const padTop = 24;
  const padBottom = 24;
  const slotW = MIN_SLOT_W;
  const width = Math.max(minWidth, padX * 2 + slotW * data.length);
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxRuns = Math.max(6, ...data.map((d) => d.runs));
  const barW = Math.min(slotW * 0.6, 22);

  const x = (i: number) => padX + slotW * i + slotW / 2;
  const y = (runs: number) => padTop + plotH - (runs / maxRuns) * plotH;

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={padX}
          y1={padTop + plotH}
          x2={width - padX}
          y2={padTop + plotH}
          stroke="#2d3f58"
          strokeWidth={1}
        />

        {data.map((d) => {
          const barH = (d.runs / maxRuns) * plotH;
          const cx = x(d.overNumber - 1);
          return (
            <Rect
              key={`bar-${d.overNumber}`}
              x={cx - barW / 2}
              y={padTop + plotH - barH}
              width={barW}
              height={Math.max(barH, 1)}
              rx={3}
              fill="#60a5fa"
            />
          );
        })}

        {data.map((d) => (
          <SvgText
            key={`v-${d.overNumber}`}
            x={x(d.overNumber - 1)}
            y={y(d.runs) - (d.wickets > 0 ? 22 : 8)}
            fill="#e2e8f0"
            fontSize={10}
            fontWeight="700"
            textAnchor="middle"
          >
            {d.runs}
          </SvgText>
        ))}

        {data.map((d) =>
          d.wickets > 0 ? (
            <G key={`w-${d.overNumber}`}>
              <Circle cx={x(d.overNumber - 1)} cy={y(d.runs) - 12} r={8} fill="#ef4444" />
              <SvgText
                x={x(d.overNumber - 1)}
                y={y(d.runs) - 9}
                fill="#ffffff"
                fontSize={9}
                fontWeight="700"
                textAnchor="middle"
              >
                {d.wickets}
              </SvgText>
            </G>
          ) : null
        )}

        {data.map((d) => (
          <SvgText
            key={`l-${d.overNumber}`}
            x={x(d.overNumber - 1)}
            y={height - 6}
            fill="#6b7280"
            fontSize={9}
            textAnchor="middle"
          >
            {d.overNumber}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
