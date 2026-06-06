import { callCallableFunction } from '../services/functionsClient';

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  clubId: string
): Promise<unknown> {
  return callCallableFunction(toolName, { ...input, clubId });
}
