import { describe, expect, it } from 'vitest';
import { mcpClientConfig, mcpServerUrl } from '../../../web/src/mcp.js';

describe('MCP connection configuration', () => {
  const endpoint = 'https://esbuddy.example/api/mcp';
  const token = 'esb_example_only';

  it('resolves the public API URL rather than assuming the frontend origin', () => {
    expect(mcpServerUrl('/api', 'https://esbuddy.example/board?canvas=example#fragment')).toBe(endpoint);
    expect(mcpServerUrl('https://api.example/prefix/api/', 'https://web.example/')).toBe('https://api.example/prefix/api/mcp');
    expect(mcpServerUrl('./api', 'https://esbuddy.example/app/')).toBe('https://esbuddy.example/app/api/mcp');
    expect(mcpServerUrl('/api/?ignored=true#ignored', 'http://localhost:5175/')).toBe('http://localhost:5175/api/mcp');
  });

  it('generates remote Cursor configuration with credentials only in headers', () => {
    const config = JSON.parse(mcpClientConfig('cursor', endpoint, token));
    expect(config).toEqual({ mcpServers: { esbuddy: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } });
    expect(config.mcpServers.esbuddy.url).not.toContain(token);
    expect(config.mcpServers.esbuddy).not.toHaveProperty('command');
  });

  it('uses the VS Code servers root and explicit HTTP transport', () => {
    expect(JSON.parse(mcpClientConfig('vscode', endpoint, token))).toEqual({
      servers: { esbuddy: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
    });
  });

  it('uses serverUrl for Windsurf and safely JSON-escapes values', () => {
    expect(JSON.parse(mcpClientConfig('windsurf', endpoint, token))).toEqual({
      mcpServers: { esbuddy: { serverUrl: endpoint, headers: { Authorization: `Bearer ${token}` } } },
    });
    const quoted = 'example"\\\nonly';
    expect(JSON.parse(mcpClientConfig('cursor', endpoint, quoted)).mcpServers.esbuddy.headers.Authorization).toBe(`Bearer ${quoted}`);
  });
});
