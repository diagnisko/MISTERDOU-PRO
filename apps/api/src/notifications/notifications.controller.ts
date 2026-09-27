import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';

@Controller({ path: 'notifications', version: '1' })
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me')
  @Roles('CLIENT', 'SELLER', 'STAFF', 'ADMIN')
  list(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.notifications.list(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Post(':id/read')
  @Roles('CLIENT', 'SELLER', 'STAFF', 'ADMIN')
  markRead(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead((req as any).user.sub, id);
  }

  @Post('read-all')
  @Roles('CLIENT', 'SELLER', 'STAFF', 'ADMIN')
  markAllRead(@Req() req: FastifyRequest) {
    return this.notifications.markAllRead((req as any).user.sub);
  }
}
