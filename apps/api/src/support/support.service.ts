import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTicketDto,
  ReplyTicketDto,
  UpdateTicketStatusDto,
} from './dto/ticket.dto';

/**
 * Support client — tickets liés optionnellement à une commande.
 * Conversation client ↔ staff dans Message (isStaff distinct).
 * Notification in-app à chaque réponse reçue.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ CLIENT ============

  async create(userId: string, dto: CreateTicketDto) {
    // Vérifie la commande si fournie
    if (dto.orderId) {
      const order = await this.prisma.client.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order || order.userId !== userId) {
        throw new ForbiddenException('Commande non autorisée.');
      }
    }

    const ticket = await this.prisma.client.supportTicket.create({
      data: {
        userId,
        orderId: dto.orderId ?? null,
        subject: dto.subject,
        status: 'OPEN',
        messages: {
          create: { senderId: userId, body: dto.body, isStaff: false },
        },
      },
      include: { messages: true },
    });
    return { id: ticket.id, status: ticket.status };
  }

  async myTickets(userId: string, page = 1, perPage = 20) {
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.supportTicket.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          _count: { select: { messages: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      this.prisma.client.supportTicket.count({ where: { userId } }),
    ]);
    return { items, total, page, perPage };
  }

  async myTicket(userId: string, role: string, ticketId: string) {
    const ticket = await this.prisma.client.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, orderNumber: true, status: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');
    if (ticket.userId !== userId && !['ADMIN', 'STAFF'].includes(role)) {
      throw new ForbiddenException('Ticket non autorisé.');
    }
    return ticket;
  }

  /** Réponse du client sur son propre ticket. */
  async reply(userId: string, role: string, ticketId: string, dto: ReplyTicketDto) {
    const ticket = await this.mustAccess(userId, role, ticketId);
    if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new ForbiddenException('Ce ticket est clôturé.');
    }

    const message = await this.prisma.client.message.create({
      data: { ticketId, senderId: userId, body: dto.body, isStaff: false },
    });

    // Réponse client → ticket ré-ouvert si résolu côté staff
    if (ticket.status === 'RESOLVED') {
      await this.prisma.client.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'OPEN' },
      });
    }

    // Notifier le staff via notification au(x) admin(s) — best effort
    await this.notifyStaff(ticketId, ticket.subject, dto.body);

    return { id: message.id };
  }

  // ============ STAFF / ADMIN ============

  async listTickets(
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ALL' = 'OPEN',
    page = 1,
    perPage = 20,
  ) {
    const where = status === 'ALL' ? {} : { status };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'asc' }, // plus anciens actifs d'abord (FIFO)
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.client.supportTicket.count({ where }),
    ]);
    return { items, total, page, perPage };
  }

  /** Réponse staff — notifie le client. */
  async staffReply(
    staffId: string,
    ticketId: string,
    dto: ReplyTicketDto,
    setStatus?: UpdateTicketStatusDto['status'],
  ) {
    const ticket = await this.prisma.client.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');

    const message = await this.prisma.client.message.create({
      data: { ticketId, senderId: staffId, body: dto.body, isStaff: true },
    });

    const newStatus = setStatus ?? (ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status);
    await this.prisma.client.supportTicket.update({
      where: { id: ticketId },
      data: { status: newStatus },
    });

    await this.prisma.client.notification.create({
      data: {
        userId: ticket.userId,
        title: 'Réponse du support 💬',
        body: `Votre ticket « ${ticket.subject} » a une nouvelle réponse.`,
      },
    });

    return { id: message.id, status: newStatus };
  }

  async updateStatus(staffId: string, ticketId: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.client.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');

    await this.prisma.client.supportTicket.update({
      where: { id: ticketId },
      data: { status: dto.status },
    });
    await this.prisma.client.auditLog.create({
      data: {
        actorId: staffId,
        action: `TICKET_${dto.status}`,
        entity: 'SupportTicket',
        entityId: ticketId,
        metadata: { subject: ticket.subject },
      },
    });
    return { status: dto.status };
  }

  // ============ HELPERS ============

  private async mustAccess(userId: string, role: string, ticketId: string) {
    const ticket = await this.prisma.client.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable.');
    if (ticket.userId !== userId && !['ADMIN', 'STAFF'].includes(role)) {
      throw new ForbiddenException('Ticket non autorisé.');
    }
    return ticket;
  }

  /** Notifie les ADMIN (staff en cc) — best effort, sans échec bloquant. */
  private async notifyStaff(ticketId: string, subject: string, body: string) {
    try {
      const admins = await this.prisma.client.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
        take: 10,
      });
      if (admins.length === 0) return;
      await this.prisma.client.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: 'Nouveau message support 📨',
          body: `Ticket « ${subject} » : ${body.slice(0, 80)}`,
        })),
      });
    } catch {
      // notification best-effort — ne bloque jamais la réponse au ticket
    }
  }
}
