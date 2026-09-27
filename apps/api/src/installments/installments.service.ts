import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { INSTALLMENT_OPTIONS, CreateInstallmentPlanDto } from './dto/installment.dto';

/**
 * Paiement échelonné — offres ADMIN uniquement (§31 CGU).
 * Identifiants remis dès l'apport initial payé (risque porté par la plateforme).
 * Échéances : échéance N payable dès l'échéance N-1 réglée (pas de saut).
 */
@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  // ============ CRÉATION DU PLAN ============

  /**
   * Convertit une commande PENDING (offres ADMIN uniquement) en plan
   * échelonné. Crée l'Order de base (réservation produits) puis le plan :
   * apport initial + N mensualités.
   */
  async createPlan(userId: string, dto: CreateInstallmentPlanDto) {
    const rate = INSTALLMENT_OPTIONS[dto.months];

    // 1. Création de la commande (verrou anti double-achat, snapshots)
    const order = await this.orders.create(userId, { items: dto.productIds });

    return this.prisma.client.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: { select: { type: true } } },
      });
      // Financement réservé aux offres ADMIN (risque porté par MISTERDOU)
      for (const item of items) {
        if (item.product.type !== 'ADMIN_ACCOUNT') {
          throw new BadRequestException(
            'Le paiement échelonné s\'applique uniquement aux offres MISTERDOU (admin).',
          );
        }
      }

      const total = Number(order.total);
      const depositAmount = Math.round(total * rate);
      const remaining = total - depositAmount;
      const monthlyAmount = Math.round(remaining / dto.months);

      const plan = await tx.installmentPlan.create({
        data: {
          orderId: order.id,
          userId,
          months: dto.months,
          depositAmount: new Prisma.Decimal(depositAmount),
          totalAmount: new Prisma.Decimal(total),
          monthlyAmount: new Prisma.Decimal(monthlyAmount),
          status: 'ACTIVE',
          credentialsDelivered: false,
          installments: {
            create: Array.from({ length: dto.months }, (_, i) => ({
              sequence: i + 1,
              dueDate: addMonths(new Date(), i + 1),
              amount: new Prisma.Decimal(
                i + 1 === dto.months
                  ? remaining - monthlyAmount * (dto.months - 1) // dernière échéance absorbe l'arrondi
                  : monthlyAmount,
              ),
            })),
          },
        },
        include: { installments: true },
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        planId: plan.id,
        depositAmount,
        monthlyAmount,
        months: dto.months,
        installments: plan.installments,
      };
    });
  }

  // ============ PAIEMENT DE L'APPORT / D'UNE ÉCHÉANCE ============

  /**
   * Prépare le paiement (apport ou mensualité) — appelé avant l'initiation
   * PayTech. Retourne le montant à payer et rattache le Payment à l'échéance.
   */
  async preparePayment(userId: string, planId: string) {
    const plan = await this.prisma.client.installmentPlan.findUnique({
      where: { id: planId },
      include: { installments: { orderBy: { sequence: 'asc' } }, order: true },
    });
    if (!plan) throw new NotFoundException('Plan introuvable.');
    if (plan.userId !== userId) {
      throw new ForbiddenException('Plan non autorisé.');
    }
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('Ce plan n\'est plus actif.');
    }

    const order = plan.order;
    if (order.status === 'PENDING' && !plan.credentialsDelivered) {
      return {
        kind: 'DEPOSIT',
        amount: Number(plan.depositAmount),
        orderId: order.id,
        installmentId: null,
      };
    }

    // Prochaine échéance due : la première non payée (ordre séquentiel)
    const next = plan.installments.find((i) => i.status !== 'PAID');
    if (!next) {
      throw new BadRequestException('Toutes les échéances sont réglées.');
    }
    return {
      kind: 'INSTALLMENT',
      amount: Number(next.amount),
      orderId: order.id,
      installmentId: next.id,
    };
  }

  // ============ CONFIRMATION WEBHOOK ============

  /**
   * Appelé par le webhook PayTech après paiement vérifié (idempotent) :
   * - APPORT → commande CREDENTIALS_DELIVERED + identifiants remis
   *   (les produits restent RESERVED jusqu'au solde complet — remise
   *   immédiate car risque porté par MISTERDOU)
   * - MENSUALITÉ → Installment PAID ; plan terminé → commande COMPLETED
   */
  async onPaymentSucceeded(paymentId: string, tx?: any) {
    const db = tx ?? this.prisma.client;
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { installment: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable.');

    // Idempotence au niveau paiement
    if (payment.status === 'SUCCEEDED') {
      return { alreadyProcessed: true };
    }

    if (payment.type === 'FULL') {
      // Paiement complet : délégation au flux commande standard
      return this.orders.onPaymentSucceeded(payment.orderId, db);
    }

    const plan = await db.installmentPlan.findUnique({
      where: { orderId: payment.orderId },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) throw new NotFoundException('Plan introuvable.');

    if (payment.type === 'INITIAL_DEPOSIT') {
      // Apport payé → remise immédiate des identifiants (§31)
      await db.installmentPlan.update({
        where: { id: plan.id },
        data: { credentialsDelivered: true },
      });
      await db.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'CREDENTIALS_DELIVERED',
          confirmedAt: new Date(),
        },
      });
      await db.productCredential.updateMany({
        where: {
          productId: {
            in: (
              await db.orderItem.findMany({
                where: { orderId: payment.orderId },
                select: { productId: true },
              })
            ).map((i: any) => i.productId),
          },
        },
        data: { deliveredAt: new Date(), deliveredTo: plan.userId },
      });
      await db.notification.create({
        data: {
          userId: plan.userId,
          title: 'Apport initial confirmé 🎉',
          body: `Vos identifiants sont disponibles dès maintenant. ${plan.months} mensualités de ${plan.monthlyAmount} FCFA restent à régler.`,
        },
      });
      return { kind: 'DEPOSIT', processed: true };
    }

    if (payment.type === 'INSTALLMENT') {
      if (!payment.installmentId) {
        throw new BadRequestException('Échéance manquante sur le paiement.');
      }
      const installment = await db.installment.findUnique({
        where: { id: payment.installmentId },
      });
      if (!installment) throw new NotFoundException('Échéance introuvable.');

      await db.installment.update({
        where: { id: installment.id },
        data: { status: 'PAID', paidAt: new Date() },
      });

      const remaining = await db.installment.count({
        where: { planId: plan.id, status: { not: 'PAID' } },
      });
      if (remaining === 0) {
        // Plan soldé → commande COMPLETED + produits SOLD
        await db.installmentPlan.update({
          where: { id: plan.id },
          data: { status: 'COMPLETED' },
        });
        await db.order.update({
          where: { id: payment.orderId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await db.product.updateMany({
          where: {
            id: {
              in: (
                await db.orderItem.findMany({
                  where: { orderId: payment.orderId },
                  select: { productId: true },
                })
              ).map((i: any) => i.productId),
            },
          },
          data: { status: 'SOLD', soldAt: new Date() },
        });
        await db.notification.create({
          data: {
            userId: plan.userId,
            title: 'Financement soldé ✅',
            body: 'Toutes vos échéances sont réglées — la vente est définitive.',
          },
        });
      } else {
        await db.notification.create({
          data: {
            userId: plan.userId,
            title: 'Mensualité enregistrée ✅',
            body: `Échéance ${installment.sequence}/${plan.months} réglée. Prochaine : ${plan.monthlyAmount} FCFA.`,
          },
        });
      }
      return { kind: 'INSTALLMENT', processed: true };
    }

    throw new BadRequestException('Type de paiement non géré.');
  }

  // ============ CONSULTATION ============

  async myPlans(userId: string, page = 1, perPage = 20) {
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.installmentPlan.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          order: { select: { orderNumber: true, status: true } },
          installments: { orderBy: { sequence: 'asc' } },
        },
      }),
      this.prisma.client.installmentPlan.count({ where: { userId } }),
    ]);
    return { items, total, page, perPage };
  }

  async myPlan(userId: string, planId: string) {
    const plan = await this.prisma.client.installmentPlan.findUnique({
      where: { id: planId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            items: { select: { titleSnapshot: true, priceSnapshot: true } },
          },
        },
        installments: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('Plan introuvable.');
    if (plan.userId !== userId) {
      throw new ForbiddenException('Plan non autorisé.');
    }
    return plan;
  }

  // ============ RETARDS (cron / appel manuel) ============

  /**
   * Marque OVERDUE les échéances dépassées (> 3 jours de grâce) et
   * notifie. Le blocage de la remise n'est pas nécessaire : les
   * identifiants sont déjà remis (risque plateforme, §31).
   */
  async markOverdue() {
    const graceEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const late = await this.prisma.client.installment.findMany({
      where: {
        status: 'SCHEDULED',
        dueDate: { lt: graceEnd },
      },
      include: { plan: true },
    });

    for (const inst of late) {
      await this.prisma.client.installment.update({
        where: { id: inst.id },
        data: { status: 'OVERDUE' },
      });
      await this.prisma.client.notification.create({
        data: {
          userId: inst.plan.userId,
          title: 'Échéance en retard ⚠️',
          body: `Votre échéance ${inst.sequence}/${inst.plan.months} est en retard. Merci de la régulariser.`,
        },
      });
    }
    return { marked: late.length };
  }
}

/** Ajoute n mois à une date (sans lib externe). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0); // fin de mois — jour 28-31 ajusté
  return d;
}
