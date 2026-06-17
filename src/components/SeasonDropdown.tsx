import { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, Pressable } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import type { SeasonInfo } from '../utils/seasons';

export function SeasonDropdown({
  seasons,
  selected,
  onSelect,
}: {
  seasons: SeasonInfo[];
  selected: SeasonInfo;
  onSelect: (s: SeasonInfo) => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: theme.surface,
          borderRadius: 8,
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{selected.label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 32 }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              overflow: 'hidden',
              maxHeight: 360,
            }}
            onPress={() => {}}
          >
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
              }}
            >
              Select Season
            </Text>
            <FlatList
              data={seasons}
              keyExtractor={(s) => s.label}
              renderItem={({ item, index }) => {
                const isSelected = item.label === selected.label;
                const isLast = index === seasons.length - 1;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                      borderBottomWidth: isLast ? 0 : 0,
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? theme.accent : theme.text,
                        fontSize: 15,
                        fontWeight: isSelected ? '700' : '400',
                      }}
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <Text style={{ color: theme.accent, fontSize: 14 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
