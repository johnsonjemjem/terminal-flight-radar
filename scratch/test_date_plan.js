const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  await sendCmd(ws, 1, 'Runtime.enable');
  await sendCmd(ws, 100, 'Page.enable');
  
  console.log('Reloading page...');
  await sendCmd(ws, 101, 'Page.reload');
  await new Promise(r => setTimeout(r, 1000));

  // Load the JSON plan file
  const jsonPath = path.join(__dirname, '../06-04-26.json');
  const planJson = fs.readFileSync(jsonPath, 'utf8');

  console.log('Loading operational plan JSON into page...');
  const loadExpr = `
    (() => {
      const plan = ${planJson};
      return window.loadPlan(plan);
    })()
  `;
  const loadRes = await sendCmd(ws, 2, 'Runtime.evaluate', { expression: loadExpr, returnByValue: true });
  console.log('Plan Loaded status:', loadRes.result?.result?.value);

  console.log('Searching for "04JUN26"...');
  const searchExpr = `
    (() => {
      document.getElementById('flight-input').value = '04JUN26';
      document.getElementById('track-btn').click();
      return 'triggered';
    })()
  `;
  await sendCmd(ws, 3, 'Runtime.evaluate', { expression: searchExpr, returnByValue: true });

  console.log('Waiting for terminal display to print daily overview...');
  await new Promise(r => setTimeout(r, 2000));

  const logExpr = `document.getElementById('result-stream').innerText`;
  const logRes = await sendCmd(ws, 4, 'Runtime.evaluate', { expression: logExpr, returnByValue: true });
  
  console.log('\n--- TERMINAL OUTPUT STREAM ---');
  console.log(logRes.result?.result?.value);
  console.log('------------------------------');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
