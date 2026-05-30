import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuthStore } from '../store/authStore';
import { initializeUserDocs } from '../services/authService';

export function useAuthListener() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await initializeUserDocs(user);
      }
      setUser(user);
      setInitialized(true);
    });

    return unsubscribe;
  }, [setUser, setInitialized]);
}
