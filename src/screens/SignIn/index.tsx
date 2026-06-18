import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  signInWithGoogleAccessToken,
  signInWithEmulatorCredentials,
} from '../../services/authService';

WebBrowser.maybeCompleteAuthSession();

const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === 'true';

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('dev@example.com');
  const [password, setPassword] = useState('password');

  const handleEmulatorSignIn = () => {
    setError(null);
    setLoading(true);
    signInWithEmulatorCredentials(email.trim(), password).catch(() => {
      setError('Emulator sign-in failed.');
      setLoading(false);
    });
  };

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.authentication?.accessToken ?? '';
      setLoading(true);
      setError(null);
      signInWithGoogleAccessToken(accessToken)
        .catch(() => {
          setError('Sign-in failed. Please try again.');
          setLoading(false);
        });
    } else if (response?.type === 'error') {
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  }, [response]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#ffffff' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: '#16a34a', fontSize: 48, fontWeight: '800', marginBottom: 6, letterSpacing: 2 }}>
        Crease
      </Text>
      <Text style={{ color: '#94a3b8', fontSize: 15, marginBottom: 48, letterSpacing: 0.5 }}>
        Where every run tells a story.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#16a34a" />
      ) : (
        <TouchableOpacity
          disabled={!request}
          onPress={() => {
            setError(null);
            setLoading(true);
            promptAsync().catch(() => {
              setError('Sign-in failed. Please try again.');
              setLoading(false);
            });
          }}
          style={{
            backgroundColor: '#16a34a',
            borderRadius: 10,
            paddingVertical: 14,
            paddingHorizontal: 32,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: request ? 1 : 0.5,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            Sign in with Google
          </Text>
        </TouchableOpacity>
      )}

      {error && (
        <Text style={{ color: '#dc2626', marginTop: 16, fontSize: 14 }}>
          {error}
        </Text>
      )}

      {USE_EMULATOR && !loading && (
        <View style={{ marginTop: 40, width: '100%', maxWidth: 320 }}>
          <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
            EMULATOR DEV SIGN-IN
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email"
            placeholderTextColor="#94a3b8"
            style={{
              backgroundColor: '#f1f5f9',
              color: '#0f172a',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="password"
            placeholderTextColor="#94a3b8"
            style={{
              backgroundColor: '#f1f5f9',
              color: '#0f172a',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          />
          <TouchableOpacity
            onPress={handleEmulatorSignIn}
            style={{
              backgroundColor: '#0f172a',
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
              Sign in (emulator)
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
