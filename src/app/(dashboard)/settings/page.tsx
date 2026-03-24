"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Bell,
  Lock,
  User,
  Shield,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface UserSettings {
  id: string;
  email: string;
  name: string;
  notifications: {
    assessmentUpdates: boolean;
    securityAlerts: boolean;
    weeklyDigest: boolean;
    planUpdates: boolean;
  };
  emergencyCodes: string[];
  mfaEnabled: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [showCodes, setShowCodes] = useState(false);

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const [notifications, setNotifications] = useState<UserSettings["notifications"]>(
    settings?.notifications || {
      assessmentUpdates: false,
      securityAlerts: false,
      weeklyDigest: false,
      planUpdates: false,
    }
  );

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: UserSettings["notifications"]) => {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update notifications");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Notification preferences updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const generateCodesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/emergency-codes", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate codes");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Emergency codes generated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate codes",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-slate-400">
          Manage your account, notifications, and security preferences
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent p-0">
          <TabsTrigger
            value="profile"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <Lock className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Profile Info</h2>
            <div className="mt-6 space-y-6">
              <div>
                <Label htmlFor="name" className="text-slate-300">
                  Full Name
                </Label>
                <Input
                  id="name"
                  defaultValue={settings?.name}
                  disabled
                  className="mt-2 border-slate-700 bg-slate-800 text-slate-300"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Managed by your account provider
                </p>
              </div>

              <div>
                <Label htmlFor="email" className="text-slate-300">
                  Email Address
                </Label>
                <Input
                  id="email"
                  defaultValue={settings?.email}
                  disabled
                  className="mt-2 border-slate-700 bg-slate-800 text-slate-300"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Cannot be changed here
                </p>
              </div>

              <div className="rounded-lg border border-blue-900/30 bg-blue-900/10 p-4">
                <p className="text-sm text-blue-200">
                  ℹ️ To update your profile information, visit your account
                  settings in the top-right menu.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">
              Notification Preferences
            </h2>
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div>
                  <p className="font-medium text-white">Assessment Updates</p>
                  <p className="text-sm text-slate-400">
                    Get notified when your assessment progress updates
                  </p>
                </div>
                <Checkbox
                  checked={notifications.assessmentUpdates || false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...notifications,
                      assessmentUpdates: checked as boolean,
                    };
                    setNotifications(updated);
                    updateNotificationsMutation.mutate(updated);
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div>
                  <p className="font-medium text-white">Security Alerts</p>
                  <p className="text-sm text-slate-400">
                    Critical security findings and recommendations
                  </p>
                </div>
                <Checkbox
                  checked={notifications.securityAlerts || false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...notifications,
                      securityAlerts: checked as boolean,
                    };
                    setNotifications(updated);
                    updateNotificationsMutation.mutate(updated);
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div>
                  <p className="font-medium text-white">Weekly Digest</p>
                  <p className="text-sm text-slate-400">
                    Summary of activity and recommendations
                  </p>
                </div>
                <Checkbox
                  checked={notifications.weeklyDigest || false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...notifications,
                      weeklyDigest: checked as boolean,
                    };
                    setNotifications(updated);
                    updateNotificationsMutation.mutate(updated);
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div>
                  <p className="font-medium text-white">Action Plan Updates</p>
                  <p className="text-sm text-slate-400">
                    When your action plan is updated or completed
                  </p>
                </div>
                <Checkbox
                  checked={notifications.planUpdates || false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...notifications,
                      planUpdates: checked as boolean,
                    };
                    setNotifications(updated);
                    updateNotificationsMutation.mutate(updated);
                  }}
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Two-Factor Authentication
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Enhances your account security
                </p>
              </div>
              <div
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium ${
                  settings?.mfaEnabled
                    ? "bg-green-900/30 text-green-200"
                    : "bg-amber-900/30 text-amber-200"
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    settings?.mfaEnabled ? "bg-green-500" : "bg-amber-500"
                  }`}
                />
                {settings?.mfaEnabled ? "Enabled" : "Not Enabled"}
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              {settings?.mfaEnabled
                ? "Your account is protected with multi-factor authentication."
                : "Set up an authenticator app for additional security."}
            </p>
            <Button variant="outline" className="mt-4">
              {settings?.mfaEnabled ? "Manage MFA" : "Enable MFA"}
            </Button>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Emergency Codes</h2>
            <p className="mt-1 text-sm text-slate-400">
              Save these codes in a secure location. Use them to access your
              account if you lose access to your authentication device.
            </p>

            {settings?.emergencyCodes && settings.emergencyCodes.length > 0 ? (
              <>
                <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">
                      {settings.emergencyCodes.length} codes available
                    </p>
                    <button
                      onClick={() => setShowCodes(!showCodes)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {showCodes ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {showCodes && (
                    <div className="mt-4 space-y-2 font-mono text-sm text-slate-300">
                      {settings.emergencyCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded bg-slate-900 p-2"
                        >
                          <span>{code}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(code);
                              toast({
                                title: "Copied",
                                description: "Code copied to clipboard",
                              });
                            }}
                            className="text-slate-400 hover:text-slate-300"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() =>
                    generateCodesMutation.mutate()
                  }
                  disabled={generateCodesMutation.isPending}
                >
                  Generate New Codes
                </Button>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-amber-200">
                  ⚠️ You haven't generated emergency codes yet.
                </p>
                <Button
                  className="mt-4"
                  onClick={() =>
                    generateCodesMutation.mutate()
                  }
                  disabled={generateCodesMutation.isPending}
                >
                  {generateCodesMutation.isPending
                    ? "Generating..."
                    : "Generate Emergency Codes"}
                </Button>
              </>
            )}
          </Card>

          <Card className="border-red-900/30 bg-red-900/10 p-6">
            <h2 className="text-lg font-semibold text-red-200">Danger Zone</h2>
            <p className="mt-2 text-sm text-red-200">
              Irreversible and destructive actions
            </p>
            <Button variant="destructive" className="mt-4">
              Delete Account
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
