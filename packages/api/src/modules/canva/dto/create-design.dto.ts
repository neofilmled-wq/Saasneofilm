import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDesignDto {
  @ApiProperty({ example: 'Pub cinéma été 2026' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 1920, description: 'Width in pixels (40-8000)' })
  @IsInt()
  @Min(40)
  @Max(8000)
  width!: number;

  @ApiProperty({ example: 1080, description: 'Height in pixels (40-8000)' })
  @IsInt()
  @Min(40)
  @Max(8000)
  height!: number;

  @ApiProperty({ required: false, example: 'Optional campaign ID to link' })
  @IsString()
  @IsOptional()
  campaignId?: string;
}
