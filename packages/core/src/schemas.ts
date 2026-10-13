import { z } from 'zod';

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
                rate: z.number(),
                period: z.number(),
                concurrency: z.number().optional(),
            })
            .optional(),
        delay: z.number().optional(),
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

export { MessageSchema }
