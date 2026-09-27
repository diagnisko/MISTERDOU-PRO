import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class ApplySellerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  shopName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ReviewSellerDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RequestWithdrawalDto {
  @IsInt()
  @Min(1000)
  amount!: number; // FCFA

  @IsIn(['WAVE', 'OM', 'BANK'])
  method!: 'WAVE' | 'OM' | 'BANK';

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  destination!: string; // numéro Wave/OM ou IBAN
}

export class ReviewWithdrawalDto {
  @IsIn(['PAID', 'REJECTED'])
  decision!: 'PAID' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
