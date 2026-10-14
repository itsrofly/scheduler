import { createServer } from 'node:http'
import { once } from 'node:events';
import Scheduler from '@scheduler/scheduler-js'

describe('Server', () => {
  const hostname = '127.0.0.1';
  const port = 3000;

  const server = createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World');
  });

  const scheduler = new Scheduler()

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });


  test('Server is listening', async () => {
    const pendingPromise = new Promise(async (resolve, reject) => {
      await once(server, 'listening');
      resolve(true)
    });

    expect(await pendingPromise).toBe(true);
    server.close()
  });
});