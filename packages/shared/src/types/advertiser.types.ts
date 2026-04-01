export interface IAdvertiser {
  id: string;
  companyName: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  billingAddress?: string;
  vatNumber?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
