import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 2FA TOTP — obligatoire pour ADMIN/STAFF avant tout accès back-office.
 * - Le secret TOTP est chiffré au repos (AES-256-GCM, clé TWOfa_MASTER_KEY)
 * - Vérification en 2 temps : login → pending → TOTP → tokens complets
 * - Codes de secours non stockés : perte = contact admin (délibéré, audit)
 */
@Injectable()
export class TwoFaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Génère un secret TOTP + QR (activation — utilisateur lui-même). */
  async setup(userId: string) {
    const secret = authenticator.generateSecret();
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new ForbiddenException('Utilisateur introuvable.');

    const otpauth = authenticator.keyuri(user.email, 'MISTERDOU', secret);
    const qrDataUrl = await toDataURL(otpauth);
    return { secret, qrDataUrl };
  }

  /** Active la 2FA : vérifie le code, puis chiffre et stocke le secret. */
  async enable(userId: string, secret: string, token: string) {
    const ok = authenticator.verify({ token, secret });
    if (!ok) throw new BadRequestException('Code invalide — réessayez.');

    const cipherText = this.encrypt(secret);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { twoFactorSecret: cipherText, twoFactorEnabled: true },
    });

    return { enabled: true };
  }

  /** Désactive (SELF ou ADMIN). */
  async disable(actorId: string, targetUserId: string, isSelf: boolean) {
    if (!isSelf && actorId === targetUserId) {
      throw new ForbiddenException('Paramètres invalides.');
    }
    await this.prisma.client.user.update({
      where: { id: targetUserId },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });
    return { enabled: false };
  }

  /** Vérifie le TOTP au login (secret chiffré en base). */
  async verify(userId: string, token: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ForbiddenException('2FA non activée.');
    }
    const secret = this.decrypt(user.twoFactorSecret);
    const ok = authenticator.verify({ token, secret });
    if (!ok) throw new BadRequestException('Code invalide.');
    return { ok: true };
  }

  // ---- chiffrement du secret au repos ----

  private encrypt(plain: string) {
    const key = this.masterKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  private decrypt(payload: string) {
    const key = this.masterKey();
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private masterKey() {
    const k = process.env.TWOFA_MASTER_KEY;
    if (!k || k.length !== 64) {
      throw new Error('TWOFA_MASTER_KEY invalide (32 bytes hex attendus).');
    }
    return Buffer.from(k, 'hex');
  }
}
