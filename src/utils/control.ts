import { Redis } from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { FastifyBaseLogger } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { z } from 'zod';
import { Security } from './security';

const MessageSchema = z
  .object({
    url: z.url(),
    method: z
      .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
      .optional()
      .default('POST'),
    body: z.record(z.string(), z.any()).optional(),
    retry: z.number().optional(),
    retryDelay: z.number().optional(),
    flowControl: z
      .object({
        key: z.string(),
        rate: z.number(), // Max number of jobs
        period: z.number(), // In milliseconds
        concurrency: z.number().optional(),
      })
      .optional(),
    delay: z.number().optional(), // In milliseconds
  })
  .refine(
    (val) => {
      const method = val.method ?? 'POST';

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        // These must have a body
        return !!val.body && Object.keys(val.body).length > 0;
      } else {
        // Other methods must NOT have a body
        return !val.body;
      }
    },
    {
      message:
        'Body is required for POST, PUT, PATCH and forbidden for other HTTP methods',
    },
  );

type Message = z.infer<typeof MessageSchema>;

class Control {
  workers: Record<string, { worker: Worker; queue: Queue; closing?: boolean }> =
    {};
  conn: Redis;
  prefix: string;
  sec: Security;
  defaultDelay = 5 * 60 * 1000; // 5 minutes
  removeOnCompleteAge = 24 * 60 * 60 * 1000; // 24 hours
  removeOnFailAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  logger: FastifyBaseLogger;

  constructor(
    sec: Security,
    connection: Redis,
    prefix: string,
    log: FastifyBaseLogger,
  ) {
    this.conn = connection;
    this.sec = sec;
    this.logger = log;
    this.prefix = prefix;
  }

  private flowControlKey(flowControl?: Message['flowControl']) {
    if (!flowControl) return 'default';
    const str = JSON.stringify(flowControl, Object.keys(flowControl).sort());
    return crypto.createHash('md5').update(str).digest('hex');
  }

  private createWorker(
    flowKey = 'default',
    flowControl?: Message['flowControl'],
  ) {
    const queue = new Queue(flowKey, {
      connection: this.conn,
      prefix: this.prefix,
      defaultJobOptions: {
        removeOnComplete: { age: this.removeOnCompleteAge },
        removeOnFail: { age: this.removeOnFailAge },
      },
    });

    this.logger.info(
      `Queue | Status: ➕ Created | Queue ID: ${queue.name} | Control: ${JSON.stringify(flowControl)}`,
    );

    const worker = new Worker(
      flowKey,
      async (job: Job) => {
        const message = job.data as Message;
        this.logger.info(
          `Message | Message ID: ${job.id} | Status: 🌐 Active | Data: ${JSON.stringify(message)}`,
        );

        try {
          const createdAt = job.timestamp;
          const startedAt = Date.now();

          const body = JSON.stringify(message.body ?? '');
          const jwt = await this.sec.signJWT(message.url, body);
          const headers = {
            'Message-Id': job.id!,
            'Attempts-Made': String(job.attemptsMade),
            'Retry-Delay': String(message.retryDelay || this.defaultDelay), // In milliseconds
            'Rate-Delay': flowControl ? String(startedAt - createdAt) : '', // In milliseconds
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          };

          const response = await fetch(message.url, {
            method: message.method,
            headers,
            body,
          });

          if (!response.ok) {
            const bodyText = await response.text();
            throw new Error(
              `Error: Failed Request | Status Code: ${response.status} | Body: ${bodyText}`,
            );
          }

          const waiting = await queue.getWaitingCount();
          const delayed = await queue.getDelayedCount();
          const active = await queue.getActiveCount();

          if (waiting + delayed + active <= 1) {
            this.workers[flowKey].closing = true;

            setTimeout(
              async () => {
                const newWaiting = await queue.getWaitingCount();
                const newDelayed = await queue.getDelayedCount();
                const newActive = await queue.getActiveCount();

                if (newWaiting + newDelayed + newActive === 0) {
                  await worker.close();
                  await queue.close();

                  if (this.workers[flowKey].closing) {
                    delete this.workers[flowKey];
                  }

                  this.logger.info(
                    `Queue | Status: 🚪 Closed | Worker ID: ${queue.name} | Control: ${JSON.stringify(flowControl)}`,
                  );
                  this.logger.info(
                    `Worker | Status: 🚪 Closed | Worker ID: ${worker.name} | Control: ${JSON.stringify(flowControl)}`,
                  );
                } else {
                  this.workers[flowKey].closing = false;
                }
              },
              (flowControl?.period || 1500) * 2,
            );
          }

          this.logger.info(
            `Message | Message ID: ${job.id} | Status: ✅ Delivered | Data: ${message}`,
          );
        } catch (err) {
          if (
            err instanceof Error &&
            err.message.startsWith('Error: Failed Request')
          ) {
            this.logger.warn(
              `Message | Status: 🔴 Failed | Message ID: ${job.id} | Error: ${err.message} | Data: ${message}`,
            );
          } else {
            this.logger.error(
              `Message | Status: 📛 Failed | Message ID: ${job.id} | Data: ${message}`,
            );
          }
          throw err;
        }
      },
      {
        connection: this.conn,
        prefix: this.prefix,
        concurrency: flowControl?.concurrency || 1,
        limiter: flowControl
          ? { max: flowControl.rate, duration: flowControl.period }
          : undefined,
      },
    );

    this.workers[flowKey] = { worker, queue };
    this.logger.info(
      `Worker | Status: ➕ Created | Worker ID: ${worker.name} | Control: ${flowControl}`,
    );
    return this.workers[flowKey];
  }

  async publish(message: Message) {
    const flowKey = this.flowControlKey(message.flowControl);

    if (!this.workers[flowKey] || this.workers[flowKey].closing) {
      this.createWorker(flowKey, message.flowControl);
    }

    const { queue } = this.workers[flowKey];
    const job = await queue.add('job', message, {
      jobId: uuidv4(),
      delay: message.delay || 0,
      attempts: message.retry || 3,
      backoff: {
        type: 'exponential',
        delay: message.retryDelay || this.defaultDelay, // In milliseconds,
      },
    });

    this.logger.info(
      `Message | Status: 📨 Created | Message ID: ${job.id} | Data: ${message}`,
    );
    return job;
  }

  async cancelJob(jobId: string) {
    const stream = this.conn.scanStream({
      match: `${this.prefix}:*:${jobId}`,
      count: 100,
    });

    for await (const batch of stream) {
      for (const key of batch as string[]) {
        const queuePrefix = `${this.prefix}:`;
        if (!key.startsWith(queuePrefix)) continue;

        const queueName = key.slice(queuePrefix.length).split(':', 1)[0];
        const queue = new Queue(queueName, {
          connection: this.conn,
          prefix: this.prefix,
        });
        const job = await queue.getJob(jobId);

        if (!job) {
          await queue.close();
          continue;
        }

        await job.remove();
        await queue.close();
        this.logger.info(
          `Message | Status: 📵 Cancelled | Message ID: ${jobId}`,
        );
        return jobId;
      }
    }

    {
      this.logger.warn(
        ` Message | Status : 🔴 Not found | Message ID: ${jobId}`,
      );
      return;
    }
  }

  async close() {
    await Promise.all(
      Object.values(this.workers).map(async ({ worker, queue }) => {
        await worker.close();
        await queue.close();
      }),
    );
    this.workers = {};
  }
}

export { Control, MessageSchema, Message };
