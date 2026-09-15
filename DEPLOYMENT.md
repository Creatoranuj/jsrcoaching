# Sadhguru Coaching Centre - Deployment Guide

## 🚀 Overview

Sadhguru Coaching Centre is a complete e-learning platform built with React, TypeScript, and Supabase. This guide covers deployment, configuration, and administration.

---

## 📦 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **State Management**: TanStack Query
- **Video Player**: Custom Premium Player (React Player)

---

## 🔧 Prerequisites

- Node.js 18+ or Bun 1.0+
- Supabase account with project
- Git

---

## 🛠️ Local Development Setup

### 1. Clone & Install

```bash
git clone <repository-url>
cd sadhguru-coaching-centre
npm install
# or
bun install
```

### 2. Environment Configuration

The app uses Supabase environment variables. These are automatically configured:

```env
VITE_SUPABASE_PROJECT_ID=wegamscqtvqhxowlskfm
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_URL=https://wegamscqtvqhxowlskfm.supabase.co
```

### 3. Start Development Server

```bash
npm run dev
# or
bun dev
```

---

## 🗄️ Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `courses` | Course catalog with title, description, price, grade |
| `lessons` | Video/content lessons linked to courses |
| `enrollments` | User-course enrollment records |
| `profiles` | Extended user profile data |
| `user_roles` | Role-based access control (admin/teacher/student) |
| `payment_requests` | Payment verification requests |
| `materials` | Downloadable course materials |
| `notices` | System-wide announcements |

### Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:
- Students can view their own data
- Admins/Teachers can manage content
- Public access for course listings

---

## 👤 User Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access to all features, payment approval, user management |
| `teacher` | Manage courses, lessons, materials, attendance |
| `student` | View courses, watch lessons, submit assignments |

### Setting Up Admin User

1. Register a new user through `/signup`
2. Go to Supabase Dashboard → SQL Editor
3. Run:

```sql
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'admin@example.com';

UPDATE profiles
SET role = 'admin'
WHERE email = 'admin@example.com';
```

---

## 📱 Application Routes

### Public Routes
- `/` - Landing page
- `/login` - Student login
- `/signup` - Student registration
- `/classes` - Course browser

### Student Routes
- `/dashboard` - Student dashboard
- `/classes/:courseId/lessons` - Lesson viewer with Premium Player
- `/buy-course` - Course purchase page

### Admin Routes
- `/admin/login` - Admin authentication
- `/admin` - Admin dashboard
- `/admin/upload` - Content upload center

---

## 🎬 Video Player Features

The Premium Video Player includes:
- ✅ Custom controls (hides YouTube branding)
- ✅ Playback speed control (0.5x - 2x)
- ✅ Keyboard shortcuts (Space, Arrow keys, M, F)
- ✅ Auto-hide controls after 4s inactivity
- ✅ Loading/buffering states
- ✅ Error handling
- ✅ Fullscreen support
- ✅ Academy watermark

### Supported Video Sources
- YouTube URLs
- YouTube Video IDs
- Direct video links

---

## 💳 Payment Flow

1. Student selects course and submits payment details
2. Payment request created in `payment_requests` table
3. Admin reviews in Admin Dashboard
4. On approval:
   - Payment status updated to 'approved'
   - Enrollment created for user
   - Course access unlocked

---

## 🚀 Production Deployment

### Option 1: Vercel (Recommended)

1. Connect repository to Vercel
2. Configure build settings:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variables (if needed)
4. Deploy

### Option 2: Netlify

1. Connect repository
2. Build settings:
   - Build Command: `npm run build`
   - Publish Directory: `dist`
3. Add `_redirects` file (already included):
   ```
   /* /index.html 200
   ```

### Option 3: Self-Hosted

```bash
# Build production bundle
npm run build

# Serve with any static server
npx serve dist
# or
nginx / Apache configuration
```

---

## 🔒 Security Checklist

- [x] RLS enabled on all tables
- [x] Admin routes protected by role check
- [x] Secure password handling via Supabase Auth
- [x] No exposed API keys in frontend code
- [x] CORS configured properly
- [x] Input validation on forms

---

## 📊 Admin Dashboard Features

- **Statistics**: Total students, revenue, enrollments
- **Payment Management**: Approve/reject payment requests
- **Course Management**: Create, edit, delete courses
- **Content Upload**: Upload videos and PDFs
- **User Management**: View users with roles
- **Export**: CSV export functionality

---

## 🔧 Supabase Configuration

### Storage Buckets Required

| Bucket | Purpose | Public |
|--------|---------|--------|
| `receipts` | Payment screenshots | Yes |
| `course-videos` | Video content | Yes |
| `course-materials` | PDFs, documents | Yes |

### Database Functions

- `has_role(user_id, role)` - Check user role
- `get_user_role(user_id)` - Get user's role
- `handle_new_user()` - Auto-create profile on signup

---

## 🐛 Troubleshooting

### Video Not Loading
- Check if YouTube video is public/unlisted
- Verify video URL format
- Check browser console for errors

### Access Denied Errors
- Verify user has correct role
- Check RLS policies in Supabase
- Ensure user is logged in

### Payment Not Approved
- Check `payment_requests` table status
- Verify admin has approved
- Check `enrollments` table for duplicate prevention

---

## 📞 Support

For technical issues:
1. Check browser console for errors
2. Review Supabase logs
3. Verify database policies

---

## 📝 Version History

- **v1.0.0** - Initial release
  - Core course management
  - Student enrollment
  - Payment system
  - Premium video player

---

## 📄 License

Proprietary - Sadhguru Coaching Centre © 2024

---

# Quick Deploy Reference

_(merged from the former `DEPLOY.md`)_

## Prerequisites
- Node.js 18+ and npm/bun installed
- A Lovable Cloud project (backend is auto-provisioned)

## Local Development
```bash
npm install
npm run dev
```

## Build for Production
```bash
npm run build
```
This creates an optimized `dist/` folder with PWA assets (service worker, manifest, icons).

## Deployment Options

### 1. Lovable Cloud (Recommended)
Click **Publish** in the Lovable editor. Your app is instantly live with HTTPS and PWA support.

### 2. Vercel
```bash
npm i -g vercel
vercel --prod
```
The included `vercel.json` handles SPA routing.

### 3. Netlify
1. Connect your GitHub repo on [netlify.com](https://netlify.com)
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add a `_redirects` file in `public/`: `/* /index.html 200`

### 4. Static Hosting (Nginx, Apache, etc.)
Serve the `dist/` folder. Ensure all routes fallback to `index.html` for SPA routing.

### 5. Android APK (Capacitor)
See [`docs/APK-BUILD-GUIDE.md`](docs/APK-BUILD-GUIDE.md) for the full step-by-step guide.

Quick summary:
```bash
npm install
npm run build
npx cap add android
npx cap sync
npx cap open android
# Build → Build APK in Android Studio
```

## PWA Installation
Once deployed with HTTPS:
- **Android**: Browser menu → "Install app" or "Add to Home Screen"
- **iOS**: Safari → Share → "Add to Home Screen"
- **Desktop**: Click the install icon in the browser address bar
- Visit `/install` in the app for a guided installation walkthrough

## Environment Variables
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Auto-set by Lovable Cloud |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auto-set by Lovable Cloud |

## Post-Deployment Checklist
- [ ] Verify PWA installs on mobile
- [ ] Check service worker registers (`/sw.js`)
- [ ] Test offline fallback
- [ ] Confirm app icon and splash screen appear correctly
- [ ] Test APK installation on Android device (if generated)

## Vercel — Skew Protection (Batch 6)

Enable **Skew Protection** in the Vercel dashboard:
Project → Settings → Advanced → Skew Protection → **Enabled** (max-age: 12 h).

Why: pins in-flight client requests to the deployment that served the HTML, so users on an older tab don't hit a redeployed API and get "chunk not found" or shape-mismatch errors. Pairs with the `22.x` engine pin in `package.json` (Batch 6) to freeze reproducibility across build + runtime.
