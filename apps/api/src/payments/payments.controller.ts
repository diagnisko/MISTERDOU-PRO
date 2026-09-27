import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentsService } from './payments.service';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'payments', version: '1' })
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Initiation du paiement (utilisateur authentifié).
   * Route dédiée (séparée d'orders) — ne pas fusionner avec le webhook.
   */
  @Post('initiate/:orderId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async initiate(
    @Body() _body: unknown,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: FastifyRequest,
  ) {
    return this.payments.initiatePayment((req as any).user.sub, orderId);
  }

  /**
   * Webhook PayTech — PUBLIC (auth par secret header), idempotent.
   */
  @Post('webhook/paytech')
  @ApiExcludeEndpoint()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async webhook(
    @Body() payload: unknown,
    @Req() req: FastifyRequest,
  ) {
    return this.payments.handleWebhook(
      payload,
      (req.headers['x-paytech-secret'] as string) ?? undefined,
    );
  }
}

import { Param, ParseUUIDPipe, Req } from '@nestjs/common';
