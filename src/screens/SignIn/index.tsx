import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  signInWithGoogleIdToken,
  signInWithAppleCredential,
  signInWithEmulatorCredentials,
} from '../../services/authService';

const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === 'true';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleSignin: any = null;
if (!USE_EMULATOR) {
  // Lazy require — native module must not be touched in emulator/Expo Go
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}

function randomHex(byteLength: number): string {
  const bytes = Crypto.getRandomBytes(byteLength);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('dev@example.com');
  const [password, setPassword] = useState('password');
  // Apple Sign In (Guideline 4.8 — required alongside Google on iOS only;
  // the module doesn't exist as a login option on Android, and
  // isAvailableAsync() is additionally false on iOS devices signed out of
  // iCloud/without an Apple ID, so the button must not just be hidden by
  // Platform.OS alone).
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (USE_EMULATOR || Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleEmulatorSignIn = () => {
    setError(null);
    setLoading(true);
    signInWithEmulatorCredentials(email.trim(), password).catch(() => {
      setError('Emulator sign-in failed.');
      setLoading(false);
    });
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token returned');
      await signInWithGoogleIdToken(idToken);
    } catch (err) {
      console.error('[GoogleSignIn] error:', err);
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const rawNonce = randomHex(16);
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('No identity token returned');
      await signInWithAppleCredential(credential.identityToken, rawNonce, credential.fullName);
    } catch (err) {
      // User dismissing the native Apple sheet isn't a failure — no error banner for it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code === 'ERR_REQUEST_CANCELED') {
        setLoading(false);
        return;
      }
      console.error('[AppleSignIn] error:', err);
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

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
      ) : !USE_EMULATOR ? (
        <TouchableOpacity
          onPress={handleGoogleSignIn}
          style={{
            backgroundColor: '#16a34a',
            borderRadius: 10,
            paddingVertical: 14,
            paddingHorizontal: 32,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            Sign in with Google
          </Text>
        </TouchableOpacity>
      ) : null}

      {!loading && appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={10}
          style={{ width: 240, height: 50, marginTop: 16 }}
          onPress={handleAppleSignIn}
        />
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
