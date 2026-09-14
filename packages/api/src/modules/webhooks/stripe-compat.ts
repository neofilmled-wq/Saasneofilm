import Stripe from 'stripe';

/**
 * Readers for the Stripe fields that MOVED between API versions.
 *
 * Webhook payloads are delivered in the ACCOUNT's default API version, which is
 * independent from the version the SDK is pinned to (`stripe.provider.ts`). Our
 * account now delivers `2026-03-25.dahlia`, where:
 *
 *   - `invoice.subscription`                   → `invoice.parent.subscription_details.subscription`
 *   - `invoice.subscription_details.metadata`  → `invoice.parent.subscription_details.metadata`
 *   - `subscription.current_period_start/end`  → `subscription.items.data[].current_period_start/end`
 *
 * Reading the old paths returned `undefined`, which silently disabled the
 * booking side-effects of `invoice.paid` / `invoice.payment_failed` and made
 * `new Date(undefined * 1000)` an Invalid Date that Prisma rejects on every
 * `customer.subscription.*` event.
 *
 * Each reader tries the new path first, then the legacy one, so payloads from
 * either API version work and a future version pin changes nothing.
 */

/** Stripe subscription id carried by an invoice, whatever the API version. */
export function subscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | undefined {
  const any = invoice as any;
  const candidates = [
    any.parent?.subscription_details?.subscription,
    any.subscription,
    any.lines?.data?.[0]?.parent?.subscription_item_details?.subscription,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') return c;
    if (c?.id) return c.id;
  }
  return undefined;
}

/**
 * Our own `bookingId`, set on `subscription_data.metadata` at checkout
 * (`billing.service.createCheckoutSession`). Used to resolve the booking when
 * `invoice.paid` lands BEFORE `checkout.session.completed` — Stripe does not
 * guarantee webhook ordering, and on a new subscription the invoice routinely
 * arrives first, before the booking carries its subscription id.
 */
export function bookingIdFromInvoice(
  invoice: Stripe.Invoice,
): string | undefined {
  const any = invoice as any;
  return (
    any.parent?.subscription_details?.metadata?.bookingId ??
    any.subscription_details?.metadata?.bookingId ??
    any.lines?.data?.[0]?.metadata?.bookingId ??
    undefined
  );
}

/**
 * Current billing period of a subscription. Falls back to now / now + 30d only
 * when both the item and the legacy root fields are missing, so the row stays
 * writable instead of throwing on an Invalid Date.
 */
export function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const any = subscription as any;
  const item = any.items?.data?.[0];
  const start = item?.current_period_start ?? any.current_period_start;
  const end = item?.current_period_end ?? any.current_period_end;

  return {
    start: typeof start === 'number' ? new Date(start * 1000) : new Date(),
    end:
      typeof end === 'number'
        ? new Date(end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Service period covered by an invoice.
 *
 * On a subscription invoice the top-level `period_start` / `period_end` are
 * both the invoice CREATION instant — a zero-length window. The real service
 * period lives on the line items. This matters well beyond cosmetics: the
 * partner retrocession engine gates every payout on
 * `periodStart <= renewal < periodEnd` (`partner-commissions.service`), so a
 * zero-length window silently made every partner statement come out empty.
 *
 * Take the widest span across the line items, and fall back to the invoice
 * level (then to a 1-month window) when there are none.
 */
export function invoicePeriod(invoice: Stripe.Invoice): {
  start: Date;
  end: Date;
} {
  const any = invoice as any;
  const lines: any[] = any.lines?.data ?? [];

  const starts = lines
    .map((l) => l.period?.start)
    .filter((t): t is number => typeof t === 'number');
  const ends = lines
    .map((l) => l.period?.end)
    .filter((t): t is number => typeof t === 'number');

  let start = starts.length ? Math.min(...starts) : any.period_start;
  let end = ends.length ? Math.max(...ends) : any.period_end;

  // Degenerate or missing → keep the invoice level if it is a real window,
  // otherwise open a one-month window from the start.
  if (typeof start !== 'number') start = Math.floor(Date.now() / 1000);
  if (typeof end !== 'number' || end <= start) {
    const invEnd = any.period_end;
    end =
      typeof invEnd === 'number' && invEnd > start
        ? invEnd
        : start + 30 * 24 * 60 * 60;
  }

  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}
