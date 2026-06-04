const WebSocket = require('ws');

const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/5BF8EB6F6C1C3100E63870B0ADF25137';

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

async function evaluate(ws, id, expression) {
  const result = await sendCmd(ws, id, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 10000,
  });
  return result;
}

async function main() {
  const ws = new WebSocket(PAGE_WS);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  // Get the page title and URL first
  const titleCheck = await evaluate(ws, 100, `document.title + ' | URL: ' + window.location.href`);
  console.log('PAGE:', titleCheck.result?.result?.value);

  // Check the entire DOM structure
  const domCheck = await evaluate(ws, 101, `document.body ? document.body.innerHTML.substring(0, 2000) : 'NO BODY'`);
  console.log('DOM (first 2000):', domCheck.result?.result?.value);

  // Check all IDs in page
  const allIds = await evaluate(ws, 102, `Array.from(document.querySelectorAll('[id]')).map(e => e.id).join(', ')`);
  console.log('ALL IDs:', allIds.result?.result?.value);

  ws.close();
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
