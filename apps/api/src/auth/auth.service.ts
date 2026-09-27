import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ---------- REGISTER (e-mail + mot de passe) ----------
  async register(dto: RegisterDto): Promise<Tokens> {
    const exists = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new ConflictException('Cet e-mail est déjà utilisé.');

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 Mo — résistance GPU
      timeCost: 2,
      parallelism: 1,
    });

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        authProvider: 'EMAIL',
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    return this.issueTokens(user.id, user.role);
  }

  // ---------- LOGIN ----------
  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }): Promise<Tokens> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Identifiants invalides.');

    // Verrouillage après MAX_FAILED échecs (anti brute-force)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Compte temporairement verrouillé. Réessayez plus tard.');
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil:
            failed >= MAX_FAILED
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      throw new UnauthorizedException('Identifiants invalides.');
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.role, meta);
  }

  // ---------- REFRESH (rotation) ----------
  async refresh(refreshToken: string): Promise<Tokens> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.client.session.findFirst({
      where: { refreshTokenHash: tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Session invalide.');

    // Rotation : ancien refresh révoqué, nouveau émis
    await this.prisma.client.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.userId, session.user.role);
  }

  // ---------- LOGOUT ----------
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.client.session.updateMany({
      where: { refreshTokenHash: tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  // ---------- HELPERS ----------
  private async issueTokens(userId: string, role: string, meta?: { ip?: string; userAgent?: string }): Promise<Tokens> {
    const payload = { sub: userId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900),
    });

    const refreshToken = randomUUID() + '.' + randomUUID();
    await this.prisma.client.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        expiresAt: new Date(Date.now() + Number(process.env.JWT_REFRESH_TTL ?? 2_592_000) * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
