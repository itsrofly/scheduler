import { createServer } from 'node:http'
import { once } from 'node:events';

describe('sum module', () => {
  const hostname = '127.0.0.1';
  const port = 3000;

  const server = createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World');
  });

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });

  test('adds 1 + 2 to equal 3', async () => {
    await once(server, 'listening');
    expect(1 + 2).toBe(3);
    server.close()
  });
});