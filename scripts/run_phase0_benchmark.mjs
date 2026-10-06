import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://localhost:5173/test/scrfd_poc.html';
const PORT = 9222;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('[Runner] Launching Chrome in headless mode with remote debugging...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--ignore-certificate-errors',
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--enable-webgl',
    '--enable-features=Vulkan,DefaultANGLEVulkan,WebAssemblySIMD',
    '--use-gl=angle',
    TARGET_URL
  ], { stdio: 'ignore' });

  chromeProcess.on('error', (err) => {
    console.error('[Runner] Failed to start Chrome:', err);
    process.exit(1);
  });

  // Wait for Chrome CDP port to become active
  let pageTarget = null;
  console.log('[Runner] Waiting for Chrome DevTools Protocol on port 9222...');
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const found = list.find(p => p.url && p.url.includes('scrfd_poc.html'));
        if (found) {
          pageTarget = found;
          break;
        }
      }
    } catch {
      // Chrome starting up
    }
  }

  if (!pageTarget) {
    console.error('[Runner] Error: Could not connect to target page on Chrome port 9222.');
    chromeProcess.kill();
    process.exit(1);
  }

  console.log(`[Runner] Connected to target page: ${pageTarget.title} (${pageTarget.webSocketDebuggerUrl})`);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pendingRequests = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onopen = async () => {
    console.log('[Runner] WebSocket connection established with page.');
    await sendCommand('Runtime.enable');
    await sendCommand('Console.enable');

    console.log('[Runner] Starting simulated camera loop...');
    await sendCommand('Runtime.evaluate', {
      expression: 'startSimulatedCameraLoop()'
    });

    await sleep(1000);

    console.log('[Runner] Triggering runAutomatedBenchmarkSuite()...');
    await sendCommand('Runtime.evaluate', {
      expression: 'runAutomatedBenchmarkSuite().catch(err => { window.__PHASE0_ERROR__ = err?.stack || String(err); console.error("Phase 0 suite failed:", err); })'
    });

    console.log('[Runner] Monitoring benchmark execution...');
    // Poll for window.__PHASE0_REPORT__
    for (let sec = 0; sec < 180; sec++) {
      await sleep(1000);
      const evalRes = await sendCommand('Runtime.evaluate', {
        expression: 'JSON.stringify({ report: window.__PHASE0_REPORT__ || null, error: window.__PHASE0_ERROR__ || null })',
        returnByValue: true
      });

      const reportStr = evalRes.result?.value;
      if (reportStr) {
        const result = JSON.parse(reportStr);
        if (result.error) {
          console.error('[Runner] Browser benchmark failed:', result.error);
          ws.close();
          chromeProcess.kill();
          process.exit(1);
        }
        if (!result.report) continue;
        const report = result.report;
        console.log('\n======================================================');
        console.log('PHASE 0 BENCHMARK COMPLETED SUCCESSFULLY:');
        console.log('======================================================');
        console.log(JSON.stringify(report, null, 2));
        console.log('======================================================');
        
        ws.close();
        chromeProcess.kill();
        process.exit(0);
      }
    }

    console.error('[Runner] Benchmark timed out after 180 seconds.');
    ws.close();
    chromeProcess.kill();
    process.exit(1);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      resolve(data.result);
    } else if (data.method === 'Console.messageAdded') {
      const text = data.params?.message?.text || '';
      console.log(`[Browser Console] ${text}`);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const args = (data.params?.args || []).map(a => a.value || JSON.stringify(a)).join(' ');
      console.log(`[Browser Console] ${args}`);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const exception = data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text;
      console.error(`[Browser Exception] ${exception || 'Unknown exception'}`);
    }
  };

  ws.onerror = (err) => {
    console.error('[Runner] WebSocket error:', err);
  };
}

main().catch(err => {
  console.error('[Runner] Fatal error:', err);
  process.exit(1);
});
