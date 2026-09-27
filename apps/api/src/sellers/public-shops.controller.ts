import { Controller, Get, Param } from '@nestjs/common';
import { SellersService } from './sellers.service';

/**
 * Boutiques publiques — consultation libre (aucune auth),
 * vendeurs APPROVED et produits PUBLISHED uniquement.
 */
@Controller({ path: 'shops', version: '1' })
export class PublicShopsController {
  constructor(private readonly sellers: SellersService) {}

  @Get(':slug')
  shop(@Param('slug') slug: string) {
    return this.sellers.publicShop(slug);
  }
}
