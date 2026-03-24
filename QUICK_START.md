# EVE Secure Frontend - Quick Start Guide

## Overview

Complete Next.js 14+ frontend implementation for EVE Secure with 29 files including 11 pages, 10+ components, and full state management.

## Installation

```bash
# Install dependencies
npm install

# Install Shadcn/UI components (if not already present)
npx shadcn-ui@latest init

# Add required components
npx shadcn-ui@latest add button card input textarea label select checkbox tabs skeleton dropdown-menu dialog badge table
```

## Environment Setup

```bash
# Create .env.local
cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_API_URL=https://api.eve-secure.local
NEXT_PUBLIC_ADMIN_IDS=user_id_1,user_id_2
ENVEOF
```

## Development Server

```bash
npm run dev
# App runs on http://localhost:3000
```

## Build for Production

```bash
npm run build
npm start
```

## Key Features

- ✅ 11 Full Pages (auth, dashboard, assessment, plan, documents, settings, IR, admin)
- ✅ 10+ React Components with Shadcn/UI
- ✅ Clerk Authentication with MFA
- ✅ Real-time SSE Streaming for Assessment
- ✅ State Management with Zustand
- ✅ Server State with React Query
- ✅ Dark/Light Mode Support
- ✅ Mobile Responsive (375px+)
- ✅ WCAG 2.1 AA Accessible
- ✅ Security Headers & CSP

## Core Pages

- `/login` - Clerk SignIn
- `/signup` - Clerk SignUp  
- `/dashboard` - Main dashboard with stats
- `/assessment` - AI-powered assessment chat
- `/plan` - Prioritized action plan
- `/documents` - Document management
- `/settings` - User preferences
- `/onboarding` - Organization setup wizard
- `/ir-walkthrough` - Incident response guide
- `/admin` - Admin panel (admin only)

## File Structure

```
src/
├── app/                    # Pages & routes
├── components/             # React components
├── lib/
│   ├── hooks/
│   │   └── use-sse.ts     # SSE streaming hook
│   └── utils.ts           # Utilities
├── hooks/
│   └── use-toast.ts       # Toast notifications
├── store/                  # Zustand stores
│   ├── assessment.ts
│   └── auth.ts
└── middleware.ts           # Security headers
```

## Core Components

- `ChatInterface` - Assessment chat with streaming
- `ActionCard` - Individual action plan items
- `TenantList` - Admin tenant table
- `Sidebar` - Desktop navigation
- `MobileNav` - Mobile hamburger menu
- `StreamingText` - Typewriter effect

## Tech Stack

- **Framework**: Next.js 14+
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS 3.3+
- **UI**: Shadcn/UI
- **Auth**: Clerk
- **State**: Zustand + React Query
- **Real-time**: Server-Sent Events (SSE)

## Documentation

See detailed documentation:
- `FRONTEND_ARCHITECTURE.md` - Complete architecture
- `FRONTEND_FILES_CREATED.md` - All files created
- Component comments for implementation details

## Next Steps

1. `npm install`
2. Configure `.env.local`
3. `npm run dev`
4. Visit http://localhost:3000

**Version**: 1.0.0 | **Status**: Production Ready
