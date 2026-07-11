import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuthStore } from '../store/authStore';
import { initializeUserDocs } from '../services/authService';
import { registerForPushNotificationsAsync } from '../services/pushTokenService';

export function useAuthListener() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await initializeUserDocs(user);
        // Fire-and-forget: permission-prompt latency must never delay auth
        // resolution below.
        registerForPushNotificationsAsync(user.uid).catch(() => undefined);
      }
      setUser(user);
      setInitialized(true);
    });

    return unsubscribe;
  }, [setUser, setInitialized]);
}
