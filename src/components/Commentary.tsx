import { View, Text, FlatList } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import type { CommentaryEntry } from '../services/commentary';

export default function Commentary({ entries }: { entries: CommentaryEntry[] }) {
  const theme = useThemeStore((s) => s.theme);
  // Newest ball first — chronological order (with over-end dividers already
  // interspersed) just gets reversed wholesale so dividers stay in place.
  const data = [...entries].reverse();

  if (data.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
          No commentary yet.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      renderItem={({ item }) => {
        if (item.type === 'over-end') {
          return (
            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                {item.overEndText}
              </Text>
            </View>
          );
        }
        return (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Text style={{ width: 36, color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
              {item.overLabel}
            </Text>
            <Text style={{ flex: 1, color: item.isWicket ? '#dc2626' : theme.text, fontSize: 13.5, lineHeight: 19 }}>
              {item.text}
            </Text>
          </View>
        );
      }}
    />
  );
}
