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
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { createClub, ClubNameTakenError } from '../../services/clubService';
import { detectHemisphere, type Hemisphere } from '../../utils/seasons';
import { useQueryClient } from '@tanstack/react-query';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateClub'>;

export default function CreateClubScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hemisphere, setHemisphere] = useState<Hemisphere>(() => detectHemisphere());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!user) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Club name is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createClub(
        user.uid,
        trimmedName,
        description.trim(),
        {
          displayName: user.displayName ?? user.email ?? 'Me',
          email: user.email ?? undefined,
          photoURL: user.photoURL ?? undefined,
        },
        hemisphere
      );
      await queryClient.invalidateQueries({ queryKey: ['clubs', user.uid] });
      navigation.goBack();
    } catch (err) {
      console.error('createClub failed', err);
      setError(
        err instanceof ClubNameTakenError
          ? `A club named "${trimmedName}" already exists. Please choose another name.`
          : 'Failed to create club. Please try again.'
      );
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a1628' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 24 }}>
          Create Club
        </Text>

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          CLUB NAME *
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Wanderers CC"
          placeholderTextColor="#4b5563"
          style={{
            backgroundColor: '#1e2d45',
            color: '#ffffff',
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            fontSize: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2d3f58',
          }}
        />

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          DESCRIPTION
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="A short description of your club"
          placeholderTextColor="#4b5563"
          multiline
          numberOfLines={3}
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

        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
          HEMISPHERE
        </Text>
        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>
          Sets how seasons are named (Summer / Winter). Auto-detected — change if it's wrong.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
          {(['N', 'S'] as const).map((h) => {
            const selected = hemisphere === h;
            return (
              <TouchableOpacity
                key={h}
                onPress={() => setHemisphere(h)}
                style={{
                  flex: 1,
                  backgroundColor: selected ? '#4ade80' : '#1e2d45',
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: selected ? '#4ade80' : '#2d3f58',
                }}
              >
                <Text
                  style={{
                    color: selected ? '#0a1628' : '#ffffff',
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  {h === 'N' ? 'Northern' : 'Southern'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && (
          <Text style={{ color: '#ef4444', marginBottom: 16, fontSize: 14 }}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading}
          style={{
            backgroundColor: '#4ade80',
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '700' }}>
              Create Club
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
