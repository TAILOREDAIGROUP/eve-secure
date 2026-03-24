/**
 * Supabase Auth — Client-safe barrel export
 *
 * This file re-exports client-safe auth utilities only.
 * For server-side auth (requireAuth, MFA, etc.), import from './supabase-auth-server'.
 */
export {
  AuthError,
  type AuthResult,
  createClient,
  signIn,
  signUp,
  signOut,
} from './supabase-auth-client';
