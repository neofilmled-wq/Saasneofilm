import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STRIPE_CLIENT } from './stripe.provider';
import Stripe from 'stripe';
import type {
  CreateBookingDraftDto,
  CreateCheckoutDto,
  UpdateBookingScreensDto,
  PurchaseAiCreditsDto,
  CreateSubscriptionDraftDto,
} from '@neofilm/shared';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { ScreenFillService } from '../screens/screen-fill.service';

const AI_CREDITS_PACKAGES: Record<string, { credits: number; priceCents: number }> = {
  '100': { credits: 100, priceCents: 990 },
  '500': { credits: 500, priceCents: 3990 },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricingEngine: PricingEngineService,
    private readonly screenFill: ScreenFillService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  // ─── Booking Draft ───────────────────────────────────────────────────

  async createBookingDraft(orgId: string, dto: CreateBookingDraftDto) {
    const screens = await this.prisma.screen.findMany({
      where: {
        id: { in: dto.screenIds },
        status: 'ACTIVE',
      },
    });

    if (screens.length !== dto.screenIds.length) {
      const foundIds = new Set(screens.map((s) => s.id));
      const missing = dto.screenIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Screens not found or not ACTIVE: ${missing.join(', ')}`,
      );
    }

    const monthlyPriceCents = screens.reduce(
      (sum, s) => sum + s.monthlyPriceCents,
      0,
    );

    const booking = await this.prisma.booking.create({
      data: {
        status: 'DRAFT',
        advertiserOrgId: orgId,
        campaignId: dto.campaignId ?? null,
        billingCycle: dto.billingCycle,
        monthlyPriceCents,
        startDate: new Date(),
        bookingScreens: {
          create: screens.map((screen) => ({
            screenId: screen.id,
            partnerOrgId: screen.partnerOrgId,
            unitPriceCents: screen.monthlyPriceCents,
            currency: screen.currency,
          })),
        },
      },
      include: {
        bookingScreens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
    });

    return booking;
  }

  // ─── Subscription Draft (NeoFilm Pack Pricing) ─────────────────────

  async createSubscriptionDraft(orgId: string, dto: CreateSubscriptionDraftDto) {
    const { diffusionTvCount, catalogueTvCount, durationMonths, screenIds, campaignId } = dto;

    // Compute pricing via engine (validates tvCounts + duration constraint)
    const quote = this.pricingEngine.computeQuote(
      diffusionTvCount,
      catalogueTvCount,
      durationMonths,
    );

    // Determine product scope
    const productScope = diffusionTvCount && catalogueTvCount
      ? 'BOTH'
      : diffusionTvCount
        ? 'DIFFUSION'
        : 'CATALOGUE';

    // Validate screens exist and are ACTIVE
    const screens = await this.prisma.screen.findMany({
      where: { id: { in: screenIds }, status: 'ACTIVE' },
    });

    if (screens.length !== screenIds.length) {
      const foundIds = new Set(screens.map((s) => s.id));
      const missing = screenIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Screens not found or not ACTIVE: ${missing.join(', ')}`,
      );
    }

    // Check capacity (MAX 40 advertisers per screen)
    for (const screen of screens) {
      const fill = await this.prisma.screenFill.findUnique({
        where: { screenId: screen.id },
      });
      if ((fill?.activeAdvertiserCount ?? 0) >= screen.capacityMaxAdvertisers) {
        throw new BadRequestException(
          `Screen "${screen.name}" (${screen.id}) has reached capacity (${screen.capacityMaxAdvertisers} advertisers)`,
        );
      }
    }

    const monthlyAmountCents = this.pricingEngine.eurToCents(quote.totalMonthly);

    // Compute unit price per screen (prorated)
    const totalTvCount = Math.max(diffusionTvCount ?? 0, catalogueTvCount ?? 0);
    const unitPriceCentsPerScreen = totalTvCount > 0
      ? Math.round(monthlyAmountCents / totalTvCount)
      : Math.round(monthlyAmountCents / screens.length);

    const booking = await this.prisma.booking.create({
      data: {
        status: 'DRAFT',
        advertiserOrgId: orgId,
        campaignId: campaignId ?? null,
        billingCycle: 'MONTHLY',
        monthlyPriceCents: monthlyAmountCents,
        startDate: new Date(),
        // New pack pricing fields
        diffusionTvCount: diffusionTvCount ?? null,
        catalogueTvCount: catalogueTvCount ?? null,
        durationMonths,
        monthlyAmountEur: quote.totalMonthly,
        breakdown: {
          diffusionAmount: quote.diffusionMonthly ?? 0,
          catalogueAmount: quote.catalogueMonthly ?? 0,
        },
        productScope,
        bookingScreens: {
          create: screens.map((screen) => ({
            screenId: screen.id,
            partnerOrgId: screen.partnerOrgId,
            unitPriceCents: unitPriceCentsPerScreen,
            currency: screen.currency,
            productScope,
          })),
        },
      },
      include: {
        bookingScreens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
    });

    return {
      ...booking,
      quote,
    };
  }

  // ─── Get Booking Draft ───────────────────────────────────────────────

  async getBookingDraft(bookingId: string, orgId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, advertiserOrgId: orgId },
      include: {
        bookingScreens: {
          include: {
            screen: {
              select: {
                id: true,
                name: true,
                city: true,
                environment: true,
                resolution: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  // ─── Stripe Checkout ─────────────────────────────────────────────────

  async createCheckoutSession(bookingId: string, orgId: string, dto: CreateCheckoutDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, advertiserOrgId: orgId },
      include: {
        bookingScreens: {
          where: { removedAt: null },
          include: { screen: { select: { id: true, name: true } } },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'DRAFT') {
      throw new BadRequestException(
        `Booking is in ${booking.status} status, expected DRAFT`,
      );
    }

    if (booking.bookingScreens.length === 0) {
      throw new BadRequestException('Booking has no active screens');
    }

    const stripeCustomer = await this.ensureStripeCustomer(orgId);

    const billingCycle = booking.billingCycle;
    const currency = booking.currency.toLowerCase();
    const interval: Stripe.Price.Recurring.Interval = 'month';
    const intervalCount = 1;

    // Build line items — separate diffusion and catalogue if using pack pricing
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const breakdown = booking.breakdown as { diffusionAmount?: number; catalogueAmount?: number } | null;

    if (breakdown && (booking.diffusionTvCount || booking.catalogueTvCount)) {
      // Pack pricing: separate line items for diffusion and catalogue
      if (booking.diffusionTvCount && breakdown.diffusionAmount) {
        lineItems.push({
          price_data: {
            currency,
            product_data: {
              name: `NeoFilm Diffusion TV - ${booking.diffusionTvCount} TV`,
              metadata: {
                bookingId: booking.id,
                product: 'DIFFUSION',
                tvCount: String(booking.diffusionTvCount),
              },
            },
            unit_amount: this.pricingEngine.eurToCents(breakdown.diffusionAmount),
            recurring: { interval, interval_count: intervalCount },
          },
          quantity: 1,
        });
      }

      if (booking.catalogueTvCount && breakdown.catalogueAmount) {
        lineItems.push({
          price_data: {
            currency,
            product_data: {
              name: `NeoFilm Catalogue TV - ${booking.catalogueTvCount} TV`,
              metadata: {
                bookingId: booking.id,
                product: 'CATALOGUE',
                tvCount: String(booking.catalogueTvCount),
              },
            },
            unit_amount: this.pricingEngine.eurToCents(breakdown.catalogueAmount),
            recurring: { interval, interval_count: intervalCount },
          },
          quantity: 1,
        });
      }
    } else {
      // Legacy per-screen pricing
      const totalMonthlyCents = booking.bookingScreens.reduce(
        (sum, bs) => sum + bs.unitPriceCents,
        0,
      );
      const screenNames = booking.bookingScreens
        .map((bs) => bs.screen.name)
        .join(', ');

      const cycleTotalCents = billingCycle === 'YEARLY'
        ? totalMonthlyCents * 12
        : billingCycle === 'QUARTERLY'
          ? totalMonthlyCents * 3
          : totalMonthlyCents;

      lineItems.push({
        price_data: {
          currency,
          product_data: {
            name: `NeoFilm Screen Subscription`,
            description: `Screens: ${screenNames}`,
            metadata: { bookingId: booking.id },
          },
          unit_amount: cycleTotalCents,
          recurring: {
            interval: billingCycle === 'YEARLY' ? 'year' : 'month',
            interval_count: billingCycle === 'QUARTERLY' ? 3 : 1,
          },
        },
        quantity: 1,
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      metadata: {
        bookingId: booking.id,
        orgId,
        ...(booking.diffusionTvCount ? { diffusionTvCount: String(booking.diffusionTvCount) } : {}),
        ...(booking.catalogueTvCount ? { catalogueTvCount: String(booking.catalogueTvCount) } : {}),
        ...(booking.durationMonths ? { durationMonths: String(booking.durationMonths) } : {}),
        ...(booking.productScope ? { productScope: booking.productScope } : {}),
      },
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      subscription_data: {
        metadata: {
          bookingId: booking.id,
          orgId,
        },
      },
    });

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'PENDING',
        stripeCheckoutSessionId: session.id,
      },
    });

    return { sessionId: session.id, url: session.url };
  }

  // ─── Webhook: Checkout Completed ─────────────────────────────────────

  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const bookingId = session.metadata?.bookingId;
    const orgId = session.metadata?.orgId;

    if (!bookingId || !orgId) {
      this.logger.warn(
        `Checkout session ${session.id} missing bookingId or orgId in metadata`,
      );
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!stripeSubscriptionId) {
      this.logger.error(
        `Checkout session ${session.id} has no subscription ID`,
      );
      return;
    }

    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        this.logger.error(`Booking ${bookingId} not found during checkout completion`);
        return;
      }

      if (booking.status !== 'PENDING') {
        this.logger.warn(
          `Booking ${bookingId} status is ${booking.status}, expected PENDING. Skipping.`,
        );
        return;
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'ACTIVE',
          stripeSubscriptionId,
        },
      });

      const stripeCustomer = await tx.stripeCustomer.findFirst({
        where: { organizationId: orgId },
      });

      if (stripeCustomer) {
        await tx.stripeSubscription.create({
          data: {
            stripeSubscriptionId,
            status: 'ACTIVE',
            currentPeriodStart: new Date(((stripeSub as any).current_period_start ?? 0) * 1000),
            currentPeriodEnd: new Date(((stripeSub as any).current_period_end ?? 0) * 1000),
            customerId: stripeCustomer.id,
            organizationId: orgId,
            metadata: {
              bookingId,
            },
          },
        });
      }

      if (booking.campaignId) {
        await tx.campaign.update({
          where: { id: booking.campaignId },
          data: { status: 'ACTIVE' },
        });
      }
    });

    // Recalculate ScreenFill for all screens in this booking (may emit capacity_full event)
    void this.screenFill.recalculateForBooking(bookingId);

    await this.audit.log({
      action: 'CHECKOUT_COMPLETED',
      entity: 'Booking',
      entityId: bookingId,
      newData: {
        stripeSubscriptionId,
        stripeCheckoutSessionId: session.id,
        orgId,
      },
      severity: 'INFO',
    });

    this.logger.log(
      `Booking ${bookingId} activated via checkout session ${session.id}`,
    );
  }

  // ─── Cancel Subscription ─────────────────────────────────────────────

  async cancelSubscription(bookingId: string, orgId: string, userId?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, advertiserOrgId: orgId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!booking.stripeSubscriptionId) {
      throw new BadRequestException('Booking has no active Stripe subscription');
    }

    if (booking.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot cancel booking in ${booking.status} status`,
      );
    }

    await this.stripe.subscriptions.update(booking.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const localSub = await this.prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId: booking.stripeSubscriptionId },
    });

    if (localSub) {
      await this.prisma.stripeSubscription.update({
        where: { id: localSub.id },
        data: { cancelAtPeriodEnd: true },
      });
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { autoRenew: false },
    });

    await this.audit.log({
      action: 'SUBSCRIPTION_CANCEL_REQUESTED',
      entity: 'Booking',
      entityId: bookingId,
      userId,
      newData: {
        stripeSubscriptionId: booking.stripeSubscriptionId,
        cancelAtPeriodEnd: true,
      },
      severity: 'WARN',
    });

    return { message: 'Subscription will be cancelled at end of current period' };
  }

  // ─── Update Booking Screens Mid-Cycle ────────────────────────────────

  async updateBookingScreens(
    bookingId: string,
    orgId: string,
    dto: UpdateBookingScreensDto,
    userId?: string,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, advertiserOrgId: orgId },
      include: {
        bookingScreens: { where: { removedAt: null } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot update screens on booking in ${booking.status} status`,
      );
    }

    if (!booking.stripeSubscriptionId) {
      throw new BadRequestException('Booking has no active Stripe subscription');
    }

    const addScreenIds = dto.addScreenIds ?? [];
    const removeScreenIds = dto.removeScreenIds ?? [];

    if (addScreenIds.length === 0 && removeScreenIds.length === 0) {
      throw new BadRequestException('Provide addScreenIds or removeScreenIds');
    }

    // Validate screens to add
    let screensToAdd: Array<{
      id: string;
      monthlyPriceCents: number;
      partnerOrgId: string;
      currency: string;
    }> = [];

    if (addScreenIds.length > 0) {
      screensToAdd = await this.prisma.screen.findMany({
        where: { id: { in: addScreenIds }, status: 'ACTIVE' },
        select: {
          id: true,
          monthlyPriceCents: true,
          partnerOrgId: true,
          currency: true,
        },
      });

      if (screensToAdd.length !== addScreenIds.length) {
        const foundIds = new Set(screensToAdd.map((s) => s.id));
        const missing = addScreenIds.filter((id) => !foundIds.has(id));
        throw new BadRequestException(
          `Screens not found or not ACTIVE: ${missing.join(', ')}`,
        );
      }

      const existingScreenIds = new Set(
        booking.bookingScreens.map((bs) => bs.screenId),
      );
      const duplicates = addScreenIds.filter((id) => existingScreenIds.has(id));
      if (duplicates.length > 0) {
        throw new ConflictException(
          `Screens already on booking: ${duplicates.join(', ')}`,
        );
      }
    }

    // Validate screens to remove
    if (removeScreenIds.length > 0) {
      const activeScreenIds = new Set(
        booking.bookingScreens.map((bs) => bs.screenId),
      );
      const notOnBooking = removeScreenIds.filter(
        (id) => !activeScreenIds.has(id),
      );
      if (notOnBooking.length > 0) {
        throw new BadRequestException(
          `Screens not found on booking: ${notOnBooking.join(', ')}`,
        );
      }
    }

    // Apply changes in a transaction
    await this.prisma.$transaction(async (tx) => {
      if (screensToAdd.length > 0) {
        await tx.bookingScreen.createMany({
          data: screensToAdd.map((screen) => ({
            bookingId,
            screenId: screen.id,
            partnerOrgId: screen.partnerOrgId,
            unitPriceCents: screen.monthlyPriceCents,
            currency: screen.currency,
          })),
        });
      }

      if (removeScreenIds.length > 0) {
        await tx.bookingScreen.updateMany({
          where: {
            bookingId,
            screenId: { in: removeScreenIds },
            removedAt: null,
          },
          data: { removedAt: new Date() },
        });
      }
    });

    // Recalculate monthly total from active booking screens
    const activeBookingScreens = await this.prisma.bookingScreen.findMany({
      where: { bookingId, removedAt: null },
    });

    const newMonthlyTotal = activeBookingScreens.reduce(
      (sum, bs) => sum + bs.unitPriceCents,
      0,
    );

    if (activeBookingScreens.length === 0) {
      throw new BadRequestException(
        'Cannot remove all screens from an active booking. Cancel the subscription instead.',
      );
    }

    // Update Stripe subscription with new price
    const stripeSub = await this.stripe.subscriptions.retrieve(
      booking.stripeSubscriptionId,
    );

    const subscriptionItemId = stripeSub.items.data[0]?.id;
    if (!subscriptionItemId) {
      throw new BadRequestException('Stripe subscription has no items');
    }

    const billingCycle = booking.billingCycle;
    const cycleTotalCents =
      billingCycle === 'YEARLY'
        ? newMonthlyTotal * 12
        : billingCycle === 'QUARTERLY'
          ? newMonthlyTotal * 3
          : newMonthlyTotal;

    const intervalMap: Record<string, Stripe.Price.Recurring.Interval> = {
      MONTHLY: 'month',
      QUARTERLY: 'month',
      YEARLY: 'year',
    };
    const intervalCountMap: Record<string, number> = {
      MONTHLY: 1,
      QUARTERLY: 3,
      YEARLY: 1,
    };

    const newPrice = await this.stripe.prices.create({
      currency: booking.currency.toLowerCase(),
      unit_amount: cycleTotalCents,
      recurring: {
        interval: intervalMap[billingCycle],
        interval_count: intervalCountMap[billingCycle],
      },
      product: stripeSub.items.data[0].price.product as string,
    });

    await this.stripe.subscriptions.update(booking.stripeSubscriptionId, {
      items: [
        {
          id: subscriptionItemId,
          price: newPrice.id,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { monthlyPriceCents: newMonthlyTotal },
    });

    await this.audit.log({
      action: 'BOOKING_SCREENS_UPDATED',
      entity: 'Booking',
      entityId: bookingId,
      userId,
      newData: {
        addedScreenIds: addScreenIds,
        removedScreenIds: removeScreenIds,
        newMonthlyTotal,
      },
      severity: 'INFO',
    });

    return this.getBookingDraft(bookingId, orgId);
  }

  // ─── AI Credits Purchase ─────────────────────────────────────────────

  async purchaseAiCredits(orgId: string, dto: PurchaseAiCreditsDto, userId?: string) {
    const pack = AI_CREDITS_PACKAGES[dto.creditsPackage];
    if (!pack) {
      throw new BadRequestException(`Invalid credits package: ${dto.creditsPackage}`);
    }

    const stripeCustomer = await this.ensureStripeCustomer(orgId);

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `NeoFilm AI Credits - ${pack.credits} credits`,
              metadata: {
                orgId,
                credits: String(pack.credits),
              },
            },
            unit_amount: pack.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'ai_credits',
        orgId,
        credits: String(pack.credits),
      },
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
    });

    await this.audit.log({
      action: 'AI_CREDITS_CHECKOUT_CREATED',
      entity: 'AIWallet',
      entityId: orgId,
      userId,
      newData: {
        credits: pack.credits,
        priceCents: pack.priceCents,
        sessionId: session.id,
      },
      severity: 'INFO',
    });

    return { sessionId: session.id, url: session.url };
  }

  // ─── Ensure Stripe Customer ──────────────────────────────────────────

  async ensureStripeCustomer(orgId: string) {
    const existing = await this.prisma.stripeCustomer.findFirst({
      where: { organizationId: orgId },
    });

    if (existing) {
      return existing;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const stripeCustomer = await this.stripe.customers.create({
      name: org.name,
      email: org.contactEmail,
      metadata: {
        orgId: org.id,
        orgType: org.type,
      },
    });

    const customer = await this.prisma.stripeCustomer.create({
      data: {
        stripeCustomerId: stripeCustomer.id,
        organizationId: orgId,
        name: org.name,
        email: org.contactEmail,
      },
    });

    this.logger.log(
      `Created Stripe customer ${stripeCustomer.id} for org ${orgId}`,
    );

    return customer;
  }
}
