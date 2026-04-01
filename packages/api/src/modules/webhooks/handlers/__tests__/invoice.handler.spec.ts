import { InvoiceHandler } from '../invoice.handler';

describe('InvoiceHandler', () => {
  let handler: InvoiceHandler;
  let mockPrisma: any;
  let mockAudit: any;
  let mockAdminGateway: any;
  let mockPartnerGateway: any;
  let mockAdvertiserGateway: any;

  const STRIPE_INVOICE_ID = 'in_test_123';
  const STRIPE_CUSTOMER_ID = 'cus_test_456';
  const STRIPE_SUBSCRIPTION_ID = 'sub_test_789';
  const BOOKING_ID = 'booking-001';
  const SCREEN_ID = 'screen-001';
  const ADVERTISER_ORG_ID = 'org-advertiser';
  const PARTNER_ORG_ID = 'org-partner';

  function createMockInvoice(overrides: any = {}): any {
    return {
      id: STRIPE_INVOICE_ID,
      customer: STRIPE_CUSTOMER_ID,
      number: 'INV-001',
      amount_due: 21340,
      amount_paid: 21340,
      currency: 'eur',
      period_start: Math.floor(Date.now() / 1000),
      period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      due_date: null,
      hosted_invoice_url: 'https://stripe.com/invoice',
      invoice_pdf: 'https://stripe.com/invoice.pdf',
      subscription: STRIPE_SUBSCRIPTION_ID,
      lines: { data: [] },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma = {
      stripeCustomer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'db-customer-1',
          stripeCustomerId: STRIPE_CUSTOMER_ID,
          organizationId: ADVERTISER_ORG_ID,
        }),
      },
      stripeInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'db-invoice-1', stripeInvoiceId: STRIPE_INVOICE_ID }),
        upsert: jest.fn().mockResolvedValue({ id: 'db-invoice-1' }),
        update: jest.fn().mockResolvedValue({ id: 'db-invoice-1' }),
      },
      stripeSubscription: {
        findUnique: jest.fn().mockResolvedValue({ id: 'db-sub-1', stripeSubscriptionId: STRIPE_SUBSCRIPTION_ID }),
        update: jest.fn().mockResolvedValue({}),
      },
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: BOOKING_ID,
          advertiserOrgId: ADVERTISER_ORG_ID,
          campaignId: 'campaign-1',
          status: 'ACTIVE',
          monthlyAmountEur: 213.40,
          campaign: { id: 'campaign-1', status: 'ACTIVE' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      bookingScreen: {
        findMany: jest.fn().mockResolvedValue([
          {
            screenId: SCREEN_ID,
            screen: { id: SCREEN_ID, partnerOrgId: PARTNER_ORG_ID },
            booking: { advertiserOrgId: ADVERTISER_ORG_ID },
          },
        ]),
      },
      screenFill: {
        upsert: jest.fn().mockResolvedValue({ screenId: SCREEN_ID, activeAdvertiserCount: 5 }),
        findUnique: jest.fn().mockResolvedValue({ screenId: SCREEN_ID, activeAdvertiserCount: 5 }),
      },
      campaign: {
        update: jest.fn().mockResolvedValue({}),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }]),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockAdminGateway = {
      emitFinanceUpdate: jest.fn(),
      emitScreenFillUpdate: jest.fn(),
    };

    mockPartnerGateway = {
      emitWalletUpdate: jest.fn(),
      emitScreenFillUpdate: jest.fn(),
    };

    mockAdvertiserGateway = {
      emitSubscriptionUpdate: jest.fn(),
      emitScreenFillUpdate: jest.fn(),
    };

    handler = new InvoiceHandler(
      mockPrisma,
      mockAudit,
      mockAdminGateway,
      mockPartnerGateway,
      mockAdvertiserGateway,
    );
  });

  // ─── invoice.paid ─────────────────────────────────────────────────────────

  describe('handleInvoicePaid', () => {
    it('updates invoice to PAID and logs audit', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaid(invoice);

      expect(mockPrisma.stripeInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeInvoiceId: STRIPE_INVOICE_ID },
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_PAID',
          entity: 'Booking',
          entityId: BOOKING_ID,
        }),
      );
    });

    it('recalculates screen fills after payment', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaid(invoice);

      expect(mockPrisma.screenFill.upsert).toHaveBeenCalled();
    });

    it('emits realtime events to all interfaces', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaid(invoice);

      // Advertiser subscription update
      expect(mockAdvertiserGateway.emitSubscriptionUpdate).toHaveBeenCalledWith(
        ADVERTISER_ORG_ID,
        expect.objectContaining({ bookingId: BOOKING_ID }),
      );

      // Admin finance update
      expect(mockAdminGateway.emitFinanceUpdate).toHaveBeenCalled();

      // Screen fill updates
      expect(mockAdminGateway.emitScreenFillUpdate).toHaveBeenCalledWith(SCREEN_ID, expect.any(Number), 40);
      expect(mockAdvertiserGateway.emitScreenFillUpdate).toHaveBeenCalledWith(SCREEN_ID, expect.any(Number), 40);

      // Partner events
      expect(mockPartnerGateway.emitWalletUpdate).toHaveBeenCalledWith(PARTNER_ORG_ID);
      expect(mockPartnerGateway.emitScreenFillUpdate).toHaveBeenCalledWith(
        PARTNER_ORG_ID, SCREEN_ID, expect.any(Number), 40,
      );
    });

    it('creates invoice first if not found in database', async () => {
      mockPrisma.stripeInvoice.findUnique.mockResolvedValueOnce(null);
      const invoice = createMockInvoice();

      await handler.handleInvoicePaid(invoice);

      // Should upsert (from handleInvoiceCreated) then update
      expect(mockPrisma.stripeInvoice.upsert).toHaveBeenCalled();
      expect(mockPrisma.stripeInvoice.update).toHaveBeenCalled();
    });

    it('skips booking logic when no subscription linked', async () => {
      const invoice = createMockInvoice({ subscription: undefined });

      await handler.handleInvoicePaid(invoice);

      expect(mockPrisma.stripeSubscription.findUnique).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });

  // ─── invoice.payment_failed ───────────────────────────────────────────────

  describe('handleInvoicePaymentFailed', () => {
    it('marks subscription as PAST_DUE and pauses booking', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockPrisma.stripeSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAST_DUE' },
        }),
      );

      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAUSED' },
        }),
      );
    });

    it('pauses active campaign', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAUSED' },
        }),
      );
    });

    it('creates payment failure notifications for org admins', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              type: 'PAYMENT_FAILED',
              userId: 'user-1',
            }),
          ]),
        }),
      );
    });

    it('recalculates screen fills and emits events', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockPrisma.screenFill.upsert).toHaveBeenCalled();
      expect(mockAdminGateway.emitScreenFillUpdate).toHaveBeenCalled();
      expect(mockAdvertiserGateway.emitSubscriptionUpdate).toHaveBeenCalledWith(
        ADVERTISER_ORG_ID,
        expect.objectContaining({ status: 'PAUSED' }),
      );
      expect(mockAdminGateway.emitFinanceUpdate).toHaveBeenCalled();
    });

    it('logs audit with WARN severity', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_PAYMENT_FAILED',
          severity: 'WARN',
        }),
      );
    });

    it('skips when no subscription linked', async () => {
      const invoice = createMockInvoice({ subscription: undefined });
      await handler.handleInvoicePaymentFailed(invoice);

      expect(mockPrisma.stripeSubscription.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.booking.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── invoice.created ──────────────────────────────────────────────────────

  describe('handleInvoiceCreated', () => {
    it('upserts invoice with DRAFT status', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoiceCreated(invoice);

      expect(mockPrisma.stripeInvoice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeInvoiceId: STRIPE_INVOICE_ID },
          create: expect.objectContaining({
            status: 'DRAFT',
            amountDueCents: 21340,
          }),
        }),
      );
    });

    it('skips when customer not found', async () => {
      mockPrisma.stripeCustomer.findUnique.mockResolvedValue(null);
      const invoice = createMockInvoice();

      await handler.handleInvoiceCreated(invoice);

      expect(mockPrisma.stripeInvoice.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── invoice.finalized ────────────────────────────────────────────────────

  describe('handleInvoiceFinalized', () => {
    it('updates invoice to OPEN status', async () => {
      const invoice = createMockInvoice();
      await handler.handleInvoiceFinalized(invoice);

      expect(mockPrisma.stripeInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'OPEN' }),
        }),
      );
    });
  });
});
