import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notifications in-app — cloche + liste, marquage lu.
 * Toutes les notifications sont propres à un utilisateur (jamais globales).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste paginée + compteur non-lues. */
  async list(userId: string, page = 1, perPage = 20) {
    const [items, unread] = await this.prisma.client.$transaction([
      this.prisma.client.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.client.notification.count({
        where: { userId, read: false },
      }),
    ]);
    return { items, unread, page, perPage };
  }

  /** Marque une notification comme lue (propriétaire uniquement). */
  async markRead(userId: string, notificationId: string) {
    const notif = await this.prisma.client.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notif || notif.userId !== userId) {
      throw new NotFoundException('Notification introuvable.');
    }
    if (!notif.read) {
      await this.prisma.client.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
    }
    return { ok: true };
  }

  /** Marque tout comme lu. */
  async markAllRead(userId: string) {
    await this.prisma.client.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}
