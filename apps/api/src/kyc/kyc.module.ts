import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, JwtModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
