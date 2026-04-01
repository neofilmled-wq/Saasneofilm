import { IsString, IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ExportFormat {
  PNG = 'png',
  JPG = 'jpg',
  MP4 = 'mp4',
}

export class ExportDesignDto {
  @ApiProperty({ enum: ExportFormat, example: 'png' })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiProperty({ required: false, example: 'horizontal_1080p', description: 'Quality preset for MP4' })
  @IsString()
  @IsOptional()
  quality?: string;

  @ApiProperty({ required: false, example: 1920 })
  @IsInt()
  @Min(40)
  @Max(25000)
  @IsOptional()
  width?: number;

  @ApiProperty({ required: false, example: 1080 })
  @IsInt()
  @Min(40)
  @Max(25000)
  @IsOptional()
  height?: number;

  @ApiProperty({ required: false, description: 'Campaign ID to attach the exported creative to' })
  @IsString()
  @IsOptional()
  campaignId?: string;
}
