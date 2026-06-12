import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { getUserProfile, updateUserProfile } from '../../services/userProfileService';
import type { BattingHand, BowlingStyle, WicketKeepingAbility } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

const BATTING_HANDS: { value: BattingHand; label: string }[] = [
  { value: 'RHB', label: 'Right hand' },
  { value: 'LHB', label: 'Left hand' },
];
const BOWLING_STYLES: { value: BowlingStyle; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
  { value: 'spin', label: 'Spin' },
];
const WICKET_KEEPING_OPTIONS: { value: WicketKeepingAbility; label: string }[] = [
  { value: 'keeper', label: 'Primary keeper' },
  { value: 'can-keep', label: 'Can keep' },
];

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = selected === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onSelect(o.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: active ? '#4ade80' : '#1e2d45',
              borderWidth: 1,
              borderColor: active ? '#4ade80' : '#2d3f58',
            }}
          >
            <Text style={{ color: active ? '#0a1628' : '#d1d5db', fontSize: 13, fontWeight: '600' }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function EditProfileScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', user?.uid],
    queryFn: () => getUserProfile(user!.uid),
    enabled: !!user,
  });

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [battingHand, setBattingHand] = useState<BattingHand | undefined>(undefined);
  const [bowlingStyle, setBowlingStyle] = useState<BowlingStyle | undefined>(undefined);
  const [wicketKeeping, setWicketKeeping] = useState<WicketKeepingAbility | undefined>(undefined);
  const [bio, setBio] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed local edit state from the loaded profile once.
  const [seeded, setSeeded] = useState(false);
  if (profile && !seeded) {
    setDisplayName(profile.displayName ?? '');
    setBattingHand(profile.battingHand);
    setBowlingStyle(profile.bowlingStyle);
    setWicketKeeping(profile.wicketKeeping);
    setBio(profile.bio ?? '');
    setSeeded(true);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        displayName: (displayName ?? '').trim() || (user.displayName ?? 'Player'),
        battingHand,
        bowlingStyle,
        wicketKeeping,
        bio: (bio ?? '').trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['userProfile', user.uid] });
      navigation.goBack();
    } catch (err) {
      console.error('updateUserProfile failed', err);
      setSaving(false);
    }
  }

  if (isLoading || !seeded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#4ade80" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a1628' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>DISPLAY NAME</Text>
        <TextInput
          value={displayName ?? ''}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor="#4b5563"
          style={{
            backgroundColor: '#1e2d45',
            color: '#ffffff',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: '#2d3f58',
          }}
        />

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>BATTING</Text>
        <View style={{ marginBottom: 24 }}>
          <ChipRow options={BATTING_HANDS} selected={battingHand} onSelect={setBattingHand} />
        </View>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>BOWLING</Text>
        <View style={{ marginBottom: 24 }}>
          <ChipRow options={BOWLING_STYLES} selected={bowlingStyle} onSelect={setBowlingStyle} />
        </View>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>WICKET KEEPING</Text>
        <View style={{ marginBottom: 24 }}>
          <ChipRow options={WICKET_KEEPING_OPTIONS} selected={wicketKeeping} onSelect={setWicketKeeping} />
        </View>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>BIO</Text>
        <TextInput
          value={bio ?? ''}
          onChangeText={setBio}
          placeholder="A short bio (optional)"
          placeholderTextColor="#4b5563"
          multiline
          style={{
            backgroundColor: '#1e2d45',
            color: '#ffffff',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            marginBottom: 32,
            borderWidth: 1,
            borderColor: '#2d3f58',
            textAlignVertical: 'top',
            minHeight: 80,
          }}
        />

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
