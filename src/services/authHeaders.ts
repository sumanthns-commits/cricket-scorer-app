import { getAuth } from 'firebase/auth';
import Constants from 'expo-constants';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const REGION = 'us-central1';

const FUNCTIONS_BASE_URL =
  process.env.EXPO_PUBLIC_USE_EMULATOR === 'true'
    ? `http://localhost:5001/${PROJECT_ID}/${REGION}`
    : `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not authenticated');

  const token = await user.getIdToken(forceRefresh);
  const apiKey =
    (Constants.expoConfig?.extra as { apiKey?: string } | undefined)?.apiKey ?? '';

  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

export async function callFirebaseFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const url = `${FUNCTIONS_BASE_URL}/${functionName}`;
  const headers = await getAuthHeaders(false);

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    const refreshed = await getAuthHeaders(true);
    response = await fetch(url, {
      method: 'POST',
      headers: refreshed,
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    throw new Error(`${functionName} failed with status ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}
