import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SellersService } from './sellers.service';

/**
 * Boutiques publiques — consultation libre (aucune auth),
 * vendeurs APPROVED et produits PUBLISHED uniquement.
 */
@Controller({ path: 'shops', version: '1' })
@UseGuards(RolesGuard)
export class PublicShopsController {
  constructor(private readonly sellers: SellersService) {}

  @Get(':slug')
  @Roles('PUBLIC')
  shop(@Param('slug') slug: string) {
    return this.sellers.publicShop(slug);
  }
}
