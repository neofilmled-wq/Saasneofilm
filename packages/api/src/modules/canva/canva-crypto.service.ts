import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

@Injectable()
export class CanvaCryptoService {
  private readonly logger = new Logger(CanvaCryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const keyHex = this.config.get<string>('CANVA_ENCRYPTION_KEY', '');
    if (!keyHex || keyHex.length !== 64) {
      this.logger.warn(
        'CANVA_ENCRYPTION_KEY not set or invalid (expected 64 hex chars). ' +
        'Token encryption will use a derived key from a fallback secret.',
      );
      const fallback = this.config.get<string>('JWT_SECRET', 'neofilm-dev-secret');
      this.key = crypto.scryptSync(fallback, 'canva-token-salt', 32);
    } else {
      this.key = Buffer.from(keyHex, 'hex');
    }
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag,
    };
  }

  decrypt(ciphertext: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }
}
