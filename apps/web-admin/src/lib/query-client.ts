import { QueryClient } from '@tanstack/react-query';

let queryClient: QueryClient | null = null;

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
        mutations: { retry: 0 },
      },
    });
  }
  return queryClient;
}
