import { DeviceStatus } from '../enums';

export interface IDevice {
  id: string;
  name: string;
  serialNumber: string;
  status: DeviceStatus;
  lastPingAt?: Date;
  firmwareVersion?: string;
  resolution?: string;
  venueId: string;
  createdAt: Date;
  updatedAt: Date;
}
