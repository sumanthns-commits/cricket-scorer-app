import { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, Pressable } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import { CLUB_TIMEZONES, timezoneLabel, type TimezoneOption } from '../constants/timezones';

export function TimezoneDropdown({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (tz: string) => void;
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
          justifyContent: 'space-between',
          backgroundColor: theme.surface,
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{timezoneLabel(selected)}</Text>
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
              maxHeight: 420,
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
              Select Location
            </Text>
            <FlatList
              data={CLUB_TIMEZONES}
              keyExtractor={(t: TimezoneOption) => t.id}
              renderItem={({ item }) => {
                const isSelected = item.id === selected;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onSelect(item.id);
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
                    }}
                  >
                    <View>
                      <Text style={{ color: isSelected ? theme.accent : theme.text, fontSize: 15, fontWeight: isSelected ? '700' : '400' }}>
                        {item.label}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{item.id}</Text>
                    </View>
                    {isSelected && <Text style={{ color: theme.accent, fontSize: 14 }}>✓</Text>}
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
