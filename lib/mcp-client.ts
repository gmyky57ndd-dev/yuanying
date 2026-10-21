import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { APP_VERSION } from './app-version';

/** ES-053 Phase C: ask an external MCP server for a second opinion. */
export async function askExternalAgent(
  role: string,
  prompt: string
): Promise<{ success: true; data: { tool: string; result: unknown } }> {
  const url = process.env.MCP_EXTERNAL_URL;
  if (!url) {
    throw new Error('MCP_EXTERNAL_URL is not configured');
  }
  const value = prompt.trim();
  if (!value) throw new Error('prompt is required');

  const token = process.env.MCP_EXTERNAL_TOKEN || '';
  const client = new Client({ name: 'yuanying', version: APP_VERSION });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const tool =
      tools.tools.find(t => /ask|chat|prompt|agent/i.test(t.name)) ??
      tools.tools[0];
    if (!tool) throw new Error('No tools available on the external MCP server');

    const result = await client.callTool({
      name: tool.name,
      arguments: { role, prompt: value },
    });
    return { success: true, data: { tool: tool.name, result } };
  } finally {
    await client.close();
  }
}
