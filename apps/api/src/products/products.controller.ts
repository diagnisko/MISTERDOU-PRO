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
import { ProductsService } from './products.service';
import {
  ConfirmMediaDto,
  CreateProductDto,
  PresignMediaDto,
  ReviewProductDto,
  SetCredentialsDto,
} from './dto/product.dto';
import { FastifyRequest } from 'fastify';

@Controller({ path: 'products', version: '1' })
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // ---------- PUBLIC (auth requise pour lister/detail ? non — public) ----------
  // Note : le guard ici protège les routes ci-dessous ; le listing public est
  // ouvert via un contrôleur dédié ci-dessous (PublicCatalogController).

  // ---------- ADMIN / VENDEUR ----------

  @Post()
  @Roles('ADMIN', 'SELLER')
  create(@Req() req: FastifyRequest, @Body() dto: CreateProductDto) {
    return this.products.create(
      (req as any).user.sub,
      (req as any).user.role,
      dto,
    );
  }

  @Post(':id/credentials')
  @Roles('ADMIN', 'SELLER')
  setCredentials(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCredentialsDto,
  ) {
    return this.products.setCredentials(
      (req as any).user.sub,
      (req as any).user.role,
      id,
      dto,
    );
  }

  @Post(':id/media/presign')
  @Roles('ADMIN', 'SELLER')
  presignMedia(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PresignMediaDto,
  ) {
    return this.products.presignMedia(
      (req as any).user.sub,
      (req as any).user.role,
      id,
      dto.mediaType,
      dto.contentType,
      dto.contentLength,
    );
  }

  @Post(':id/media/confirm')
  @Roles('ADMIN', 'SELLER')
  confirmMedia(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMediaDto,
  ) {
    return this.products.confirmMedia(
      (req as any).user.sub,
      (req as any).user.role,
      id,
      dto.objectKey,
      dto.isCover,
    );
  }

  // ---------- ADMIN/STAFF : workflow ----------

  @Post(':id/publish')
  @Roles('ADMIN')
  publish(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.publish((req as any).user.sub, id);
  }

  @Post(':id/review')
  @Roles('ADMIN', 'STAFF')
  review(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProductDto,
  ) {
    return this.products.review(
      id,
      (req as any).user.sub,
      dto.decision,
      dto.reviewNote,
    );
  }
}
