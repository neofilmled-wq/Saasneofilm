import { z } from 'zod';

export const mqttConfigSchema = z.object({
  MQTT_BROKER_URL: z
    .string()
    .default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
});

export type MqttConfig = z.infer<typeof mqttConfigSchema>;
