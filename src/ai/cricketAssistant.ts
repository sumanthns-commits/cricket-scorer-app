import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  type Content,
  type FunctionResponsePart,
} from 'firebase/ai';
import { app } from '../services/firebase';
import { functionDeclarations } from './toolDefinitions';
import { executeToolCall } from './toolExecutor';

const MODEL = 'gemini-2.5-flash';

// Gemini Developer API backend — uses the Firebase project's free tier.
const ai = getAI(app, { backend: new GoogleAIBackend() });

export interface AssistantResult {
  text: string;
  history: Content[];
}

export interface AssistantOptions {
  history?: Content[];
  onToolCall?: (toolName: string) => void;
}

export async function askCricketAssistant(
  message: string,
  clubId: string,
  systemPrompt: string,
  options: AssistantOptions = {}
): Promise<AssistantResult> {
  const model = getGenerativeModel(ai, {
    model: MODEL,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations }],
  });

  const chat = model.startChat({ history: options.history ?? [] });

  let result = await chat.sendMessage(message);

  for (;;) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) break;

    const responses: FunctionResponsePart[] = await Promise.all(
      calls.map(async (call) => {
        options.onToolCall?.(call.name);
        const data = await executeToolCall(
          call.name,
          call.args as Record<string, unknown>,
          clubId
        );
        // Gemini requires functionResponse.response to be a JSON object (Struct).
        // Tools that return arrays/primitives (e.g. a player list) must be wrapped.
        const response =
          data !== null && typeof data === 'object' && !Array.isArray(data)
            ? (data as object)
            : { result: data ?? null };
        return {
          functionResponse: {
            name: call.name,
            response,
          },
        };
      })
    );

    result = await chat.sendMessage(responses);
  }

  return { text: result.response.text(), history: await chat.getHistory() };
}
