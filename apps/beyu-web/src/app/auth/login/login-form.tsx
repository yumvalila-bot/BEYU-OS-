'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { loginAction, type LoginState } from '../actions';

const initialState: LoginState = { message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="field"
          placeholder="you@beyu.example"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-sm text-critical"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
