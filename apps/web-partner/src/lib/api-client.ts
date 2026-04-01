import { NeoFilmApiClient } from '@neofilm/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient = new NeoFilmApiClient(API_BASE_URL, async () => {
  return typeof window !== 'undefined'
    ? localStorage.getItem('neofilm_partner_token')
    : null;
});
