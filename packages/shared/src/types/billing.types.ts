import { InvoiceStatus } from '../enums';

export interface IInvoice {
  id: string;
  invoiceNumber: string;
  type: 'ADVERTISER_CHARGE' | 'PARTNER_PAYOUT';
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date;
  paidAt?: Date;
  advertiserId?: string;
  partnerId?: string;
  createdAt: Date;
  updatedAt: Date;
}
