import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { InstallmentsService } from '../installments/installments.service';

export type PaymentChannel = 'WAVE' | 'OM';

/**
 * Paiements — le client choisit son canal (Wave ou Orange Money).
 * L'agrégateur technique reste en coulisses : il n'apparaît jamais dans
 * les réponses renvoyées au client (API et interface web).
 *
 * Webhook — idempotent via PaymentEvent @@unique([providerRef, eventType]).
 * Auth par clé secrète via en-tête X-PayTech-Secret (secret serveur-à-serveur).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly installments: InstallmentsService,
  ) {}

  // ============ INITIATION PAIEMENT (complet) ============

  /**
   * Crée l'enregistrement Payment FULL pour le canal choisi (WAVE | OM).
   */
  async initiatePayment(userId: string, orderId: string, channel: PaymentChannel) {
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
      return { paymentId: active.id, amount: order.total, channel, reuse: true };
    }

    const payment = await this.prisma.client.payment.create({
      data: {
        orderId,
        type: 'FULL',
        status: 'INITIATED',
        amount: order.total,
        channel, // WAVE | OM — canal choisi par le client
      },
    });

    // TODO(prod) : appeler l'API du canal (clés API en env, jamais exposées),
    // passer payment.id dans custom_data pour le rattrapage au webhook,
    // et renvoyer payment_url/token de redirection.
    return {
      paymentId: payment.id,
      amount: order.total,
      channel, // renvoyé au client — canal, jamais l'agrégateur
      reuse: false,
    };
  }

  // ============ INITIATION PAIEMENT ÉCHELONNÉ ============

  /**
   * Paiement de l'apport initial ou de la prochaine mensualité, sur le
   * canal choisi. Le type et le montant sont déterminés par le plan
   * (jamais le client).
   */
  async initiateInstallmentPayment(
    userId: string,
    planId: string,
    channel: PaymentChannel,
  ) {
    const next = await this.installments.preparePayment(userId, planId);

    const active = await this.prisma.client.payment.findFirst({
      where: {
        orderId: next.orderId,
        installmentId: next.installmentId,
        status: 'INITIATED',
      },
    });
    if (active) {
      return { paymentId: active.id, amount: active.amount, channel, kind: next.kind, reuse: true };
    }

    const payment = await this.prisma.client.payment.create({
      data: {
        orderId: next.orderId,
        type: next.kind === 'DEPOSIT' ? 'INITIAL_DEPOSIT' : 'INSTALLMENT',
        status: 'INITIATED',
        amount: next.amount,
        installmentId: next.installmentId,
        channel,
      },
    });

    return {
      paymentId: payment.id,
      amount: next.amount,
      kind: next.kind,
      channel,
      reuse: false,
    };
  }

  // ============ WEBHOOK (idempotent) ============

  /**
   * Traitement du webhook serveur-à-serveur :
   * 1. Vérifier le secret
   * 2. Résoudre le Payment (par providerRef, sinon par custom_data.paymentId)
   * 3. Consigner PaymentEvent — doublon @@unique → rejeu ignoré
   * 4. Statut paiement + dispatch : FULL → orders, sinon → installments
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
        // Dispatch : FULL → flux commande, INITIAL_DEPOSIT/INSTALLMENT → flux échelonné
        // (InstallmentsService.onPaymentSucceeded délègue lui-même les FULL à orders)
        await this.installments.onPaymentSucceeded(paymentId, tx);
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
   * 2. sinon custom_data.paymentId (renvoyé par le canal à l'initiation)
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
