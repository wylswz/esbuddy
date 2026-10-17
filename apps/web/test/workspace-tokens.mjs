// Run against a remote-mode Vite server backed by an isolated development DB.
// Creates its own user and browser context; never uses your browser's canvases.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const appUrl = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5175';
const debugUrl = process.env.BROWSER_DEBUG_URL ?? 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error('Browser condition timed out');
};

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const call = pending.get(message.id);
    if (!call) return;
    clearTimeout(call.timeout);
    pending.delete(message.id);
    if (message.error) call.reject(new Error(JSON.stringify(message.error)));
    else call.resolve(message.result);
  });
  return {
    exceptions,
    close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    }),
  };
}

const version = await fetch(`${debugUrl}/json/version`).then((res) => res.json());
const browser = await connect(version.webSocketDebuggerUrl);
let contextId;
let page;
let agent;
let agentDoc;
try {
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
  const targets = await fetch(`${debugUrl}/json/list`).then((res) => res.json());
  page = await connect(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  const evaluate = async (expression) => {
    const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = (expression) => until(() => evaluate(expression)).catch((cause) => {
    throw new Error(`Browser condition timed out: ${expression}`, { cause });
  });
  const button = async (text) => {
    const expression = `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
    await waitFor(`!!(${expression})`);
    await evaluate(`(${expression}).click()`);
  };
  const click = async (expression) => {
    await waitFor(`!!(${expression})`);
    await evaluate(`(${expression}).scrollIntoView({ block: 'center' })`);
    const point = await evaluate(`(() => {
      const r = (${expression}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const chooseClient = async (name) => {
    await click('document.querySelector(\'button[aria-label="MCP client"]\')');
    await click(`Array.from(document.querySelectorAll('[role="option"]')).find((option) => option.textContent === ${JSON.stringify(name)})`);
  };
  const capture = async (name) => {
    if (!process.env.BROWSER_SCREENSHOT_DIR) return;
    // A guide capture must never write a full credential into an image artifact.
    const originals = await evaluate(`Array.from(document.querySelectorAll('input, textarea')).map((field, index) => {
      const value = field.value;
      field.value = value.replace(/esb_[0-9a-f]{64}/g, 'esb_REDACTED');
      return { index, value };
    })`);
    try {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(resolve(process.env.BROWSER_SCREENSHOT_DIR, `workspace-tokens-${name}.png`), Buffer.from(data, 'base64'));
    } finally {
      await evaluate(`(${JSON.stringify(originals)}).forEach(({ index, value }) => {
        document.querySelectorAll('input, textarea')[index].value = value;
      })`);
    }
  };
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: appUrl });
  await waitFor('document.readyState === "complete"');
  await evaluate(`(async () => {
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'token-browser-' + crypto.randomUUID() + '@example.com', name: 'Token test' }),
    });
    if (!res.ok) throw new Error('Development login failed');
    const { token } = await res.json();
    localStorage.setItem('esbuddy.token', token);
    localStorage.setItem('esbuddy.locale', 'en');
    localStorage.setItem('esbuddy.tour.done', '1');
  })()`);
  await page.send('Page.reload');
  await button('Manage workspace');
  await waitFor('!!document.querySelector("form input")');
  await evaluate('document.querySelector("form input").focus()');
  await page.send('Input.insertText', { text: 'First expert' });
  await waitFor('!document.querySelector(\'button[type="submit"]\').disabled');
  await button('Create token');
  await waitFor('!!document.querySelector(\'input[aria-label="New access token"]\')');
  const firstSecret = await evaluate('document.querySelector(\'input[aria-label="New access token"]\').value');
  await waitFor('!document.querySelector("form input").disabled');
  assert.equal(await evaluate('document.querySelector("form input").value'), '');
  assert.equal(await evaluate('document.querySelector(\'button[type="submit"]\').disabled'), true);
  await chooseClient('VS Code');
  await evaluate(`Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => {} },
  })`);
  await button('Copy configuration');
  await waitFor('!!document.querySelector(\'section[aria-label="Connect via MCP"] [role="status"]\')');
  await evaluate('document.querySelector("form input").focus()');
  await page.send('Input.insertText', { text: 'Token expert' });
  await waitFor('!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Create token"))?.disabled');
  // A failed consecutive creation must keep the previous one-time secret visible.
  await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['*/api/workspaces/*/tokens'] });
  await button('Create token');
  await waitFor('!!document.querySelector(\'[role="alert"]\')');
  await page.send('Network.setBlockedURLs', { urls: [] });
  assert.equal(await evaluate('document.querySelector(\'input[aria-label="New access token"]\').value'), firstSecret);
  assert.equal(await evaluate('document.querySelector("form input").value'), 'Token expert');
  assert.equal(await evaluate('document.querySelector("form input").disabled'), false);
  await button('Create token');
  await waitFor(`document.querySelector('input[aria-label="New access token"]').value !== ${JSON.stringify(firstSecret)}`);
  const secret = await evaluate('document.querySelector(\'input[aria-label="New access token"]\').value');
  assert.ok(/^esb_[0-9a-f]{64}$/.test(secret));
  assert.equal(await evaluate('document.querySelector(\'input[aria-label="New access token"]\').readOnly'), true);
  assert.equal(await evaluate('document.querySelector("form input").disabled'), false);
  assert.equal(await evaluate('document.querySelector("form input").value'), '');
  assert.equal(await evaluate('!!document.querySelector(\'[role="alert"]\')'), false);
  assert.equal(await evaluate('!!document.querySelector(\'section[aria-label="Connect via MCP"] [role="status"]\')'), false);
  assert.equal(await evaluate('document.querySelector(\'button[aria-label="MCP client"]\').textContent'), 'Cursor');
  assert.equal(await evaluate('document.body.innerText.includes("First expert") && document.body.innerText.includes("Token expert")'), true);
  assert.equal(await evaluate(`Object.values(localStorage).some((value) => value.includes(${JSON.stringify(firstSecret)}))`), false);
  assert.equal(await evaluate(`Object.values(sessionStorage).some((value) => value.includes(${JSON.stringify(firstSecret)}))`), false);
  console.log('PASS consecutive token creation, failed retry preserves secret and new guide resets copy state');
  await waitFor('!!document.querySelector(\'textarea[aria-label="MCP configuration"]\')');
  assert.equal(await evaluate('document.querySelector(\'input[aria-label="MCP server URL"]\').value'), new URL('/api/mcp', appUrl).href);
  assert.equal(await evaluate(`(() => {
    const config = JSON.parse(document.querySelector('textarea[aria-label="MCP configuration"]').value);
    return config.mcpServers.esbuddy.headers.Authorization === 'Bearer ' + ${JSON.stringify(secret)}
      && !('command' in config.mcpServers.esbuddy);
  })()`), true);
  // Mock the clipboard in this isolated context, leaving the user's OS clipboard untouched.
  await evaluate(`Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async (text) => { window.__mcpClipboard = text; } },
  })`);
  await button('Copy URL');
  assert.equal(await evaluate('window.__mcpClipboard'), new URL('/api/mcp', appUrl).href);
  await button('Copy configuration');
  assert.equal(await evaluate('window.__mcpClipboard === document.querySelector(\'textarea[aria-label="MCP configuration"]\').value'), true);
  await chooseClient('VS Code');
  assert.equal(await evaluate(`(() => {
    const config = JSON.parse(document.querySelector('textarea[aria-label="MCP configuration"]').value);
    return config.servers.esbuddy.type === 'http'
      && config.servers.esbuddy.headers.Authorization === 'Bearer ' + ${JSON.stringify(secret)};
  })()`), true);
  await button('Copy configuration');
  assert.equal(await evaluate('window.__mcpClipboard === document.querySelector(\'textarea[aria-label="MCP configuration"]\').value'), true);
  await chooseClient('Windsurf');
  assert.equal(await evaluate(`(() => {
    const config = JSON.parse(document.querySelector('textarea[aria-label="MCP configuration"]').value);
    return !!config.mcpServers.esbuddy.serverUrl
      && config.mcpServers.esbuddy.headers.Authorization === 'Bearer ' + ${JSON.stringify(secret)};
  })()`), true);
  await chooseClient('Cursor');
  const connection = await evaluate('JSON.parse(document.querySelector(\'textarea[aria-label="MCP configuration"]\').value).mcpServers.esbuddy');
  const callMcp = async (method, params) => {
    const response = await fetch(connection.url, {
      method: 'POST',
      headers: { ...connection.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const initialized = await callMcp('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'onboarding-test', version: '1.0' },
  });
  assert.equal(initialized.result.serverInfo.name, 'esbuddy');
  const identity = await callMcp('tools/call', { name: 'esbuddy_identity', arguments: {} });
  assert.equal(identity.result.structuredContent.result.name, 'Token expert');
  console.log('PASS copied MCP configuration connects to the remote server with the correct identity');
  await evaluate('document.querySelector(\'section[aria-label="Connect via MCP"]\').scrollIntoView({ block: "start" })');
  await capture('mcp-desktop');
  await evaluate('navigator.clipboard.writeText = async () => { throw new Error("Clipboard unavailable"); }');
  await button('Copy configuration');
  await waitFor('document.body.innerText.includes("Clipboard access is unavailable")');
  assert.equal(await evaluate('document.querySelector(\'textarea[aria-label="MCP configuration"]\').readOnly'), true);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector(\'section[aria-label="Connect via MCP"]\').scrollIntoView({ block: "start" })');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(await evaluate(`(() => {
    const select = document.querySelector('button[aria-label="MCP client"]').getBoundingClientRect();
    const copy = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Copy configuration').getBoundingClientRect();
    return copy.top >= select.bottom;
  })()`), true);
  await capture('mcp-mobile');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await evaluate('delete window.__mcpClipboard');
  console.log('PASS MCP guide, client configurations, copy actions, clipboard fallback and mobile layout');
  await button('I have saved the token');
  assert.equal(await evaluate('!!document.querySelector(\'input[aria-label="New access token"]\')'), false);
  assert.equal(await evaluate('!!document.querySelector(\'textarea[aria-label="MCP configuration"]\')'), false);
  assert.equal(await evaluate(`Object.values(localStorage).some((value) => value.includes(${JSON.stringify(secret)}))`), false);
  assert.equal(await evaluate(`Object.values(sessionStorage).some((value) => value.includes(${JSON.stringify(secret)}))`), false);
  await capture('desktop');
  console.log('PASS create token, one-time secret display and safe browser storage');

  await button('Back');
  await waitFor('!!document.querySelector(\'.card-enter button[aria-label="Rename"]\')');
  await evaluate('document.querySelector(\'.card-enter button[aria-label="Rename"]\').closest(".card-enter").click()');
  await waitFor('!!document.querySelector(".react-flow")');
  const canvasId = await evaluate(`(async () => {
    const res = await fetch('/api/canvases', { headers: { authorization: 'Bearer ' + ${JSON.stringify(secret)} } });
    return (await res.json())[0].id;
  })()`);
  agentDoc = new Y.Doc();
  agent = new WebsocketProvider(`${appUrl.replace(/^http/, 'ws')}/api/rooms`, canvasId, agentDoc, {
    params: { token: secret }, disableBc: true,
  });
  await until(() => agent.synced);
  agent.awareness.setLocalState({
    user: { id: 'fake', name: 'Spoofed name' }, cursor: { x: 400, y: 200 }, selection: [],
  });
  await waitFor('!!document.querySelector(\'[title="Token expert (agent)"]\')');
  await waitFor('Array.from(document.querySelectorAll("span")).some((el) => el.textContent === "Token expert")');
  await capture('presence');
  console.log('PASS real agent connection, authenticated avatar and cursor label');

  await page.send('Page.reload');
  await button('Manage workspace');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor('document.body.innerText.includes("Token expert")');
  await evaluate('document.querySelector("form").scrollIntoView({ block: "start" })');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await capture('mobile');
  await button('Revoke token');
  await waitFor('!!document.querySelector(\'[role="alertdialog"]\')');
  await evaluate(`Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent.trim() === 'Revoke token').click()`);
  await waitFor('document.body.innerText.includes("Revoked")');
  agent.shouldConnect = false;
  agent.awareness.setLocalStateField('cursor', null);
  await until(() => !agent.wsconnected);
  const revoked = await fetch(`${appUrl}/api/auth/identity`, { headers: { authorization: `Bearer ${secret}` } });
  assert.equal(revoked.status, 401);
  assert.equal(await evaluate('!!document.querySelector(\'input[aria-label="New access token"]\')'), false);
  assert.equal(await evaluate('!!document.querySelector(\'textarea[aria-label="MCP configuration"]\')'), false);
  assert.deepEqual(page.exceptions, []);
  console.log('PASS mobile layout, token revocation and rejection of an existing connection');
} catch (error) {
  if (page) {
    const diagnostic = await page.send('Runtime.evaluate', {
      expression: '({ text: document.body.innerText.replace(/esb_[0-9a-f]{64}/g, "[redacted]").slice(0, 2000), width: innerWidth })', returnByValue: true,
    }).catch(() => null);
    console.error(diagnostic?.result?.value);
  }
  throw error;
} finally {
  agent?.destroy();
  agentDoc?.destroy();
  if (contextId) await browser.send('Target.disposeBrowserContext', { browserContextId: contextId });
  page?.close();
  browser.close();
}
