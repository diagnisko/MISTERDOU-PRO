import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Options de financement MISTERDOU — offres ADMIN uniquement. */
export const INSTALLMENT_OPTIONS = {
  2: 0.3, // 2 mois → apport 30 %, puis 2 mensualités
  3: 0.3, // 3 mois → apport 30 %, puis 3 mensualités
  4: 0.4, // 4 mois → apport 40 %, puis 4 mensualités
} as const;

export class CreateInstallmentPlanDto {
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  productIds!: string[]; // offres ADMIN_ACCOUNT uniquement

  @Type(() => Number)
  @IsInt()
  @IsIn([2, 3, 4])
  months!: 2 | 3 | 4;
}

export class PayInstallmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  note?: string;
}
