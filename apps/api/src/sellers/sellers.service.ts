import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplySellerDto, RequestWithdrawalDto } from './dto/seller.dto';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

interface SellerRow {
  id: string;
  balance: Prisma.Decimal;
  pendingBalance: Prisma.Decimal;
}

@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ CANDIDATURE ============

  /**
   * Candidature vendeur — KYC APPROVED obligatoire.
   * Statut PENDING → revue ADMIN, AuditLog consigné.
   */
  async apply(userId: string, dto: ApplySellerDto) {
    const kyc = await this.prisma.client.identityVerification.findUnique({
      where: { userId },
    });
    if (!kyc || kyc.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Vérification d\'identité (KYC) approuvée requise pour devenir vendeur.',
      );
    }

    const existing = await this.prisma.client.seller.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Vous avez déjà une candidature vendeur.');
    }

    const slug = `${slugify(dto.shopName)}-${Date.now().toString(36)}`;

    const seller = await this.prisma.client.seller.create({
      data: {
        userId,
        shopName: dto.shopName,
        slug,
        description: dto.description,
        status: 'PENDING',
      },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: userId,
        action: 'SELLER_APPLY',
        entity: 'Seller',
        entityId: seller.id,
        metadata: { shopName: dto.shopName },
      },
    });

    return { id: seller.id, slug: seller.slug, status: seller.status };
  }

  // ============ REVUE ADMIN ============

  async reviewSeller(
    sellerId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const seller = await this.prisma.client.seller.findUnique({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Candidature introuvable.');
    if (seller.status !== 'PENDING') {
      throw new BadRequestException('Cette candidature a déjà été traitée.');
    }

    const updated = await this.prisma.client.seller.update({
      where: { id: sellerId },
      data:
        decision === 'APPROVED'
          ? { status: 'APPROVED', approvedAt: new Date() }
          : { status: 'REJECTED' },
    });

    await this.prisma.client.auditLog.create({
      data: {
        actorId: reviewerId,
        action: `SELLER_${decision}`,
        entity: 'Seller',
        entityId: sellerId,
        metadata: { note: note ?? null },
      },
    });

    // Promotion du rôle utilisateur → SELLER
    if (decision === 'APPROVED') {
      await this.prisma.client.user.update({
        where: { id: seller.userId },
        data: { role: 'SELLER' },
      });
    }

    // Notification in-app
    await this.prisma.client.notification.create({
      data: {
        userId: seller.userId,
        title:
          decision === 'APPROVED'
            ? 'Compte vendeur approuvé 🎉'
            : 'Candidature vendeur refusée',
        body:
          decision === 'APPROVED'
            ? `Votre boutique « ${seller.shopName} » est active. Vous pouvez publier des offres (validation requise).`
            : `Votre candidature a été refusée. Motif : ${note ?? 'non précisé'}`,
      },
    });

    return { status: updated.status };
  }

  async listPending(page = 1, perPage = 20) {
    return this.prisma.client.seller.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
  }

  // ============ ESPACE VENDEUR ============

  async mySeller(userId: string) {
    const seller = await this.prisma.client.seller.findUnique({
      where: { userId },
      include: {
        withdrawals: { orderBy: { requestedAt: 'desc' }, take: 20 },
      },
    });
    if (!seller) throw new NotFoundException('Aucun compte vendeur.');
    return seller;
  }

  async myProducts(userId: string, page = 1, perPage = 20) {
    const seller = await this.mustBeSeller(userId);
    return this.prisma.client.product.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        images: { where: { isCover: true }, take: 1 },
      },
    });
  }

  async mySales(userId: string, page = 1, perPage = 20) {
    const seller = await this.mustBeSeller(userId);
    return this.prisma.client.orderItem.findMany({
      where: {
        sellerId: seller.id,
        order: {
          status: { in: ['CONFIRMED', 'CREDENTIALS_DELIVERED', 'COMPLETED'] },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        product: { select: { title: true, slug: true } },
        order: { select: { orderNumber: true, status: true, completedAt: true } },
      },
    });
  }

  async myBalanceEvents(userId: string, page = 1, perPage = 30) {
    const seller = await this.mustBeSeller(userId);
    return this.prisma.client.sellerBalanceEvent.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
  }

  // ============ RETRAITS ============

  /**
   * Demande de retrait — frais fixes 200 FCFA, solde disponible uniquement
   * (le séquestre `pendingBalance` n'est jamais retirable directement).
   * Verrou pessimiste FOR UPDATE : anti double-retrait concurrent.
   */
  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    return this.prisma.client.$transaction(async (tx) => {
      const seller = await tx.seller.findUnique({ where: { userId } });
      if (!seller || seller.status !== 'APPROVED') {
        throw new ForbiddenException('Compte vendeur non approuvé.');
      }

      const locked = await tx.$queryRaw<SellerRow[]>`
        SELECT id, balance, "pendingBalance" FROM "Seller"
        WHERE id = ${seller.id} FOR UPDATE`;
      const balance = Number(locked[0].balance);
      const pendingBalance = Number(locked[0].pendingBalance);

      if (dto.amount > balance) {
        throw new BadRequestException(
          `Solde insuffisant (disponible : ${balance} FCFA).`,
        );
      }

      const fee = 200;
      const netAmount = dto.amount - fee;
      if (netAmount <= 0) {
        throw new BadRequestException(
          'Montant trop faible pour couvrir les frais (200 FCFA).',
        );
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          sellerId: seller.id,
          amount: dto.amount,
          method: dto.method,
          destination: dto.destination,
          fee,
          status: 'PENDING',
        },
      });

      // Le montant passe immédiatement en séquestre jusqu'au paiement
      await tx.seller.update({
        where: { id: seller.id },
        data: {
          balance: new Prisma.Decimal(balance - dto.amount),
          pendingBalance: new Prisma.Decimal(pendingBalance + dto.amount),
        },
      });

      return {
        id: withdrawal.id,
        amount: withdrawal.amount,
        fee,
        netAmount,
        status: withdrawal.status,
      };
    });
  }

  // ============ ADMIN : TRAITEMENT RETRAITS ============

  async listWithdrawals(
    status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' = 'PENDING',
    page = 1,
    perPage = 20,
  ) {
    return this.prisma.client.withdrawal.findMany({
      where: { status },
      include: {
        seller: {
          select: { shopName: true, slug: true, balance: true, pendingBalance: true },
        },
      },
      orderBy: { requestedAt: 'asc' }, // FIFO
      skip: (page - 1) * perPage,
      take: perPage,
    });
  }

  async processWithdrawal(
    withdrawalId: string,
    adminId: string,
    decision: 'PAID' | 'REJECTED',
    note?: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });
      if (!withdrawal) throw new NotFoundException('Retrait introuvable.');
      if (withdrawal.status !== 'PENDING') {
        throw new BadRequestException('Ce retrait a déjà été traité.');
      }

      const locked = await tx.$queryRaw<SellerRow[]>`
        SELECT id, balance, "pendingBalance" FROM "Seller"
        WHERE id = ${withdrawal.sellerId} FOR UPDATE`;
      const balance = Number(locked[0].balance);
      const pendingBalance = Number(locked[0].pendingBalance);

      if (decision === 'PAID') {
        const amount = Number(withdrawal.amount);
        if (pendingBalance < amount) {
          throw new BadRequestException('Solde séquestre incohérent.');
        }
        await tx.seller.update({
          where: { id: withdrawal.sellerId },
          data: {
            pendingBalance: new Prisma.Decimal(pendingBalance - amount),
          },
        });
        await tx.sellerBalanceEvent.create({
          data: {
            sellerId: withdrawal.sellerId,
            amount: new Prisma.Decimal(-amount),
            type: 'PAYOUT',
            balanceAfter: new Prisma.Decimal(balance),
            description: `Retrait ${withdrawal.method} — ${withdrawal.destination}`,
          },
        });
      } else {
        // Annulation : le séquestre retourne au solde disponible
        const amount = Number(withdrawal.amount);
        await tx.seller.update({
          where: { id: withdrawal.sellerId },
          data: {
            balance: new Prisma.Decimal(balance + amount),
            pendingBalance: new Prisma.Decimal(pendingBalance - amount),
          },
        });
        await tx.sellerBalanceEvent.create({
          data: {
            sellerId: withdrawal.sellerId,
            amount: new Prisma.Decimal(amount),
            type: 'ADJUSTMENT',
            balanceAfter: new Prisma.Decimal(balance + amount),
            description: `Retrait annulé — retour au solde. ${note ?? ''}`.trim(),
          },
        });
      }

      const updated = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: decision, processedAt: new Date(), notes: note ?? null },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: `WITHDRAWAL_${decision}`,
          entity: 'Withdrawal',
          entityId: withdrawalId,
          metadata: { amount: withdrawal.amount, note: note ?? null },
        },
      });

      return { status: updated.status };
    });
  }

  // ============ BOUTIQUE PUBLIQUE ============

  async publicShop(slug: string) {
    const seller = await this.prisma.client.seller.findUnique({
      where: { slug },
    });
    if (!seller || seller.status !== 'APPROVED') {
      throw new NotFoundException('Boutique introuvable.');
    }
    const products = await this.prisma.client.product.findMany({
      where: { sellerId: seller.id, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 24,
      include: { images: { where: { isCover: true }, take: 1 } },
    });
    return {
      shopName: seller.shopName,
      slug: seller.slug,
      description: seller.description,
      rating: seller.rating,
      salesCount: seller.salesCount,
      products,
    };
  }

  // ============ HELPERS ============

  private async mustBeSeller(userId: string) {
    const seller = await this.prisma.client.seller.findUnique({
      where: { userId },
    });
    if (!seller) throw new ForbiddenException('Compte vendeur requis.');
    return seller;
  }
}
