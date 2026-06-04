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

  const results = {};

  // Step 3: Setup error listener
  const step3 = await evaluate(ws, 3,
    `window.__errors = []; window.onerror = (m,s,l,c,e) => window.__errors.push({m,s,l,c}); 'listening'`
  );
  results.step3 = step3.result?.result?.value ?? JSON.stringify(step3);

  // Step 4: Check function types
  const step4 = await evaluate(ws, 4,
    `typeof drawRouteCanvas + ' | ' + typeof trackFlight + ' | ' + typeof buildOutputLines + ' | ' + typeof greatCirclePoint`
  );
  results.step4 = step4.result?.result?.value ?? JSON.stringify(step4);

  // Step 5: Check elements
  const step5 = await evaluate(ws, 5,
    `['flight-input','track-btn','result-stream','route-canvas','splash','flight-result','loading-overlay'].map(id => id + ':' + (document.getElementById(id) ? 'OK' : 'MISSING')).join(', ')`
  );
  results.step5 = step5.result?.result?.value ?? JSON.stringify(step5);

  // Step 6: Simulate click
  const step6 = await evaluate(ws, 6,
    `document.getElementById('flight-input').value = 'AA169'; document.getElementById('track-btn').click(); 'clicked'`
  );
  results.step6 = step6.result?.result?.value ?? JSON.stringify(step6);

  // Wait 2 seconds
  await new Promise(r => setTimeout(r, 2000));

  // Step 7: Check errors
  const step7 = await evaluate(ws, 7,
    `JSON.stringify(window.__errors)`
  );
  results.step7 = step7.result?.result?.value ?? JSON.stringify(step7);

  // Step 8: result-stream content
  const step8 = await evaluate(ws, 8,
    `document.getElementById('result-stream') ? document.getElementById('result-stream').innerHTML.substring(0, 500) : 'MISSING'`
  );
  results.step8 = step8.result?.result?.value ?? JSON.stringify(step8);

  // Step 9: flight-result content
  const step9 = await evaluate(ws, 9,
    `document.getElementById('flight-result') ? document.getElementById('flight-result').innerHTML.substring(0, 300) : 'MISSING'`
  );
  results.step9 = step9.result?.result?.value ?? JSON.stringify(step9);

  // Step 10: loading-overlay display
  const step10 = await evaluate(ws, 10,
    `document.getElementById('loading-overlay') ? document.getElementById('loading-overlay').style.display : 'MISSING'`
  );
  results.step10 = step10.result?.result?.value ?? JSON.stringify(step10);

  ws.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
