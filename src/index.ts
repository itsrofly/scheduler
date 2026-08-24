import 'dotenv/config';
import './instrument';

import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import v1Routes from './routes/v1';
import logger from './utils/logger';

import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

const app = Fastify({
  loggerInstance: logger('scheduler'),
});

app
  .setSerializerCompiler(serializerCompiler)
  .setValidatorCompiler(validatorCompiler)
  .withTypeProvider<ZodTypeProvider>()
  .register(v1Routes, { prefix: '/api/v1' });

Sentry.setupFastifyErrorHandler(app);

try {
  app.listen({ port: 8000, host: '0.0.0.0' });
  console.log('Server Started | Port: 8000');
} catch (err) {
  app.log.error(err);
}
