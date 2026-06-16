import { View, Text } from 'react-native';
import Svg, { Line, Text as SvgText, Polyline, Circle } from 'react-native-svg';
import type { WormPoint } from '../services/matchStatsService';

const COLOR_1 = '#60a5fa';
const COLOR_2 = '#facc15';

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: '#94a3b8', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/** Worm/race chart: cumulative runs per over, one line per innings present. */
export default function WormChart({
  innings1,
  innings2,
  width = 320,
  height = 180,
}: {
  innings1: WormPoint[];
  innings2?: WormPoint[];
  width?: number;
  height?: number;
}) {
  if (innings1.length <= 1 && (!innings2 || innings2.length <= 1)) {
    return (
      <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
        No overs bowled yet
      </Text>
    );
  }

  const padX = 24;
  const padTop = 16;
  const padBottom = 24;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const allPoints = [...innings1, ...(innings2 ?? [])];
  const maxOver = Math.max(1, ...allPoints.map((p) => p.overNumber));
  const maxRuns = Math.max(1, ...allPoints.map((p) => p.cumRuns));

  const x = (overNumber: number) => padX + (overNumber / maxOver) * plotW;
  const y = (cumRuns: number) => padTop + plotH - (cumRuns / maxRuns) * plotH;

  const linePoints = (series: WormPoint[]) => series.map((p) => `${x(p.overNumber)},${y(p.cumRuns)}`).join(' ');

  const renderSeries = (series: WormPoint[], color: string, keyPrefix: string) => {
    const last = series[series.length - 1];
    return (
      <>
        <Polyline points={linePoints(series)} fill="none" stroke={color} strokeWidth={2} />
        {series
          .filter((p) => p.wickets > 0)
          .map((p) => (
            <Circle key={`${keyPrefix}-w-${p.overNumber}`} cx={x(p.overNumber)} cy={y(p.cumRuns)} r={3.5} fill="#ef4444" />
          ))}
        <SvgText x={x(last.overNumber) + 4} y={y(last.cumRuns) + 4} fill={color} fontSize={11} fontWeight="700">
          {last.cumRuns}
        </SvgText>
      </>
    );
  };

  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={padX} y1={padTop + plotH} x2={width - padX} y2={padTop + plotH} stroke="#2d3f58" strokeWidth={1} />
        <Line x1={padX} y1={padTop} x2={padX} y2={padTop + plotH} stroke="#2d3f58" strokeWidth={1} />

        {renderSeries(innings1, COLOR_1, 'i1')}
        {innings2 && innings2.length > 1 ? renderSeries(innings2, COLOR_2, 'i2') : null}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 6 }}>
        <LegendDot color={COLOR_1} label="Innings 1" />
        {innings2 && innings2.length > 1 ? <LegendDot color={COLOR_2} label="Innings 2" /> : null}
      </View>
    </View>
  );
}
