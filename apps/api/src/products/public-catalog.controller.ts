import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Catalogue public — aucune authentification requise (consultation),
 * mais données filtrées : uniquement PUBLISHED, jamais de credentials/reviewNote.
 */
@Controller({ path: 'catalog', version: '1' })
export class PublicCatalogController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('platform') platform?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('seller') seller?: string,
    @Query('sort') sort?: string,
  ) {
    return this.products.listPublic({
      page: Number(page ?? 1) || 1,
      perPage: Number(perPage ?? 12) || 12,
      platform,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      sellerId: seller,
      sort,
    });
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.products.getPublic(slug);
  }
}
