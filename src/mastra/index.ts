import { Mastra } from '@mastra/core/mastra';
import { convertMessages } from '@mastra/core/agent';
import { registerApiRoute } from '@mastra/core/server';
import { chatRoute } from '@mastra/ai-sdk';
import { MastraEditor } from '@mastra/editor';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { agent } from './agents/agent';
import { startScheduleTool, stopScheduleTool } from './tools/schedule-tools';

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { agent },
  server: {
    apiRoutes: [
      chatRoute({
        path: '/chat/agent',
        agent: 'agent',
        version: 'v7',
        sendReasoning: true,
        sendSources: true,
        onError: () => '回复生成失败，请稍后重试。',
      }),
      // Local anonymous resource IDs are selectors, not authentication credentials.
      registerApiRoute('/chat/threads', {
        method: 'GET',
        handler: async c => {
          c.header('Cache-Control', 'no-store');
          const resourceId = c.req.query('resourceId');
          const page = Number(c.req.query('page') ?? 0);
          if (!resourceId || resourceId.length > 200 || !Number.isSafeInteger(page) || page < 0) {
            return c.json({ error: '无效的会话查询参数。' }, 400);
          }
          const memory = await c.get('mastra').getAgent('agent').getMemory();
          if (!memory) return c.json({ error: '未启用会话存储。' }, 503);
          const result = await memory.listThreads({
            filter: { resourceId }, page, perPage: 30,
            orderBy: { field: 'updatedAt', direction: 'DESC' },
          });
          return c.json({
            threads: result.threads.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })),
            hasMore: result.hasMore,
          });
        },
      }),
      registerApiRoute('/chat/threads/:threadId/messages', {
        method: 'GET',
        handler: async c => {
          c.header('Cache-Control', 'no-store');
          const resourceId = c.req.query('resourceId');
          const threadId = c.req.param('threadId');
          if (!resourceId || resourceId.length > 200 || !threadId || threadId.length > 200) {
            return c.json({ error: '无效的会话查询参数。' }, 400);
          }
          const memory = await c.get('mastra').getAgent('agent').getMemory();
          if (!memory) return c.json({ error: '未启用会话存储。' }, 503);
          const thread = await memory.getThreadById({ threadId });
          if (!thread || thread.resourceId !== resourceId) {
            return c.json({ error: '会话不存在。' }, 404);
          }
          const { messages } = await memory.recall({
            threadId, resourceId, perPage: false,
            orderBy: { field: 'createdAt', direction: 'ASC' },
          });
          // v6 UI parts (including approvals) also match the v7 UI contract used here.
          return c.json({ messages: convertMessages(messages).to('AIV6.UI') });
        },
      }),
    ],
  },
  tools: { startScheduleTool, stopScheduleTool },
  editor: new MastraEditor(),
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db',
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
