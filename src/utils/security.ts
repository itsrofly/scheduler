import {
  generateKeyPair,
  exportJWK,
  importJWK,
  SignJWT,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';
import { createHash, timingSafeEqual } from 'crypto';

import { Redis } from 'ioredis';

export class Security {
  private conn: Redis;
  private publicKey: CryptoKey | Uint8Array | undefined;
  private privateKey: CryptoKey | Uint8Array | undefined;
  private alg = 'Ed25519';
  private kid = 'validate-scheduler';
  private serverToken: string;

  constructor(conn: Redis) {
    this.conn = conn;

    const apiTokenKey = process.env.API_TOKEN_KEY;
    if (!apiTokenKey) {
      throw new Error('API_TOKEN_KEY is not defined');
    }

    this.serverToken = apiTokenKey;
  }

  async start() {
    const [pubJson, privJson] = await Promise.all([
      this.conn.get('validate-scheduler:publicJwk'),
      this.conn.get('validate-scheduler:privateJwk'),
    ]);

    if (pubJson && privJson) {
      const pubJwk: JWK = JSON.parse(pubJson);
      const privJwk: JWK = JSON.parse(privJson);

      this.publicKey = await importJWK(pubJwk, this.alg);
      this.privateKey = await importJWK(privJwk, this.alg);
    } else {
      const { publicKey, privateKey } = await generateKeyPair(this.alg, {
        extractable: true,
      });
      this.publicKey = publicKey;
      this.privateKey = privateKey;

      const pubJwk = await exportJWK(publicKey);
      const privJwk = await exportJWK(privateKey);
      pubJwk.kid = this.kid;
      privJwk.kid = this.kid;

      await Promise.all([
        this.conn.set('validate-scheduler:publicJwk', JSON.stringify(pubJwk)),
        this.conn.set('validate-scheduler:privateJwk', JSON.stringify(privJwk)),
      ]);
    }
  }

  async getPublicJwk(): Promise<JWK> {
    const jwk = await exportJWK(this.publicKey!);
    jwk.kid = this.kid;
    return jwk;
  }

  async signJWT(
    audience: string,
    body: string,
    extraClaims: Record<string, unknown> = {},
    ttl = '120s',
  ): Promise<string> {
    const digest = createHash('sha256').update(body).digest('base64url');

    console.log(
      `Created SignJWT with digest: ${digest} |
        claims: ${JSON.stringify(extraClaims)} |
        audience: ${audience} |
        body: ${body} |
        ttl: ${ttl}`,
    );
    return await new SignJWT({
      ...extraClaims,
      digest,
    })
      .setProtectedHeader({ alg: this.alg, kid: this.kid })
      .setIssuedAt()
      .setSubject('receiver-auth')
      .setAudience(audience)
      .setExpirationTime(ttl)
      .sign(this.privateKey!);
  }

  async verifyJWT(
    token: string,
    body: string,
    expectedAudience: string,
  ): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.publicKey!, {
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

  async verifyServerToken(token: string): Promise<boolean> {
    const expected = Buffer.from(this.serverToken, 'utf8');
    const received = Buffer.from(token, 'utf8');

    if (expected.length !== received.length) return false;

    return timingSafeEqual(expected, received);
  }
}
