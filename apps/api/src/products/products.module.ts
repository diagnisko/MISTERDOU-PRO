import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { PublicCatalogController } from './public-catalog.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [PrismaModule, StorageModule, CryptoModule],
  controllers: [ProductsController, PublicCatalogController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
