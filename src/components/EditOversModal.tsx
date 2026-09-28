import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';

// Stepper modal for an overs-per-innings limit. Shared by LiveScoring (change
// the limit mid-match, or set one on a match that has none) and PollResponse
// (choose overs when converting a poll option into a match).
export default function EditOversModal({
  visible,
  current,
  minOvers,
  onConfirm,
  onCancel,
  subtitle,
  saveLabel = 'Save',
  allowUnchanged = false,
}: {
  visible: boolean;
  current: number;
  minOvers: number;
  onConfirm: (overs: number) => void;
  onCancel: () => void;
  // Overrides the default "can be raised, not below what's bowled" hint.
  subtitle?: string;
  saveLabel?: string;
  // When true Save is enabled even if the value equals `current` — needed when
  // `current` is only a suggested default rather than an already-saved value.
  allowUnchanged?: boolean;
}) {
  const [value, setValue] = useState(current);

  useEffect(() => { if (visible) setValue(Math.max(current, minOvers)); }, [visible, current, minOvers]);

  const dec = () => setValue((v) => Math.max(minOvers, v - 1));
  const inc = () => setValue((v) => v + 1);
  const canDec = value > minOvers;
  const canSave = allowUnchanged || value !== current;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#0a1628', borderRadius: 16, padding: 20, width: 320 }}>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            Overs per innings
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
            {subtitle ?? `Can be raised any time, but not below the ${minOvers} over${minOvers !== 1 ? 's' : ''} already bowled.`}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            <TouchableOpacity
              onPress={dec}
              disabled={!canDec}
              style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1e2d45', borderWidth: 1.5, borderColor: canDec ? '#2d3f58' : '#162033',
              }}
            >
              <Text style={{ color: canDec ? '#ffffff' : '#374151', fontSize: 28, fontWeight: '800' }}>−</Text>
            </TouchableOpacity>

            <Text style={{ color: '#ffffff', fontSize: 44, fontWeight: '800', minWidth: 70, textAlign: 'center' }}>
              {value}
            </Text>

            <TouchableOpacity
              onPress={inc}
              style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1e2d45', borderWidth: 1.5, borderColor: '#2d3f58',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800' }}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => onConfirm(value)}
            disabled={!canSave}
            style={{
              marginTop: 24, padding: 14, borderRadius: 10, alignItems: 'center',
              backgroundColor: canSave ? '#4ade80' : '#1e2d45',
              borderWidth: canSave ? 0 : 1, borderColor: '#2d3f58',
            }}
          >
            <Text style={{ color: canSave ? '#0a1628' : '#9ca3af', fontWeight: '700' }}>{saveLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} style={{ marginTop: 10, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
