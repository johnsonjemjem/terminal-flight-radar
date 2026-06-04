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
  console.log('Found page:', page.title, 'at', page.url);
  console.log('Connecting to:', page.webSocketDebuggerUrl);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  // Enable Page domain
  await sendCmd(ws, 1, 'Page.enable');

  // Set up Page load event listener
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

  // Reload the page to load latest JS
  console.log('Reloading page...');
  await sendCmd(ws, 2, 'Page.reload', { ignoreCache: true });

  console.log('Waiting for load event...');
  await loadPromise;
  console.log('Page loaded!');

  // Wait 1 second after reload for initialization
  console.log('Waiting 1 second...');
  await new Promise(r => setTimeout(r, 1000));

  // Run the evaluation to query "05/JUN/26"
  console.log('Evaluating query input and click...');
  const evalResult = await sendCmd(ws, 3, 'Runtime.evaluate', {
    expression: `document.getElementById('flight-input').value = '05/JUN/26'; document.getElementById('track-btn').click(); 'queried'`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 10000,
  });
  console.log('Query response:', evalResult.result?.result?.value);

  // Wait 1.5 seconds
  console.log('Waiting 1.5 seconds...');
  await new Promise(r => setTimeout(r, 1500));

  // Print the terminal output
  console.log('Fetching terminal output...');
  const outputResult = await sendCmd(ws, 4, 'Runtime.evaluate', {
    expression: `document.getElementById('result-stream').innerText`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 10000,
  });

  console.log('=== TERMINAL OUTPUT ===');
  console.log(outputResult.result?.result?.value);
  console.log('=======================');

  ws.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
