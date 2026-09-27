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
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SellersService } from './sellers.service';
import {
  ApplySellerDto,
  RequestWithdrawalDto,
  ReviewSellerDto,
  ReviewWithdrawalDto,
} from './dto/seller.dto';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'sellers', version: '1' })
@UseGuards(RolesGuard)
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  // ---------- CLIENT → VENDEUR ----------

  @Post('apply')
  @Roles('CLIENT', 'SELLER')
  apply(@Req() req: FastifyRequest, @Body() dto: ApplySellerDto) {
    return this.sellers.apply((req as any).user.sub, dto);
  }

  @Get('me')
  @Roles('SELLER')
  me(@Req() req: FastifyRequest) {
    return this.sellers.mySeller((req as any).user.sub);
  }

  @Get('me/products')
  @Roles('SELLER')
  myProducts(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.sellers.myProducts(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Get('me/sales')
  @Roles('SELLER')
  mySales(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.sellers.mySales(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Get('me/balance-events')
  @Roles('SELLER')
  myBalanceEvents(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.sellers.myBalanceEvents(
      (req as any).user.sub,
      Number(page ?? 1) || 1,
      Number(perPage ?? 30) || 30,
    );
  }

  @Post('me/withdrawals')
  @Roles('SELLER')
  requestWithdrawal(
    @Req() req: FastifyRequest,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.sellers.requestWithdrawal((req as any).user.sub, dto);
  }

  // ---------- ADMIN ----------

  @Get('pending')
  @Roles('ADMIN', 'STAFF')
  listPending(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.sellers.listPending(
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Post(':id/review')
  @Roles('ADMIN')
  review(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSellerDto,
  ) {
    return this.sellers.reviewSeller(
      id,
      (req as any).user.sub,
      dto.decision,
      dto.note,
    );
  }

  @Get('withdrawals')
  @Roles('ADMIN', 'STAFF')
  listWithdrawals(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const allowed = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'];
    return this.sellers.listWithdrawals(
      (allowed.includes(status ?? '') ? status : 'PENDING') as any,
      Number(page ?? 1) || 1,
      Number(perPage ?? 20) || 20,
    );
  }

  @Post('withdrawals/:id/process')
  @Roles('ADMIN')
  processWithdrawal(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewWithdrawalDto,
  ) {
    return this.sellers.processWithdrawal(
      id,
      (req as any).user.sub,
      dto.decision,
      dto.note,
    );
  }
}
