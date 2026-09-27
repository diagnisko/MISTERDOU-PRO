import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Chiffrement AES-256-GCM des identifiants eFootball au repos.
 * Format stocké : base64(iv).base64(authTag).base64(cipherText)
 */
@Injectable()
export class CryptoService {
  private masterKey(): Buffer {
    const raw = process.env.EFCRED_MASTER_KEY ?? '';
    // Format attendu : base64:xxxxx
    const b64 = raw.startsWith('base64:') ? raw.slice(7) : raw;
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new Error('EFCRED_MASTER_KEY doit être une clé de 32 octets (base64).');
    }
    return key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Charge chiffrée invalide.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
