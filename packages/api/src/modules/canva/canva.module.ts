import { Module } from '@nestjs/common';
import { CanvaController } from './canva.controller';
import { CanvaService } from './canva.service';
import { CanvaCryptoService } from './canva-crypto.service';

@Module({
  controllers: [CanvaController],
  providers: [CanvaService, CanvaCryptoService],
  exports: [CanvaService],
})
export class CanvaModule {}
