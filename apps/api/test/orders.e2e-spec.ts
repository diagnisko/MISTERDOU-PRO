import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Tests e2e des flux critiques — achat concurrent.
 * Vérifie que deux commandes simultanées sur le même produit ne peuvent
 * pas toutes deux aboutir (verrou pessimiste FOR UPDATE).
 *
 * Nécessite une base de test (DATABASE_URL de test) — s'exécute via
 * `pnpm --filter api test:e2e`. En l'absence de DB, les tests sont
 * skippés (describe.skipIf).
 */
const hasDb = Boolean(process.env.DATABASE_URL && process.env.E2E_ENABLED);

const describeE2e = hasDb ? describe : describe.skip;

describeE2e('Orders — achat concurrent (verrou anti double-achat)', () => {
  let orders: OrdersService;
  let prisma: PrismaService;
  let buyerA: string;
  let buyerB: string;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, PrismaService, CryptoService],
    }).compile();

    orders = moduleRef.get(OrdersService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();

    // Fixture : deux acheteurs + un produit publié
    [buyerA, buyerB] = await Promise.all(
      ['a@test.md', 'b@test.md'].map((email) =>
        prisma.client.user.create({
          data: { email, emailVerified: true },
        }).then((u) => u.id),
      ),
    );
    const product = await prisma.client.product.create({
      data: {
        title: 'E2E Compte test',
        slug: `e2e-${Date.now()}`,
        price: 5000,
        status: 'PUBLISHED',
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    // Nettoyage (ordre :enfants d'abord)
    await prisma.client.orderItem.deleteMany({});
    await prisma.client.order.deleteMany({ where: { userId: { in: [buyerA, buyerB] } } });
    await prisma.client.product.deleteMany({ where: { id: productId } });
    await prisma.client.user.deleteMany({ where: { id: { in: [buyerA, buyerB] } } });
    await prisma.onModuleDestroy();
  });

  it('un seul acheteur gagne quand deux commandes partent en parallèle', async () => {
    const results = await Promise.allSettled([
      orders.create(buyerA, { items: [productId] }),
      orders.create(buyerB, { items: [productId] }),
    ]);

    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Le perdant reçoit un rejet clair
    const reason = (losers[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictException);

    // Le produit est RESERVED — plus achetable
    const product = await prisma.client.product.findUnique({
      where: { id: productId },
    });
    expect(product?.status).toBe('RESERVED');
  });

  it('le gagnant annule → le produit redevient disponible', async () => {
    const ordersList = await prisma.client.order.findMany({
      where: { status: 'PENDING' },
    });
    const order = ordersList[0];
    const owner = order.userId;

    await orders.cancel(owner, order.id, 'CLIENT');
    const product = await prisma.client.product.findUnique({
      where: { id: productId },
    });
    expect(product?.status).toBe('PUBLISHED');
  });
});
