import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { InstallmentsService } from '../installments/installments.service';

/**
 * Tâches planifiées (BullMQ repeatable jobs, pattern cron) :
 * - release-expired-orders : toutes les 5 min — annule les commandes
 *   PENDING > 15 min et libère les produits RESERVED
 * - mark-overdue-installments : 08h00 — échéances en retard (> 3 j de grâce)
 * - installment-reminders : 09h00 — rappel 3 j avant chaque échéance
 * - expire-featured : minuit — désactive les mises en avant échues
 *
 * Désactivé proprement (warning) si REDIS_URL est absent en dev.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private queue?: Queue;
  private worker?: Worker;
  private connection?: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly installments: InstallmentsService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL absent — tâches planifiées désactivées (dev).',
      );
      return;
    }

    const { Queue: Q, Worker: W } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

    this.queue = new Q('misterdou-scheduler', {
      connection: this.connection,
    });

    // Jobs répétitifs (idempotents par design : la clé {cron, jobId} évite les doublons)
    await this.queue.add(
      'release-expired-orders',
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        jobId: 'release-expired-orders',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    await this.queue.add(
      'mark-overdue-installments',
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        jobId: 'mark-overdue-installments',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    await this.queue.add(
      'installment-reminders',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        jobId: 'installment-reminders',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    await this.queue.add(
      'expire-featured',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'expire-featured',
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.worker = new W(
      'misterdou-scheduler',
      async (job) => {
        switch (job.name) {
          case 'release-expired-orders': {
            const r = await this.orders.releaseExpired();
            if (r.cancelled > 0) this.logger.log(`Commandes expirées annulées : ${r.cancelled}`);
            return r;
          }
          case 'mark-overdue-installments': {
            const r = await this.installments.markOverdue();
            if (r.marked > 0) this.logger.log(`Échéances marquées en retard : ${r.marked}`);
            return r;
          }
          case 'installment-reminders':
            return this.sendInstallmentReminders();
          case 'expire-featured':
            return this.expireFeatured();
          default:
            this.logger.warn(`Job inconnu : ${job.name}`);
        }
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.name} échoué : ${err.message}`),
    );

    this.logger.log('Tâches planifiées actives (4 jobs cron).');
  }

  /**
   * Rappel 3 jours avant l'échéance — un seul rappel par échéance
   * (lastReminderSentAt), notification in-app.
   */
  async sendInstallmentReminders() {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const due = await this.prisma.client.installment.findMany({
      where: {
        status: 'SCHEDULED',
        dueDate: { lte: inThreeDays },
        lastReminderSentAt: null,
      },
      include: { plan: true },
      take: 200,
    });

    for (const inst of due) {
      await this.prisma.client.$transaction([
        this.prisma.client.installment.update({
          where: { id: inst.id },
          data: { lastReminderSentAt: new Date(), status: 'PAYMENT_LINK_SENT' },
        }),
        this.prisma.client.notification.create({
          data: {
            userId: inst.plan.userId,
            title: 'Échéance à venir ⏰',
            body: `Votre mensualité de ${Number(inst.amount)} FCFA arrive à échéance le ${inst.dueDate.toLocaleDateString('fr-SN')}.`,
          },
        }),
      ]);
    }
    return { reminded: due.length };
  }

  /** Désactive les mises en avant dont la fenêtre est échue. */
  async expireFeatured() {
    const r = await this.prisma.client.featuredProduct.updateMany({
      where: {
        active: true,
        endsAt: { lt: new Date() },
      },
      data: { active: false },
    });
    if (r.count > 0) this.logger.log(`Mises en avant expirées : ${r.count}`);
    return { expired: r.count };
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
