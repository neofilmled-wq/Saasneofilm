# NEOFILM SAAS — Billing & Revenue-Sharing Architecture

> **Version**: 1.0
> **Date**: 2026-02-25
> **Status**: Design specification — implementation-ready
> **Audience**: Engineering team, finance stakeholders, auditors

---

## Table of Contents

1. [Products & Billing Model](#1-products--billing-model)
2. [Stripe Architecture](#2-stripe-architecture)
3. [Payment Workflows](#3-payment-workflows)
4. [Revenue Sharing & Distribution Algorithms](#4-revenue-sharing--distribution-algorithms)
5. [VAT / Tax Handling](#5-vat--tax-handling)
6. [Invoices, Accounting Exports & Reconciliation](#6-invoices-accounting-exports--reconciliation)
7. [Fraud Prevention & Financial Integrity](#7-fraud-prevention--financial-integrity)
8. [Prisma Schema (Billing + Revenue Module)](#8-prisma-schema-billing--revenue-module)
9. [Security Model](#9-security-model)
10. [Testing Scenarios](#10-testing-scenarios)

---

## 1. Products & Billing Model

### 1.1 Commercial Products Catalog

| Product | Type | Stripe Object | Billing Model |
|---------|------|---------------|---------------|
| **Ad Pack — Premium** | Subscription | Product + recurring Price | Monthly subscription |
| **Ad Pack — Standard** | Subscription | Product + recurring Price | Monthly subscription |
| **Catalog Listing Add-on** | Subscription | Product + recurring Price | Monthly add-on (subscription item) |
| **Sponsored Placement Add-on** | Subscription | Product + recurring Price | Monthly add-on (subscription item) |
| **AI Credits Top-up** | One-time | Product + one-time Price | Single charge via Checkout |
| **Usage-based Impressions** (future) | Metered | Product + metered Price | Usage records per billing period |

### 1.2 Ad Pack Pricing Matrix

Packs are pre-defined screen bundles. Each combination of **pack size × tier** maps to a single Stripe Price.

| Pack | Screen Count | Premium (EUR/mo) | Standard (EUR/mo) |
|------|-------------|-------------------|--------------------|
| S | 50 | Configurable | Configurable |
| M | 100 | Configurable | Configurable |
| L | 150 | Configurable | Configurable |
| XL | 200 | Configurable | Configurable |
| XXL | 300 | Configurable | Configurable |
| Custom | N (user selects) | SUM(screen.unitPrice) | SUM(screen.unitPrice × 0.8) |

**Design decision — One Product per Tier, One Price per Pack Size:**

```
Product: "Ad Pack — Premium"
  └── Price: "premium-50"   → 499_00 EUR/mo (recurring)
  └── Price: "premium-100"  → 899_00 EUR/mo (recurring)
  └── Price: "premium-150"  → 1249_00 EUR/mo (recurring)
  └── Price: "premium-200"  → 1549_00 EUR/mo (recurring)
  └── Price: "premium-300"  → 2099_00 EUR/mo (recurring)

Product: "Ad Pack — Standard"
  └── Price: "standard-50"  → 349_00 EUR/mo (recurring)
  └── Price: "standard-100" → 649_00 EUR/mo (recurring)
  ... (same pattern)

Product: "Ad Pack — Custom"
  └── Price: created dynamically per booking (ad hoc price)
```

**Justification**: Fixed products with fixed prices keeps Stripe dashboard clean, enables easy price analysis in Stripe Revenue reports, and simplifies webhook handling. Custom packs use dynamically-created prices with the amount calculated server-side from `SUM(BookingScreen.unitPriceCents)`.

### 1.3 Add-ons

| Add-on | Stripe Model | Notes |
|--------|-------------|-------|
| Catalog Listing | Additional `SubscriptionItem` on existing subscription | Added/removed via Subscription update |
| Sponsored Placement | Additional `SubscriptionItem` on existing subscription | Added/removed via Subscription update |
| AI Credits (100 pack) | Separate one-time Checkout Session | Creates `AITransaction` of type RECHARGE |
| AI Credits (500 pack) | Separate one-time Checkout Session | Same flow, different Price |

### 1.4 Usage-Based Billing (Future)

For impression-based billing:

```
Product: "Impression Metered Billing"
  └── Price: metered, EUR per 1000 impressions, billed monthly

Usage reporting flow:
1. DiffusionLog entries are aggregated daily per subscription
2. Background job calls Stripe API: stripe.subscriptionItems.createUsageRecord()
3. Stripe aggregates at period end and adds to invoice
```

The existing `DiffusionLog` table with `verified` flag serves as the source of truth for usage events.

### 1.5 Booking Snapshot — What Gets Stored at Purchase

When an advertiser completes a purchase, a **Booking** is created as an immutable commercial snapshot:

```
Booking
├── monthlyPriceCents     = total subscription amount
├── currency              = "EUR"
├── billingCycle          = MONTHLY
├── stripeSubscriptionId  = "sub_xxx"
├── advertiserOrgId       = advertiser org
├── campaignId            = linked campaign (optional)
└── BookingScreen[] (one per selected screen)
    ├── unitPriceCents    = screen price frozen at purchase time
    ├── screenId          = the screen
    └── partnerOrgId      = screen owner (for revenue split)
```

This design ensures:
- Revenue calculations use **purchase-time prices**, not current catalog prices
- Historical audits always reflect what was actually charged
- Partner shares are traceable to specific booking line items

---

## 2. Stripe Architecture

### 2.1 Stripe Object Mapping Table

| Internal Model (Prisma) | Stripe Object | Cardinality | Sync Direction |
|-------------------------|---------------|-------------|----------------|
| `Organization` (ADVERTISER) | `Customer` | 1:1 | DB ← Stripe (via webhook) |
| `StripeCustomer` | `Customer` | 1:1 mirror | DB ← Stripe |
| `StripeSubscription` | `Subscription` | 1:N per Customer | DB ← Stripe |
| `StripeInvoice` | `Invoice` | 1:N per Subscription | DB ← Stripe |
| `StripePayment` | `PaymentIntent` | 1:N per Invoice | DB ← Stripe |
| `Booking` | — (internal only) | 1:1 to Subscription | — |
| `BookingScreen` | — (internal only) | N per Booking | — |
| `Organization` (PARTNER) | `Connect Account` | 1:1 | DB ← Stripe |
| `PartnerPayoutProfile` | `Connect Account` details | 1:1 | DB ← Stripe |
| `Payout` | `Transfer` + `Payout` | 1:1 | DB → Stripe → DB |
| `StripeWebhookEvent` | `Event` | 1:1 log | DB ← Stripe |
| `AITransaction` (RECHARGE) | `PaymentIntent` (one-off) | 1:1 | DB ← Stripe |

### 2.2 Customer Mapping

```
advertiserOrg.id ──→ StripeCustomer.organizationId
                     StripeCustomer.stripeCustomerId ──→ Stripe Customer cus_xxx

Creation flow:
1. When advertiser org is created, call stripe.customers.create({ metadata: { orgId } })
2. Store stripeCustomerId on Organization.stripeCustomerId
3. Create StripeCustomer record linking back

Metadata stored on Stripe Customer:
{
  "orgId": "clxyz...",
  "orgName": "Acme Ads",
  "orgType": "ADVERTISER",
  "environment": "production"
}
```

### 2.3 Subscription Lifecycle

#### Trial Support
```
Subscription creation options:
  trial_period_days: 14  (configurable per product)
  trial_end: timestamp   (or explicit date)

During trial:
  - Booking status: ACTIVE
  - Campaign can run
  - No invoice generated
  - StripeSubscription.status = TRIALING

Trial end:
  - Stripe auto-generates first invoice
  - If payment succeeds → ACTIVE
  - If payment fails → INCOMPLETE → dunning flow
```

#### Proration Rules
```
Policy: PRORATE on upgrade, CREATE_PRORATIONS on downgrade

When advertiser changes screens mid-cycle:
  proration_behavior: "create_prorations"

  Stripe automatically:
  1. Calculates remaining days on old price
  2. Credits unused portion
  3. Charges new prorated amount
  4. Next invoice reflects the change

Internal handling:
  - Create new BookingScreen records for added screens
  - Mark removed BookingScreen records with removedAt timestamp
  - Keep historical BookingScreen records for revenue audit
  - Update Booking.monthlyPriceCents to new total
```

#### Cancellation Rules
```
Policy: Cancel at period end (no immediate cancellation)

stripe.subscriptions.update(subId, {
  cancel_at_period_end: true
})

Effects:
  - StripeSubscription.cancelAtPeriodEnd = true
  - Booking remains ACTIVE until period ends
  - Campaign keeps running until period ends
  - At period end: Stripe fires customer.subscription.deleted
  - → Booking.status = CANCELLED
  - → Campaign.status = COMPLETED (if no other bookings)

Immediate cancellation (admin only):
  - stripe.subscriptions.cancel(subId)
  - Refund policy: prorated credit note
```

#### Dunning Rules (configured in Stripe Dashboard)
```
Smart Retries: ENABLED
Retry schedule:
  Day 0:  payment_intent.payment_failed → mark PAST_DUE
  Day 3:  automatic retry #1
  Day 5:  automatic retry #2
  Day 7:  automatic retry #3 (final)
  Day 7+: if still failed → mark subscription UNPAID

Internal reaction:
  PAST_DUE → Campaign.status = PAUSED (auto-pause)
  UNPAID   → Campaign.status = PAUSED, Booking.status = PAUSED

Recovery:
  payment_intent.succeeded → Campaign.status = ACTIVE (auto-resume, policy-based)
```

### 2.4 Stripe Connect for Partners

#### Account Type: Express

```
Chosen: Express accounts
Reason: Minimal integration burden, Stripe handles KYC/identity verification,
        partners get a Stripe-hosted dashboard for payout history

Alternative considered: Custom accounts (rejected: too much compliance overhead)
```

#### Onboarding Flow

```
Sequence:
1. Partner admin clicks "Connect Stripe" in web-partner dashboard
2. Backend calls:
   const account = await stripe.accounts.create({
     type: 'express',
     country: 'FR',
     email: partnerOrg.contactEmail,
     capabilities: { transfers: { requested: true } },
     metadata: { orgId: partnerOrg.id }
   });

3. Store account.id → PartnerPayoutProfile.stripeConnectAccountId
4. Generate onboarding link:
   const link = await stripe.accountLinks.create({
     account: account.id,
     refresh_url: `${APP_URL}/partner/stripe/refresh`,
     return_url: `${APP_URL}/partner/stripe/complete`,
     type: 'account_onboarding'
   });
5. Redirect partner to link.url
6. On return: check account.charges_enabled & account.payouts_enabled
7. Listen for account.updated webhook to track status changes
```

#### Payout Readiness Checks

```typescript
async function isPartnerPayoutReady(partnerOrgId: string): Promise<{
  ready: boolean;
  reason?: string;
}> {
  const profile = await db.partnerPayoutProfile.findUnique({
    where: { partnerOrgId }
  });

  if (!profile) return { ready: false, reason: 'NO_PROFILE' };
  if (!profile.stripeConnectAccountId) return { ready: false, reason: 'NOT_ONBOARDED' };
  if (!profile.chargesEnabled) return { ready: false, reason: 'CHARGES_DISABLED' };
  if (!profile.payoutsEnabled) return { ready: false, reason: 'PAYOUTS_DISABLED' };
  if (profile.frozen) return { ready: false, reason: 'ADMIN_FROZEN' };

  return { ready: true };
}
```

### 2.5 Invoicing

#### Invoice Finalization
```
Stripe config:
  collection_method: "charge_automatically"
  days_until_due: null  (auto-charge, no net terms)

  For enterprise clients (future):
  collection_method: "send_invoice"
  days_until_due: 30
```

#### Invoice Numbering
```
Stripe auto-generates: INV-XXXX-XXXX
Custom prefix configured in Stripe: "NEO"
→ Result: NEO-0001, NEO-0002, ...

Stored in: StripeInvoice.invoiceNumber
```

#### Invoice PDF Storage
```
Stripe provides:
  invoice.hosted_invoice_url → customer-facing payment page
  invoice.invoice_pdf        → direct PDF download link

Stored in:
  StripeInvoice.hostedUrl = invoice.hosted_invoice_url
  StripeInvoice.pdfUrl    = invoice.invoice_pdf

No self-hosting of PDFs — Stripe URLs are permanent and accessible.
```

#### Credit Notes / Refunds
```
Refund flow:
1. Admin initiates refund in web-admin
2. Backend calls stripe.refunds.create({ payment_intent: pi_xxx, amount: cents })
3. Stripe fires charge.refunded webhook
4. Update StripePayment.status = REFUNDED | PARTIALLY_REFUNDED
5. Create AuditLog entry

Credit note flow:
1. Admin issues credit note against invoice
2. Backend calls stripe.creditNotes.create({ invoice: inv_xxx, lines: [...] })
3. Stripe fires credit_note.created webhook
4. Credit applied to customer's balance for next invoice
```

### 2.6 Webhooks

#### Required Event Types

| Stripe Event | DB Update | Business Logic |
|-------------|-----------|----------------|
| `checkout.session.completed` | Create Booking, BookingScreens, activate subscription | Start campaign |
| `customer.subscription.created` | Create StripeSubscription | — |
| `customer.subscription.updated` | Update StripeSubscription status/period | Handle proration changes |
| `customer.subscription.deleted` | StripeSubscription.status = CANCELLED | End booking & campaign |
| `customer.subscription.trial_will_end` | — | Notify advertiser (3 days before) |
| `invoice.created` | Create StripeInvoice (DRAFT) | — |
| `invoice.finalized` | Update StripeInvoice (OPEN) | — |
| `invoice.paid` | StripeInvoice.status = PAID, paidAt = now | Trigger revenue share calculation |
| `invoice.payment_failed` | StripeInvoice status unchanged | Pause campaign, notify advertiser |
| `invoice.voided` | StripeInvoice.status = VOID | — |
| `payment_intent.succeeded` | StripePayment.status = SUCCEEDED | Resume campaign if was paused |
| `payment_intent.payment_failed` | StripePayment.status = FAILED, store failure info | Pause campaign |
| `charge.refunded` | StripePayment.status = REFUNDED | Adjust revenue shares if needed |
| `charge.dispute.created` | Flag on payment | Freeze advertiser, notify admin |
| `charge.dispute.closed` | Update dispute status | Unfreeze if won |
| `account.updated` (Connect) | Update PartnerPayoutProfile | Check payout readiness |
| `transfer.created` (Connect) | Payout.stripeTransferId | — |
| `payout.paid` (Connect) | Payout.status = PAID, paidAt | — |
| `payout.failed` (Connect) | Payout.status = FAILED, failureReason | Alert admin |

#### Idempotency Strategy

```typescript
async function handleWebhook(event: Stripe.Event): Promise<void> {
  // 1. Check if already processed (idempotency)
  const existing = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id }
  });

  if (existing?.processed) {
    return; // Already handled — safe to skip
  }

  // 2. Store event (upsert for replay safety)
  await db.stripeWebhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      eventType: event.type,
      payload: event as any,
      processed: false,
    },
    update: {} // No-op if already stored but unprocessed
  });

  // 3. Process in transaction
  try {
    await db.$transaction(async (tx) => {
      await processEvent(tx, event);
      await tx.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: { processed: true, processedAt: new Date() }
      });
    });
  } catch (error) {
    await db.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        failureReason: error.message,
        retryCount: { increment: 1 }
      }
    });
    throw error; // Return 500 so Stripe retries
  }
}
```

#### Replay Strategy

```
Replay mechanism:
1. Background CRON job runs every 5 minutes
2. Queries: StripeWebhookEvent WHERE processed = false AND retryCount < 5
3. For each: re-processes via processEvent()
4. If retryCount >= 5: alerts admin, marks as dead-letter

Manual replay:
  Admin endpoint: POST /admin/webhooks/:eventId/replay
  → Re-fetches event from Stripe API
  → Resets processed = false, retryCount = 0
  → Processes again
```

#### Signature Verification

```typescript
// NestJS webhook controller
@Post('stripe/webhook')
@HttpCode(200)
async handleStripeWebhook(
  @Headers('stripe-signature') signature: string,
  @Req() req: RawBodyRequest<Request>,
) {
  const event = stripe.webhooks.constructEvent(
    req.rawBody,            // raw body buffer — NOT parsed JSON
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  await this.webhookService.handleWebhook(event);
}
```

**Critical**: NestJS must be configured to preserve raw body on the webhook route. Use `rawBody: true` in NestJS platform adapter or a dedicated raw-body middleware for `/stripe/webhook`.

---

## 3. Payment Workflows

### 3.1 State Machines

#### Booking State Machine

```
                 ┌──────────────────────────────────────────┐
                 │                                          │
    ┌────────┐   │   ┌────────┐   ┌────────┐   ┌──────────┐│
    │ DRAFT  │───┘──▶│PENDING │──▶│ ACTIVE │──▶│ EXPIRED  ││
    └────────┘       └────────┘   └────────┘   └──────────┘│
                         │            │  ▲                   │
                         │            │  │                   │
                         ▼            ▼  │                   │
                    ┌──────────┐  ┌────────┐                │
                    │CANCELLED │  │ PAUSED │                │
                    └──────────┘  └────────┘                │
                                                            │

Transitions:
  DRAFT → PENDING      : Advertiser submits screen selection (BookingDraft created)
  PENDING → ACTIVE     : checkout.session.completed (payment successful)
  PENDING → CANCELLED  : Checkout expired or advertiser cancelled
  ACTIVE → PAUSED      : payment_failed (dunning) or admin action
  PAUSED → ACTIVE      : payment recovered or admin action
  ACTIVE → EXPIRED     : Subscription period ended (no renewal)
  ACTIVE → CANCELLED   : Advertiser cancels or admin cancels
```

**New status: DRAFT** — represents a booking being built but not yet submitted to Stripe. This is the "cart" state.

#### Subscription State Machine (mirrors Stripe)

```
  ┌──────────┐    ┌────────┐    ┌──────────┐
  │INCOMPLETE│───▶│TRIALING│───▶│  ACTIVE  │
  └──────────┘    └────────┘    └──────────┘
       │                            │   ▲
       ▼                            │   │
  ┌──────────────┐                  ▼   │
  │INCOMPLETE_   │              ┌────────┐
  │  EXPIRED     │              │PAST_DUE│
  └──────────────┘              └────────┘
                                    │
                              ┌─────┴─────┐
                              ▼           ▼
                         ┌────────┐  ┌────────┐
                         │ UNPAID │  │CANCELLED│
                         └────────┘  └────────┘
                              │
                              ▼
                         ┌────────┐
                         │CANCELLED│
                         └────────┘
```

#### Campaign State Machine (billing-relevant transitions)

```
Billing-triggered transitions only:

  APPROVED → ACTIVE     : When Booking becomes ACTIVE (payment confirmed)
  ACTIVE → PAUSED       : When Booking becomes PAUSED (payment failed)
  PAUSED → ACTIVE       : When Booking resumes (payment recovered)
  ACTIVE → COMPLETED    : When Booking expires or is cancelled
```

### 3.2 Workflow A: Advertiser Subscription Purchase

```
SEQUENCE: New Subscription Purchase

Advertiser                    Backend (API)                     Stripe                  DB
    │                              │                              │                     │
    │  1. Select screens           │                              │                     │
    │─────────────────────────────▶│                              │                     │
    │                              │  2. Validate screens avail.  │                     │
    │                              │──────────────────────────────────────────────────▶ │
    │                              │  3. Compute total price      │                     │
    │                              │  SUM(screen.monthlyPrice)    │                     │
    │                              │                              │                     │
    │                              │  4. Create BookingDraft      │                     │
    │                              │──────────────────────────────────────────────────▶ │
    │                              │     status: DRAFT            │                     │
    │                              │     + BookingScreen snapshots│                     │
    │                              │                              │                     │
    │                              │  5. Create Checkout Session  │                     │
    │                              │─────────────────────────────▶│                     │
    │                              │     mode: "subscription"     │                     │
    │                              │     line_items: [packPrice]  │                     │
    │                              │     metadata: { bookingId }  │                     │
    │                              │                              │                     │
    │  6. Redirect to Checkout     │◀─────────────────────────────│                     │
    │◀─────────────────────────────│     sessionUrl               │                     │
    │                              │                              │                     │
    │  7. Completes payment        │                              │                     │
    │─────────────────────────────────────────────────────────────▶                     │
    │                              │                              │                     │
    │                              │  8. checkout.session.completed│                    │
    │                              │◀─────────────────────────────│                     │
    │                              │                              │                     │
    │                              │  9. In DB transaction:       │                     │
    │                              │  a. Booking DRAFT → ACTIVE   │                     │
    │                              │  b. Link stripeSubscriptionId│                     │
    │                              │  c. Create StripeSubscription│                     │
    │                              │  d. Create StripeCustomer    │                     │
    │                              │     (if first subscription)  │                     │
    │                              │  e. Activate Campaign        │                     │
    │                              │──────────────────────────────────────────────────▶ │
    │                              │                              │                     │
    │  10. Redirect to success     │                              │                     │
    │◀─────────────────────────────│                              │                     │

```

**DB updates at step 9 (atomic transaction):**

```sql
-- a. Update booking
UPDATE bookings SET status = 'ACTIVE', stripe_subscription_id = :subId
WHERE id = :bookingId AND status = 'DRAFT';

-- b. Create stripe subscription record
INSERT INTO stripe_subscriptions (stripe_subscription_id, status, current_period_start,
  current_period_end, customer_id, organization_id)
VALUES (:subId, 'ACTIVE', :periodStart, :periodEnd, :customerId, :orgId);

-- c. Activate campaign (if linked)
UPDATE campaigns SET status = 'ACTIVE'
WHERE id = :campaignId AND status IN ('APPROVED', 'DRAFT');

-- d. Create audit log
INSERT INTO audit_logs (action, entity, entity_id, user_id, org_id, new_data, severity)
VALUES ('SUBSCRIPTION_CREATED', 'Booking', :bookingId, :userId, :orgId,
  '{"subscriptionId": "...", "amount": ...}', 'INFO');
```

### 3.3 Workflow B: Subscription Renewals

```
SEQUENCE: Monthly Renewal

Stripe                          Backend (Webhook)               DB
  │                                  │                           │
  │  1. invoice.created              │                           │
  │─────────────────────────────────▶│                           │
  │     (draft invoice)              │  2. Create StripeInvoice  │
  │                                  │──────────────────────────▶│
  │                                  │     status: DRAFT         │
  │                                  │                           │
  │  2. invoice.finalized            │                           │
  │─────────────────────────────────▶│                           │
  │     (invoice open, ready)        │  3. Update status: OPEN   │
  │                                  │──────────────────────────▶│
  │                                  │                           │
  │  3. payment_intent.succeeded     │                           │
  │─────────────────────────────────▶│                           │
  │                                  │  4. StripePayment SUCCEED │
  │                                  │──────────────────────────▶│
  │                                  │                           │
  │  4. invoice.paid                 │                           │
  │─────────────────────────────────▶│                           │
  │                                  │  5. StripeInvoice → PAID  │
  │                                  │  6. Update Subscription   │
  │                                  │     currentPeriodStart/End│
  │                                  │  7. Enqueue revenue share │
  │                                  │     computation for period│
  │                                  │──────────────────────────▶│
  │                                  │                           │
```

**Revenue share trigger**: On `invoice.paid`, enqueue a job:

```typescript
// Pseudocode: on invoice.paid
await revenueQueue.add('compute-period-shares', {
  invoiceId: stripeInvoice.id,
  subscriptionId: stripeSubscription.id,
  periodStart: invoice.period_start,
  periodEnd: invoice.period_end,
  organizationId: stripeSubscription.organizationId,
});
```

### 3.4 Workflow C: Payment Failure (Dunning)

```
SEQUENCE: Payment Failure & Recovery

Stripe                          Backend (Webhook)               DB                     Advertiser
  │                                  │                           │                        │
  │  1. invoice.payment_failed       │                           │                        │
  │─────────────────────────────────▶│                           │                        │
  │                                  │  2. StripePayment→FAILED  │                        │
  │                                  │  3. StripeSubscription    │                        │
  │                                  │     → PAST_DUE            │                        │
  │                                  │  4. Booking → PAUSED      │                        │
  │                                  │  5. Campaign → PAUSED     │                        │
  │                                  │──────────────────────────▶│                        │
  │                                  │                           │                        │
  │                                  │  6. Send notification     │                        │
  │                                  │──────────────────────────────────────────────────▶│
  │                                  │     "Payment failed,      │                        │
  │                                  │      campaign paused"     │                        │
  │                                  │                           │                        │
  │  ... Stripe retry Day 3 ...      │                           │                        │
  │  ... Stripe retry Day 5 ...      │                           │                        │
  │  ... Stripe retry Day 7 (final)  │                           │                        │
  │                                  │                           │                        │
  │  ══════ IF PAYMENT RECOVERED ═══ │                           │                        │
  │                                  │                           │                        │
  │  7. payment_intent.succeeded     │                           │                        │
  │─────────────────────────────────▶│                           │                        │
  │                                  │  8. StripePayment→SUCCESS │                        │
  │                                  │  9. StripeSubscription    │                        │
  │                                  │     → ACTIVE              │                        │
  │                                  │ 10. Booking → ACTIVE      │                        │
  │                                  │ 11. Campaign → ACTIVE     │                        │
  │                                  │     (policy: auto-resume) │                        │
  │                                  │──────────────────────────▶│                        │
  │                                  │                           │                        │
  │  ══════ IF ALL RETRIES FAIL ════ │                           │                        │
  │                                  │                           │                        │
  │  7b. customer.subscription.      │                           │                        │
  │      updated (status=unpaid)     │                           │                        │
  │─────────────────────────────────▶│                           │                        │
  │                                  │ 8b. Subscription → UNPAID │                        │
  │                                  │ 9b. Booking stays PAUSED  │                        │
  │                                  │ 10b. Notify admin         │                        │
  │                                  │──────────────────────────▶│                        │
```

**Auto-resume policy** (configurable per org):

```typescript
enum ResumePolicy {
  AUTO_RESUME = 'AUTO_RESUME',     // Campaign resumes immediately on payment recovery
  MANUAL_RESUME = 'MANUAL_RESUME', // Admin must manually resume
}

// Default: AUTO_RESUME for standard advertisers
// MANUAL_RESUME for flagged or high-risk advertisers
```

### 3.5 Workflow D: Changing Selection Mid-Cycle

```
SEQUENCE: Upgrade (Add Screens)

Advertiser                    Backend                          Stripe                  DB
    │                              │                              │                     │
    │  1. Add 20 screens           │                              │                     │
    │─────────────────────────────▶│                              │                     │
    │                              │  2. Validate new screens     │                     │
    │                              │  3. Compute new total price  │                     │
    │                              │                              │                     │
    │                              │  4. Update Stripe Sub        │                     │
    │                              │─────────────────────────────▶│                     │
    │                              │     items: [newPrice]        │                     │
    │                              │     proration: create        │                     │
    │                              │                              │                     │
    │                              │  5. In DB transaction:       │                     │
    │                              │  a. Create new BookingScreens│                     │
    │                              │     with current unitPrice   │                     │
    │                              │  b. Update Booking total     │                     │
    │                              │  c. Audit log the change     │                     │
    │                              │──────────────────────────────────────────────────▶ │
    │                              │                              │                     │
    │  6. Stripe prorates invoice  │                              │                     │
    │                              │◀─────────────────────────────│                     │
    │                              │  invoice.updated webhook     │                     │
```

**Screen removal** follows the same pattern but:
- BookingScreen records get `removedAt` timestamp (soft delete)
- Revenue share for current period is prorated based on days active
- Booking total is reduced
- Historical BookingScreens remain for audit

**Critical rule**: Past periods' revenue calculations are NEVER retroactively modified. Only future periods reflect changes.

### 3.6 Workflow E: One-Time Purchases

#### AI Credits Top-Up

```
Advertiser                    Backend                          Stripe                  DB
    │                              │                              │                     │
    │  1. Buy 500 AI credits       │                              │                     │
    │─────────────────────────────▶│                              │                     │
    │                              │  2. Create Checkout Session  │                     │
    │                              │─────────────────────────────▶│                     │
    │                              │     mode: "payment"          │                     │
    │                              │     line_items: [credits500] │                     │
    │                              │     metadata: { orgId, type: │                     │
    │                              │       "AI_CREDITS", qty: 500}│                     │
    │                              │                              │                     │
    │  3. Complete payment         │                              │                     │
    │                              │  4. checkout.session.completed│                    │
    │                              │◀─────────────────────────────│                     │
    │                              │                              │                     │
    │                              │  5. In DB transaction:       │                     │
    │                              │  a. AIWallet.balance += 500  │                     │
    │                              │  b. Create AITransaction     │                     │
    │                              │     type: RECHARGE           │                     │
    │                              │     credits: +500            │                     │
    │                              │     stripePaymentIntentId    │                     │
    │                              │──────────────────────────────────────────────────▶ │
```

#### Refunds & Chargebacks

```
Refund handling:
1. Admin initiates refund (partial or full)
2. stripe.refunds.create({ payment_intent, amount, reason })
3. charge.refunded webhook received
4. Update StripePayment.status
5. If subscription payment: adjust Booking.monthlyPriceCents if needed
6. If AI credits: deduct credits from AIWallet, create AITransaction type: REFUND

Chargeback handling:
1. charge.dispute.created webhook
2. Flag advertiser account in DB (Organization.isFlagged = true)
3. Pause all active campaigns for this advertiser
4. Notify admin via Notification + AuditLog (severity: CRITICAL)
5. Submit dispute evidence via Stripe API if applicable
6. charge.dispute.closed → update based on outcome (won/lost)
```

---

## 4. Revenue Sharing & Distribution Algorithms

### 4.1 Core Algorithm (Pseudocode)

```typescript
/**
 * Revenue Share Computation — runs monthly after invoice.paid
 *
 * Input:  A paid invoice for period [periodStart, periodEnd]
 * Output: RevenueShare records per partner org
 */
async function computeRevenueShares(
  invoiceId: string,
  subscriptionId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {

  // 1. Find the Booking linked to this subscription
  const booking = await db.booking.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { bookingScreens: true }
  });

  if (!booking || booking.status === 'CANCELLED') return;

  // 2. Get the paid invoice for amount verification
  const invoice = await db.stripeInvoice.findUnique({
    where: { id: invoiceId }
  });

  // 3. Group BookingScreens by partnerOrgId
  const screensByPartner = groupBy(booking.bookingScreens, 'partnerOrgId');

  // 4. For each partner: compute their share
  for (const [partnerOrgId, screens] of Object.entries(screensByPartner)) {

    // 4a. Calculate gross revenue for this partner's screens
    let grossRevenueCents = 0;
    const lineItems: RevenueShareLineItem[] = [];

    for (const bs of screens) {
      // Check screen removal mid-cycle (prorate if needed)
      const daysActive = computeActiveDays(bs, periodStart, periodEnd);
      const totalDays = differenceInDays(periodEnd, periodStart);
      const proratedAmount = Math.round(bs.unitPriceCents * (daysActive / totalDays));

      // Apply uptime policy if configured
      const finalAmount = await applyUptimePolicy(bs, proratedAmount, periodStart, periodEnd);

      grossRevenueCents += finalAmount;

      lineItems.push({
        bookingScreenId: bs.id,
        screenId: bs.screenId,
        unitPriceCents: bs.unitPriceCents,
        daysActive,
        proratedAmountCents: proratedAmount,
        finalAmountCents: finalAmount,
        uptimePolicyApplied: finalAmount !== proratedAmount,
      });
    }

    // 4b. Look up applicable revenue rule
    const rule = await findApplicableRule(partnerOrgId, periodStart);

    // 4c. Calculate splits
    const platformShareCents = Math.round(grossRevenueCents * rule.platformRate);
    const partnerShareCents = grossRevenueCents - platformShareCents; // Avoid rounding errors

    // 4d. Upsert RevenueShare (idempotent for replays)
    await db.revenueShare.upsert({
      where: {
        partnerOrgId_periodStart_periodEnd: {
          partnerOrgId,
          periodStart,
          periodEnd,
        }
      },
      create: {
        status: 'CALCULATED',
        periodStart,
        periodEnd,
        totalRevenueCents: grossRevenueCents,
        platformShareCents,
        partnerShareCents,
        platformRate: rule.platformRate,
        partnerOrgId,
        calculatedAt: new Date(),
        breakdown: lineItems, // JSON for auditability
      },
      update: {
        // Only update if not already APPROVED or PAID
        status: 'CALCULATED',
        totalRevenueCents: grossRevenueCents,
        platformShareCents,
        partnerShareCents,
        platformRate: rule.platformRate,
        calculatedAt: new Date(),
        breakdown: lineItems,
      }
    });
  }
}
```

### 4.2 Revenue Rule Lookup

```typescript
/**
 * Find the most specific applicable rule for a partner at a point in time.
 * Priority: partner-specific rule > global rule
 */
async function findApplicableRule(
  partnerOrgId: string,
  effectiveDate: Date,
): Promise<{ platformRate: number; partnerRate: number }> {

  // Try partner-specific rule first
  const partnerRule = await db.revenueRule.findFirst({
    where: {
      partnerOrgId,
      effectiveFrom: { lte: effectiveDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: effectiveDate } }
      ]
    },
    orderBy: { effectiveFrom: 'desc' } // Most recent rule wins
  });

  if (partnerRule) {
    return { platformRate: partnerRule.platformRate, partnerRate: partnerRule.partnerRate };
  }

  // Fall back to global rule
  const globalRule = await db.revenueRule.findFirst({
    where: {
      partnerOrgId: null, // global
      effectiveFrom: { lte: effectiveDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: effectiveDate } }
      ]
    },
    orderBy: { effectiveFrom: 'desc' }
  });

  if (!globalRule) {
    throw new Error(`No revenue rule found for partner ${partnerOrgId} at ${effectiveDate}`);
  }

  return { platformRate: globalRule.platformRate, partnerRate: globalRule.partnerRate };
}
```

### 4.3 Uptime Policy

```typescript
enum UptimePolicy {
  PAY_REGARDLESS = 'PAY_REGARDLESS',       // Pay partner even if screen was offline
  PAY_PRO_RATA_UPTIME = 'PAY_PRO_RATA_UPTIME', // Pay proportional to uptime
  PAY_ONLY_IF_DELIVERED = 'PAY_ONLY_IF_DELIVERED', // Pay only if impressions confirmed
}

// Stored on: PartnerPayoutProfile.uptimePolicy (default: PAY_REGARDLESS)

async function applyUptimePolicy(
  bookingScreen: BookingScreen,
  baseAmountCents: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {

  const profile = await db.partnerPayoutProfile.findUnique({
    where: { partnerOrgId: bookingScreen.partnerOrgId }
  });

  const policy = profile?.uptimePolicy ?? 'PAY_REGARDLESS';

  switch (policy) {
    case 'PAY_REGARDLESS':
      return baseAmountCents;

    case 'PAY_PRO_RATA_UPTIME': {
      // Calculate uptime from DeviceHeartbeat data
      const totalHours = differenceInHours(periodEnd, periodStart);
      const onlineHours = await db.deviceHeartbeat.count({
        where: {
          device: { activeOnScreen: { id: bookingScreen.screenId } },
          isOnline: true,
          timestamp: { gte: periodStart, lte: periodEnd }
        }
      });
      const uptimeRatio = Math.min(onlineHours / totalHours, 1.0);
      return Math.round(baseAmountCents * uptimeRatio);
    }

    case 'PAY_ONLY_IF_DELIVERED': {
      // Check if any verified diffusion logs exist for this screen in period
      const deliveredCount = await db.diffusionLog.count({
        where: {
          screenId: bookingScreen.screenId,
          verified: true,
          startTime: { gte: periodStart, lte: periodEnd }
        }
      });
      return deliveredCount > 0 ? baseAmountCents : 0;
    }
  }
}
```

### 4.4 Retrocession Policy Options

| Policy | Description | Partner Impact | Platform Risk |
|--------|------------|---------------|---------------|
| **PAY_REGARDLESS** (default) | Partner always paid for booked screens | Partner loves it, predictable income | Platform absorbs downtime risk |
| **PAY_PRO_RATA_UPTIME** | Payment proportional to screen uptime | Partner incentivized to maintain uptime | Fair split of risk |
| **PAY_ONLY_IF_DELIVERED** | Payment only if verified impressions exist | Highest accountability | Partner may dispute if device issues are platform's fault |

**Recommendation**: Default to `PAY_REGARDLESS` for initial launch to attract partners, then offer `PAY_PRO_RATA_UPTIME` as a premium option that gives partners higher base rates in exchange for uptime guarantees.

### 4.5 Payout Rules

```typescript
/**
 * Monthly payout batch — runs after all RevenueShares for the period are APPROVED
 */
async function processMonthlyPayouts(periodStart: Date, periodEnd: Date): Promise<void> {

  const MINIMUM_PAYOUT_CENTS = 5000; // €50 minimum payout threshold

  // 1. Get all approved revenue shares for this period
  const approvedShares = await db.revenueShare.findMany({
    where: {
      status: 'APPROVED',
      periodStart,
      periodEnd,
      payoutId: null, // Not yet assigned to a payout
    },
    include: { partnerOrg: true }
  });

  // 2. Group by partner
  const sharesByPartner = groupBy(approvedShares, 'partnerOrgId');

  for (const [partnerOrgId, shares] of Object.entries(sharesByPartner)) {
    const totalPayoutCents = shares.reduce((sum, s) => sum + s.partnerShareCents, 0);

    // 3. Check minimum threshold
    if (totalPayoutCents < MINIMUM_PAYOUT_CENTS) {
      // Hold balance — will accumulate to next period
      // Revenue shares remain APPROVED but unpaid
      await createAuditLog('PAYOUT_BELOW_THRESHOLD', 'RevenueShare', partnerOrgId, {
        amount: totalPayoutCents,
        threshold: MINIMUM_PAYOUT_CENTS,
        period: `${periodStart} - ${periodEnd}`,
      });
      continue;
    }

    // 4. Check partner payout readiness
    const readiness = await isPartnerPayoutReady(partnerOrgId);
    if (!readiness.ready) {
      // Hold balance — partner needs to complete onboarding
      await createAuditLog('PAYOUT_HELD_NOT_ONBOARDED', 'RevenueShare', partnerOrgId, {
        reason: readiness.reason,
        amount: totalPayoutCents,
      });
      continue;
    }

    // 5. Create Payout record
    const payout = await db.payout.create({
      data: {
        status: 'PENDING',
        amountCents: totalPayoutCents,
        currency: 'EUR',
        partnerOrgId,
        revenueShares: {
          connect: shares.map(s => ({ id: s.id }))
        }
      }
    });

    // 6. Initiate Stripe Connect transfer
    try {
      const transfer = await stripe.transfers.create({
        amount: totalPayoutCents,
        currency: 'eur',
        destination: readiness.connectAccountId,
        transfer_group: `payout_${payout.id}`,
        metadata: {
          payoutId: payout.id,
          partnerOrgId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }
      });

      await db.payout.update({
        where: { id: payout.id },
        data: {
          status: 'PROCESSING',
          stripeTransferId: transfer.id,
        }
      });

      // Update revenue shares status
      await db.revenueShare.updateMany({
        where: { payoutId: payout.id },
        data: { status: 'PAID' }
      });
    } catch (error) {
      await db.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failureReason: error.message,
        }
      });
    }
  }
}
```

### 4.6 Example Calculation

**Setup:**
```
Advertiser: "Acme Ads" subscribes to Ad Pack Custom
  Booking B1: 5 screens selected, total €500/month

  BookingScreens:
    BS1: Screen S1 (Partner "CinéParis")    → unitPrice: €120/mo
    BS2: Screen S2 (Partner "CinéParis")    → unitPrice: €100/mo
    BS3: Screen S3 (Partner "CinéLyon")     → unitPrice: €100/mo
    BS4: Screen S4 (Partner "CinéLyon")     → unitPrice: €80/mo
    BS5: Screen S5 (Partner "CinéLyon")     → unitPrice: €100/mo

Revenue Rules (effective 2026-01-01):
  Global default: platformRate=0.30, partnerRate=0.70
  CinéParis override: platformRate=0.25, partnerRate=0.75 (premium partner)

Period: February 2026
```

**Calculation:**

```
═══ Partner: CinéParis ═══
  BS1: €120.00 × 28/28 days = €120.00
  BS2: €100.00 × 28/28 days = €100.00
  Gross: €220.00

  Rule: CinéParis-specific (platformRate=0.25)
  Platform share: €220.00 × 0.25 = €55.00
  Partner share:  €220.00 × 0.75 = €165.00

  RevenueShare record:
  {
    partnerOrgId: "cineparis",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    totalRevenueCents: 22000,
    platformShareCents: 5500,
    partnerShareCents: 16500,
    platformRate: 0.25,
    breakdown: [
      { bookingScreenId: "BS1", screenName: "S1", unitPriceCents: 12000, daysActive: 28, finalAmountCents: 12000 },
      { bookingScreenId: "BS2", screenName: "S2", unitPriceCents: 10000, daysActive: 28, finalAmountCents: 10000 }
    ]
  }

═══ Partner: CinéLyon ═══
  BS3: €100.00 × 28/28 days = €100.00
  BS4: €80.00  × 28/28 days = €80.00
  BS5: €100.00 × 28/28 days = €100.00
  Gross: €280.00

  Rule: Global default (platformRate=0.30)
  Platform share: €280.00 × 0.30 = €84.00
  Partner share:  €280.00 × 0.70 = €196.00

  RevenueShare record:
  {
    partnerOrgId: "cinelyon",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    totalRevenueCents: 28000,
    platformShareCents: 8400,
    partnerShareCents: 19600,
    platformRate: 0.30,
    breakdown: [
      { bookingScreenId: "BS3", screenName: "S3", ..., finalAmountCents: 10000 },
      { bookingScreenId: "BS4", screenName: "S4", ..., finalAmountCents: 8000 },
      { bookingScreenId: "BS5", screenName: "S5", ..., finalAmountCents: 10000 }
    ]
  }

═══ Platform Summary ═══
  Total collected from Acme Ads:       €500.00
  Platform revenue (CinéParis):          €55.00
  Platform revenue (CinéLyon):           €84.00
  Total platform revenue:               €139.00
  Total partner payouts:                €361.00
  Verification: €139.00 + €361.00 =    €500.00 ✓
```

### 4.7 Mid-Cycle Rate Change Scenario

```
Scenario: CinéParis renegotiates rate effective 2026-02-15

Old rule: platformRate=0.25 (effective 2026-01-01)
New rule: platformRate=0.20 (effective 2026-02-15)

February calculation for CinéParis:
  Feb 1-14 (14 days): €220 × (14/28) = €110 → old rate 0.25
    Platform: €110 × 0.25 = €27.50
    Partner:  €110 × 0.75 = €82.50

  Feb 15-28 (14 days): €220 × (14/28) = €110 → new rate 0.20
    Platform: €110 × 0.20 = €22.00
    Partner:  €110 × 0.80 = €88.00

  Totals:
    Platform: €27.50 + €22.00 = €49.50
    Partner:  €82.50 + €88.00 = €170.50
    Total:    €220.00 ✓

The breakdown JSON stores both rule applications for audit.
```

---

## 5. VAT / Tax Handling

### 5.1 Strategy: Use Stripe Tax

**Decision**: Use **Stripe Tax** for automated tax calculation.

**Justification**:
- Handles EU VAT rules (including reverse charge for B2B)
- Automatic rate lookup by customer location
- Supports VAT ID validation
- Generates tax-compliant invoices automatically
- Reduces liability for incorrect tax calculation

### 5.2 Tax Fields in Schema

```prisma
model TaxProfile {
  id               String  @id @default(cuid())
  organizationId   String  @unique
  organization     Organization @relation(fields: [organizationId], references: [id])

  // Tax identification
  vatNumber        String?  // e.g., "FR12345678901"
  vatNumberValid   Boolean  @default(false) // Validated by Stripe Tax
  vatValidatedAt   DateTime?
  taxExempt        Boolean  @default(false) // B2B reverse charge eligible

  // Location (for tax nexus determination)
  taxCountry       String   @default("FR")
  taxRegion        String?  // For countries with regional taxes

  // Stripe Tax reference
  stripeTaxId      String?  @unique // Stripe Tax ID object

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("tax_profiles")
}
```

### 5.3 VAT Logic Rules

```
Rule 1: B2C France
  → Apply 20% TVA (standard rate)
  → Invoice shows: HT + TVA 20% + TTC

Rule 2: B2B France (valid VAT number)
  → Apply 20% TVA (no exemption for domestic B2B in France)
  → Invoice shows: HT + TVA 20% + TTC

Rule 3: B2B EU (valid VAT number, different EU country)
  → Reverse charge applies → 0% VAT
  → Invoice shows: "Autoliquidation de TVA — Article 196 Directive 2006/112/CE"
  → Customer self-reports VAT in their country

Rule 4: B2B non-EU
  → No VAT charged
  → Invoice shows: "Exonération de TVA — prestation extra-communautaire"

Rule 5: B2C EU (no valid VAT number)
  → Apply destination country VAT rate (OSS rules)
  → Stripe Tax handles this automatically
```

### 5.4 Stripe Tax Configuration

```typescript
// When creating Checkout Session:
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{
    price: priceId,
    quantity: 1,
  }],
  automatic_tax: { enabled: true },
  customer_update: {
    address: 'auto', // Collect address for tax calculation
  },
  tax_id_collection: { enabled: true }, // Collect VAT numbers
  // ...
});
```

### 5.5 Invoice Tax Fields (stored from Stripe)

```
StripeInvoice extended metadata (stored in lineItems JSON):
{
  "lineItems": [
    {
      "description": "Ad Pack Premium — 100 screens",
      "amountCents": 89900,
      "tax": {
        "taxAmountCents": 17980,
        "taxRate": 0.20,
        "taxType": "vat",
        "taxCountry": "FR",
        "taxBehavior": "exclusive"
      }
    }
  ],
  "sellerIdentity": {
    "companyName": "NeoFilm SAS",
    "address": "...",
    "vatNumber": "FR...",
    "siret": "..."
  },
  "buyerIdentity": {
    "companyName": "Acme Ads SARL",
    "address": "...",
    "vatNumber": "FR...",
    "country": "FR"
  },
  "totals": {
    "subtotalCents": 89900,
    "taxCents": 17980,
    "totalCents": 107880,
    "currency": "EUR"
  }
}
```

---

## 6. Invoices, Accounting Exports & Reconciliation

### 6.1 Advertiser Invoice List

Endpoint: `GET /api/v1/invoices?orgId={advertiserOrgId}`

Returns:

```json
{
  "data": [
    {
      "id": "inv_abc123",
      "invoiceNumber": "NEO-0042",
      "status": "PAID",
      "amountDueCents": 107880,
      "amountPaidCents": 107880,
      "currency": "EUR",
      "periodStart": "2026-02-01T00:00:00Z",
      "periodEnd": "2026-02-28T23:59:59Z",
      "paidAt": "2026-02-01T10:23:45Z",
      "pdfUrl": "https://pay.stripe.com/invoice/...",
      "lineItems": [
        {
          "description": "Ad Pack Premium — 100 screens",
          "amountCents": 89900,
          "taxCents": 17980
        }
      ]
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 12 }
}
```

### 6.2 Partner Payout Statements

Endpoint: `GET /api/v1/payouts?orgId={partnerOrgId}`

Returns:

```json
{
  "data": [
    {
      "id": "payout_xyz789",
      "status": "PAID",
      "amountCents": 16500,
      "currency": "EUR",
      "periodStart": "2026-02-01",
      "periodEnd": "2026-02-28",
      "paidAt": "2026-03-05T14:00:00Z",
      "revenueShares": [
        {
          "id": "rs_001",
          "totalRevenueCents": 22000,
          "platformShareCents": 5500,
          "partnerShareCents": 16500,
          "platformRate": 0.25,
          "breakdown": [
            {
              "screenName": "Lobby Screen 1",
              "unitPriceCents": 12000,
              "daysActive": 28,
              "finalAmountCents": 12000
            },
            {
              "screenName": "Hallway Screen 2",
              "unitPriceCents": 10000,
              "daysActive": 28,
              "finalAmountCents": 10000
            }
          ]
        }
      ]
    }
  ]
}
```

### 6.3 Admin Reconciliation Dashboard Tables

#### Table 1: Stripe Invoices vs Internal Bookings

```sql
-- Reconciliation: all paid invoices with their booking match
SELECT
  si.invoice_number,
  si.stripe_invoice_id,
  si.amount_paid_cents,
  si.paid_at,
  b.id AS booking_id,
  b.monthly_price_cents,
  b.status AS booking_status,
  CASE
    WHEN si.amount_paid_cents = b.monthly_price_cents THEN 'MATCHED'
    WHEN si.amount_paid_cents != b.monthly_price_cents THEN 'AMOUNT_MISMATCH'
    WHEN b.id IS NULL THEN 'ORPHAN_INVOICE'
    ELSE 'UNKNOWN'
  END AS reconciliation_status
FROM stripe_invoices si
LEFT JOIN stripe_subscriptions ss ON si.organization_id = ss.organization_id
LEFT JOIN bookings b ON b.stripe_subscription_id = ss.stripe_subscription_id
WHERE si.period_start >= :periodStart
  AND si.period_end <= :periodEnd
ORDER BY si.paid_at DESC;
```

#### Table 2: Payouts vs Computed Revenue Shares

```sql
-- Reconciliation: payouts vs revenue share totals
SELECT
  p.id AS payout_id,
  p.amount_cents AS payout_amount,
  p.status AS payout_status,
  p.paid_at,
  o.name AS partner_name,
  SUM(rs.partner_share_cents) AS computed_share_total,
  CASE
    WHEN p.amount_cents = SUM(rs.partner_share_cents) THEN 'MATCHED'
    ELSE 'MISMATCH'
  END AS reconciliation_status
FROM payouts p
JOIN organizations o ON p.partner_org_id = o.id
LEFT JOIN revenue_shares rs ON rs.payout_id = p.id
WHERE p.created_at >= :periodStart
GROUP BY p.id, o.name
ORDER BY p.created_at DESC;
```

### 6.4 CSV Export Formats

#### Advertiser Invoice Export

```csv
invoice_id,invoice_number,date,customer_org_id,customer_name,net_cents,vat_cents,gross_cents,currency,status,stripe_invoice_id
inv_001,NEO-0042,2026-02-01,org_abc,Acme Ads,89900,17980,107880,EUR,PAID,in_1xyz
inv_002,NEO-0043,2026-03-01,org_abc,Acme Ads,89900,17980,107880,EUR,PAID,in_2xyz
```

#### Partner Payout Export

```csv
payout_id,date,partner_org_id,partner_name,gross_revenue_cents,platform_fee_cents,net_payout_cents,currency,status,stripe_transfer_id,period_start,period_end
pay_001,2026-03-05,org_cinema1,CinéParis,22000,5500,16500,EUR,PAID,tr_abc,2026-02-01,2026-02-28
pay_002,2026-03-05,org_cinema2,CinéLyon,28000,8400,19600,EUR,PAID,tr_def,2026-02-01,2026-02-28
```

#### Journal Entries Export (Double-Entry Bookkeeping)

```csv
date,journal_id,account_code,account_name,debit_cents,credit_cents,description,reference
2026-02-01,JE-001,411000,Clients - Acme Ads,107880,0,Facture NEO-0042,inv_001
2026-02-01,JE-001,706000,Prestations de services,0,89900,CA publicitaire,inv_001
2026-02-01,JE-001,445710,TVA collectée 20%,0,17980,TVA sur facture,inv_001
2026-03-05,JE-002,622000,Rétrocession partenaire CinéParis,16500,0,Payout février,pay_001
2026-03-05,JE-002,401000,Fournisseurs - CinéParis,0,16500,Payout février,pay_001
```

### 6.5 Reconciliation Queries

#### Detect orphan payments (Stripe payments without matching DB records)

```sql
SELECT swe.stripe_event_id, swe.event_type, swe.created_at
FROM stripe_webhook_events swe
WHERE swe.event_type = 'invoice.paid'
  AND swe.processed = true
  AND NOT EXISTS (
    SELECT 1 FROM stripe_invoices si
    WHERE si.stripe_invoice_id = swe.payload->>'data'->>'object'->>'id'
  );
```

#### Monthly revenue reconciliation

```sql
-- Total invoiced vs total distributed
SELECT
  DATE_TRUNC('month', si.period_start) AS month,
  SUM(si.amount_paid_cents) AS total_invoiced,
  (SELECT SUM(rs.total_revenue_cents) FROM revenue_shares rs
   WHERE rs.period_start = DATE_TRUNC('month', si.period_start)) AS total_in_revenue_shares,
  SUM(si.amount_paid_cents) - COALESCE(
    (SELECT SUM(rs.total_revenue_cents) FROM revenue_shares rs
     WHERE rs.period_start = DATE_TRUNC('month', si.period_start)), 0
  ) AS discrepancy_cents
FROM stripe_invoices si
WHERE si.status = 'PAID'
GROUP BY DATE_TRUNC('month', si.period_start)
ORDER BY month DESC;
```

---

## 7. Fraud Prevention & Financial Integrity

### 7.1 Fraud Signals List

| Signal ID | Category | Description | Detection Method | Severity |
|-----------|----------|------------|-----------------|----------|
| F-001 | Fake screens | Partner registers screens that don't physically exist | No heartbeats after 7 days of booking | HIGH |
| F-002 | Cloned device | Same deviceId reporting from multiple IPs simultaneously | IP correlation on heartbeats | CRITICAL |
| F-003 | Inflated impressions | Abnormally high diffusion count per screen | Z-score > 3σ from screen's environment average | HIGH |
| F-004 | Spoofed logs | DiffusionLog with invalid HMAC signature | Signature verification failure | CRITICAL |
| F-005 | Phantom uptime | Heartbeat present but no actual diffusions playing | Heartbeat:diffusion ratio < 0.01 over 24h | MEDIUM |
| F-006 | Chargeback pattern | Advertiser with > 2 chargebacks in 90 days | Count on charge.dispute.created | HIGH |
| F-007 | Payout velocity | Partner earning >300% of historical average | Month-over-month revenue anomaly | MEDIUM |
| F-008 | Ghost bookings | Booking created for screens owned by same entity as advertiser | advertiserOrgId linked to partnerOrgId via membership | CRITICAL |
| F-009 | Device token reuse | Same provisioning token used after device was unpaired | Token used after unpairedAt set | HIGH |
| F-010 | Burst registration | Partner creates >10 screens in 24 hours | Rate limiting on screen creation | LOW |

### 7.2 Automated Rules & Thresholds

```typescript
// Rule engine — runs daily as background job
const FRAUD_RULES = [
  {
    id: 'F-001',
    name: 'Ghost Screen Detection',
    query: `
      SELECT s.id, s.name, s.partner_org_id
      FROM screens s
      JOIN booking_screens bs ON bs.screen_id = s.id
      JOIN bookings b ON bs.booking_id = b.id AND b.status = 'ACTIVE'
      LEFT JOIN device_heartbeats dh ON dh.device_id = s.active_device_id
        AND dh.timestamp > NOW() - INTERVAL '7 days'
      WHERE s.status = 'ACTIVE'
        AND dh.id IS NULL
    `,
    action: 'FLAG_SCREEN',
    severity: 'HIGH',
  },
  {
    id: 'F-003',
    name: 'Impossible Impressions Rate',
    threshold: {
      maxDiffusionsPerScreenPerDay: 2000, // ~83/hour max reasonable
      stdDevMultiplier: 3, // Z-score threshold
    },
    query: `
      SELECT screen_id, COUNT(*) as daily_count,
             AVG(COUNT(*)) OVER () as avg_count,
             STDDEV(COUNT(*)) OVER () as stddev_count
      FROM diffusion_logs
      WHERE start_time >= CURRENT_DATE - INTERVAL '1 day'
      GROUP BY screen_id
      HAVING COUNT(*) > 2000
         OR COUNT(*) > AVG(COUNT(*)) OVER () + 3 * STDDEV(COUNT(*)) OVER ()
    `,
    action: 'FLAG_SCREEN_AND_HOLD_PAYOUT',
    severity: 'HIGH',
  },
  {
    id: 'F-008',
    name: 'Self-dealing Detection',
    query: `
      SELECT b.id AS booking_id, b.advertiser_org_id,
             bs.partner_org_id, m_adv.user_id AS shared_user
      FROM bookings b
      JOIN booking_screens bs ON bs.booking_id = b.id
      JOIN memberships m_adv ON m_adv.organization_id = b.advertiser_org_id
      JOIN memberships m_par ON m_par.organization_id = bs.partner_org_id
        AND m_par.user_id = m_adv.user_id
      WHERE b.status = 'ACTIVE'
    `,
    action: 'FREEZE_BOOKING_AND_NOTIFY_ADMIN',
    severity: 'CRITICAL',
  }
];
```

### 7.3 Device Authentication & Token Rotation

```
Security chain:
1. Device pairs via provisioningToken (one-time use)
2. After pairing: device receives JWT device token (short-lived: 24h)
3. Device refreshes token using device-specific refresh token
4. Refresh tokens are rotated on each use (old token invalidated)
5. All DiffusionLogs signed with HMAC(deviceSecret)
6. deviceSecret is rotated monthly via OTA push
7. If token reuse detected: immediate device lockout + admin alert
```

### 7.4 Admin Actions

| Action | Trigger | Effect | Reversible |
|--------|---------|--------|------------|
| **Freeze Advertiser** | Chargeback/fraud signal | All campaigns paused, no new bookings | Yes (admin unfreeze) |
| **Freeze Partner Payout** | Fraud signal on partner | Payouts held, revenue shares calculated but not disbursed | Yes (admin release) |
| **Freeze Booking** | Self-dealing detected | Booking paused, campaign paused | Yes (admin unfreeze) |
| **Block Screen** | Ghost screen / no heartbeat | Screen excluded from bookings, revenue stopped | Yes (admin reactivate) |
| **Lock Device** | Token reuse / spoofed logs | Device marked ERROR, stops all playback | Yes (admin re-provision) |
| **Manual Payout Hold** | Any suspicion | Specific payout held for review | Yes (admin approve/deny) |

---

## 8. Prisma Schema (Billing + Revenue Module)

### 8.1 Schema Additions & Modifications

The following schema changes are needed on top of the existing `schema.prisma`:

```prisma
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SCHEMA ADDITIONS — BILLING & REVENUE ENHANCEMENT                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// ─── New enum: Booking now supports DRAFT ───
// Update existing BookingStatus enum:
enum BookingStatus {
  DRAFT       // NEW: screen selection in progress (cart state)
  PENDING
  ACTIVE
  PAUSED
  CANCELLED
  EXPIRED
}

// ─── New enum: Uptime policy for partner payouts ───
enum UptimePolicy {
  PAY_REGARDLESS
  PAY_PRO_RATA_UPTIME
  PAY_ONLY_IF_DELIVERED
}

// ─── New enum: Resume policy after payment recovery ───
enum ResumePolicy {
  AUTO_RESUME
  MANUAL_RESUME
}

// ─── New: Partner Payout Profile (Stripe Connect details) ───
model PartnerPayoutProfile {
  id                      String  @id @default(cuid())
  stripeConnectAccountId  String  @unique
  chargesEnabled          Boolean @default(false)
  payoutsEnabled          Boolean @default(false)
  detailsSubmitted        Boolean @default(false)
  frozen                  Boolean @default(false) // Admin freeze

  uptimePolicy            UptimePolicy @default(PAY_REGARDLESS)

  partnerOrgId            String  @unique
  partnerOrg              Organization @relation(fields: [partnerOrgId], references: [id])

  onboardedAt             DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@map("partner_payout_profiles")
}

// ─── New: Tax Profile for advertiser organizations ───
model TaxProfile {
  id               String   @id @default(cuid())
  organizationId   String   @unique
  organization     Organization @relation(fields: [organizationId], references: [id])

  vatNumber        String?
  vatNumberValid   Boolean  @default(false)
  vatValidatedAt   DateTime?
  taxExempt        Boolean  @default(false)

  taxCountry       String   @default("FR")
  taxRegion        String?
  stripeTaxId      String?  @unique

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("tax_profiles")
}

// ─── New: Revenue Share Line Items (relational audit trail) ───
model RevenueShareLineItem {
  id                  String   @id @default(cuid())
  revenueShareId      String
  revenueShare        RevenueShare @relation(fields: [revenueShareId], references: [id], onDelete: Cascade)

  bookingId           String
  bookingScreenId     String
  screenId            String
  screenName          String

  unitPriceCents      Int
  daysActive          Int
  totalDaysInPeriod   Int
  proratedAmountCents Int
  finalAmountCents    Int
  uptimePolicyApplied Boolean  @default(false)
  uptimeRatio         Float?

  // Optional proof reference
  verifiedDiffusionCount Int?
  invoiceId              String? // Link to the Stripe invoice that paid for this

  createdAt DateTime @default(now())

  @@index([revenueShareId])
  @@index([bookingScreenId])
  @@index([screenId])
  @@map("revenue_share_line_items")
}

// ─── New: Payout Line Items (links payout to revenue shares) ───
model PayoutLineItem {
  id              String @id @default(cuid())
  payoutId        String
  payout          Payout @relation(fields: [payoutId], references: [id], onDelete: Cascade)

  revenueShareId  String
  revenueShare    RevenueShare @relation(fields: [revenueShareId], references: [id])

  amountCents     Int
  currency        String @default("EUR")

  createdAt       DateTime @default(now())

  @@unique([payoutId, revenueShareId])
  @@index([revenueShareId])
  @@map("payout_line_items")
}

// ─── Enhancement: Booking gets checkout tracking ───
// Add these fields to existing Booking model:
//   stripeCheckoutSessionId  String?  @unique
//   resumePolicy             ResumePolicy @default(AUTO_RESUME)
//   isFlagged                Boolean  @default(false) // Fraud flag

// ─── Enhancement: BookingScreen gets soft-delete for mid-cycle changes ───
// Add these fields to existing BookingScreen model:
//   addedAt    DateTime  @default(now())
//   removedAt  DateTime?  // null = still active

// ─── Enhancement: Organization gets fraud flags ───
// Add these fields to existing Organization model:
//   isFlagged    Boolean @default(false)
//   flaggedAt    DateTime?
//   flagReason   String?
//   partnerPayoutProfile  PartnerPayoutProfile?
//   taxProfile            TaxProfile?

// ─── Enhancement: RevenueShare gets relational line items ───
// Add to existing RevenueShare model:
//   lineItems    RevenueShareLineItem[]
//   invoiceId    String?  // FK to the StripeInvoice that funded this share

// ─── Enhancement: Payout gets relational line items ───
// Add to existing Payout model:
//   lineItems    PayoutLineItem[]
```

### 8.2 Complete Schema Diff Summary

| Model | Change | Fields Added |
|-------|--------|-------------|
| `BookingStatus` enum | Add value | `DRAFT` |
| `UptimePolicy` enum | New | `PAY_REGARDLESS`, `PAY_PRO_RATA_UPTIME`, `PAY_ONLY_IF_DELIVERED` |
| `ResumePolicy` enum | New | `AUTO_RESUME`, `MANUAL_RESUME` |
| `PartnerPayoutProfile` | New model | Connect account details, uptime policy, frozen flag |
| `TaxProfile` | New model | VAT number, tax country, Stripe Tax ID |
| `RevenueShareLineItem` | New model | Per-screen audit trail with proration and uptime details |
| `PayoutLineItem` | New model | Links payouts to revenue shares for traceability |
| `Booking` | Add fields | `stripeCheckoutSessionId`, `resumePolicy`, `isFlagged` |
| `BookingScreen` | Add fields | `addedAt`, `removedAt` |
| `Organization` | Add fields | `isFlagged`, `flaggedAt`, `flagReason` |
| `Organization` | Add relations | `partnerPayoutProfile`, `taxProfile` |
| `RevenueShare` | Add fields | `invoiceId` |
| `RevenueShare` | Add relation | `lineItems: RevenueShareLineItem[]` |
| `Payout` | Add relation | `lineItems: PayoutLineItem[]` |

### 8.3 Index Strategy for New Models

```sql
-- PartnerPayoutProfile: fast lookup by org
CREATE UNIQUE INDEX idx_ppp_partner_org ON partner_payout_profiles(partner_org_id);
CREATE UNIQUE INDEX idx_ppp_connect ON partner_payout_profiles(stripe_connect_account_id);

-- TaxProfile: fast lookup by org
CREATE UNIQUE INDEX idx_tp_org ON tax_profiles(organization_id);

-- RevenueShareLineItem: period queries and audit
CREATE INDEX idx_rsli_revenue_share ON revenue_share_line_items(revenue_share_id);
CREATE INDEX idx_rsli_booking_screen ON revenue_share_line_items(booking_screen_id);
CREATE INDEX idx_rsli_screen ON revenue_share_line_items(screen_id);

-- PayoutLineItem: payout audit
CREATE UNIQUE INDEX idx_pli_payout_rs ON payout_line_items(payout_id, revenue_share_id);

-- BookingScreen soft delete: active screens query
-- (partial index on removedAt IS NULL for active-only queries)
CREATE INDEX idx_bs_active ON booking_screens(booking_id) WHERE removed_at IS NULL;
```

---

## 9. Security Model

### 9.1 Webhook Verification

```typescript
// 1. Raw body preservation (critical for signature verification)
// In main.ts:
const app = await NestFactory.create(AppModule, {
  rawBody: true, // Preserve raw body for Stripe signature verification
});

// 2. Webhook controller
@Controller('stripe')
export class StripeWebhookController {
  @Post('webhook')
  @HttpCode(200)
  @UseGuards() // NO auth guard — webhooks are authenticated by signature
  async handleWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!sig) throw new BadRequestException('Missing stripe-signature header');
    if (!req.rawBody) throw new BadRequestException('Missing raw body');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        this.configService.get('STRIPE_WEBHOOK_SECRET'),
      );
    } catch (err) {
      // Log failed verification attempt (potential attack)
      this.logger.warn(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    await this.webhookService.processEvent(event);
  }
}
```

### 9.2 Idempotency Strategy

```
Principle: Every webhook handler MUST be idempotent.

Implementation:
1. StripeWebhookEvent.stripeEventId is UNIQUE
   → Duplicate events are caught at DB level

2. All state transitions use WHERE clauses that guard current state:
   UPDATE bookings SET status = 'ACTIVE'
   WHERE id = :id AND status = 'PENDING';
   → If already ACTIVE, zero rows affected = no-op

3. RevenueShare uses UPSERT on unique(partnerOrgId, periodStart, periodEnd)
   → Re-computation is safe

4. Payout creation checks:
   - RevenueShare.payoutId IS NULL (not yet assigned)
   - Payout.stripeTransferId IS NULL (transfer not yet initiated)

5. All webhook handlers wrapped in DB transactions
   → Either fully processed or fully rolled back
```

### 9.3 RBAC for Finance Endpoints

| Endpoint | Required Role | Org Scope |
|----------|--------------|-----------|
| `GET /invoices` | MEMBER+ | Own org only |
| `GET /invoices/:id` | MEMBER+ | Own org only |
| `POST /bookings` (create draft) | MANAGER+ | Own advertiser org |
| `POST /checkout` (initiate payment) | MANAGER+ | Own advertiser org |
| `GET /payouts` | MEMBER+ | Own partner org |
| `GET /revenue-shares` | MEMBER+ | Own partner org |
| `POST /admin/revenue-shares/:id/approve` | SUPER_ADMIN or ADMIN | Platform-wide |
| `POST /admin/payouts/batch` | SUPER_ADMIN | Platform-wide |
| `POST /admin/refunds` | SUPER_ADMIN | Platform-wide |
| `POST /admin/freeze-advertiser` | ADMIN+ | Platform-wide |
| `POST /admin/freeze-payout` | ADMIN+ | Platform-wide |
| `GET /admin/reconciliation` | ADMIN+ | Platform-wide |
| `GET /admin/exports/invoices` | ADMIN+ | Platform-wide |
| `GET /admin/exports/payouts` | ADMIN+ | Platform-wide |
| `POST /admin/webhooks/:id/replay` | SUPER_ADMIN | Platform-wide |

### 9.4 Encryption of Sensitive Data

```
At rest:
- PostgreSQL: enable TDE (Transparent Data Encryption) or use encrypted volumes
- Stripe secrets: stored in environment variables, NEVER in DB
- VAT numbers: stored as-is (not PII under GDPR — business identifiers)
- Stripe Connect account IDs: stored as-is (identifiers, not secrets)

In transit:
- All Stripe API calls over HTTPS (enforced by Stripe SDK)
- Webhook endpoint: HTTPS only (reject HTTP)
- Internal API: HTTPS in production

Application-level:
- No credit card data stored locally (Stripe handles PCI compliance)
- Stripe Customer Portal for payment method management
- Device secrets for HMAC: encrypted at rest in device provisioning store
```

### 9.5 Audit Logs for Finance Actions

Every finance-related action creates an `AuditLog` entry:

```typescript
const FINANCE_AUDIT_ACTIONS = [
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_CANCELLED',
  'SUBSCRIPTION_UPDATED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUNDED',
  'INVOICE_CREATED',
  'INVOICE_PAID',
  'INVOICE_VOIDED',
  'REVENUE_SHARE_CALCULATED',
  'REVENUE_SHARE_APPROVED',
  'PAYOUT_INITIATED',
  'PAYOUT_COMPLETED',
  'PAYOUT_FAILED',
  'PAYOUT_HELD',
  'PAYOUT_RELEASED',
  'ADVERTISER_FROZEN',
  'ADVERTISER_UNFROZEN',
  'PARTNER_PAYOUT_FROZEN',
  'PARTNER_PAYOUT_UNFROZEN',
  'BOOKING_FROZEN',
  'BOOKING_UNFROZEN',
  'CREDIT_NOTE_ISSUED',
  'DISPUTE_RECEIVED',
  'DISPUTE_RESOLVED',
  'WEBHOOK_REPLAYED',
] as const;

// All finance audit logs have severity >= 'INFO'
// Fraud-related: severity = 'CRITICAL'
// Admin overrides: severity = 'WARN'
```

### 9.6 Double Payout Prevention

```
Layered protection:

Layer 1: Database constraint
  Payout.stripeTransferId UNIQUE
  → Cannot create two transfers for same Stripe transfer

Layer 2: RevenueShare.payoutId
  Once assigned, revenue share cannot be assigned to another payout
  → Checked in code before payout creation

Layer 3: Status guard
  Only RevenueShare with status = 'APPROVED' and payoutId = NULL can be included
  → SQL: WHERE status = 'APPROVED' AND payout_id IS NULL

Layer 4: Transfer group
  Stripe transfer_group = "payout_{payoutId}"
  → Traceable back to internal record

Layer 5: Payout batch lock
  Distributed lock (pg_advisory_lock) on "monthly_payout_batch_{period}"
  → Prevents concurrent batch runs

Layer 6: Manual review gate
  Revenue shares require SUPER_ADMIN approval before payout batch runs
  → Human verification step
```

---

## 10. Testing Scenarios

### 10.1 Payment Tests

| ID | Scenario | Setup | Expected Outcome | Verification |
|----|----------|-------|-------------------|-------------|
| PAY-01 | Subscription success | Advertiser selects 50 screens, completes checkout | Booking=ACTIVE, Campaign=ACTIVE, StripeSubscription=ACTIVE | DB states + Stripe dashboard |
| PAY-02 | Payment failure → campaign paused | Attach `pm_card_chargeDeclined` test card | Booking=PAUSED, Campaign=PAUSED, Notification sent | DB states + notification |
| PAY-03 | Recovery → campaign resumes | After PAY-02, update payment method, pay manually | Booking=ACTIVE, Campaign=ACTIVE (if AUTO_RESUME) | DB states |
| PAY-04 | Cancellation at period end | Advertiser cancels subscription | cancelAtPeriodEnd=true, stays ACTIVE until period end, then CANCELLED | Timeline check |
| PAY-05 | Immediate cancellation (admin) | Admin cancels subscription | Booking=CANCELLED, Campaign=COMPLETED, prorated credit note | DB + Stripe credit note |
| PAY-06 | Full refund | Admin refunds a paid invoice | StripePayment=REFUNDED, revenue shares voided | DB + Stripe refund |
| PAY-07 | Partial refund | Admin refunds 50% of invoice | StripePayment=PARTIALLY_REFUNDED, revenue shares adjusted | DB + amounts |
| PAY-08 | Chargeback | Stripe fires charge.dispute.created | Advertiser flagged, campaigns paused, admin notified | DB flags + audit log |
| PAY-09 | Trial → paid transition | Subscription with 14-day trial, trial ends | First invoice generated, payment processed, remains ACTIVE | Timeline |
| PAY-10 | Trial → payment failure | Trial ends, payment fails | Subscription=PAST_DUE, campaign paused | DB states |

### 10.2 Revenue Share Tests

| ID | Scenario | Setup | Expected Outcome | Verification |
|----|----------|-------|-------------------|-------------|
| REV-01 | Multi-partner split | Booking with screens from 3 partners | 3 RevenueShare records, amounts sum to booking total | Sum check |
| REV-02 | Partner-specific rate | Partner A has custom rate (25%), Partner B uses global (30%) | Different platformRate on each RevenueShare | Rate verification |
| REV-03 | Rate change mid-period | Rule changes on 15th of month | Prorated calculation: 14 days old rate + 14 days new rate | Amount check |
| REV-04 | Partner not onboarded | Partner has no Stripe Connect account | RevenueShare=APPROVED but no Payout created, balance held | Payout absence |
| REV-05 | Below minimum threshold | Partner earned €30 (below €50 threshold) | No Payout, balance carries to next month | Accumulation check |
| REV-06 | Threshold reached with accumulation | REV-05 + next month earns €40 → total €70 | Payout for €70 created | Combined amount |
| REV-07 | Uptime policy: PAY_REGARDLESS | Screen offline for 10 days | Full payment for full month | Amount = full price |
| REV-08 | Uptime policy: PRO_RATA | Screen offline for 10 days | Payment = unitPrice × (20/30) | Proportional amount |
| REV-09 | Uptime policy: DELIVERED_ONLY | Screen has 0 verified diffusions | Payment = €0 for that screen | Zero amount |
| REV-10 | Screen added mid-cycle | Advertiser adds 10 screens on day 15 | New BookingScreens with prorated revenue for 15 days | Proration check |
| REV-11 | Screen removed mid-cycle | Advertiser removes 5 screens on day 10 | BookingScreen.removedAt set, revenue prorated for 10 days | Proration check |
| REV-12 | Idempotent recalculation | Revenue share computed twice for same period | Same amounts, no duplicate records | UPSERT idempotency |

### 10.3 Webhook Robustness Tests

| ID | Scenario | Setup | Expected Outcome | Verification |
|----|----------|-------|-------------------|-------------|
| WH-01 | Duplicate event | Send same event.id twice | Second call is no-op, returns 200 | StripeWebhookEvent.processed unchanged |
| WH-02 | Out-of-order: paid before created | invoice.paid arrives before invoice.created | Both processed correctly (upsert handles order) | Both records exist |
| WH-03 | Replay after failure | Event failed on first attempt (retryCount=1) | Background job reprocesses successfully | processed=true |
| WH-04 | Dead letter (5 failures) | Event fails 5 times | Marked as dead letter, admin alerted | retryCount=5 + notification |
| WH-05 | Manual replay | Admin triggers replay via endpoint | Event reprocessed from Stripe API | Fresh payload + processed |
| WH-06 | Concurrent same event | Two webhook deliveries arrive simultaneously | Only one processes, other is no-op (DB unique constraint) | Single processing |

### 10.4 Security Tests

| ID | Scenario | Setup | Expected Outcome | Verification |
|----|----------|-------|-------------------|-------------|
| SEC-01 | Invalid webhook signature | Send webhook with wrong signing secret | 400 Bad Request, audit log warning | HTTP 400 + log entry |
| SEC-02 | Missing signature header | Send webhook without stripe-signature | 400 Bad Request | HTTP 400 |
| SEC-03 | Unauthorized payout request | MEMBER role tries POST /admin/payouts/batch | 403 Forbidden | HTTP 403 |
| SEC-04 | Cross-org invoice access | Advertiser A tries to read Advertiser B's invoices | 404 Not Found (org scoped) | HTTP 404 |
| SEC-05 | Audit log correctness | Admin approves revenue share | AuditLog entry with action=REVENUE_SHARE_APPROVED, userId, orgId | DB record |
| SEC-06 | Double payout attempt | Run payout batch twice for same period | Second run produces no new payouts | Payout count unchanged |
| SEC-07 | Self-dealing detection | User is member of both advertiser and partner org | Fraud signal F-008 raised, booking frozen | Flag + audit log |
| SEC-08 | Spoofed diffusion log | Log with invalid HMAC signature | verified=false, excluded from revenue calculation | Verification flag |

### 10.5 End-to-End Integration Test Sequence

```
Full lifecycle test (happy path):

1. Create advertiser org + Stripe customer
2. Create partner org + Stripe Connect account (test mode)
3. Create 3 screens for partner
4. Set global revenue rule: 70/30

5. Advertiser creates Booking (DRAFT) with 3 screens
6. Advertiser initiates checkout → Stripe test Checkout Session
7. Complete payment with test card pm_card_visa

8. Verify:
   - Booking = ACTIVE
   - Campaign = ACTIVE
   - StripeSubscription = ACTIVE
   - 3 BookingScreens with price snapshots

9. Advance clock (Stripe test clock) to next period
10. Stripe generates invoice → invoice.paid

11. Verify:
    - StripeInvoice = PAID
    - Revenue share computation triggered

12. Revenue share batch runs:
    - RevenueShare created for partner (status=CALCULATED)
    - LineItems reference each BookingScreen

13. Admin approves revenue share → status=APPROVED

14. Payout batch runs:
    - Payout created (status=PROCESSING)
    - Stripe transfer initiated
    - On transfer.created → Payout.stripeTransferId set

15. Verify final state:
    - Payout = PAID
    - RevenueShare = PAID
    - All audit logs present
    - Reconciliation query shows MATCHED

16. Export CSV, verify all fields populated
```

---

## Appendix A: NestJS Module Structure

```
packages/api/src/modules/
├── billing/
│   ├── billing.module.ts
│   ├── billing.controller.ts        # Checkout, subscription management
│   ├── billing.service.ts           # Stripe API interactions
│   ├── checkout.service.ts          # Checkout session creation
│   ├── subscription.service.ts      # Subscription CRUD
│   └── dto/
│       ├── create-checkout.dto.ts
│       └── update-subscription.dto.ts
├── webhooks/
│   ├── webhooks.module.ts
│   ├── stripe-webhook.controller.ts # POST /stripe/webhook
│   ├── webhook-processor.service.ts # Event routing + idempotency
│   ├── handlers/
│   │   ├── invoice.handler.ts       # invoice.* events
│   │   ├── subscription.handler.ts  # customer.subscription.* events
│   │   ├── payment.handler.ts       # payment_intent.* events
│   │   ├── checkout.handler.ts      # checkout.session.* events
│   │   ├── dispute.handler.ts       # charge.dispute.* events
│   │   └── connect.handler.ts       # account.*, transfer.*, payout.* events
│   └── webhook-replay.service.ts    # Manual replay + dead letter processing
├── revenue/
│   ├── revenue.module.ts
│   ├── revenue.controller.ts        # Revenue share endpoints
│   ├── revenue-computation.service.ts # Core algorithm
│   ├── revenue-rule.service.ts      # Rule CRUD + lookup
│   └── dto/
│       └── approve-revenue-share.dto.ts
├── payouts/
│   ├── payouts.module.ts
│   ├── payouts.controller.ts        # Payout endpoints
│   ├── payout-batch.service.ts      # Monthly batch processing
│   ├── partner-connect.service.ts   # Stripe Connect onboarding
│   └── dto/
│       └── initiate-payout.dto.ts
├── fraud/
│   ├── fraud.module.ts
│   ├── fraud-detection.service.ts   # Rule engine
│   ├── fraud-signals.service.ts     # Signal evaluation
│   └── admin-actions.service.ts     # Freeze/unfreeze
└── exports/
    ├── exports.module.ts
    ├── exports.controller.ts        # CSV download endpoints
    ├── invoice-export.service.ts
    ├── payout-export.service.ts
    └── journal-export.service.ts
```

## Appendix B: Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Stripe Tax
STRIPE_TAX_ENABLED=true

# Billing
BILLING_MINIMUM_PAYOUT_CENTS=5000
BILLING_DEFAULT_TRIAL_DAYS=14
BILLING_DUNNING_MAX_RETRIES=3
BILLING_DEFAULT_PLATFORM_RATE=0.30
BILLING_DEFAULT_RESUME_POLICY=AUTO_RESUME
BILLING_DEFAULT_UPTIME_POLICY=PAY_REGARDLESS

# Fraud
FRAUD_MAX_DIFFUSIONS_PER_SCREEN_PER_DAY=2000
FRAUD_CHARGEBACK_THRESHOLD=2
FRAUD_SCREEN_GHOST_DAYS=7
```

## Appendix C: Stripe Products Setup Script

```typescript
// scripts/setup-stripe-products.ts
// Run once to seed Stripe with products and prices

async function setupStripeProducts() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // 1. Ad Pack Premium
  const premiumProduct = await stripe.products.create({
    name: 'Ad Pack — Premium',
    metadata: { tier: 'PREMIUM', type: 'AD_PACK' },
  });

  const premiumPrices = [
    { screens: 50, amount: 49900 },
    { screens: 100, amount: 89900 },
    { screens: 150, amount: 124900 },
    { screens: 200, amount: 154900 },
    { screens: 300, amount: 209900 },
  ];

  for (const p of premiumPrices) {
    await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: p.amount,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: `premium-${p.screens}`,
      metadata: { screens: String(p.screens), tier: 'PREMIUM' },
    });
  }

  // 2. Ad Pack Standard
  const standardProduct = await stripe.products.create({
    name: 'Ad Pack — Standard',
    metadata: { tier: 'STANDARD', type: 'AD_PACK' },
  });

  const standardPrices = [
    { screens: 50, amount: 34900 },
    { screens: 100, amount: 64900 },
    { screens: 150, amount: 89900 },
    { screens: 200, amount: 114900 },
    { screens: 300, amount: 159900 },
  ];

  for (const p of standardPrices) {
    await stripe.prices.create({
      product: standardProduct.id,
      unit_amount: p.amount,
      currency: 'eur',
      recurring: { interval: 'month' },
      lookup_key: `standard-${p.screens}`,
      metadata: { screens: String(p.screens), tier: 'STANDARD' },
    });
  }

  // 3. Add-ons
  const catalogProduct = await stripe.products.create({
    name: 'Catalog Listing Add-on',
    metadata: { type: 'ADDON_CATALOG' },
  });
  await stripe.prices.create({
    product: catalogProduct.id,
    unit_amount: 9900,
    currency: 'eur',
    recurring: { interval: 'month' },
    lookup_key: 'addon-catalog',
  });

  const sponsoredProduct = await stripe.products.create({
    name: 'Sponsored Placement Add-on',
    metadata: { type: 'ADDON_SPONSORED' },
  });
  await stripe.prices.create({
    product: sponsoredProduct.id,
    unit_amount: 14900,
    currency: 'eur',
    recurring: { interval: 'month' },
    lookup_key: 'addon-sponsored',
  });

  // 4. AI Credits
  const aiCreditsProduct = await stripe.products.create({
    name: 'AI Credits Top-up',
    metadata: { type: 'AI_CREDITS' },
  });
  await stripe.prices.create({
    product: aiCreditsProduct.id,
    unit_amount: 990,
    currency: 'eur',
    lookup_key: 'ai-credits-100',
    metadata: { credits: '100' },
  });
  await stripe.prices.create({
    product: aiCreditsProduct.id,
    unit_amount: 3990,
    currency: 'eur',
    lookup_key: 'ai-credits-500',
    metadata: { credits: '500' },
  });

  console.log('Stripe products and prices created successfully.');
}
```

---

*End of Billing & Revenue-Sharing Architecture Document*
