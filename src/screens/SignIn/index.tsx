import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
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
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
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
    <View
      style={{
        flex: 1,
        backgroundColor: '#0a1628',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Text style={{ color: '#4ade80', fontSize: 32, fontWeight: '700', marginBottom: 8 }}>
        Cricket Scorer
      </Text>
      <Text style={{ color: '#9ca3af', fontSize: 16, marginBottom: 48 }}>
        Club management & live scoring
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#4ade80" />
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
            backgroundColor: '#ffffff',
            borderRadius: 8,
            paddingVertical: 14,
            paddingHorizontal: 24,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: request ? 1 : 0.5,
          }}
        >
          <Text style={{ color: '#0a1628', fontSize: 16, fontWeight: '600' }}>
            Sign in with Google
          </Text>
        </TouchableOpacity>
      )}

      {error && (
        <Text style={{ color: '#ef4444', marginTop: 16, fontSize: 14 }}>
          {error}
        </Text>
      )}

      {USE_EMULATOR && !loading && (
        <View style={{ marginTop: 40, width: '100%', maxWidth: 320 }}>
          <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
            EMULATOR DEV SIGN-IN
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email"
            placeholderTextColor="#475569"
            style={{
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 8,
            }}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="password"
            placeholderTextColor="#475569"
            style={{
              backgroundColor: '#1e293b',
              color: '#e2e8f0',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
            }}
          />
          <TouchableOpacity
            onPress={handleEmulatorSignIn}
            style={{
              backgroundColor: '#334155',
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: '600' }}>
              Sign in (emulator)
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
