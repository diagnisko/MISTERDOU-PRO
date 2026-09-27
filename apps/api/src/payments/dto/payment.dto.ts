import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Canaux de paiement présentés au client — Wave et Orange Money.
 * L'agrégateur PayTech reste strictement en coulisses : le terme n'apparaît
 * jamais dans les échanges avec le client (API comme interface web).
 */
export class InitiatePaymentDto {
  @IsIn(['WAVE', 'OM'])
  channel!: 'WAVE' | 'OM';
}

export class InitiateInstallmentDto {
  @IsIn(['WAVE', 'OM'])
  channel!: 'WAVE' | 'OM';
}

export class PayInstallmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  note?: string;
}

export class CreateOrderDtoPlaceholder {
  @Type(() => Number)
  @IsInt()
  placeholder!: number;
}
