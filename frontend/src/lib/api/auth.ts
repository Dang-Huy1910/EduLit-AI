import { apiRequest } from './http';
import type { ApiUser } from './types';

export async function loginApi(loginId: string, password: string): Promise<ApiUser> {
  const result = await apiRequest<{ user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: { loginId, password },
  });
  return result.user;
}

export async function listDemoAccounts(): Promise<ApiUser[]> {
  const result = await apiRequest<{ accounts: ApiUser[] }>('/auth/demo-accounts');
  return result.accounts;
}

export async function demoLoginApi(loginId: string): Promise<ApiUser> {
  const result = await apiRequest<{ user: ApiUser }>('/auth/demo-login', {
    method: 'POST',
    body: { loginId },
  });
  return result.user;
}

export async function fetchMe(): Promise<ApiUser> {
  return apiRequest<ApiUser>('/auth/me');
}

export async function logoutApi(): Promise<void> {
  await apiRequest<Record<string, never>>('/auth/logout', {
    method: 'POST',
    body: {},
  });
}
