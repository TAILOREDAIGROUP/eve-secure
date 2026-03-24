# EVE Secure Frontend Architecture

## Overview

This document describes the Next.js frontend implementation for EVE Secure, an AI-driven security assessment and incident response platform.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout with Clerk & theme providers
│   ├── (auth)/
│   │   ├── login/page.tsx                 # Clerk SignIn page
│   │   └── signup/page.tsx                # Clerk SignUp page
│   └── (dashboard)/
│       ├── layout.tsx                      # Dashboard layout with sidebar
│       ├── dashboard/page.tsx              # Main dashboard
│       ├── onboarding/page.tsx             # Organization setup wizard
│       ├── assessment/page.tsx             # Security assessment interface
│       ├── plan/page.tsx                   # Action plan view
│       ├── documents/page.tsx              # Document management
│       ├── settings/page.tsx               # User settings
│       ├── ir-walkthrough/page.tsx         # Incident response walkthrough
│       └── admin/page.tsx                  # Admin panel
├── components/
│   ├── assessment/
│   │   └── chat-interface.tsx              # Main assessment chat UI
│   ├── plan/
│   │   └── action-card.tsx                 # Action plan card component
│   ├── admin/
│   │   └── tenant-list.tsx                 # Admin tenant management
│   ├── dashboard/
│   │   ├── sidebar.tsx                     # Desktop navigation
│   │   └── mobile-nav.tsx                  # Mobile navigation
│   ├── shared/
│   │   └── streaming-text.tsx              # SSE streaming text display
│   ├── ui/                                 # Shadcn/UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── checkbox.tsx
│   │   ├── tabs.tsx
│   │   ├── skeleton.tsx
│   │   ├── toaster.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── dialog.tsx
│   │   ├── badge.tsx
│   │   └── table.tsx
│   └── theme-provider.tsx                  # Next-themes provider
├── lib/
│   ├── hooks/
│   │   └── use-sse.ts                      # SSE streaming hook
│   └── utils.ts                            # Utility functions
├── store/
│   ├── assessment.ts                       # Assessment state (Zustand)
│   └── auth.ts                             # Auth state (Zustand)
├── hooks/
│   └── use-toast.ts                        # Toast notifications
├── middleware.ts                            # Next.js middleware with security
└── styles/
    └── globals.css                         # Global Tailwind styles
```

## Key Features

### 1. Authentication & Authorization
- **Clerk Integration**: Complete auth flow with MFA enforcement
- **Protected Routes**: Middleware enforces auth on dashboard routes
- **Admin Gating**: Admin panel restricted to admin users only

### 2. Assessment Interface
- **Chat-based Assessment**: Conversational UI powered by EVE AI
- **SSE Streaming**: Real-time streaming responses with auto-reconnect
- **Progress Tracking**: Visual indicators for assessment completion
- **Source Citations**: EVE responses include source attribution
- **Multi-section**: Organized into themed assessment sections

### 3. Action Planning
- **Priority-based Ordering**: Critical → High → Medium → Low
- **Cost Estimation**: Min/max cost ranges with total calculations
- **Compliance Tags**: Regulatory framework alignment (HIPAA, PCI-DSS, etc.)
- **Insurance Tags**: Coverage indicators for cyber insurance claims
- **Status Tracking**: Not Started → In Progress → Completed

### 4. Organization Onboarding
- **Guided Wizard**: 4-step setup process
- **Industry Selection**: Tailored recommendations per sector
- **Tool Inventory**: Track cloud & software dependencies
- **Insurance Integration**: Provider info for compliance recommendations

### 5. Incident Response Walkthrough
- **Phase-based Guidance**: Initial Intake → Containment → Eradication → Recovery → Completed
- **Timestamped Logging**: Every action logged with exact timestamps
- **Severity Tracking**: Critical/High/Medium/Low severity levels
- **Contact Notifications**: Record who was notified and when
- **Timeline Export**: Generate IR reports and ticket creation

### 6. Document Management
- **Generation**: Create reports from assessment data
  - Executive Summary
  - Remediation Plan
  - Incident Response Plan
  - Security Policy
  - Compliance Report
  - Risk Assessment
  - Business Continuity Plan
  - Vendor Security Matrix
- **Format Support**: PDF, DOCX, Markdown
- **Status Tracking**: Draft → Ready → Archived
- **Download & Preview**: Direct access to generated documents

### 7. Admin Panel
- **Tenant Management**: View all tenants with usage metrics
- **Cost Tracking**: System-wide and per-tenant cost analysis
- **Knowledge Metrics**: Document generation quality & volume
- **Evaluation Metrics**: Assessment quality scoring
- **Usage Monitoring**: Track API calls and resource consumption

## Tech Stack

### Core
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS 3.3+
- **Components**: Shadcn/UI

### State Management
- **Client State**: Zustand with persistence
- **Server State**: TanStack Query (React Query)

### Authentication
- **Provider**: Clerk
- **Security**: MFA enforcement, security headers, CSP

### Real-time Features
- **Streaming**: Server-Sent Events (SSE)
- **Auto-reconnect**: Exponential backoff strategy

### Utilities
- **HTTP Client**: Native Fetch API
- **Animations**: Tailwind CSS animations
- **Theming**: Next-themes (Light/Dark mode)
- **Date Handling**: Native Date API with locale formatting

## Accessibility Features

- **WCAG 2.1 AA Compliance**: All components follow accessibility guidelines
- **Keyboard Navigation**: Full keyboard support for all interactive elements
- **Screen Reader Support**: Semantic HTML and ARIA labels
- **Color Contrast**: 4.5:1+ contrast ratio on all text
- **Focus Management**: Clear focus indicators throughout
- **Mobile Responsive**: 375px minimum viewport support

## Dark/Light Mode

- **Default**: Dark theme (slate-950 background, slate-100 text)
- **Toggle**: User preference saved in localStorage
- **System Preference**: Respects system dark mode setting
- **Consistent**: Applied across all pages and components

## Performance Optimizations

- **Code Splitting**: Route-based automatic splitting
- **Image Optimization**: Next.js Image component for critical images
- **Lazy Loading**: Components lazy-loaded where appropriate
- **Caching**: React Query caching with stale-while-revalidate
- **CSS-in-JS**: Tailwind CSS for zero-runtime overhead
- **SSE Optimization**: Chunk-based streaming with efficient buffers

## Security Features

### Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: 31536000 seconds
- Content-Security-Policy: Strict (inline styles only, trusted CDNs)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: Geolocation, microphone, camera disabled

### Authentication
- MFA enforcement via Clerk
- Session management with secure cookies
- CSRF protection via Next.js middleware

### Data Protection
- HTTPS only (enforced via HSTS)
- No sensitive data in URL parameters
- Encrypted state persistence via Zustand
- Rate limiting (backend enforced)

## API Integration

### Endpoints
- `GET /api/assessment/status` - Current assessment progress
- `GET /api/assessment/{id}/section/{id}/initial` - Initial section message
- `POST /api/assessment/{id}/section/{id}/response` - Assessment response (SSE)
- `GET /api/plan/current` - Fetch action plan
- `GET /api/documents` - List generated documents
- `POST /api/documents/generate` - Generate new document
- `GET /api/settings` - User preferences
- `PUT /api/settings/notifications` - Update notification prefs
- `POST /api/settings/emergency-codes` - Generate MFA codes
- `GET /api/ir/current-session` - Get current IR session
- `POST /api/ir/add-update` - Log IR update
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/tenants` - List all tenants
- `GET /api/admin/knowledge/metrics` - Knowledge base metrics
- `GET /api/admin/eval/metrics` - Evaluation metrics

### Error Handling
- Try-catch wrapper in all data fetching
- User-friendly error toasts
- Network error recovery via SSE auto-reconnect
- Fallback states for loading and empty states

## State Management Patterns

### Assessment Store (Zustand)
```typescript
- currentAssessmentId: string | null
- currentSection: string | null
- messages: AssessmentMessage[]
- assessmentData: any
- progress: number
```

### Auth Store (Zustand)
```typescript
- userId: string | null
- tenantId: string | null
- tenantInfo: TenantInfo | null
- isAdmin: boolean
- mfaEnabled: boolean
```

## Component Patterns

### Pages
- Query data on mount with error handling
- Show skeleton loaders while fetching
- Display content in organized sections
- Mobile-responsive grid layouts

### Components
- Prop-based configuration
- TypeScript interfaces for all props
- Semantic HTML structure
- Dark mode awareness with Tailwind classes

## Mobile Responsiveness

- **Breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)
- **Sidebar**: Hidden on mobile, accessible via hamburger menu
- **Forms**: Full-width on mobile, multi-column on desktop
- **Tables**: Responsive cards on mobile, table view on desktop
- **Navigation**: Sticky header with mobile nav toggle

## Browser Support

- Chrome/Chromium (latest 2)
- Firefox (latest 2)
- Safari (latest 2)
- Edge (latest 2)
- Mobile browsers (iOS Safari, Chrome for Android)

## Development Guidelines

### Component Structure
```typescript
// 1. Imports
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";

// 2. Interfaces
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

// 3. Component
export function MyComponent({ title, onAction }: MyComponentProps) {
  // 4. Hooks
  const { data, isLoading } = useQuery({...});

  // 5. Render
  return <div>...</div>;
}
```

### Styling Conventions
- Use Tailwind utility classes (no custom CSS)
- Use semantic color variables (blue-500, slate-800, etc.)
- Apply dark mode explicitly (dark:bg-slate-900)
- Use spacing scale consistently (px-4, py-6, gap-4)

### Type Safety
- Always define prop interfaces
- Use const as const for string unions
- Type API responses completely
- No `any` types (use `unknown` + type guards)

## Deployment

### Environment Variables
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_API_URL=https://api.eve-secure.com
NEXT_PUBLIC_ADMIN_IDS=userid1,userid2
```

### Build & Optimization
```bash
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run type-check # TypeScript check
```

## Future Enhancements

1. **Collaborative Features**: Real-time team collaboration on assessments
2. **Advanced Reporting**: Custom report builder with templates
3. **Integration Hub**: Third-party tool integration (Jira, ServiceNow, etc.)
4. **Mobile App**: Native mobile app for on-the-go access
5. **Compliance Frameworks**: Extended framework support (SOC 2, ISO 27001)
6. **AI Customization**: Fine-tuning EVE for industry-specific knowledge
7. **Audit Logging**: Complete audit trail of all assessments and changes
8. **API Webhooks**: Event-driven integrations for external systems

## Support & Documentation

- **User Guide**: `/docs/user-guide.md`
- **API Reference**: `/docs/api-reference.md`
- **Architecture**: `/docs/architecture.md`
- **Troubleshooting**: `/docs/troubleshooting.md`
