"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationProfile {
  id: string;
  name: string;
  description: string;
  industry: string;
  size: string;
  location: string;
  website?: string;
  tools: string[];
  insuranceProvider?: string;
  hasInsurance: boolean;
}

const INDUSTRIES = [
  "Healthcare",
  "Finance",
  "Technology",
  "Retail",
  "Manufacturing",
  "Education",
  "Government",
  "Energy",
  "Telecommunications",
  "Other",
];

const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
];

const COMMON_TOOLS = [
  "AWS",
  "Azure",
  "Google Cloud",
  "Microsoft 365",
  "Slack",
  "Jira",
  "Salesforce",
  "ServiceNow",
  "Okta",
  "Splunk",
  "DataDog",
  "Other",
];

export default function OnboardingPage() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Partial<OrganizationProfile>>({
    tools: [],
    hasInsurance: false,
  });

  const { data: profile, isLoading } = useQuery<OrganizationProfile>({
    queryKey: ["organization-profile"],
    queryFn: async () => {
      const res = await fetch("/api/organization/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<OrganizationProfile>) => {
      const res = await fetch("/api/organization/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      if (currentStep < 3) {
        setCurrentStep(currentStep + 1);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save profile",
        variant: "destructive",
      });
    },
  });

  const handleToolToggle = (tool: string) => {
    const tools = formData.tools || [];
    setFormData({
      ...formData,
      tools: tools.includes(tool)
        ? tools.filter((t) => t !== tool)
        : [...tools, tool],
    });
  };

  const handleNext = async () => {
    if (currentStep === 3) {
      await saveMutation.mutateAsync(formData);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Organization Setup</h1>
        <p className="mt-1 text-slate-400">
          Complete your profile to get personalized security recommendations
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Step {currentStep + 1} of 4</span>
          <span className="text-slate-400">
            {Math.round(((currentStep + 1) / 4) * 100)}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
            style={{ width: `${((currentStep + 1) / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Content Card */}
      <Card className="border-slate-800 bg-slate-900/50">
        <div className="min-h-96 p-6 sm:p-8">
          {/* Step 1: Basic Info */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Organization Details
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Tell us about your organization
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-slate-300">
                    Organization Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., Acme Corporation"
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="mt-2 border-slate-700 bg-slate-800 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-slate-300">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="What does your organization do?"
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    className="mt-2 border-slate-700 bg-slate-800 text-white"
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="location" className="text-slate-300">
                    Location
                  </Label>
                  <Input
                    id="location"
                    placeholder="e.g., San Francisco, CA"
                    value={formData.location || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    className="mt-2 border-slate-700 bg-slate-800 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="website" className="text-slate-300">
                    Website (optional)
                  </Label>
                  <Input
                    id="website"
                    placeholder="https://example.com"
                    value={formData.website || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, website: e.target.value })
                    }
                    className="mt-2 border-slate-700 bg-slate-800 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Industry & Size */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Industry & Size
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Help us tailor recommendations for your sector
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="industry" className="text-slate-300">
                    Industry
                  </Label>
                  <Select
                    value={formData.industry || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, industry: value })
                    }
                  >
                    <SelectTrigger className="mt-2 border-slate-700 bg-slate-800">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-800">
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="size" className="text-slate-300">
                    Company Size
                  </Label>
                  <Select
                    value={formData.size || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, size: value })
                    }
                  >
                    <SelectTrigger className="mt-2 border-slate-700 bg-slate-800">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-800">
                      {COMPANY_SIZES.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size} employees
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Tools */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Tools & Platforms
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Select the tools your organization uses
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {COMMON_TOOLS.map((tool) => (
                  <div key={tool} className="flex items-center space-x-2">
                    <Checkbox
                      id={tool}
                      checked={(formData.tools || []).includes(tool)}
                      onCheckedChange={() => handleToolToggle(tool)}
                    />
                    <Label htmlFor={tool} className="cursor-pointer text-slate-300">
                      {tool}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Insurance */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Cyber Insurance
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Tell us about your insurance coverage
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasInsurance"
                    checked={formData.hasInsurance || false}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        hasInsurance: checked as boolean,
                      })
                    }
                  />
                  <Label
                    htmlFor="hasInsurance"
                    className="cursor-pointer text-slate-300"
                  >
                    We have cyber insurance
                  </Label>
                </div>

                {formData.hasInsurance && (
                  <div>
                    <Label htmlFor="insurance" className="text-slate-300">
                      Insurance Provider
                    </Label>
                    <Input
                      id="insurance"
                      placeholder="e.g., Chubb, AIG, Zurich"
                      value={formData.insuranceProvider || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insuranceProvider: e.target.value,
                        })
                      }
                      className="mt-2 border-slate-700 bg-slate-800 text-white"
                    />
                  </div>
                )}

                <div className="rounded-lg border border-blue-900/30 bg-blue-900/10 p-4">
                  <p className="text-sm text-blue-200">
                    ℹ️ Insurance information helps us provide compliance
                    recommendations specific to your provider's requirements.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Navigation */}
        <div className="border-t border-slate-800 flex items-center justify-between bg-slate-800/50 px-6 py-4 sm:px-8">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {currentStep === 3 ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Complete Setup"}
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Help Text */}
      <p className="text-center text-xs text-slate-500">
        You can update this information anytime in Settings
      </p>
    </div>
  );
}
