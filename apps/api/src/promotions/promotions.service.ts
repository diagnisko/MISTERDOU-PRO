import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  ValidatePromoDto,
} from './dto/promotion.dto';

/**
 * Promotions & mises en avant — ADMIN gère, client valide un code.
 * Un code promo : PERCENT (0-90 %) ou FIXED (FCFA), bornes de validité,
 * nombre d'usages max, restriction optionnelle à certaines offres.
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ ADMIN ============

  async create(adminId: string, dto: CreatePromotionDto) {
    if (dto.discountType === 'PERCENT' && (dto.discountValue < 0 || dto.discountValue > 90)) {
      throw new BadRequestException('Remise en % entre 0 et 90 uniquement.');
    }
    if (dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('La fin doit être après le début.');
    }

    const code = dto.code.trim().toUpperCase();

    const exists = await this.prisma.client.promotion.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('Ce code promo existe déjà.');

    const promo = await this.prisma.client.promotion.create({
      data: {
        code,
        label: dto.label,
        discountType: dto.discountType,
        discountValue: new Prisma.Decimal(dto.discountValue),
        minOrderAmount: dto.minOrderAmount
          ? new Prisma.Decimal(dto.minOrderAmount)
          : null,
        maxUses: dto.maxUses ?? null,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        promotionProducts: dto.productIds?.length
          ? {
              create: dto.productIds.map((productId) => ({ productId })),
            }
          : undefined,
      },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PROMOTION_CREATE',
        entity: 'Promotion',
        entityId: promo.id,
        metadata: { code, discountType: dto.discountType },
      },
    });

    return { id: promo.id, code: promo.code, active: promo.active };
  }

  async list(includeInactive = false) {
    return this.prisma.client.promotion.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { promotionProducts: true } },
      },
    });
  }

  async update(adminId: string, promotionId: string, dto: UpdatePromotionDto) {
    const promo = await this.prisma.client.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promo) throw new NotFoundException('Promotion introuvable.');

    const updated = await this.prisma.client.promotion.update({
      where: { id: promotionId },
      data: {
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.endsAt ? { endsAt: new Date(dto.endsAt) } : {}),
      },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: adminId,
        action: dto.active === false ? 'PROMOTION_DEACTIVATE' : 'PROMOTION_UPDATE',
        entity: 'Promotion',
        entityId: promotionId,
        metadata: { code: promo.code },
      },
    });

    return { id: updated.id, active: updated.active };
  }

  // ============ CLIENT : VALIDATION D'UN CODE ============

  /**
   * Vérifie un code promo pour un montant donné — renvoie la remise
   * calculée. Ne consomme PAS l'usage (consommation à la confirmation
   * de commande — phase ultérieure avec intégration Order.promotionId).
   */
  async validate(dto: ValidatePromoDto) {
    const code = dto.code.trim().toUpperCase();
    const promo = await this.prisma.client.promotion.findUnique({
      where: { code },
      include: { promotionProducts: true },
    });

    if (!promo || !promo.active) {
      throw new NotFoundException('Code promo invalide.');
    }
    const now = new Date();
    if (promo.startsAt > now) {
      throw new BadRequestException('Ce code promo n\'est pas encore actif.');
    }
    if (promo.endsAt && promo.endsAt < now) {
      throw new BadRequestException('Ce code promo a expiré.');
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Ce code promo a atteint sa limite d\'usages.');
    }
    if (promo.minOrderAmount && dto.orderAmount < Number(promo.minOrderAmount)) {
      throw new BadRequestException(
        `Montant minimum requis : ${Number(promo.minOrderAmount)} FCFA.`,
      );
    }

    const discount =
      promo.discountType === 'PERCENT'
        ? Math.round(dto.orderAmount * (Number(promo.discountValue) / 100) * 100) / 100
        : Math.min(Number(promo.discountValue), dto.orderAmount);

    return {
      code: promo.code,
      label: promo.label,
      discountType: promo.discountType,
      discount,
      finalAmount: dto.orderAmount - discount,
      restrictedProductIds: promo.promotionProducts.map((p) => p.productId),
    };
  }

  // ============ MISES EN AVANT (FeaturedProduct) ============

  /** Produits mis en avant, affichés en tête du catalogue. */
  async featuredPublic() {
    return this.prisma.client.featuredProduct.findMany({
      where: {
        active: true,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: new Date() }, endsAt: null },
          { startsAt: null, endsAt: { gte: new Date() } },
          { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        ],
      },
      orderBy: { position: 'asc' },
      take: 8,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            platform: true,
            images: { where: { isCover: true }, take: 1 },
            seller: { select: { shopName: true, slug: true } },
          },
        },
      },
    });
  }

  async feature(adminId: string, productId: string, position = 0) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Offre introuvable.');
    if (product.status !== 'PUBLISHED') {
      throw new BadRequestException('Seule une offre publiée peut être mise en avant.');
    }

    const featured = await this.prisma.client.featuredProduct.upsert({
      where: { productId },
      update: { position, active: true },
      create: { productId, position, active: true },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PRODUCT_FEATURED',
        entity: 'FeaturedProduct',
        entityId: featured.id,
        metadata: { productSlug: product.slug, position },
      },
    });

    return { id: featured.id, position: featured.position };
  }

  async unfeature(adminId: string, productId: string) {
    const featured = await this.prisma.client.featuredProduct.findUnique({
      where: { productId },
    });
    if (!featured) throw new NotFoundException('Cette offre n\'est pas mise en avant.');

    await this.prisma.client.featuredProduct.update({
      where: { productId },
      data: { active: false },
    });
    await this.prisma.client.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PRODUCT_UNFEATURED',
        entity: 'FeaturedProduct',
        entityId: featured.id,
      },
    });
    return { ok: true };
  }
}
