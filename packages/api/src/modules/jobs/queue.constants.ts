/** BullMQ queue names used across the application */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  INVOICE_GENERATION: 'invoice-generation',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
  CAMPAIGN_LIFECYCLE: 'campaign-lifecycle',
  DEVICE_STATUS: 'device-status',
  SCHEDULE_GENERATION: 'schedule-generation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
