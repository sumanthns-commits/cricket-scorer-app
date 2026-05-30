import Anthropic from '@anthropic-ai/sdk';
import Constants from 'expo-constants';
import { toolDefinitions } from './toolDefinitions';
import { executeToolCall } from './toolExecutor';

function createClient(): Anthropic {
  const apiKey = (Constants.expoConfig?.extra as { apiKey?: string } | undefined)?.apiKey;
  if (!apiKey) throw new Error('Anthropic API key not configured');
  return new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  });
}

export async function askCricketAssistant(
  message: string,
  clubId: string,
  systemPrompt: string,
  history: Anthropic.MessageParam[] = []
): Promise<string> {
  const client = createClient();
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: message },
  ];

  for (;;) {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: toolDefinitions,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map(async (b) => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: JSON.stringify(
            await executeToolCall(b.name, b.input as Record<string, unknown>, clubId)
          ),
        }))
    );

    messages.push({ role: 'user', content: toolResults });
  }
}
