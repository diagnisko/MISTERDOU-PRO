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
import { PromotionsService } from './promotions.service';
import {
  CreatePromotionDto,
  FeatureProductDto,
  UpdatePromotionDto,
  ValidatePromoDto,
} from './dto/promotion.dto';

@Controller({ path: 'promotions', version: '1' })
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  // ---------- ADMIN ----------

  @Post()
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  create(@Req() req: FastifyRequest, @Body() dto: CreatePromotionDto) {
    return this.promotions.create((req as any).user.sub, dto);
  }

  @Get()
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  list(@Query('includeInactive') includeInactive?: string) {
    return this.promotions.list(includeInactive === 'true');
  }

  @Post(':id')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  update(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotions.update((req as any).user.sub, id, dto);
  }

  @Post('featured')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  feature(@Req() req: FastifyRequest, @Body() dto: FeatureProductDto) {
    return this.promotions.feature((req as any).user.sub, dto.productId, dto.position ?? 0);
  }

  @Post('featured/:productId/remove')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  unfeature(
    @Req() req: FastifyRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.promotions.unfeature((req as any).user.sub, productId);
  }
}

/**
 * Routes publiques — validation de code promo (aucune auth) et produits
 * mis en avant pour le catalogue. Pattern PublicCatalog (Phase 3).
 */
@Controller({ path: 'promos', version: '1' })
export class PublicPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** Valide un code promo pour un montant — public, ne consomme pas l'usage. */
  @Post('validate')
  validate(@Body() dto: ValidatePromoDto) {
    return this.promotions.validate(dto);
  }

  /** Produits mis en avant (tête du catalogue) — public. */
  @Get('featured')
  featured() {
    return this.promotions.featuredPublic();
  }
}
