import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PresignKycDocDto {
  @IsIn(['doc-front', 'doc-back', 'selfie'])
  docKind!: 'doc-front' | 'doc-back' | 'selfie';

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}

export class SubmitKycDto {
  @IsIn(['CNI', 'PASSPORT', 'PERMIS_CONDUIRE'])
  docType!: 'CNI' | 'PASSPORT' | 'PERMIS_CONDUIRE';

  @IsString()
  @MaxLength(64)
  docNumber!: string;
}

export class ReviewKycDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
