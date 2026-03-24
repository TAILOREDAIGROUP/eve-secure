"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function LoginPage() {
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
            <SignIn
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-0 bg-transparent",
                  socialButtonsBlockButton:
                    "border border-slate-600 bg-slate-700/50 text-white hover:bg-slate-700",
                  formButtonPrimary:
                    "bg-blue-600 text-white hover:bg-blue-700 rounded-lg",
                  formFieldInput:
                    "bg-slate-700 border-slate-600 text-white placeholder:text-slate-400",
                  headerTitle: "text-white text-xl font-semibold",
                  headerSubtitle: "text-slate-400 text-sm",
                  dividerLine: "bg-slate-700",
                  dividerText: "text-slate-400",
                  footerActionLink: "text-blue-400 hover:text-blue-300",
                },
              }}
              redirectUrl="/dashboard"
              signUpUrl="/signup"
            />
          </Card>

          {/* Security Notice */}
          <div className="rounded-lg border border-amber-900/30 bg-amber-900/10 p-4 text-center">
            <p className="text-xs text-amber-200">
              ⚠️ Multi-factor authentication required for all accounts
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
