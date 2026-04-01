import type { PaginatedResponse, PaginationQuery } from '../dto/pagination.dto';
import type { LoginDto, RegisterDto, RefreshTokenDto, TokenResponseDto } from '../dto/auth.dto';
import type { CreateUserDto, UpdateUserDto, UserResponseDto } from '../dto/user.dto';
import type {
  CreatePartnerDto,
  UpdatePartnerDto,
  CreateVenueDto,
  UpdateVenueDto,
} from '../dto/partner.dto';
import type { CreateAdvertiserDto, UpdateAdvertiserDto } from '../dto/advertiser.dto';
import type {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignStatusDto,
  CampaignQueryDto,
} from '../dto/campaign.dto';
import type { CreateCreativeDto, UpdateCreativeDto } from '../dto/creative.dto';
import type { CreateDeviceDto, UpdateDeviceDto, DeviceQueryDto } from '../dto/device.dto';
import type { CreateScheduleDto, UpdateScheduleDto } from '../dto/schedule.dto';
import type { CreateInvoiceDto, InvoiceQueryDto } from '../dto/invoice.dto';
import type { IUser } from '../types/user.types';
import type { IPartner, IVenue } from '../types/partner.types';
import type { IAdvertiser } from '../types/advertiser.types';
import type { ICampaign, ICreative } from '../types/campaign.types';
import type { IDevice } from '../types/device.types';
import type { IInvoice } from '../types/billing.types';
import { ApiError } from '../errors/api-error';
import { ErrorCode } from '../errors/error-codes';

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  authenticated?: boolean;
}

export class NeoFilmApiClient {
  private baseUrl: string;
  private getToken: () => Promise<string | null>;

  public readonly auth: AuthNamespace;
  public readonly users: UsersNamespace;
  public readonly partners: PartnersNamespace;
  public readonly venues: VenuesNamespace;
  public readonly advertisers: AdvertisersNamespace;
  public readonly campaigns: CampaignsNamespace;
  public readonly creatives: CreativesNamespace;
  public readonly devices: DevicesNamespace;
  public readonly schedules: SchedulesNamespace;
  public readonly invoices: InvoicesNamespace;

  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.getToken = getToken;

    this.auth = new AuthNamespace(this);
    this.users = new UsersNamespace(this);
    this.partners = new PartnersNamespace(this);
    this.venues = new VenuesNamespace(this);
    this.advertisers = new AdvertisersNamespace(this);
    this.campaigns = new CampaignsNamespace(this);
    this.creatives = new CreativesNamespace(this);
    this.devices = new DevicesNamespace(this);
    this.schedules = new SchedulesNamespace(this);
    this.invoices = new InvoicesNamespace(this);
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, body, query, authenticated = true } = options;

    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (authenticated) {
      const token = await this.getToken();
      if (!token) {
        throw ApiError.unauthorized('No authentication token available');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: { code?: string; message?: string; details?: Record<string, unknown> };
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { message: response.statusText };
      }

      throw new ApiError(
        (errorBody.code as ErrorCode) ?? ErrorCode.INTERNAL_SERVER_ERROR,
        errorBody.message ?? `Request failed with status ${response.status}`,
        response.status,
        errorBody.details,
      );
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

// ------ Namespace classes ------

class AuthNamespace {
  constructor(private client: NeoFilmApiClient) {}

  login(data: LoginDto): Promise<TokenResponseDto> {
    return this.client.request<TokenResponseDto>({
      method: 'POST',
      path: '/auth/login',
      body: data,
      authenticated: false,
    });
  }

  register(data: RegisterDto): Promise<TokenResponseDto> {
    return this.client.request<TokenResponseDto>({
      method: 'POST',
      path: '/auth/register',
      body: data,
      authenticated: false,
    });
  }

  refresh(data: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.client.request<TokenResponseDto>({
      method: 'POST',
      path: '/auth/refresh',
      body: data,
      authenticated: false,
    });
  }

  me(): Promise<UserResponseDto> {
    return this.client.request<UserResponseDto>({
      method: 'GET',
      path: '/auth/me',
    });
  }
}

class UsersNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: PaginationQuery): Promise<PaginatedResponse<IUser>> {
    return this.client.request({
      method: 'GET',
      path: '/users',
      query: query as Record<string, unknown>,
    });
  }

  get(id: string): Promise<IUser> {
    return this.client.request({ method: 'GET', path: `/users/${id}` });
  }

  create(data: CreateUserDto): Promise<IUser> {
    return this.client.request({ method: 'POST', path: '/users', body: data });
  }

  update(id: string, data: UpdateUserDto): Promise<IUser> {
    return this.client.request({ method: 'PATCH', path: `/users/${id}`, body: data });
  }

  delete(id: string): Promise<void> {
    return this.client.request({ method: 'DELETE', path: `/users/${id}` });
  }
}

class PartnersNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: PaginationQuery): Promise<PaginatedResponse<IPartner>> {
    return this.client.request({
      method: 'GET',
      path: '/partners',
      query: query as Record<string, unknown>,
    });
  }

  get(id: string): Promise<IPartner> {
    return this.client.request({ method: 'GET', path: `/partners/${id}` });
  }

  create(data: CreatePartnerDto): Promise<IPartner> {
    return this.client.request({ method: 'POST', path: '/partners', body: data });
  }

  update(id: string, data: UpdatePartnerDto): Promise<IPartner> {
    return this.client.request({ method: 'PATCH', path: `/partners/${id}`, body: data });
  }

  delete(id: string): Promise<void> {
    return this.client.request({ method: 'DELETE', path: `/partners/${id}` });
  }
}

class VenuesNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(partnerId: string, query?: PaginationQuery): Promise<PaginatedResponse<IVenue>> {
    return this.client.request({
      method: 'GET',
      path: `/partners/${partnerId}/venues`,
      query: query as Record<string, unknown>,
    });
  }

  get(partnerId: string, venueId: string): Promise<IVenue> {
    return this.client.request({
      method: 'GET',
      path: `/partners/${partnerId}/venues/${venueId}`,
    });
  }

  create(data: CreateVenueDto): Promise<IVenue> {
    return this.client.request({
      method: 'POST',
      path: `/partners/${data.partnerId}/venues`,
      body: data,
    });
  }

  update(partnerId: string, venueId: string, data: UpdateVenueDto): Promise<IVenue> {
    return this.client.request({
      method: 'PATCH',
      path: `/partners/${partnerId}/venues/${venueId}`,
      body: data,
    });
  }

  delete(partnerId: string, venueId: string): Promise<void> {
    return this.client.request({
      method: 'DELETE',
      path: `/partners/${partnerId}/venues/${venueId}`,
    });
  }
}

class AdvertisersNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: PaginationQuery): Promise<PaginatedResponse<IAdvertiser>> {
    return this.client.request({
      method: 'GET',
      path: '/advertisers',
      query: query as Record<string, unknown>,
    });
  }

  get(id: string): Promise<IAdvertiser> {
    return this.client.request({ method: 'GET', path: `/advertisers/${id}` });
  }

  create(data: CreateAdvertiserDto): Promise<IAdvertiser> {
    return this.client.request({ method: 'POST', path: '/advertisers', body: data });
  }

  update(id: string, data: UpdateAdvertiserDto): Promise<IAdvertiser> {
    return this.client.request({ method: 'PATCH', path: `/advertisers/${id}`, body: data });
  }

  delete(id: string): Promise<void> {
    return this.client.request({ method: 'DELETE', path: `/advertisers/${id}` });
  }
}

class CampaignsNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: CampaignQueryDto): Promise<PaginatedResponse<ICampaign>> {
    return this.client.request({
      method: 'GET',
      path: '/campaigns',
      query: query as unknown as Record<string, unknown>,
    });
  }

  get(id: string): Promise<ICampaign> {
    return this.client.request({ method: 'GET', path: `/campaigns/${id}` });
  }

  create(data: CreateCampaignDto): Promise<ICampaign> {
    return this.client.request({ method: 'POST', path: '/campaigns', body: data });
  }

  update(id: string, data: UpdateCampaignDto): Promise<ICampaign> {
    return this.client.request({ method: 'PATCH', path: `/campaigns/${id}`, body: data });
  }

  updateStatus(id: string, data: UpdateCampaignStatusDto): Promise<ICampaign> {
    return this.client.request({
      method: 'PATCH',
      path: `/campaigns/${id}/status`,
      body: data,
    });
  }

  delete(id: string): Promise<void> {
    return this.client.request({ method: 'DELETE', path: `/campaigns/${id}` });
  }
}

class CreativesNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(
    campaignId: string,
    query?: PaginationQuery,
  ): Promise<PaginatedResponse<ICreative>> {
    return this.client.request({
      method: 'GET',
      path: `/campaigns/${campaignId}/creatives`,
      query: query as Record<string, unknown>,
    });
  }

  get(campaignId: string, creativeId: string): Promise<ICreative> {
    return this.client.request({
      method: 'GET',
      path: `/campaigns/${campaignId}/creatives/${creativeId}`,
    });
  }

  create(data: CreateCreativeDto): Promise<ICreative> {
    return this.client.request({
      method: 'POST',
      path: `/campaigns/${data.campaignId}/creatives`,
      body: data,
    });
  }

  update(
    campaignId: string,
    creativeId: string,
    data: UpdateCreativeDto,
  ): Promise<ICreative> {
    return this.client.request({
      method: 'PATCH',
      path: `/campaigns/${campaignId}/creatives/${creativeId}`,
      body: data,
    });
  }

  delete(campaignId: string, creativeId: string): Promise<void> {
    return this.client.request({
      method: 'DELETE',
      path: `/campaigns/${campaignId}/creatives/${creativeId}`,
    });
  }
}

class DevicesNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: DeviceQueryDto): Promise<PaginatedResponse<IDevice>> {
    return this.client.request({
      method: 'GET',
      path: '/devices',
      query: query as unknown as Record<string, unknown>,
    });
  }

  get(id: string): Promise<IDevice> {
    return this.client.request({ method: 'GET', path: `/devices/${id}` });
  }

  create(data: CreateDeviceDto): Promise<IDevice> {
    return this.client.request({ method: 'POST', path: '/devices', body: data });
  }

  update(id: string, data: UpdateDeviceDto): Promise<IDevice> {
    return this.client.request({ method: 'PATCH', path: `/devices/${id}`, body: data });
  }

  delete(id: string): Promise<void> {
    return this.client.request({ method: 'DELETE', path: `/devices/${id}` });
  }
}

class SchedulesNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(campaignId: string, query?: PaginationQuery): Promise<PaginatedResponse<unknown>> {
    return this.client.request({
      method: 'GET',
      path: `/campaigns/${campaignId}/schedules`,
      query: query as Record<string, unknown>,
    });
  }

  get(campaignId: string, scheduleId: string): Promise<unknown> {
    return this.client.request({
      method: 'GET',
      path: `/campaigns/${campaignId}/schedules/${scheduleId}`,
    });
  }

  create(data: CreateScheduleDto): Promise<unknown> {
    return this.client.request({
      method: 'POST',
      path: `/campaigns/${data.campaignId}/schedules`,
      body: data,
    });
  }

  update(
    campaignId: string,
    scheduleId: string,
    data: UpdateScheduleDto,
  ): Promise<unknown> {
    return this.client.request({
      method: 'PATCH',
      path: `/campaigns/${campaignId}/schedules/${scheduleId}`,
      body: data,
    });
  }

  delete(campaignId: string, scheduleId: string): Promise<void> {
    return this.client.request({
      method: 'DELETE',
      path: `/campaigns/${campaignId}/schedules/${scheduleId}`,
    });
  }
}

class InvoicesNamespace {
  constructor(private client: NeoFilmApiClient) {}

  list(query?: InvoiceQueryDto): Promise<PaginatedResponse<IInvoice>> {
    return this.client.request({
      method: 'GET',
      path: '/invoices',
      query: query as unknown as Record<string, unknown>,
    });
  }

  get(id: string): Promise<IInvoice> {
    return this.client.request({ method: 'GET', path: `/invoices/${id}` });
  }

  create(data: CreateInvoiceDto): Promise<IInvoice> {
    return this.client.request({ method: 'POST', path: '/invoices', body: data });
  }
}
