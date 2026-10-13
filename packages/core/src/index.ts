
import { z } from 'zod';
import { importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { createHash } from 'crypto';
import { MessageSchema } from './schemas.js';


export default class Scheduler {
    private schedulerUrl: string;
    private schedulerToken: string;

    constructor(
        schedulerUrl: string | undefined = process.env.SCHEDULER_URL,
        schedulerToken: string | undefined = process.env.SCHEDULER_TOKEN_KEY,
    ) {
        if (!schedulerUrl || !schedulerToken) {
            throw new Error('SCHEDULER_URL and SCHEDULER_TOKEN_KEY must be provided');
        }
        this.schedulerUrl = schedulerUrl;
        this.schedulerToken = schedulerToken;
    }

    async getPubKey() {
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
        const pubKey = await importJWK(jwk, jwk.crv);

        if (!pubKey) {
            throw new Error('No public key imported from keys');
        }
        return pubKey;
    }

    async verifyMessage(
        token: string,
        body: string,
        expectedAudience: string,
    ): Promise<JWTPayload> {
        const pubkey = await this.getPubKey();

        if (!pubkey) {
            throw new Error('Public key not found.');
        }

        const { payload } = await jwtVerify(token, pubkey, {
            audience: expectedAudience,
        });

        const digest = createHash('sha256').update(body).digest('base64url');

        if (payload.digest !== digest) {
            throw new Error(
                `Digest mismatch, expected: ${payload.digest}, got: ${digest} | 
          body: ${body} | 
          payload: ${JSON.stringify(payload)} |
          audience: ${expectedAudience}`,
            );
        }

        return payload;
    }

    async createMessage(message: z.infer<typeof MessageSchema>) {
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

        const data = await response.json();
        const jobId = data.id || data.opts?.jobId;

        return { messageId: jobId as string };
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
            const error = await response.text();
            throw new Error(`Failed to cancel message\n${error}`);
        }

        return true;
    }
}