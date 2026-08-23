const fs = require('fs').promises;
const path = require('path');
const { startBrowserServer } = require('./browser-server');

describe('browser E2E fixture server', () => {
  let server;

  afterEach(async () => {
    if (server) await server.close();
  });

  test('serves only viewer and memory fixture routes', async () => {
    server = await startBrowserServer({ port: 0 });

    await expect(fetch(`${server.url}/viewer.html`)).resolves.toMatchObject({ status: 200 });
    await expect(fetch(`${server.url}/.dsh-memory.json`)).resolves.toMatchObject({ status: 200 });
    await expect(fetch(`${server.url}/package.json`)).resolves.toMatchObject({ status: 404 });
  });

  test('serves valid fixture JSON with a stable content type', async () => {
    server = await startBrowserServer({ port: 0 });

    const response = await fetch(`${server.url}/.dsh-memory.json`);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).userPreferences.defaultModel).toBe('browser-e2e-model');
  });

  test('does not expose files outside the allowlist even when they exist', async () => {
    const outsideFile = path.join(__dirname, 'fixtures', 'not-allowed.txt');
    await fs.writeFile(outsideFile, 'private test data');
    server = await startBrowserServer({ port: 0 });

    try {
      expect((await fetch(`${server.url}/test/fixtures/not-allowed.txt`)).status).toBe(404);
    } finally {
      await fs.unlink(outsideFile);
    }
  });
});
