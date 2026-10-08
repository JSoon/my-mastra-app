import assert from 'node:assert/strict';
import test from 'node:test';
import { BailianResponsesModel, bailianReasoningTransform } from '../src/mastra/models/bailian.ts';

async function transform(parts) {
  return Array.fromAsync(ReadableStream.from(parts).pipeThrough(bailianReasoningTransform()));
}

test('Bailian summary deltas keep the SDK reasoning block ID and event order', async () => {
  const start = { type: 'reasoning-start', id: 'item-1:0' };
  const end = { type: 'reasoning-end', id: 'item-1:0' };
  const text = { type: 'text-delta', id: 'answer', delta: '391' };
  const parts = await transform([
    start,
    { type: 'raw', rawValue: { type: 'response.reasoning_text.delta', item_id: 'item-1', delta: '先算十位。' } },
    { type: 'raw', rawValue: { type: 'response.reasoning_text.delta', item_id: 'item-1', delta: '再算个位。' } },
    end, text,
  ]);
  assert.deepEqual(parts.map(part => part.type), ['reasoning-start', 'reasoning-delta', 'reasoning-delta', 'reasoning-end', 'text-delta']);
  assert.equal(parts[1].id, start.id);
  assert.equal(parts[2].id, start.id);
  assert.equal(parts[1].delta + parts[2].delta, '先算十位。再算个位。');
  assert.equal(parts.at(-1), text);
});

test('standard reasoning, tool calls and errors pass through; unrelated raw data stays private', async () => {
  const native = { type: 'reasoning-delta', id: 'native:0', delta: '标准摘要' };
  const tool = { type: 'tool-call', toolCallId: 'tool-1', toolName: 'lookup', input: '{}' };
  const error = { type: 'error', error: new Error('test') };
  assert.deepEqual(await transform([
    native, tool, error,
    { type: 'raw', rawValue: { type: 'response.reasoning_text.done', text: '不得重复' } },
    { type: 'raw', rawValue: { type: 'response.created', response: { private: 'not forwarded' } } },
    { type: 'raw', rawValue: { type: 'response.reasoning_text.delta', item_id: 'bad', delta: null } },
    { type: 'raw', rawValue: null },
  ]), [native, tool, error]);
});

test('model tracing retains Mastra credential redaction', () => {
  const model = new BailianResponsesModel({ id: 'bailian/test', url: 'https://example.test', apiKey: 'private-key', api: 'responses' });
  const serialized = JSON.stringify(model.serializeForSpan());
  assert.ok(!serialized.includes('private-key'));
  assert.ok(!serialized.includes('example.test'));
});
