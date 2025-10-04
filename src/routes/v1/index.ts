import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { Redis } from 'ioredis';
import messagesRoutes from './messages';
import { Security } from '../../utils/security';
import { Control } from '../../utils/control';

const conn = new Redis({
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT) || 6379,
  username: process.env.REDIS_USER,
  password: process.env.REDIS_PASSWORD!,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
});

declare module 'fastify' {
  interface FastifyRequest {
    control: Readonly<Control>;
  }
}

const v1Routes: FastifyPluginAsyncZod = async (fastify) => {
  const sec = new Security(conn);
  await sec.start();
  const control = new Control(sec, conn);

  fastify.get('/health', async function handler(_, reply) {
    if (conn.status === 'ready') {
      reply.code(200).send();
    }
    reply.code(500).send();
  });

  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url === '/api/v1/health') return;

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

  fastify.register(messagesRoutes, { prefix: '/messages' });
};

export default v1Routes;
