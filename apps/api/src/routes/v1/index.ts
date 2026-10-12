import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { Redis } from 'ioredis';
import messagesRoutes from './messages';
import { Security } from '../../utils/security';
import { Control } from '../../utils/control';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error('REDIS_URL is not defined');

const conn = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

declare module 'fastify' {
  interface FastifyRequest {
    control: Readonly<Control>;
  }
}

const v1Routes: FastifyPluginAsyncZod = async (fastify) => {
  const sec = new Security(conn, 'scheduler-security');
  await sec.start();
  const control = new Control(sec, conn, 'scheduler-control', fastify.log);

  fastify.get('/health', async function handler(_, reply) {
    if (conn.status === 'ready') {
      return reply.code(200).send();
    }
    return reply.code(500).send();
  });

  fastify.get('/.well-known/jwks.json', async (_, reply) => {
    try {
      const jwk = await sec.getPublicJwk();
      reply
        .header(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        )
        .header('Pragma', 'no-cache')
        .header('Expires', '0');
      return { keys: [jwk] };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'failed to get jwk' });
    }
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const ignore = ['/api/v1/health', '/api/v1/.well-known/jwks.json'];
    if (ignore.includes(request.url)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply
        .code(401)
        .send({ message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const isValid = await sec.verifyServerToken(token);

    if (!isValid) {
      return reply.code(401).send({ message: 'Invalid server token' });
    }

    request.control = control;
  });

  fastify.addHook('onClose', async () => {
    await control.close();
    await conn.quit();
  });

  fastify.register(messagesRoutes, { prefix: '/messages' });
};

export default v1Routes;
