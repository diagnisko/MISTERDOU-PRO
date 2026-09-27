import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KycModule } from './kyc/kyc.module';
import { StorageModule } from './storage/storage.module';
import { CryptoModule } from './crypto/crypto.module';
import { ProductsModule } from './products/products.module';
import { SellersModule } from './sellers/sellers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { InstallmentsModule } from './installments/installments.module';
import { AdminModule } from './admin/admin.module';
import { SupportModule } from './support/support.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PromotionsModule } from './promotions/promotions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([
      {
        // Limite globale : RATE_LIMIT_GLOBAL_MAX req/min (défaut 100)
        ttl: 60_000,
        limit: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 100),
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    StorageModule,
    KycModule,
    CryptoModule,
    ProductsModule,
    SellersModule,
    OrdersModule,
    PaymentsModule,
    InstallmentsModule,
    AdminModule,
    SupportModule,
    NotificationsModule,
    PromotionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
