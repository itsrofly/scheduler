import {
  generateKeyPair,
  exportJWK,
  importJWK,
  SignJWT,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';

import { Redis } from 'ioredis';

export class Security {
  private conn: Redis;
  private publicKey: CryptoKey | Uint8Array | undefined;
  private privateKey: CryptoKey | Uint8Array | undefined;
  private alg = 'Ed25519';
  private kid = 'validate-control-flow';
  private serverToken: string | null = null;

  constructor(conn: Redis) {
    this.conn = conn;
  }

  async start() {
    const [pubJson, privJson] = await Promise.all([
      this.conn.get('validate-control-flow:publicJwk'),
      this.conn.get('validate-control-flow:privateJwk'),
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
        this.conn.set(
          'validate-control-flow:publicJwk',
          JSON.stringify(pubJwk),
        ),
        this.conn.set(
          'validate-control-flow:privateJwk',
          JSON.stringify(privJwk),
        ),
      ]);
    }

    const token = await this.conn.get('validate-control-flow:serverJwt');

    if (token) {
      this.serverToken = token;
    } else {
      this.serverToken = await this.createServerToken();
      await this.conn.set('validate-control-flow:serverJwt', this.serverToken);
    }
  }

  async getPublicJwk(): Promise<JWK> {
    const jwk = await exportJWK(this.publicKey!);
    jwk.kid = this.kid;
    return jwk;
  }

  async signJWT(
    audience: string,
    body: unknown,
    extraClaims: Record<string, unknown> = {},
    ttl = '120s',
  ): Promise<string> {
    const bodyStr = JSON.stringify(body ?? '');
    const digest = createHash('sha256').update(bodyStr).digest('base64url');

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
    body: unknown,
    expectedAudience: string,
  ): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.publicKey!, {
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

  async refreshServerToken(token: string): Promise<string> {
    const isValid = await this.verifyServerToken(token);
    if (!isValid) {
      throw new Error('Invalid Server Token');
    }

    this.serverToken = await this.createServerToken();
    await fs.writeFile('./server.jwt', this.serverToken);
    return this.serverToken;
  }

  async verifyServerToken(token: string): Promise<boolean> {
    try {
      if (this.serverToken !== token) return false;

      const { payload } = await jwtVerify(token, this.publicKey!, {
        audience: 'control-flow',
      });

      if (payload.role !== 'server') return false;

      return true;
    } catch {
      return false;
    }
  }

  private async createServerToken(): Promise<string> {
    return await new SignJWT({ role: 'server' })
      .setProtectedHeader({ alg: this.alg, kid: this.kid })
      .setIssuedAt()
      .setSubject('sender-auth')
      .setAudience('control-flow')
      .sign(this.privateKey!);
  }
}
