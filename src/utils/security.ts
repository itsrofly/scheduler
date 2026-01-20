import {
  generateKeyPair,
  exportJWK,
  importJWK,
  SignJWT,
  jwtVerify,
  decodeJwt,
  type JWK,
  type JWTPayload,
} from 'jose';
import { createHash } from 'crypto';

import { Redis } from 'ioredis';

export class Security {
  private conn: Redis;
  private publicKey: CryptoKey | Uint8Array | undefined;
  private privateKey: CryptoKey | Uint8Array | undefined;
  private alg = 'Ed25519';
  private kid = 'validate-scheduler';
  private serverToken: string | null = null;
  private serverTokenExpiry = '1y';

  constructor(conn: Redis) {
    this.conn = conn;
  }

  async start() {
    const [pubJson, privJson] = await Promise.all([
      this.conn.get('validate-scheduler:publicJwk'),
      this.conn.get('validate-scheduler:privateJwk'),
    ]);

    let expiresAt: Date | null = null;
    if (pubJson && privJson) {
      const pubJwk: JWK = JSON.parse(pubJson);
      const privJwk: JWK = JSON.parse(privJson);

      this.publicKey = await importJWK(pubJwk, this.alg);
      this.privateKey = await importJWK(privJwk, this.alg);
      this.serverToken = await this.conn.get('validate-scheduler:serverToken');

      let isValid = this.serverToken
        ? await this.verifyServerToken(this.serverToken)
        : false;

      if (isValid && this.serverToken) {
        const payload = decodeJwt(this.serverToken);
        if (payload.exp) {
          expiresAt = new Date(payload.exp * 1000);
        }

        const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
        if (!expiresAt || expiresAt.getTime() - Date.now() < thirtyOneDaysMs) {
          process.stdout.write(
            'Server token expiring soon (<= 31 days). Setting as expired...\n',
          );
          isValid = false;
        }
      }

      if (!isValid) {
        process.stdout.write(
          `Expired or invalid server token, generating a new one...\n`,
        );
        this.serverToken = await this.createServerToken();
        await this.conn.set('validate-scheduler:serverToken', this.serverToken);

        const payload = decodeJwt(this.serverToken);
        expiresAt = new Date((payload.exp || 0) * 1000);
      }
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
      this.serverToken = await this.createServerToken();
      await this.conn.set('validate-scheduler:serverToken', this.serverToken);

      const payload = decodeJwt(this.serverToken);
      expiresAt = new Date((payload.exp || 0) * 1000);
    }

    process.stdout.write(`Server Token: ${this.serverToken}\n`);
    process.stdout.write(`Expires in: ${expiresAt?.toLocaleDateString()}\n`);
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

  async verifyServerToken(token: string): Promise<boolean> {
    try {
      if (this.serverToken !== token) return false;

      const { payload } = await jwtVerify(token, this.publicKey!, {
        audience: 'scheduler',
      });

      if (payload.role !== 'server') return false;

      return true;
    } catch (error) {
      return false;
    }
  }

  private async createServerToken() {
    return await new SignJWT({ role: 'server' })
      .setProtectedHeader({ alg: this.alg, kid: this.kid })
      .setIssuedAt()
      .setExpirationTime(this.serverTokenExpiry)
      .setSubject('sender-auth')
      .setAudience('scheduler')
      .sign(this.privateKey!);
  }
}
