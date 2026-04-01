import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { CsvService } from './csv.service';
import { InvoiceExportService } from './invoice-export.service';
import { PayoutExportService } from './payout-export.service';
import { JournalExportService } from './journal-export.service';

@Module({
  controllers: [ExportsController],
  providers: [CsvService, InvoiceExportService, PayoutExportService, JournalExportService],
  exports: [CsvService, InvoiceExportService, PayoutExportService, JournalExportService],
})
export class ExportsModule {}
