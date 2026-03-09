import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE_URL = process.env.DELUXINE_API_BASE_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  return (await response.json()) as T;
}

const server = new McpServer({
  name: 'deluxine-mcp',
  version: '0.1.0',
});

server.tool(
  'health_check',
  'Deluxine API 상태 확인',
  {},
  async () => {
    const result = await request<{ ok: boolean }>('/mcp/health');
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  'create_session',
  '선화 기반 세션 생성',
  {
    lineArt: z.string().optional().describe('원본 선화 URL 또는 파일 식별자'),
  },
  async ({ lineArt }) => {
    const body = JSON.stringify({ lineArt });
    const result = await request('/sessions', {
      method: 'POST',
      body,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  'generate_pose',
  '세션 기반 자동 포즈 생성',
  {
    sessionId: z.string().describe('세션 ID'),
  },
  async ({ sessionId }) => {
    const result = await request(`/sessions/${sessionId}/pose/generate`, {
      method: 'POST',
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  'update_pose',
  '포즈 키포인트 수정',
  {
    sessionId: z.string().describe('세션 ID'),
    keypoints: z
      .array(
        z.object({
          name: z.string(),
          x: z.number(),
          y: z.number(),
        }),
      )
      .describe('수정할 키포인트 배열'),
  },
  async ({ sessionId, keypoints }) => {
    const result = await request(`/sessions/${sessionId}/pose`, {
      method: 'PATCH',
      body: JSON.stringify({ keypoints }),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  'render_image',
  '최종 이미지 렌더 요청',
  {
    sessionId: z.string().describe('세션 ID'),
    prompt: z.string().describe('연출/배경/조명/스타일 프롬프트'),
  },
  async ({ sessionId, prompt }) => {
    const result = await request(`/sessions/${sessionId}/render`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  'get_session',
  '세션 상세 조회(히스토리 포함)',
  {
    sessionId: z.string().describe('세션 ID'),
  },
  async ({ sessionId }) => {
    const result = await request(`/sessions/${sessionId}`);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[deluxine-mcp] fatal error', error);
  process.exit(1);
});
