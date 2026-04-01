export interface IPartner {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  country: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  postCode?: string;
  country: string;
  timezone: string;
  category: string;
  screenCount: number;
  partnerId: string;
  createdAt: string;
  updatedAt: string;
}
