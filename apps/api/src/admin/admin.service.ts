import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Centre d'administration — statistiques plateforme et journaux d'audit.
 * Toutes les routes ADMIN/STAFF (statistiques) ou ADMIN (audit).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ DASHBOARD ============

  /**
   * Vue d'ensemble : files d'attente de revue + volumes financiers.
   * CA = paiements SUCCEEDED ; commissions = events COMMISSION.
   */
  async dashboard() {
    const [
      users,
      sellersPending,
      productsPending,
      kycPending,
      withdrawalsPending,
      revenue,
      commissions,
      paidOut,
      ordersCompleted,
      disputesOpen,
    ] = await this.prisma.client.$transaction([
      this.prisma.client.user.count(),
      this.prisma.client.seller.count({ where: { status: 'PENDING' } }),
      this.prisma.client.product.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.client.identityVerification.count({
        where: { status: 'SUBMITTED' },
      }),
      this.prisma.client.withdrawal.count({ where: { status: 'PENDING' } }),
      this.prisma.client.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCEEDED' },
      }),
      this.prisma.client.sellerBalanceEvent.aggregate({
        _sum: { amount: true },
        where: { type: 'COMMISSION' },
      }),
      this.prisma.client.sellerBalanceEvent.aggregate({
        _sum: { amount: true },
        where: { type: 'PAYOUT' },
      }),
      this.prisma.client.order.count({
        where: { status: { in: ['COMPLETED', 'CREDENTIALS_DELIVERED'] } },
      }),
      this.prisma.client.supportTicket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
    ]);

    return {
      totals: {
        users,
        ordersCompleted,
      },
      queues: {
        sellersPending,
        productsPending,
        kycPending,
        withdrawalsPending,
        disputesOpen,
      },
      finance: {
        // commissions négatives (débit) → valeur absolue
        revenue: Number(revenue._sum.amount ?? 0),
        commissions: Math.abs(Number(commissions._sum.amount ?? 0)),
        sellerPayouts: Math.abs(Number(paidOut._sum.amount ?? 0)),
      },
    };
  }

  // ============ CA PAR CANAL (Wave / Orange Money) ============

  async revenueByChannel() {
    const rows = await this.prisma.client.payment.groupBy({
      by: ['channel'],
      _sum: { amount: true },
      _count: true,
      where: { status: 'SUCCEEDED' },
    });
    return rows.map((r) => ({
      channel: r.channel ?? 'N/A',
      count: r._count,
      total: Number(r._sum.amount ?? 0),
    }));
  }

  // ============ CA PAR MOIS (6 derniers) ============

  async revenueMonthly() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const rows = await this.prisma.client.$queryRaw<
      { month: Date; total: Prisma.Decimal }[]
    >`
      SELECT date_trunc('month', "paidAt") AS month,
             SUM("amount") AS total
      FROM "Payment"
      WHERE "status" = 'SUCCEEDED' AND "paidAt" >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1 ASC`;

    return rows.map((r) => ({
      month: r.month,
      total: Number(r.total),
    }));
  }

  // ============ AUDIT LOGS ============

  async auditLogs(filters: {
    page?: number;
    perPage?: number;
    action?: string;
    entity?: string;
    actorId?: string;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(100, filters.perPage ?? 50);

    const where = {
      ...(filters.action ? { action: { contains: filters.action } } : {}),
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
    };

    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          actor: { select: { email: true, firstName: true, lastName: true, role: true } },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return { items, total, page, perPage };
  }

  // ============ LISTE UTILISATEURS (recherche) ============

  async listUsers(filters: { page?: number; perPage?: number; q?: string; role?: string }) {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(50, filters.perPage ?? 20);

    const where = {
      ...(filters.role ? { role: filters.role as any } : {}),
      ...(filters.q
        ? {
            OR: [
              { email: { contains: filters.q, mode: 'insensitive' as const } },
              { firstName: { contains: filters.q, mode: 'insensitive' as const } },
              { lastName: { contains: filters.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          kyc: { select: { status: true } },
          seller: { select: { shopName: true, status: true } },
        },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return { items, total, page, perPage };
  }
}
