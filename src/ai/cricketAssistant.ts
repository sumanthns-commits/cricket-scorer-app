import {
  getAI,
  getGenerativeModel,
  VertexAIBackend,
  type Content,
  type FunctionResponsePart,
} from 'firebase/ai';
import { app, auth } from '../services/firebase';
import { functionDeclarations } from './toolDefinitions';
import { executeToolCall } from './toolExecutor';

const MODEL = 'gemini-2.5-flash';

const ai = getAI(app, { backend: new VertexAIBackend() });

export interface AssistantResult {
  text: string;
  history: Content[];
}

export interface AssistantOptions {
  history?: Content[];
  onToolCall?: (toolName: string) => void;
  /** When true, no tools are exposed to the model — forces a single-turn response.
   *  Use when all required data is already embedded in the message. */
  noTools?: boolean;
  /** Gemini 2.5 Flash thinking token budget. 0 = disable thinking (fast).
   *  Omit to let the model decide (default = extended thinking, slow). */
  thinkingBudget?: number;
}

export async function askCricketAssistant(
  message: string,
  clubId: string,
  systemPrompt: string,
  options: AssistantOptions = {}
): Promise<AssistantResult> {
  // Ensure Firebase auth state is restored from persistence before making
  // authenticated Vertex AI requests.
  await auth.authStateReady();

  const model = getGenerativeModel(ai, {
    model: MODEL,
    systemInstruction: systemPrompt,
    ...(options.noTools ? {} : { tools: [{ functionDeclarations }] }),
    ...(options.thinkingBudget !== undefined
      ? { generationConfig: { thinkingConfig: { thinkingBudget: options.thinkingBudget } } }
      : {}),
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
