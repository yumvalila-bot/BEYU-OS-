'use server';

import { redirect } from 'next/navigation';

import { ApiError, apiFetch } from '@/lib/api';
import { clearSession, readRefreshToken, writeSession } from '@/lib/session';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    activeTenantId: string | null;
    mfaRequired: boolean;
  };
}

export interface LoginState {
  message: string | null;
}

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { message: 'Enter your email address and password.' };
  }

  let result: LoginResult;
  try {
    result = await apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // The API returns an identical message for an unknown account and a
      // wrong password so the endpoint cannot be used to enumerate users.
      // Surfacing it verbatim keeps that property intact.
      return { message: error.message };
    }
    throw error;
  }

  writeSession(result);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const refreshToken = readRefreshToken();
  if (refreshToken) {
    try {
      await apiFetch<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        anonymous: true,
      });
    } catch {
      // Server-side revocation failing must not strand the user in a signed-in
      // shell. The cookies are cleared regardless.
    }
  }
  clearSession();
  redirect('/auth/login');
}
