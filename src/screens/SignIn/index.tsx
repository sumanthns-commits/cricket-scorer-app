import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogleAccessToken } from '../../services/authService';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
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
    </View>
  );
}
