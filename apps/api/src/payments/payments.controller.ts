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
import { InitiateInstallmentDto, InitiatePaymentDto } from './dto/payment.dto';

@Controller({ path: 'payments', version: '1' })
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Initiation du paiement complet — canal choisi par le client :
   * Wave (WAVE) ou Orange Money (OM).
   */
  @Post('initiate/:orderId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initiate(
    @Req() req: FastifyRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiatePayment((req as any).user.sub, orderId, dto.channel);
  }

  /**
   * Initiation du paiement échelonné — apport ou prochaine mensualité,
   * sur le canal choisi (WAVE | OM). Type et montant fixés serveur.
   */
  @Post('initiate/installment/:planId')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initiateInstallment(
    @Req() req: FastifyRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: InitiateInstallmentDto,
  ) {
    return this.payments.initiateInstallmentPayment(
      (req as any).user.sub,
      planId,
      dto.channel,
    );
  }

  /**
   * Webhook serveur-à-serveur — PUBLIC (auth par secret header
   * X-PayTech-Secret), idempotent via PaymentEvent.
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
