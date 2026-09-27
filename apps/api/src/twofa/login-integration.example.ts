import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
  requiresTwoFactor?: boolean; // true → étape TOTP
}

/**
 * Authentification — Argon2id, verrouillage, JWT, refresh, 2FA admin.
 * ADMIN/STAFF avec 2FA activée : le login renvoie un token PENDING — les
 * vrais tokens ne sont délivrés qu'après vérification TOTP (TwoFaService).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ... (méthodes register/refresh/logout inchangées — voir Phase 1)

  async login(
    dto: { email: string; password: string },
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Identifiants invalides.');

    // Verrouillage après échecs (5 → 15 min)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Compte temporairement verrouillé.');
    }

    const ok = await argon2.verify(user.passwordHash ?? '', dto.password);
    if (!ok) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { failedLogins: { increment: 1 } },
      });
      throw new UnauthorizedException('Identifiants invalides.');
    }

    // 2FA requise pour ADMIN/STAFF activée → étape 2
    if (user.twoFactorEnabled && ['ADMIN', 'STAFF'].includes(user.role)) {
      const pendingToken = this.jwt.sign(
        { sub: user.id, role: user.role, tfa: 'PENDING' },
        { expiresIn: '5m' },
      );
      return {
        accessToken: pendingToken,
        refreshToken: '',
        user: { id: user.id, email: user.email, role: user.role },
        requiresTwoFactor: true,
      };
    }

    // Flux normal : tokens complets
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role },
      { expiresIn: '15m' },
    );
    const session = await this.prisma.client.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: await argon2.hash(crypto.randomUUID()),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: session.refreshTokenHash,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}

import * as crypto from 'crypto';
