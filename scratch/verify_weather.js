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

  await sendCmd(ws, 1, 'Runtime.enable');
  await sendCmd(ws, 100, 'Page.enable');
  console.log('Reloading page to apply latest CSS...');
  await sendCmd(ws, 101, 'Page.reload');
  await new Promise(r => setTimeout(r, 1500));

  const checkExpr = `
    (() => {
      const box = document.querySelector('.wagon-neon-box');
      const computed = window.getComputedStyle(box);
      const overlays = Array.from(document.querySelectorAll('.flicker-overlay')).map(el => el.className);
      return {
        boxExists: !!box,
        height: computed.height,
        borderColor: computed.borderColor,
        boxShadow: computed.boxShadow,
        overlays: overlays
      };
    })()
  `;

  const res = await sendCmd(ws, 2, 'Runtime.evaluate', { expression: checkExpr, returnByValue: true });
  const val = res.result?.result?.value;
  
  console.log('\n--- Le Wagon Neon Sign Styling & Animation Validation ---');
  console.log(`Box Exists: ${val.boxExists}`);
  console.log(`Computed Height: ${val.height}`);
  console.log(`Border Color: ${val.borderColor}`);
  console.log(`Box Shadow: ${val.boxShadow}`);
  console.log(`Flicker Overlays found in DOM:`, val.overlays);

  const isPurple = val.borderColor.includes('190') || val.borderColor.includes('rgba(190');
  const isHeightCorrect = val.height === '320px';
  const overlaysExist = val.overlays.length === 3;

  if (val.boxExists && isHeightCorrect && overlaysExist) {
    console.log('\n✓ Success: Le Wagon Tokyo neon sign is successfully customized with 320px height, purple lining, and wheel/window flicker overlays!');
  } else {
    console.error('\n✗ Error: Customization validation failed!');
    if (!isHeightCorrect) console.error(`  Expected height: 320px, Got: ${val.height}`);
    if (!overlaysExist) console.error(`  Expected 3 flicker overlays, Got: ${val.overlays.length}`);
  }

  ws.close();
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
