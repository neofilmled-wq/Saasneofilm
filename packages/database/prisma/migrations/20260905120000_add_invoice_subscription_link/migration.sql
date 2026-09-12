-- AlterTable: link an invoice to the subscription it bills, so partner
-- retrocessions can be gated on the paid invoice of the right booking.
ALTER TABLE "stripe_invoices" ADD COLUMN "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "stripe_invoices_stripeSubscriptionId_idx" ON "stripe_invoices"("stripeSubscriptionId");
