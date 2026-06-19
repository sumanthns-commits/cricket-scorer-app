import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';

// AI tools are named snake_case (LLM-facing) but the deployed callable
// functions are camelCase, e.g. get_available_players → getAvailablePlayers.
function toFunctionName(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export async function callCallableFunction(
  name: string,
  data: Record<string, unknown>
): Promise<unknown> {
  // Wait for Firebase to finish restoring auth state from AsyncStorage persistence.
  // Without this, auth.currentUser can be null during the async restoration window
  // even when the user is genuinely signed in.
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) {
    throw new Error('unauthenticated');
  }

  // Best-effort token pre-refresh to avoid 1h ID token expiry mid-session.
  // Non-fatal: if refresh fails the callable SDK uses the cached token.
  try {
    await user.getIdToken(true);
  } catch (e) {
    console.warn('[callCallableFunction] Token pre-refresh failed (non-fatal):', e);
  }

  const fn = httpsCallable(functions, toFunctionName(name));
  const res = await fn(data);
  return res.data;
}
