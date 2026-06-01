import { View, Text, Image } from 'react-native';

const PALETTE = [
  '#4ade80',
  '#60a5fa',
  '#f97316',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#facc15',
  '#fb7185',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function PlayerAvatar({
  name,
  photoURL,
  seed,
  size = 44,
}: {
  name: string;
  photoURL?: string;
  seed?: string;
  size?: number;
}) {
  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1e2d45' }}
      />
    );
  }

  const bg = colorFor(seed ?? name);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#0a1628', fontWeight: '800', fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
