"use client";

import { Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { createClient } from "@/lib/auth/supabase-auth";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      router.push("/onboarding");
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

          {/* Sign Up Card */}
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
                  autoComplete="new-password"
                  minLength={12}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Minimum 12 characters"
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
                {loading ? "Creating account..." : "Create Account"}
              </Button>

              <p className="text-center text-sm text-slate-400">
                Already have an account?{" "}
                <a href="/login" className="text-blue-400 hover:text-blue-300">
                  Sign in
                </a>
              </p>
            </form>
          </Card>

          {/* Features List */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Included with signup:
            </p>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span> AI-powered security assessment
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span> Incident response guidance
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span> Compliance recommendations
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span> Mandatory MFA enforcement
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-xs text-slate-500">
              By signing up, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
