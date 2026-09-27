import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string; // sera stocké en MAJUSCULES

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  label!: string;

  @IsIn(['PERCENT', 'FIXED'])
  discountType!: 'PERCENT' | 'FIXED';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue!: number; // PERCENT: 0-90 ; FIXED: FCFA

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number;

  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  productIds?: string[]; // restriction à certaines offres
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class ValidatePromoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderAmount!: number;
}

export class FeatureProductDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  position?: number;
}
