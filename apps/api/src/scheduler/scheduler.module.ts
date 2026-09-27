import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { InstallmentsModule } from '../installments/installments.module';

@Module({
  imports: [PrismaModule, OrdersModule, InstallmentsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
