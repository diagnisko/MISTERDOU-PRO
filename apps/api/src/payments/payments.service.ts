import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

/**
 * Webhook PayTech — idempotent via PaymentEvent @@unique([providerRef, eventType]).
 * Auth par clé secrète (PAYTECH_WEBHOOK_SECRET) via en-tête X-PayTech-Secret.
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
   * paramètres renvoyés (à finaliser avec les creds prod).
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

    // TODO(prod) : appeler l'API PayTech /payment/request (API_KEY/API_SECRET),
    // passer payment.id dans custom_data pour le rattrapage au webhook,
    // et renvoyer payment_url/token de redirection.
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
   * 2. Résoudre le Payment (par providerRef, sinon par custom_data.paymentId)
   * 3. Consigner PaymentEvent — doublon @@unique → rejeu ignoré
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
    const eventType: string | undefined =
      payload?.type_event ?? payload?.event_type ?? payload?.event;
    const statusFromProvider: string | undefined = payload?.state ?? payload?.status;
    const customPaymentId: string | undefined = payload?.custom_data?.paymentId;

    if (!eventType) {
      throw new Error('Webhook invalide : type d\'événement manquant.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const paymentId = await this.resolvePaymentId(tx, providerRef, customPaymentId);

      // Consignation idempotente — violation @@unique = rejeu déjà traité
      try {
        await tx.paymentEvent.create({
          data: {
            paymentId,
            providerRef: providerRef ?? `noref-${customPaymentId ?? paymentId}`,
            eventType,
            payload: payload as object,
          },
        });
      } catch {
        return { duplicate: true };
      }

      const succeeded =
        eventType === 'payment_success' ||
        (eventType === 'sale_complete' && statusFromProvider === 'completed');

      if (succeeded) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'SUCCEEDED', paidAt: new Date() },
        });
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new Error('Paiement introuvable.');
        await this.orders.onPaymentSucceeded(payment.orderId, tx);
        return { duplicate: false, processed: true };
      }

      if (eventType === 'payment_canceled' || eventType === 'payment_failed') {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'FAILED' },
        });
      }
      return { duplicate: false, processed: false };
    });
  }

  /**
   * Résout le Payment concerné :
   * 1. providerRef déjà connu → Payment correspondant
   * 2. sinon custom_data.paymentId (renvoyé par PayTech à l'initiation)
   *    → rattache le providerRef au Payment
   */
  private async resolvePaymentId(
    tx: any,
    providerRef: string | undefined,
    customPaymentId: string | undefined,
  ): Promise<string> {
    if (providerRef) {
      const byRef = await tx.payment.findFirst({ where: { providerRef } });
      if (byRef) return byRef.id;
    }

    if (!customPaymentId) {
      throw new Error('Webhook invalide : paiement non identifiable.');
    }
    const payment = await tx.payment.findUnique({ where: { id: customPaymentId } });
    if (!payment) {
      throw new Error('Paiement introuvable.');
    }
    if (providerRef) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { providerRef },
      });
    }
    return payment.id;
  }
}
