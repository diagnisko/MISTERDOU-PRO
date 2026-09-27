import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  /**
   * Identifiants des offres publiées. Chaque offre = 1 exemplaire unique
   * (compte eFootball), donc quantity implicite = 1 par ligne.
   */
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  items!: string[];
}
