import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Message body' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
