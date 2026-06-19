import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';

// AI tools are named snake_case (LLM-facing) but the deployed callable
// functions are camelCase, e.g. get_available_players → getAvailablePlayers.
function toFunctionName(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Call an onCall (callable) Cloud Function. Accepts either the snake_case tool
 * name or the camelCase function name. The callable SDK handles auth context,
 * region, the data envelope and emulator routing.
 */
export async function callCallableFunction(
  name: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const user = auth.currentUser;
  if (!user) {
    console.error('[callCallableFunction] No currentUser — not authenticated', name);
    throw new Error('unauthenticated');
  }
  // Force-refresh the token before every callable so a recently-expired token
  // doesn't silently fail inside the Functions SDK.
  try {
    await user.getIdToken(true);
  } catch (e) {
    console.error('[callCallableFunction] Token refresh failed', e);
    throw new Error('unauthenticated');
  }
  const fn = httpsCallable(functions, toFunctionName(name));
  const res = await fn(data);
  return res.data;
}
