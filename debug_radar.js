const http = require('http');
const WebSocket = require('ws');

function getPageInfo() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.url.includes('Terminal%20Flight%20Radar/index.html') || p.url.includes('Terminal Flight Radar/index.html'));
          resolve(page);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function sendCmd(ws, id, method, params = {}) {
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const page = await getPageInfo();
  if (!page) {
    console.error('Error: Terminal Flight Radar page not found.');
    process.exit(1);
  }
  console.log('Connecting to:', page.webSocketDebuggerUrl);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  // Enable domains and bring tab to front
  await sendCmd(ws, 1, 'Page.enable');
  await sendCmd(ws, 2, 'Page.bringToFront');
  await sendCmd(ws, 3, 'Runtime.enable');
  await sendCmd(ws, 4, 'Console.enable');

  // Monitor console messages and exceptions
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Console.messageAdded') {
      const cMsg = msg.params.message;
      console.log(`[PAGE CONSOLE] [${cMsg.level}] ${cMsg.text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[PAGE EXCEPTION]', msg.params.exceptionDetails);
    }
  });

  const loadPromise = new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Page.loadEventFired') {
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
  });

  console.log('Reloading page...');
  await sendCmd(ws, 5, 'Page.reload', { ignoreCache: true });
  await loadPromise;
  console.log('Page loaded!');

  console.log('Waiting 1 second for scripts to initialize...');
  await new Promise(r => setTimeout(r, 1000));

  // Inspect elements in a block scope
  const checkResult = await sendCmd(ws, 6, 'Runtime.evaluate', {
    expression: `{
      const input = document.getElementById('flight-input');
      const btn = document.getElementById('track-btn');
      const stream = document.getElementById('result-stream');
      JSON.stringify({
        inputExists: !!input,
        btnExists: !!btn,
        streamExists: !!stream,
        inputValueBefore: input ? input.value : null,
        streamHtmlBefore: stream ? stream.innerHTML : null
      });
    }`,
    returnByValue: true
  });
  console.log('Pre-check response:', JSON.stringify(checkResult));

  console.log('Simulating drag-and-drop of operational routing plan...');
  const dropResult = await sendCmd(ws, 7, 'Runtime.evaluate', {
    expression: `{
      const mockJson = {
        "date": "2026-06-05",
        "airport": "HND",
        "routings": [
          { "arrival": "169", "sta": "04:45", "eta": "IN", "ac_type": "B789", "nose": "8LY", "arv_spot": "110", "tow_to": "153", "dep_spot": "144", "departure": "170", "std": "11:55", "remarks": "AA170 TOW IN AT 1000L" },
          { "arrival": "175", "sta": "14:20", "eta": "15:18", "ac_type": "B773", "nose": "7LT", "arv_spot": "102", "tow_to": "STAY", "dep_spot": "102", "departure": "176", "std": "16:30", "etd": "17:00", "remarks": "DLY DUE MAINTENANCE" }
        ]
      };
      const file = new File([JSON.stringify(mockJson)], "05-JUN-26.json", { type: "application/json" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const leftTerminal = document.getElementById('left-terminal');
      const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      leftTerminal.dispatchEvent(dropEvent);
      'dispatched'
    }`,
    returnByValue: true
  });
  console.log('Drop dispatch response:', JSON.stringify(dropResult));

  // Wait 1 second for FileReader
  console.log('Waiting 1 second for file reader to finish...');
  await new Promise(r => setTimeout(r, 1000));

  // Check drop output log
  const dropOutputResult = await sendCmd(ws, 8, 'Runtime.evaluate', {
    expression: `document.getElementById('result-stream').innerText`,
    returnByValue: true
  });
  console.log('=== DROP TERMINAL OUTPUT ===');
  console.log(dropOutputResult.result?.result?.value);
  console.log('============================');

  console.log('Clicking button with 05/JUN/26...');
  const evalResult = await sendCmd(ws, 9, 'Runtime.evaluate', {
    expression: `{
      const input = document.getElementById('flight-input');
      input.value = '05/JUN/26';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('track-btn').click();
      'clicked'
    }`,
    returnByValue: true
  });
  console.log('Click response:', JSON.stringify(evalResult));

  // Wait 3 seconds to allow printing to complete fully
  console.log('Waiting 3 seconds...');
  await new Promise(r => setTimeout(r, 3000));

  // Check output stream after date query
  const outputResult = await sendCmd(ws, 10, 'Runtime.evaluate', {
    expression: `document.getElementById('result-stream').innerText`,
    returnByValue: true
  });
  console.log('=== TERMINAL OUTPUT AFTER QUERY ===');
  console.log(outputResult.result?.result?.value);
  console.log('===================================');

  // Check state variables
  const stateResult = await sendCmd(ws, 11, 'Runtime.evaluate', {
    expression: `JSON.stringify({
      isLoading: typeof state !== 'undefined' ? state.isLoading : null,
      currentFlight: typeof state !== 'undefined' ? state.currentFlight : null,
      routingsPlanDate: typeof state !== 'undefined' ? state.routingsPlanDate : null,
      routingsCount: typeof state !== 'undefined' && state.routingsPlan ? state.routingsPlan.length : 0
    })`,
    returnByValue: true
  });
  console.log('State variables:', stateResult.result?.result?.value);

  ws.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
