import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentsService } from './payments.service';

@Controller({ path: 'payments', version: '1' })
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Initiation du paiement complet (utilisateur authentifié).
   */
  @Post('initiate/:orderId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initiate(
    @Req() req: FastifyRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.payments.initiatePayment((req as any).user.sub, orderId);
  }

  /**
   * Initiation du paiement échelonné — apport initial ou prochaine mensualité.
   * Type et montant déterminés côté serveur (jamais le client).
   */
  @Post('initiate/installment/:planId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initiateInstallment(
    @Req() req: FastifyRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.payments.initiateInstallmentPayment((req as any).user.sub, planId);
  }

  /**
   * Webhook PayTech — PUBLIC (auth par secret header X-PayTech-Secret),
   * idempotent via PaymentEvent. Le secret fait office d'auth.
   */
  @Post('webhook/paytech')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  webhook(@Req() req: FastifyRequest, @Body() payload: unknown) {
    return this.payments.handleWebhook(
      payload,
      (req.headers['x-paytech-secret'] as string) ?? undefined,
    );
  }
}
