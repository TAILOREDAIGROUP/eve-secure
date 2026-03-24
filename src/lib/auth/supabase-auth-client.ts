import { createBrowserClient } from '@supabase/ssr';

// ─── Custom error ──────────────────────────────────────────────────────────────
export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// ─── Auth result type ──────────────────────────────────────────────────────────
export interface AuthResult {
  user: {
    id: string;
    email: string;
    role: string;
  };
  tenantId: string;
  supabaseUid: string;
}

// ─── Client-side (browser) ─────────────────────────────────────────────────────
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Client-side auth functions ────────────────────────────────────────────────
export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new AuthError(error.message, 401);
  return data;
}

export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, unknown>
) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) throw new AuthError(error.message, 400);
  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(error.message, 500);
}
