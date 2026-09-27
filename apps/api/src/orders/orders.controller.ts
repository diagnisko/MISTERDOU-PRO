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
import { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/order.dto';

@Controller({ path: 'orders', version: '1' })
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  create(@Req() req: FastifyRequest, @Body() dto: CreateOrderDto) {
    return this.orders.create((req as any).user.sub, dto);
  }

  @Post(':id/cancel')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  cancel(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel((req as any).user.sub, id, (req as any).user.role);
  }

  @Get('me')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  myOrders(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.orders.myOrders(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Get(':id')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  myOrder(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.myOrder((req as any).user.sub, (req as any).user.role, id);
  }

  @Post(':id/credentials/:productId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  revealCredentials(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.orders.revealCredentials((req as any).user.sub, id, productId);
  }
}
