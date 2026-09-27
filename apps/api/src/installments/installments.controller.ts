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
import { InstallmentsService } from './installments.service';
import { CreateInstallmentPlanDto } from './dto/installment.dto';

@Controller({ path: 'installments', version: '1' })
@UseGuards(RolesGuard)
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  /** Créer un plan de financement (offres ADMIN uniquement). */
  @Post('plans')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  createPlan(
    @Req() req: FastifyRequest,
    @Body() dto: CreateInstallmentPlanDto,
  ) {
    return this.installments.createPlan((req as any).user.sub, dto);
  }

  /** Montant à payer maintenant (apport ou prochaine échéance). */
  @Get('plans/:id/next-payment')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  nextPayment(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.installments.preparePayment((req as any).user.sub, id);
  }

  /** Mes plans de financement. */
  @Get('me')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  myPlans(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.installments.myPlans(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  /** Détail d'un plan avec échéancier. */
  @Get('plans/:id')
  @Roles('CLIENT', 'SELLER', 'ADMIN')
  myPlan(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.installments.myPlan((req as any).user.sub, id);
  }
}
