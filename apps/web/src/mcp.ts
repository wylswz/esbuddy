export type McpClient = 'cursor' | 'vscode' | 'windsurf';

/** Use the configured API origin/path, not necessarily the SPA's own origin. */
export function mcpServerUrl(apiBase: string, pageUrl: string): string {
  const url = new URL(apiBase, pageUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/mcp`;
  url.search = '';
  url.hash = '';
  return url.href;
}

export function mcpClientConfig(client: McpClient, url: string, token: string): string {
  const headers = { Authorization: `Bearer ${token}` };
  if (client === 'vscode') {
    return JSON.stringify({ servers: { esbuddy: { type: 'http', url, headers } } }, null, 2);
  }
  if (client === 'windsurf') {
    return JSON.stringify({ mcpServers: { esbuddy: { serverUrl: url, headers } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { esbuddy: { url, headers } } }, null, 2);
}
