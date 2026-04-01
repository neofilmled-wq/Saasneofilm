export enum DeviceState {
  UNPAIRED = 'UNPAIRED',
  PAIRED = 'PAIRED',
  SYNCING = 'SYNCING',
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
  ERROR = 'ERROR',
}

export const VALID_TRANSITIONS: Record<DeviceState, DeviceState[]> = {
  [DeviceState.UNPAIRED]: [DeviceState.PAIRED],
  [DeviceState.PAIRED]: [DeviceState.SYNCING, DeviceState.UNPAIRED],
  [DeviceState.SYNCING]: [DeviceState.ACTIVE, DeviceState.ERROR, DeviceState.UNPAIRED],
  [DeviceState.ACTIVE]: [DeviceState.OFFLINE, DeviceState.ERROR, DeviceState.SYNCING, DeviceState.UNPAIRED],
  [DeviceState.OFFLINE]: [DeviceState.ACTIVE, DeviceState.SYNCING, DeviceState.ERROR],
  [DeviceState.ERROR]: [DeviceState.SYNCING, DeviceState.UNPAIRED],
};

export function canTransition(from: DeviceState, to: DeviceState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
