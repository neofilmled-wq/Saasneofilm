export enum DiffusionTrigger {
  POWER_ON = 'POWER_ON',
  OPEN_APP = 'OPEN_APP',
  CHANGE_APP = 'CHANGE_APP',
  CATALOG_OPEN = 'CATALOG_OPEN',
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

export enum AdTier {
  FORCED = 'FORCED',
  PREMIUM = 'PREMIUM',
  STANDARD = 'STANDARD',
  HOUSE = 'HOUSE',
}

export enum OverrideAction {
  FORCE = 'FORCE',
  BLOCK = 'BLOCK',
  PAUSE = 'PAUSE',
}

export enum OverrideScope {
  SPECIFIC = 'SPECIFIC',
  ALL = 'ALL',
  PARTNER = 'PARTNER',
  GEO = 'GEO',
}

export enum ScreenEnvironment {
  CINEMA_LOBBY = 'CINEMA_LOBBY',
  CINEMA_HALLWAY = 'CINEMA_HALLWAY',
  HOTEL_LOBBY = 'HOTEL_LOBBY',
  HOTEL_ROOM = 'HOTEL_ROOM',
  RESTAURANT = 'RESTAURANT',
  RETAIL = 'RETAIL',
  OUTDOOR = 'OUTDOOR',
  OTHER = 'OTHER',
}
