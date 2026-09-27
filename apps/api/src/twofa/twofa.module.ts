import { Module } from '@nestjs/common';
import { TwoFaController } from './twofa.controller';
import { TwoFaService } from './twofa.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TwoFaController],
  providers: [TwoFaService],
  exports: [TwoFaService],
})
export class TwoFaModule {}
