import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { CreateProductDto, SetCredentialsDto } from './dto/product.dto';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  // ============ CRÉATION ============

  /**
   * Création d'un produit. ADMIN → offre admin (publication directe possible,
   * identifiants remis dès l'apport initial). VENDEUR (KYC approuvé + Seller
   * APPROVED) → statut PENDING_REVIEW, publication après validation.
   */
  async create(userId: string, role: string, dto: CreateProductDto) {
    let sellerId: string | null = null;
    let type: 'ADMIN_ACCOUNT' | 'SELLER_ACCOUNT' = 'ADMIN_ACCOUNT';

    if (role === 'ADMIN') {
      type = 'ADMIN_ACCOUNT';
    } else if (role === 'SELLER') {
      const seller = await this.prisma.client.seller.findUnique({
        where: { userId },
      });
      if (!seller || seller.status !== 'APPROVED') {
        throw new ForbiddenException(
          'Compte vendeur non approuvé — impossible de créer une offre.',
        );
      }
      sellerId = seller.id;
      type = 'SELLER_ACCOUNT';
    } else {
      throw new ForbiddenException('Rôle insuffisant pour créer une offre.');
    }

    const product = await this.prisma.client.product.create({
      data: {
        title: dto.title,
        slug: `${slugify(dto.title)}-${Date.now().toString(36)}`,
        description: dto.description,
        price: dto.price,
        platform: dto.platform,
        level: dto.level,
        playersCount: dto.playersCount,
        coins: dto.coins,
        hasLegends: dto.hasLegends ?? false,
        specialFeatures: dto.specialFeatures,
        type,
        sellerId,
        status: type === 'ADMIN_ACCOUNT' ? 'DRAFT' : 'PENDING_REVIEW',
      },
    });

    return { id: product.id, slug: product.slug, status: product.status };
  }

  // ============ IDENTIFIANTS (chiffrés AES-256-GCM) ============

  /** Stocke les identifiants eFootball CHIFFRÉS — jamais en clair. */
  async setCredentials(userId: string, role: string, productId: string, dto: SetCredentialsDto) {
    const product = await this.mustOwn(userId, role, productId);

    const cipherText = this.crypto.encrypt(
      JSON.stringify({ login: dto.login, password: dto.password }),
    );

    await this.prisma.client.productCredential.upsert({
      where: { productId },
      update: { cipherText, deliveredAt: null, deliveredTo: null },
      create: { productId, cipherText },
    });

    this.logger.log(`Credentials set (encrypted) for product ${productId}`);
    return { ok: true };
  }

  // ============ MÉDIAS (bucket public) ============

  async presignMedia(userId: string, role: string, productId: string, mediaType: string, contentType: string, contentLength: number) {
    await this.mustOwn(userId, role, productId);
    return this.storage.presignMediaUpload(productId, contentType, contentLength);
  }

  async confirmMedia(userId: string, role: string, productId: string, objectKey: string, isCover: boolean) {
    const product = await this.mustOwn(userId, role, productId);

    if (!objectKey.startsWith(`media/products/${productId}/`)) {
      throw new ForbiddenException('Clé objet invalide.');
    }

    return this.prisma.client.productImage.create({
      data: {
        productId: product.id,
        mediaType: mediaTypeOf(objectKey),
        objectKey,
        url: this.storage.mediaPublicUrl(objectKey),
        isCover,
      },
    });
  }

  // ============ WORKFLOW ============

  /** ADMIN/STAFF publient ou rejettent une offre (PENDING_REVIEW). */
  async review(productId: string, reviewerId: string, decision: 'APPROVED' | 'REJECTED', reviewNote?: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Offre introuvable.');
    if (product.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Cette offre n\'est pas en attente de validation.');
    }

    const updated = await this.prisma.client.product.update({
      where: { id: productId },
      data:
        decision === 'APPROVED'
          ? { status: 'PUBLISHED', publishedAt: new Date(), reviewNote: reviewNote ?? null }
          : { status: 'REJECTED', reviewNote: reviewNote ?? 'Non conforme' },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: reviewerId,
        action: `PRODUCT_${decision}`,
        entity: 'Product',
        entityId: productId,
        metadata: { reviewNote: reviewNote ?? null },
      },
    });

    return { status: updated.status };
  }

  /** L'admin publie directement ses propres offres (pas de revue). */
  async publish(userId: string, productId: string) {
    const product = await this.mustOwn(userId, 'ADMIN', productId);
    if (product.status !== 'DRAFT' && product.status !== 'REJECTED') {
      throw new BadRequestException('Seule une offre en brouillon peut être publiée.');
    }
    const updated = await this.prisma.client.product.update({
      where: { id: productId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return { status: updated.status };
  }

  // ============ CATALOGUE PUBLIC ============

  async listPublic(filters: {
    page?: number;
    perPage?: number;
    platform?: string;
    minPrice?: number;
    maxPrice?: number;
    sellerId?: string;
    sort?: string;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(24, filters.perPage ?? 12);

    const where = {
      status: 'PUBLISHED' as const,
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.minPrice || filters.maxPrice
        ? {
            price: {
              ...(filters.minPrice ? { gte: filters.minPrice } : {}),
              ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
            },
          }
        : {}),
      ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
    };

    const orderBy =
      filters.sort === 'price-asc'
        ? { price: 'asc' as const }
        : filters.sort === 'price-desc'
          ? { price: 'desc' as const }
          : { publishedAt: 'desc' as const };

    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          images: { where: { isCover: true }, take: 1 },
          seller: { select: { shopName: true, slug: true, rating: true } },
        },
      }),
      this.prisma.client.product.count({ where }),
    ]);

    return { items, total, page, perPage };
  }

  async getPublic(slug: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        seller: { select: { shopName: true, slug: true, rating: true, salesCount: true } },
      },
    });
    if (!product || product.status !== 'PUBLISHED') {
      throw new NotFoundException('Offre introuvable.');
    }
    // Ne JAMAIS inclure ProductCredential ni reviewNote dans la réponse publique
    return product;
  }

  // ============ HELPERS ============

  private async mustOwn(userId: string, role: string, productId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Offre introuvable.');

    if (role === 'ADMIN' || role === 'STAFF') return product;

    const seller = await this.prisma.client.seller.findUnique({
      where: { userId },
    });
    if (!seller || product.sellerId !== seller.id) {
      throw new ForbiddenException('Vous n\'êtes pas propriétaire de cette offre.');
    }
    return product;
  }
}

function mediaTypeOf(objectKey: string): 'IMAGE' | 'VIDEO' {
  return /\.(mp4|webm)$/i.test(objectKey) ? 'VIDEO' : 'IMAGE';
}
