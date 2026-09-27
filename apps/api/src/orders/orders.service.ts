import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/order.dto';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Constantes métier MISTERDOU — Phase 5
 */
export const PLATFORM_COMMISSION = 0.15; // 15 % plateforme
export const RESERVATION_TTL_MIN = 15; // réservation 15 min pour payer

interface ProductRow {
  id: string;
  sellerId: string | null;
  title: string;
  price: Prisma.Decimal;
  status: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // ============ CRÉATION (verrou anti double-achat) ============

  /**
   * Création d'une commande : verrou pessimiste FOR UPDATE sur les produits.
   * Un produit unique ne peut être acheté qu'une fois — la première
   * transaction gagne, les concurrentes échouent (produit RESERVED).
   * Snapshots titre/prix capturés au moment de la commande.
   */
  async create(userId: string, dto: CreateOrderDto) {
    // Anti-spam : max 10 items, unicité des produits
    const productIds = [...new Set(dto.items)];
    if (productIds.length === 0) {
      throw new BadRequestException('Commande vide.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Verrou pessimiste sur les produits dans un ordre stable
      // (ordre alphabétique des ids → évite deadlock entre transactions concurrentes)
      const locked = await tx.$queryRaw<ProductRow[]>`
        SELECT id, "sellerId", title, price, status FROM "Product"
        WHERE id IN (${Prisma.join(productIds)})
        ORDER BY id
        FOR UPDATE`;
      if (locked.length !== productIds.length) {
        throw new NotFoundException('Une des offres est introuvable.');
      }

      for (const p of locked) {
        if (p.status !== 'PUBLISHED') {
          throw new ConflictProductError(p.title);
        }
      }

      const subtotal = locked.reduce(
        (sum, p) => sum + Number(p.price),
        0,
      );
      const total = subtotal; // pas de promo en Phase 5

      const order = await tx.order.create({
        data: {
          orderNumber: `MD-${Date.now().toString(36).toUpperCase()}-${Math.random()
            .toString(36)
            .slice(2, 6)
            .toUpperCase()}`,
          userId,
          status: 'PENDING',
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          items: {
            create: locked.map((p) => ({
              productId: p.id,
              sellerId: p.sellerId,
              titleSnapshot: p.title,
              priceSnapshot: new Prisma.Decimal(p.price),
              quantity: 1,
            })),
          },
        },
        include: { items: true },
      });

      // Réservation des produits (expiration 15 min)
      await tx.product.updateMany({
        where: { id: { in: productIds } },
        data: {
          status: 'RESERVED',
          reservedUntil: new Date(Date.now() + RESERVATION_TTL_MIN * 60_000),
        },
      });

      return order;
    });
  }

  // ============ ANNULATION ============

  /** Annulation par l'acheteur (PENDING uniquement) → produits libérés. */
  async cancel(userId: string, orderId: string, role: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.userId !== userId && role !== 'ADMIN') {
        throw new ForbiddenException('Commande non autorisée.');
      }
      if (order.status !== 'PENDING') {
        throw new BadRequestException(
          'Seule une commande en attente de paiement peut être annulée.',
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      // Libération des produits non vendus
      await tx.product.updateMany({
        where: {
          id: { in: order.items.map((i) => i.productId) },
          status: 'RESERVED',
        },
        data: { status: 'PUBLISHED', reservedUntil: null },
      });

      return { status: 'CANCELLED' };
    });
  }

  // ============ PAIEMENT CONFIRMÉ (appelé par le webhook) ============

  /**
   * Suite au paiement vérifié :
   * 1. Commande → CREDENTIALS_DELIVERED, produits → SOLD
   * 2. Identifiants chiffrés révélés à l'acheteur (déchiffrement à la lecture)
   * 3. Crédit vendeur en séquestre (net de la commission 15 %)
   * 4. SellerBalanceEvent + notification acheteur
   */
  async onPaymentSucceeded(orderId: string, paymentId: string, tx?: any) {
    const db = tx ?? this.prisma.client;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.status !== 'PENDING') {
      return { alreadyProcessed: true }; // idempotence au niveau commande
    }

    // 1. Commande confirmée + produits vendus
    await db.order.update({
      where: { id: orderId },
      data: {
        status: 'CREDENTIALS_DELIVERED',
        confirmedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await db.product.updateMany({
      where: { id: { in: order.items.map((i) => i.productId) } },
      data: { status: 'SOLD', soldAt: new Date() },
    });

    // 2. Marquer les identifiants comme remis à l'acheteur
    await db.productCredential.updateMany({
      where: { productId: { in: order.items.map((i) => i.productId) } },
      data: { deliveredAt: new Date(), deliveredTo: order.userId },
    });

    // 3. Crédit vendeur (séquestre anti-fraude) — net de commission 15 %
    for (const item of order.items) {
      if (!item.sellerId) continue; // offre admin : pas de crédit vendeur
      const gross = Number(item.priceSnapshot);
      const net = Math.round(gross * (1 - PLATFORM_COMMISSION) * 100) / 100;

      const locked = await db.$queryRaw<SellerRow[]>`
        SELECT id, balance, "pendingBalance" FROM "Seller"
        WHERE id = ${item.sellerId} FOR UPDATE`;
      const balance = Number(locked[0].balance);
      const pendingBalance = Number(locked[0].pendingBalance);

      await db.seller.update({
        where: { id: item.sellerId },
        data: {
          pendingBalance: new Prisma.Decimal(pendingBalance + net),
          totalSales: new Prisma.Decimal(Number(locked[0].totalSales) + gross),
          salesCount: { increment: 1 },
        },
      });
      await db.sellerBalanceEvent.create({
        data: {
          sellerId: item.sellerId,
          amount: new Prisma.Decimal(net),
          type: 'SALE',
          balanceAfter: new Prisma.Decimal(balance), // reste en séquestre
          orderId,
          description: `Vente « ${item.titleSnapshot} » — net après commission 15 %`,
        },
      });
      await db.sellerBalanceEvent.create({
        data: {
          sellerId: item.sellerId,
          amount: new Prisma.Decimal(-net * PLATFORM_COMMISSION / (1 - PLATFORM_COMMISSION)),
          type: 'COMMISSION',
          balanceAfter: new Prisma.Decimal(balance),
          orderId,
          description: `Commission plateforme 15 %`,
        },
      });
      await db.seller.update({
        where: { id: item.sellerId },
        data: { pendingBalance: new Prisma.Decimal(pendingBalance + net) },
      });
    }

    // 4. Notification acheteur
    await db.notification.create({
      data: {
        userId: order.userId,
        title: 'Paiement confirmé 🎉',
        body: `Commande ${order.orderNumber} confirmée — vos identifiants eFootball sont disponibles.`,
      },
    });

    return { alreadyProcessed: false };
  }

  // ============ CONSULTATION ============

  async myOrders(userId: string, page = 1, perPage = 20) {
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          items: { include: { product: { select: { slug: true, title: true } } } },
        },
      }),
      this.prisma.client.order.count({ where: { userId } }),
    ]);
    return { items, total, page, perPage };
  }

  async myOrder(userId: string, role: string, orderId: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { select: { slug: true, title: true } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Commande non autorisée.');
    }
    return order;
  }

  // ============ RÉVÉLATION DES IDENTIFIANTS ============

  /**
   * Seul l'acheteur (commande CREDENTIALS_DELIVERED/COMPLETED) peut
   * révéler les identifiants. Déchiffrement à la volée, jamais stocké en clair.
   */
  async revealCredentials(userId: string, orderId: string, productId: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.userId !== userId) {
      throw new ForbiddenException('Commande non autorisée.');
    }
    if (!['CREDENTIALS_DELIVERED', 'COMPLETED'].includes(order.status)) {
      throw new ForbiddenException(
        'Les identifiants ne sont disponibles qu\'après paiement confirmé.',
      );
    }
    if (!order.items.some((i) => i.productId === productId)) {
      throw new ForbiddenException('Ce produit n\'est pas dans cette commande.');
    }

    const cred = await this.prisma.client.productCredential.findUnique({
      where: { productId },
    });
    if (!cred) {
      throw new NotFoundException('Identifiants non disponibles.');
    }

    const plain = JSON.parse(this.crypto.decrypt(cred.cipherText));
    return { login: plain.login, password: plain.password };
  }

  // ============ LIBÉRATION DES EXPIRÉES (cron, phase ultérieure) ============

  /** Libère les produits RESERVED dont la réservation a expiré. */
  async releaseExpired() {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const stale = await tx.product.findMany({
        where: { status: 'RESERVED', reservedUntil: { lt: new Date() } },
        select: { id: true },
      });
      if (stale.length === 0) return { released: 0 };
      await tx.product.updateMany({
        where: { id: { in: stale.map((s) => s.id) }, status: 'RESERVED' },
        data: { status: 'PUBLISHED', reservedUntil: null },
      });
      return { released: stale.length };
    });
    return result;
  }
}

interface SellerRow {
  id: string;
  balance: Prisma.Decimal;
  pendingBalance: Prisma.Decimal;
  totalSales: Prisma.Decimal;
}

class ConflictProductError extends BadRequestException {
  constructor(title: string) {
    super(`L'offre « ${title} » n'est plus disponible (réservée ou vendue).`);
  }
}
