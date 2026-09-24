import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MessageSchema } from '../../utils/control';
import { z } from 'zod';

const messagesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/',
    {
      schema: {
        body: MessageSchema,
      },
    },
    async (request, reply) => {
      const message = request.body;
      const job = await request.control.publish(message);
      return reply.code(200).send(job);
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.uuid({ error: 'Invalid ID' }),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existAndCancelled = await request.control.cancelJob(id);
      if (existAndCancelled === undefined) {
        return reply.code(404).send('Message not found.');
      }
      return reply.code(204).send();
    },
  );
};

export default messagesRoutes;
