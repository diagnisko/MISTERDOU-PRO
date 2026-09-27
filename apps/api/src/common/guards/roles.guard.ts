import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { FastifyRequest } from 'fastify';

export interface AuthUser {
  sub: string;
  role: 'CLIENT' | 'SELLER' | 'STAFF' | 'ADMIN';
}

/**
 * Guard JWT + RBAC — TOUTES les permissions sont vérifiées côté serveur.
 * Le frontend n'est jamais une source de vérité pour l'autorisation (§20).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentification requise.');
    }

    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Session expirée ou invalide.');
    }

    (req as any).user = payload;

    if (!required || required.length === 0) return true;

    const ok = required.includes(payload.role);
    if (!ok) {
      // Accès refusé — log de sécurité (tentative d'escalade §22)
      throw new ForbiddenException('Accès refusé.');
    }
    return true;
  }
}

export const CurrentUser = () => (target: object, key: string) => {
  // helper réservé — lecture via req.user dans les contrôleurs
};
