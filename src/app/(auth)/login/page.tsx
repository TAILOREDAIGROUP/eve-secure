"use client";

import { Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/auth/supabase-auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-8">
      <Suspense fallback={<div className="text-white">Loading...</div>}>
        <div className="w-full max-w-md space-y-6">
          {/* Logo Section */}
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 p-2">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">EVE Secure</h1>
            </div>
            <p className="text-sm text-slate-400">
              AI-Driven Security Assessment & Incident Response
            </p>
          </div>

          {/* Sign In Card */}
          <Card className="border border-slate-700 bg-slate-800/50 p-6 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-800 bg-red-900/30 p-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <p className="text-center text-sm text-slate-400">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="text-blue-400 hover:text-blue-300">
                  Sign up
                </a>
              </p>
            </form>
          </Card>

          {/* Security Notice */}
          <div className="rounded-lg border border-amber-900/30 bg-amber-900/10 p-4 text-center">
            <p className="text-xs text-amber-200">
              Multi-factor authentication required for all accounts
            </p>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-xs text-slate-500">
              EVE Secure uses industry-standard encryption and security
              protocols
            </p>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
