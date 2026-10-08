import { ModelRouterLanguageModel } from '@mastra/core/llm';

type StreamResult = Awaited<ReturnType<ModelRouterLanguageModel['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

/** Bridge Bailian's Responses reasoning summaries to the installed OpenAI adapter. */
export function bailianReasoningTransform() {
  return new TransformStream<StreamPart, StreamPart>({
    transform(part, controller) {
      if (part.type !== 'raw') {
        controller.enqueue(part);
        return;
      }

      // Raw provider payloads stay inside this adapter. Only the public summary
      // delta is forwarded; the SDK already emits reasoning-start/end for :0.
      const event = part.rawValue;
      if (typeof event !== 'object' || event === null) return;
      if (!('type' in event) || event.type !== 'response.reasoning_text.delta') return;
      if (!('item_id' in event) || typeof event.item_id !== 'string') return;
      if (!('delta' in event) || typeof event.delta !== 'string') return;
      controller.enqueue({
        type: 'reasoning-delta',
        id: `${event.item_id}:0`,
        delta: event.delta,
        providerMetadata: { openai: { itemId: event.item_id } },
      });
    },
  });
}

export class BailianResponsesModel extends ModelRouterLanguageModel {
  override async doStream(options: Parameters<ModelRouterLanguageModel['doStream']>[0]) {
    const result = await super.doStream({ ...options, includeRawChunks: true });
    return { ...result, stream: result.stream.pipeThrough(bailianReasoningTransform()) };
  }
}
