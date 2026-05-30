import { callFirebaseFunction } from '../services/authHeaders';

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  clubId: string
): Promise<unknown> {
  return callFirebaseFunction(toolName, { ...input, clubId });
}
