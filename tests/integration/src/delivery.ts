import { createServer } from 'node:http'
import Scheduler from '@scheduler/scheduler-js'

describe('Message delivery', () => {
  const scheduler = new Scheduler()
  const port = 3000
  const hostname = process.env.HOSTNAME || 'localhost'
  const url = `http://${hostname}:${port}`;

  test('delivers a GET message to the target URL', async () => {
    const delivery = new Promise<void>((resolve, _reject) => {
      const server = createServer((req, res) => {
        const { method, url } = req;
        const parsedUrl = new URL(url!, `http://${req.headers.host}`);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World');

        expect(method).toBe('GET');
        expect(parsedUrl.pathname).toBe('/health');

        server.close(() => {
          resolve();
        });
      });

      server.listen(port, '0.0.0.0', async () => {
        const message = await scheduler.createMessage({
          url: `${url}/health`,
          method: 'GET',
        })

        expect(message.messageId).toBeTruthy();
      });
    })

    await delivery
  });
});