import { UserRole } from '../enums';

export interface IUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  partnerId?: string;
  advertiserId?: string;
  createdAt: Date;
  updatedAt: Date;
}
