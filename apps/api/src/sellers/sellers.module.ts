import { Module } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { PublicShopsController } from './public-shops.controller';
import { SellersService } from './sellers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SellersController, PublicShopsController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
