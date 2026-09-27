import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated';

@Injectable()
export class PrismaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly _client = new PrismaClient();

  async onModuleInit() {
    await this._client.$connect();
  }

  async onModuleDestroy() {
    await this._client.$disconnect();
  }

  get client(): PrismaClient {
    return this._client;
  }
}
