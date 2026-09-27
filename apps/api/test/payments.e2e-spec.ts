import { Test } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { CryptoService } from '../crypto/crypto.service';
import { InstallmentsService } from '../installments/installments.service';

/**
 * Tests e2e — idempotence du webhook et séquestre vendeur.
 * Vérifie que :
 * 1. Un rejeu du webhook payment_success n'engendre ni double remise
 *    d'identifiants ni double-crédit vendeur.
 * 2. Le paiement d'une commande vendeur crédite le séquestre du net
 *    (commission 15 % déduite) et trace SALE + COMMISSION.
 */
const hasDb = Boolean(process.env.DATABASE_URL && process.env.E2E_ENABLED);
const describeE2e = hasDb ? describe : describe.skip;

describeE2e('Webhook idempotent + séquestre vendeur', () => {
  let payments: PaymentsService;
  let prisma: PrismaService;
  let buyerId: string;
  let sellerId: string; // Seller.id
  let orderId: string;
  let paymentId: string;

  beforeAll(async () => {
    process.env.PAYTECH_WEBHOOK_SECRET = 'test-secret';

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        OrdersService,
        InstallmentsService,
        PrismaService,
        CryptoService,
      ],
    }).compile();

    payments = moduleRef.get(PaymentsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    // Fixture : vendeur approuvé + acheteur + produit publié
    const sellerUser = await prisma.client.user.create({
      data: { email: 'seller@test.md', emailVerified: true, role: 'SELLER' },
    });
    const seller = await prisma.client.seller.create({
      data: {
        userId: sellerUser.id,
        shopName: 'E2E Shop',
        slug: `e2e-shop-${Date.now()}`,
        status: 'APPROVED',
      },
    });
    sellerId = seller.id;

    const buyer = await prisma.client.user.create({
      data: { email: 'buyer@test.md', emailVerified: true },
    });
    buyerId = buyer.id;

    const product = await prisma.client.product.create({
      data: {
        title: 'E2E Webhook test',
        slug: `e2e-wh-${Date.now()}`,
        price: 10000,
        status: 'PUBLISHED',
        sellerId,
      },
    });

    const order = await prisma.client.order.create({
      data: {
        orderNumber: `E2E-${Date.now()}`,
        userId: buyerId,
        status: 'PENDING',
        subtotal: 10000,
        total: 10000,
        items: {
          create: {
            productId: product.id,
            sellerId,
            titleSnapshot: 'E2E Webhook test',
            priceSnapshot: 10000,
            quantity: 1,
          },
        },
      },
    });
    orderId = order.id;

    const payment = await prisma.client.payment.create({
      data: {
        orderId,
        type: 'FULL',
        status: 'INITIATED',
        amount: 10000,
        channel: 'WAVE',
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.client.paymentEvent.deleteMany({});
    await prisma.client.payment.deleteMany({ where: { id: paymentId } });
    await prisma.client.order.deleteMany({ where: { id: orderId } });
    await prisma.client.user.deleteMany({
      where: { id: { in: [buyerId] } },
    });
    await prisma.onModuleDestroy();
  });

  it('rejette un webhook avec un secret invalide', async () => {
    await expect(
      payments.handleWebhook(
        { reference: 'ref-1', type_event: 'payment_success', custom_data: { paymentId } },
        'mauvais-secret',
      ),
    ).rejects.toThrow();
  });

  it('premier webhook : remise identifiants + crédit séquestre net (85 %)', async () => {
    const res = await payments.handleWebhook(
      {
        reference: 'ref-e2e-1',
        type_event: 'payment_success',
        custom_data: { paymentId },
      },
      'test-secret',
    );
    expect(res).toMatchObject({ duplicate: false, processed: true });

    const seller = await prisma.client.seller.findUnique({
      where: { id: sellerId },
    });
    // 10000 - 15 % commission = 8500 en séquestre
    expect(Number(seller?.pendingBalance)).toBe(8500);
    expect(Number(seller?.balance)).toBe(0);

    const order = await prisma.client.order.findUnique({
      where: { id: orderId },
    });
    expect(order?.status).toBe('CREDENTIALS_DELIVERED');
  });

  it('rejeu du même webhook : ignoré, aucun double-crédit', async () => {
    const res = await payments.handleWebhook(
      {
        reference: 'ref-e2e-1',
        type_event: 'payment_success',
        custom_data: { paymentId },
      },
      'test-secret',
    );
    expect(res).toMatchObject({ duplicate: true });

    const seller = await prisma.client.seller.findUnique({
      where: { id: sellerId },
    });
    // Toujours 8500 — pas de double-crédit
    expect(Number(seller?.pendingBalance)).toBe(8500);

    // Un seul event SALE tracé
    const events = await prisma.client.sellerBalanceEvent.findMany({
      where: { sellerId, type: 'SALE' },
    });
    expect(events).toHaveLength(1);
  });
});
