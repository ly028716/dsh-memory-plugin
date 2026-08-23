const fs = require('fs').promises;
const http = require('http');
const path = require('path');

const DEFAULT_PORT = 4173;

function send(response, status, contentType, body) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function createBrowserServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const fixturePath = path.resolve(options.fixturePath || path.join(__dirname, 'fixtures', 'browser-memory.json'));
  const requestedPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;

  const server = http.createServer(async (request, response) => {
    const requestPath = new URL(request.url || '/', 'http://127.0.0.1').pathname;

    try {
      if (requestPath === '/' || requestPath === '/viewer.html') {
        const viewer = await fs.readFile(path.join(rootDir, 'viewer.html'), 'utf8');
        send(response, 200, 'text/html; charset=utf-8', viewer);
        return;
      }

      if (requestPath === '/.dsh-memory.json') {
        const fixture = await fs.readFile(fixturePath, 'utf8');
        send(response, 200, 'application/json; charset=utf-8', fixture);
        return;
      }

      send(response, 404, 'text/plain; charset=utf-8', 'Not found');
    } catch (error) {
      send(response, 500, 'text/plain; charset=utf-8', `Server error: ${error.message}`);
    }
  });

  return {
    server,
    url: null,
    start() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          const address = server.address();
          this.url = `http://127.0.0.1:${address.port}`;
          resolve(this);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(requestedPort, '127.0.0.1');
      });
    },
    close() {
      if (!server.listening) return Promise.resolve();
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function startBrowserServer(options) {
  const instance = createBrowserServer(options);
  return instance.start();
}

async function startFromCli() {
  const port = Number(process.env.PLAYWRIGHT_PORT || DEFAULT_PORT);
  const instance = await startBrowserServer({ port });
  console.log(`BROWSER_E2E_SERVER_READY ${instance.url}`);

  const shutdown = async () => {
    await instance.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  startFromCli().catch((error) => {
    console.error(`BROWSER_E2E_SERVER_FAILED ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createBrowserServer, startBrowserServer, startFromCli };
