import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

/**
 * Webhook PayTech — idempotent via PaymentEvent @@unique([providerRef, eventType]).
 * Auth par clé secrète (PAYTECH_WEBHOOK_SECRET) via en-tête + IP allowlist optionnelle.
 * Route publique (pas d'auth utilisateur) — le secret fait office d'auth.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  // ============ INITIATION PAIEMENT ============

  /**
   * Crée l'enregistrement Payment (INITIATED) et génère la session PayTech.
   * La redirection réelle vers PayTech se fait côté client avec les
   * paramètres renvoyés (API-key-based, à finaliser avec les creds prod).
   */
  async initiatePayment(userId: string, orderId: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new Error('Commande introuvable.');
    if (order.userId !== userId) throw new Error('Commande non autorisée.');
    if (order.status !== 'PENDING') {
      throw new Error('Cette commande n\'est plus payable.');
    }

    // Une seule session de paiement active par commande
    const active = await this.prisma.client.payment.findFirst({
      where: { orderId, status: 'INITIATED' },
    });
    if (active) {
      return { paymentId: active.id, amount: order.total, reuse: true };
    }

    const payment = await this.prisma.client.payment.create({
      data: {
        orderId,
        type: 'FULL',
        status: 'INITIATED',
        amount: order.total,
      },
    });

    // TODO(prod) : appeler l'API PayTech /payment/request avec
    // API_KEY/API_SECRET et renvoyer payment_url/token de redirection.
    return {
      paymentId: payment.id,
      amount: order.total,
      provider: 'paytech',
      reuse: false,
    };
  }

  // ============ WEBHOOK (idempotent) ============

  /**
   * Traitement du webhook PayTech :
   * 1. Vérifier le secret
   * 2. Vérrouiller le Payment par providerRef (unicité)
   3. Consigner PaymentEvent (idempotence)
   * 4. Statut paiement + transition commande (onPaymentSucceeded)
   */
  async handleWebhook(payload: any, secretHeader: string | undefined) {
    const expected = process.env.PAYTECH_WEBHOOK_SECRET ?? '';
    if (!expected) {
      throw new Error('PAYTECH_WEBHOOK_SECRET non configuré.');
    }
    if (secretHeader !== expected) {
      throw new Error('Secret webhook invalide.');
    }

    const providerRef: string | undefined = payload?.reference;
    const eventType: string | undefined = payload?.type_event
      ?? payload?.event_type
      ?? payload?.event;
    const statusFromProvider: string | undefined = payload?.state
      ?? payload?.status;

    if (!providerRef || !eventType) {
      throw new Error('Webhook invalide : référence ou type manquant.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Consignation idempotente — doublon = rejeu déjà traité
      try {
        await tx.paymentEvent.create({
          data: {
            paymentId: await this.resolvePaymentId(tx, providerRef),
            providerRef,
            eventType,
            payload: payload as object,
          },
        });
      } catch {
        // Violation @@unique([providerRef, eventType]) → déjà traité
        return { duplicate: true };
      }

      const succeeded =
        eventType === 'payment_success'
          || (eventType === 'sale_complete' && statusFromProvider === 'completed');

      if (succeeded) {
        const payment = await tx.payment.findFirst({
          where: { providerRef },
        });
        if (!payment) throw new Error('Paiement introuvable.');
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCEEDED', paidAt: new Date() },
        });
        await this.orders.onPaymentSucceeded(payment.orderId, tx);
        return { duplicate: false, processed: true };
      }

      if (eventType === 'payment_canceled' || eventType === 'payment_failed') {
        const payment = await tx.payment.findFirst({ where: { providerRef } });
        if (payment) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          });
        }
      }
      return { duplicate: false, processed: false };
    });
  }

  private async resolvePaymentId(tx: any, providerRef: string): Promise<string> {
    const payment = await tx.payment.findFirst({ where: { providerRef } });
    if (payment) return payment.id;

    // La référence PayTech peut précéder l'attribution du providerRef côté nous
    // → on rattache par le champ custom_ref si présent
    const customRef: string | undefined = payloadOf(providerRef);
    if (!customRef) {
      throw new Error(`Paiement introuvable pour la référence ${providerRef}.`);
    }
    const byCustom = await tx.payment.findFirst({ where: { id: customRef } });
    if (!byCustom) {
      throw new Error('Paiement introuvable.');
    }
    await tx.payment.update({
      where: { id: byCustom.id },
      data: { providerRef },
    });
    return byCustom.id;
    function payloadOf(_: string): string | undefined {
      return (arguments.callee as any).custom_ref;
    }
  }
}
