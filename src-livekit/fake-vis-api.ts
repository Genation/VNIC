import http from 'node:http';

const PORT = parseInt(process.env.VIS_API_PORT || '3001', 10);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/visualize') {
    const body = await readBody(req);
    const { prompt } = JSON.parse(body);

    // Simulate 2s render delay
    console.log(`[fake-vis] Rendering "${prompt}"...`);
    await sleep(2000);
    console.log(`[fake-vis] Done rendering "${prompt}"`);

    const resp = {
      id: `viz_${Date.now()}`,
      html: `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><style>
  body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f4ff; }
  .card { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
  h1 { color: #1a1a2e; }
  p { color: #555; }
</style></head>
<body>
  <div class="card">
    <h1>${escapeHtml(prompt)}</h1>
    <p>Hình minh họa đang được xây dựng...</p>
    <p style="font-size: 0.8rem; color: #999">Fake API — delay 2s</p>
  </div>
</body>
</html>`,
      status: 'done',
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resp));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[fake-vis] Teammate mock API running on http://localhost:${PORT}`);
});

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
