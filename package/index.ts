import { z } from 'zod';
import { importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { createHash } from 'crypto';

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

type Message = z.infer<typeof MessageSchema>;

export class scheduler {
  private schedulerUrl: string;
  private schedulerToken: string;
  private pubkey: CryptoKey | Uint8Array<ArrayBufferLike> | undefined;

  constructor(
    schedulerUrl = process.env.SCHEDULER_URL,
    schedulerToken = process.env.SCHEDULER_TOKEN_KEY,
  ) {
    if (!schedulerUrl || !schedulerToken) {
      throw new Error('SCHEDULER_URL and SCHEDULER_TOKEN_KEY must be provided');
    }

    this.schedulerUrl = schedulerUrl;
    this.schedulerToken = schedulerToken;
  }

  async initialize() {
    const response = await fetch(
      `${this.schedulerUrl}/api/v1/.well-known/jwks.json`,
    );
    if (!response.ok) {
      throw new Error('Failed to fetch public key from scheduler');
    }

    const { keys } = await response.json();
    if (!keys || keys.length === 0) {
      throw new Error('No public keys found in scheduler response');
    }

    const jwk: JWK = keys[0];
    const pubKey = await importJWK(jwk, jwk.alg);

    if (!pubKey) {
      throw new Error('No public key imported from keys');
    }
    this.pubkey = pubKey;
  }

  async verifyMessage(
    token: string,
    body: unknown,
    expectedAudience: string,
  ): Promise<JWTPayload> {
    if (!this.pubkey) {
      throw new Error('Public key not initialized. Call initialize() first.');
    }

    const { payload } = await jwtVerify(token, this.pubkey!, {
      audience: expectedAudience,
    });

    const digest = createHash('sha256')
      .update(JSON.stringify(body ?? ''))
      .digest('base64url');

    if (payload.digest !== digest) {
      throw new Error('body digest mismatch');
    }

    return payload;
  }

  async createMessage(message: Message) {
    MessageSchema.parse(message);

    const response = await fetch(`${this.schedulerUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.schedulerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error('Failed to create message');
    }

    return response;
  }

  async cancelMessage(id: string) {
    const response = await fetch(`${this.schedulerUrl}/api/v1/messages/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.schedulerToken}`,
      },
    });

    if (response.status === 404) {
      throw new Error('Message not found');
    }

    if (!response.ok) {
      throw new Error('Failed to cancel message');
    }

    return true;
  }
}
