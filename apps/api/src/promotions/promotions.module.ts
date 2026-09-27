import { Module } from '@nestjs/common';
import {
  PromotionsController,
  PublicPromotionsController,
} from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PromotionsController, PublicPromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
