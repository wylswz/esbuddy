// Run against a local Vite server and a Chrome instance with --remote-debugging-port=9333.
// Uses an isolated browser context: existing canvases and browser storage are untouched.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const appUrl = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5174';
const debugUrl = process.env.BROWSER_DEBUG_URL ?? 'http://127.0.0.1:9333';
const screenshotDir = process.env.BROWSER_SCREENSHOT_DIR;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  const exceptions = [];
  let sequence = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return {
    exceptions,
    close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    }),
  };
}

const version = await fetch(`${debugUrl}/json/version`).then((r) => r.json()).catch((cause) => {
  throw new Error('Start Chrome with --remote-debugging-port=9333, or set BROWSER_DEBUG_URL.', { cause });
});
const browser = await connect(version.webSocketDebuggerUrl);
let contextId;
let page;
try {
  ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
  const targets = await fetch(`${debugUrl}/json/list`).then((r) => r.json());
  page = await connect(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);
  await page.send('Runtime.enable');
  await page.send('Page.enable');

  const evaluate = async (expression) => {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  const viewport = async (width, height, mobile = false) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await sleep(150);
  };
  const click = async (selector, clickCount = 1) => {
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    const point = await evaluate(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount });
  };
  const key = async (key, code, windowsVirtualKeyCode) => {
    const params = { key, code, windowsVirtualKeyCode };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  };
  const capture = async (name) => {
    if (!screenshotDir) return;
    await sleep(700);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(screenshotDir, `interaction-${name}.png`), Buffer.from(data, 'base64'));
  };
  const check = async (name, run) => {
    try {
      await run();
    } catch (error) {
      await capture('failure');
      console.error(await evaluate('({ focus: document.activeElement?.tagName, text: document.body.innerText.slice(0, 1200), notes: document.querySelectorAll(".react-flow__node").length })'));
      throw error;
    }
    console.log(`PASS ${name}`);
  };
  const fixture = {
    version: 1,
    canvases: {
      'browser-test': {
        name: 'Workshop study',
        nodes: ['event', 'command', 'actor', 'policy', 'external', 'hotspot', 'readmodel', 'note'].map((type, i) => ({
          id: `test-${type}`, type, width: type === 'actor' ? 140 : 180, height: type === 'actor' ? 120 : 180,
          position: { x: (i % 4) * 240, y: Math.floor(i / 4) * 250 },
          data: { type, label: type === 'event' ? 'Order placed' : `Workshop ${type}` },
        })),
        edges: [],
        viewport: { x: 300, y: 160, zoom: 1.05 },
      },
    },
  };

  await viewport(1440, 1000);
  await page.send('Page.navigate', { url: appUrl });
  await waitFor('!!document.querySelector(".poster-field")');
  await evaluate(`(() => {
    localStorage.setItem('esbuddy.tour.done', '1');
    localStorage.setItem('esbuddy.started', '1');
    localStorage.setItem('esbuddy.locale', 'en');
    localStorage.setItem('esbuddy.example-seeded', '1');
    localStorage.setItem('esbuddy.canvas-store', ${JSON.stringify(JSON.stringify(fixture))});
  })()`);
  await page.send('Page.reload');
  await waitFor('Array.from(document.querySelectorAll(".group.card-enter")).some(e => e.textContent.includes("Workshop study"))');
  await evaluate('Array.from(document.querySelectorAll(".group.card-enter")).find(e => e.textContent.includes("Workshop study")).click()');
  await waitFor('document.querySelectorAll(".react-flow__node .sticky-node").length === 8');
  const count = () => evaluate('document.querySelectorAll(".react-flow__node .sticky-node").length');
  const move = (x, y, modifiers = 0) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  const clickAt = async (x, y, modifiers = 0) => {
    await move(x, y, modifiers);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers });
  };
  const undo = async (redo = false) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: redo ? 10 : 2 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 0 });
    await sleep(100);
  };
  const rect = (selector) => evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  const drag = async (start, end, inspect) => {
    await move(start.x, start.y);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1,
        x: start.x + (end.x - start.x) * i / 12,
        y: start.y + (end.y - start.y) * i / 12,
      });
      await sleep(15);
    }
    // A pause must not split this physical gesture into multiple undo steps.
    await sleep(500);
    await inspect?.();
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', clickCount: 1 });
    await sleep(100);
  };

  await check('placement and cancellation do not publish empty paper', async () => {
    await capture('rest');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-id=\\"test-event\\"] .sticky-memo")).visibility'), 'hidden');
    await click('.editor-toolbar [data-tour="elements"] button');
    assert.equal(await count(), 8);
    await move(300, 700);
    await waitFor('!!document.querySelector("[data-note-composer][data-phase=placing]")');
    await capture('placement');
    const transform = await evaluate('document.querySelector(".react-flow__viewport").style.transform');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 300, y: 700, deltaX: 80, deltaY: 60 });
    await waitFor(`document.querySelector(".react-flow__viewport").style.transform !== ${JSON.stringify(transform)}`);
    await sleep(100);
    const held = await evaluate('document.querySelector("[data-note-composer]").getBoundingClientRect().x');
    assert.ok(Math.abs(held - 300) < 1, 'Held paper follows the pointer, not the panning wall');
    await key('Escape', 'Escape', 27);
    await waitFor('!document.querySelector(".placement-hint")');
    assert.equal(await count(), 8);
  });
  await check('place, write, confirm is one undoable contribution; IME Enter does not submit', async () => {
    await click('.editor-toolbar [data-tour="elements"] button');
    await clickAt(300, 700);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    assert.equal(await count(), 8);
    await page.send('Input.insertText', { text: 'Payment received' });
    await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }))');
    assert.equal(await count(), 8);
    assert.equal(await evaluate('!!document.querySelector("[data-note-composer] textarea")'), true);
    await capture('writing');
    await key('Enter', 'Enter', 13);
    await waitFor('!document.querySelector("[data-note-composer]")');
    assert.equal(await count(), 9);
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".sticky-title")).some(e => e.textContent === "Payment received")'), true);
    await undo();
    assert.equal(await count(), 8);
    await undo(true);
    assert.equal(await count(), 9);
    await undo();
    assert.equal(await count(), 8);
  });
  await check('keyboard starts writing at the pointer; cancellation and blank blur leave no note', async () => {
    await move(300, 700);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: 'Cancelled thought' });
    await key('Escape', 'Escape', 27);
    assert.equal(await count(), 8);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await clickAt(1100, 800);
    await waitFor('!document.querySelector("[data-note-composer]")');
    assert.equal(await count(), 8);
  });
  await check('written blur saves, but clicking cancel never saves the draft', async () => {
    await move(300, 700);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: 'Save on leaving' });
    await clickAt(1100, 800);
    await waitFor('!document.querySelector("[data-note-composer]")');
    assert.equal(await count(), 9);
    await undo();
    assert.equal(await count(), 8);
    await move(300, 700);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: 'Do not save this' });
    await click('[data-note-composer] button[aria-label="Cancel"]');
    assert.equal(await count(), 8);
  });
  await check('selection is not a lifted state and local actions edit the selected paper', async () => {
    await click('[data-id="test-event"] .sticky-title');
    await waitFor('document.querySelector("[data-id=\\"test-event\\"] .sticky-note").dataset.selected === "true"');
    assert.equal(await evaluate('document.querySelector("[data-id=\\"test-event\\"] .sticky-note").dataset.lifted'), 'false');
    await click('.note-tools button[aria-label="Edit title"]');
    await waitFor('!!document.querySelector("[data-id=\\"test-event\\"] textarea")');
    await page.send('Input.insertText', { text: 'Order confirmed' });
    await key('Enter', 'Enter', 13);
    await waitFor('document.querySelector("[data-id=\\"test-event\\"] .sticky-title")?.textContent === "Order confirmed"');
  });
  const actorSelector = '[data-id="test-actor"]';
  const commandSelector = '[data-id="test-command"]';
  const near = (actual, expected) => {
    assert.ok(Math.abs(actual.x - expected.x) < 1 && Math.abs(actual.y - expected.y) < 1, JSON.stringify({ actual, expected }));
  };
  const bound = () => evaluate('document.querySelector("[data-id=\\"test-actor\\"] .sticky-node").dataset.boundTo ?? null');
  await check('saving on blur does not steal selection from the next object', async () => {
    await move(300, 700);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: 'Leave this here' });
    const command = await rect(commandSelector);
    await clickAt(command.x + 40, command.y + command.height - 12);
    await waitFor('!document.querySelector("[data-note-composer]")');
    assert.equal(await count(), 9);
    assert.equal(await evaluate('document.querySelector("[data-id=\\"test-command\\"]").classList.contains("selected")'), true);
    await undo();
    assert.equal(await count(), 8);
  });
  await check('binding preview predicts the drop; a paused drag and binding undo together', async () => {
    const actor = await rect(actorSelector);
    const command = await rect(commandSelector);
    await drag(
      { x: actor.x + actor.width / 2, y: actor.y + actor.height / 2 },
      { x: command.x + command.width / 2, y: command.y + command.height / 2 },
      async () => {
        assert.equal(await evaluate('document.querySelector("[data-id=\\"test-actor\\"] .sticky-note").dataset.lifted'), 'true');
        assert.ok((await evaluate('document.querySelector(".placement-hint").textContent')).includes('issues'));
        await capture('binding-preview');
      },
    );
    assert.equal(await bound(), 'test-command');
    await undo();
    assert.equal(await bound(), null);
    near(await rect(actorSelector), actor);
    await undo(true);
    assert.equal(await bound(), 'test-command');
  });
  await check('local unstick preserves position and is undoable', async () => {
    const position = await rect(actorSelector);
    await click('.note-tools [data-node-action="detach"]');
    assert.equal(await bound(), null);
    near(await rect(actorSelector), position);
    await undo();
    assert.equal(await bound(), 'test-command');
  });
  await check('dragging off predicts unbinding and undo restores both position and attachment', async () => {
    const actor = await rect(actorSelector);
    await drag(
      { x: actor.x + actor.width / 2, y: actor.y + actor.height / 2 },
      { x: actor.x + actor.width / 2 + 320, y: actor.y + actor.height / 2 + 260 },
      async () => assert.ok((await evaluate('document.querySelector(".placement-hint").textContent')).includes('unstick')),
    );
    assert.equal(await bound(), null);
    await undo();
    assert.equal(await bound(), 'test-command');
    near(await rect(actorSelector), actor);
  });
  await check('moving the target moves its attached paper; one undo restores the whole gesture', async () => {
    const actor = await rect(actorSelector);
    const command = await rect(commandSelector);
    const start = { x: command.x + command.width / 2, y: command.y + command.height - 12 };
    await drag(start, { x: start.x + 60, y: start.y + 70 });
    near(await rect(commandSelector), { x: command.x + 60, y: command.y + 70 });
    near(await rect(actorSelector), { x: actor.x + 60, y: actor.y + 70 });
    await undo();
    near(await rect(commandSelector), command);
    near(await rect(actorSelector), actor);
    assert.equal(await bound(), 'test-command');
  });
  await check('detaching the only aggregate member removes the empty aggregate without moving the member', async () => {
    const result = await evaluate(`import('/src/editor/transforms.ts').then(({ detachNote }) => {
      const member = { id: 'child', type: 'event', position: { x: 50, y: 60 }, data: { aggregateId: 'agg' }, style: { width: 180, height: 180 } };
      return detachNote([{ id: 'agg', type: 'aggregate', position: { x: 0, y: 0 }, data: {}, style: { width: 400, height: 300 } }, member], 'child');
    })`);
    assert.equal(result.length, 1);
    assert.equal(result[0].data.aggregateId, null);
    assert.deepEqual(result[0].position, { x: 50, y: 60 });
  });
  await check('aggregate grouping is available at the selection and undo restores membership', async () => {
    const event = await rect('[data-id="test-event"]');
    const command = await rect(commandSelector);
    // The lower strip intersects the event and command, but not the attached actor.
    await drag(
      { x: event.x - 12, y: command.y + command.height - 8 },
      { x: command.x + command.width + 12, y: command.y + command.height + 8 },
    );
    await waitFor('document.querySelectorAll(".react-flow__node.selected").length === 2');
    await click('[data-tour="group"]');
    await waitFor('document.querySelectorAll(".react-flow__node-aggregate").length === 1');
    await undo();
    await waitFor('document.querySelectorAll(".react-flow__node-aggregate").length === 0');
  });
  await check('export remains discoverable in the tool search', async () => {
    await click('[data-tour="search"]');
    await waitFor('!!document.querySelector("[role=dialog] input")');
    await page.send('Input.insertText', { text: 'YAML' });
    await waitFor('document.querySelectorAll("[role=option]").length === 1');
    assert.ok((await evaluate('document.querySelector("[role=option]").textContent')).includes('Export YAML'));
    await key('Escape', 'Escape', 27);
    await waitFor('!document.querySelector("[role=dialog]")');
  });
  await check('new attached notes are written and bound in one undo step', async () => {
    const command = await rect(commandSelector);
    await move(command.x + 20, command.y + 20);
    await key('a', 'KeyA', 65);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: 'A new customer' });
    await key('Enter', 'Enter', 13);
    assert.equal(await count(), 9);
    const actorHeight = await evaluate(`(() => {
      const node = Array.from(document.querySelectorAll('.react-flow__node-actor')).find(e => e.textContent.includes('A new customer'));
      return { model: node.getBoundingClientRect().height, paper: node.querySelector('.sticky-node').getBoundingClientRect().height };
    })()`);
    assert.ok(Math.abs(actorHeight.model - actorHeight.paper) < 1, 'Actor paper matches its placement and binding geometry');
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".sticky-node[data-bound-to=\\"test-command\\"]")).length'), 2);
    await undo();
    assert.equal(await count(), 8);
    assert.equal(await bound(), 'test-command');
  });
  await check('writing stays readable while the board is zoomed out', async () => {
    await click('.react-flow__controls-zoomout');
    await click('.react-flow__controls-zoomout');
    await sleep(300);
    await move(300, 700);
    await key('e', 'KeyE', 69);
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    const size = await evaluate(`(() => {
      const composer = document.querySelector('[data-note-composer]');
      const scale = new DOMMatrix(getComputedStyle(composer).transform).a;
      return parseFloat(getComputedStyle(composer.querySelector('textarea')).fontSize) * scale;
    })()`);
    assert.ok(size >= 15.9, `Writing font is ${size}px on screen`);
    await key('Escape', 'Escape', 27);
    await click('.react-flow__controls-zoomin');
    await click('.react-flow__controls-zoomin');
    await sleep(300);
  });
  await check('voting and read-only guide remain available after the toolbar changes', async () => {
    await click('[data-id="test-hotspot"] button');
    await waitFor('document.querySelector("[data-id=\\"test-hotspot\\"] button").getAttribute("aria-pressed") === "true"');
    await click('[data-tour="help"]');
    await waitFor('!!document.querySelector("[role=dialog] nav")');
    await evaluate('document.querySelectorAll("[role=dialog] nav button")[1].click()');
    await waitFor('!!document.querySelector("[role=dialog] .sticky-title")');
    await click('[role="dialog"] .sticky-title', 2);
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog] input, [role=dialog] textarea").length'), 0);
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog] .note-tools").length'), 0);
    await click('[role="dialog"] button[aria-label="Close"]');
  });
  await viewport(390, 844, true);
  await check('mobile can take, place and write a note without an extra edit gesture', async () => {
    assert.equal(await evaluate(`(() => {
      const title = document.querySelector('.editor-title').getBoundingClientRect();
      const actions = document.querySelector('[data-tour=compile]').parentElement.getBoundingClientRect();
      return title.top >= actions.bottom && title.right <= innerWidth;
    })()`), true);
    await click('.editor-fab');
    await waitFor('document.querySelector(".editor-fab").getAttribute("aria-expanded") === "true"');
    await click('.editor-toolbar .grid button');
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 70, y: 200 }] });
    await sleep(60);
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitFor('document.activeElement.matches("[data-note-composer] textarea")');
    await page.send('Input.insertText', { text: '\u8ba2\u5355\u5df2\u53d1\u8d27' });
    await key('Enter', 'Enter', 13);
    await waitFor('!document.querySelector("[data-note-composer]")');
    assert.equal(await count(), 9);
    await capture('mobile');
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".sticky-note")).transitionDuration'), '0s');
  });
  assert.deepEqual(page.exceptions, [], 'No uncaught browser exceptions');
} finally {
  page?.close();
  if (contextId) await browser.send('Target.disposeBrowserContext', { browserContextId: contextId });
  browser.close();
}
