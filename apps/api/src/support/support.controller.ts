import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  ReplyTicketDto,
  UpdateTicketStatusDto,
} from './dto/ticket.dto';

@Controller({ path: 'support', version: '1' })
@UseGuards(RolesGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ---------- CLIENT ----------

  @Post('tickets')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  create(@Req() req: FastifyRequest, @Body() dto: CreateTicketDto) {
    return this.support.create((req as any).user.sub, dto);
  }

  @Get('tickets/me')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  myTickets(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.support.myTickets(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Get('tickets/:id')
  @Roles('CLIENT', 'SELLER', 'ADMIN', 'STAFF')
  myTicket(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.support.myTicket((req as any).user.sub, (req as any).user.role, id);
  }

  @Post('tickets/:id/reply')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reply(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.reply(
      (req as any).user.sub,
      (req as any).user.role,
      id,
      dto,
    );
  }

  // ---------- STAFF / ADMIN ----------

  @Get('admin/tickets')
  @Roles('ADMIN', 'STAFF')
  listTickets(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const allowed = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL'];
    return this.support.listTickets(
      (allowed.includes(status ?? '') ? status : 'OPEN') as any,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Post('admin/tickets/:id/reply')
  @Roles('ADMIN', 'STAFF')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  staffReply(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.support.staffReply((req as any).user.sub, id, dto);
  }

  @Post('admin/tickets/:id/status')
  @Roles('ADMIN', 'STAFF')
  updateStatus(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.support.updateStatus((req as any).user.sub, id, dto);
  }
}
