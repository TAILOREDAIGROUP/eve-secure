import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { OnboardingSchema } from '@/lib/validation/schemas';
import { getSupabaseAdmin } from '@/lib/db';
import { generateEmergencyAccessCodes } from '@/lib/auth/emergency-access';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/onboarding
 * Create tenant, org profile, emergency codes, default notification prefs
 * Returns: profile + emergency codes (one-time display)
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = OnboardingSchema.parse(body);

    const db = getSupabaseAdmin();
    const tenantId = uuidv4();
    const userId = uuidv4();
    const orgProfileId = uuidv4();

    // 1. Create tenant
    const { error: tenantError } = await db.from('tenants').insert({
      id: tenantId,
      name: validated.orgName,
      sector: validated.sector,
      state: validated.state,
      employee_count: validated.employeeCount,
      it_budget_range: validated.itBudgetRange,
      current_tools: validated.currentTools,
      has_cyber_insurance: validated.hasCyberInsurance,
      carrier_name: validated.carrierName ?? null,
      status: 'active',
    });

    if (tenantError) {
      logger.error('Failed to create tenant', { error: tenantError.message, requestId });
      return NextResponse.json(
        { error: 'Internal Error', message: 'Failed to create organization', errorId: requestId },
        { status: 500 }
      );
    }

    // 2. Create user record
    const { error: userError } = await db.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      clerk_id: session.userId,
      email: body.email ?? `${session.userId}@eve-secure.com`,
      role: 'tenant_admin',
      notification_preferences: {
        email: validated.notificationPrefs.emailEnabled,
        sms: validated.notificationPrefs.smsEnabled,
      },
    });

    if (userError) {
      logger.error('Failed to create user', { error: userError.message, requestId });
    }

    // 3. Create org profile (profile_data encrypted conceptually — in production KMS would encrypt)
    const profileData = {
      orgName: validated.orgName,
      sector: validated.sector,
      state: validated.state,
      employeeCount: validated.employeeCount,
      itBudgetRange: validated.itBudgetRange,
      currentTools: validated.currentTools,
      ehrSystem: validated.ehrSystem,
      dmsSystem: validated.dmsSystem,
      hasCyberInsurance: validated.hasCyberInsurance,
      carrierName: validated.carrierName,
    };

    const { error: profileError } = await db.from('org_profiles').insert({
      id: orgProfileId,
      tenant_id: tenantId,
      org_name: validated.orgName,
      sector: validated.sector,
      state: validated.state,
      employee_count: validated.employeeCount,
      it_budget_range: validated.itBudgetRange,
      current_tools: validated.currentTools,
      ehr_system: validated.ehrSystem ?? null,
      dms_system: validated.dmsSystem ?? null,
      cyber_insurance: validated.hasCyberInsurance,
      carrier: validated.carrierName ?? null,
      profile_data: profileData,
    });

    if (profileError) {
      logger.error('Failed to create org profile', { error: profileError.message, requestId });
    }

    // 4. Generate emergency access codes
    const { displayCodes } = await generateEmergencyAccessCodes(userId, tenantId);

    // Store hashed codes in DB
    const codeInserts = [];
    const bcrypt = await import('bcryptjs');
    for (const code of displayCodes) {
      const hash = await bcrypt.default.hash(code, 12);
      codeInserts.push({ user_id: userId, code_hash: hash, used: false });
    }
    await db.from('emergency_codes').insert(codeInserts);

    // 5. Set default notification preferences
    await db.from('notification_preferences').insert({
      tenant_id: tenantId,
      user_id: userId,
      email_enabled: validated.notificationPrefs.emailEnabled,
      sms_enabled: validated.notificationPrefs.smsEnabled,
      phone_number: validated.notificationPrefs.phoneNumber ?? null,
    });

    // 6. Audit log
    await db.from('audit_events').insert({
      tenant_id: tenantId,
      user_id: userId,
      event_type: 'onboarding_complete',
      event_data: { sector: validated.sector, state: validated.state, requestId },
    });

    logger.info('Onboarding complete', { tenantId, userId, sector: validated.sector, requestId });

    return NextResponse.json(
      {
        tenantId,
        orgId: orgProfileId,
        userId,
        status: 'created',
        emergencyCodes: displayCodes,
        message: 'Save your emergency codes securely. They will not be shown again.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          errorId: requestId,
          fields: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Invalid JSON', errorId: requestId },
        { status: 400 }
      );
    }

    logger.error('Onboarding error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
