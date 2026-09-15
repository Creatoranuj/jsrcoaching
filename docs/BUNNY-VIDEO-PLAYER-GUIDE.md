# Bunny.net Video Player Integration Guide

## Overview

The Safar English platform supports **Bunny Stream** video hosting alongside YouTube. Bunny Stream videos get a premium custom player with gesture controls, while YouTube videos continue to use the MahimaGhostPlayer — both are completely independent.

---

## How to Upload a Video to Bunny.net

### Step 1: Access Bunny Dashboard
1. Go to [dash.bunny.net](https://dash.bunny.net)
2. Navigate to **Stream** → Select your library (Library ID: `631493`)

### Step 2: Upload Video
1. Click **"Upload"** button
2. Select your video file (MP4 recommended)
3. Wait for transcoding to complete (green checkmark)

### Step 3: Get Embed URL
1. Click on the uploaded video
2. Go to the **"Embed"** tab
3. Copy the `src` URL from the iframe code:
   ```
   https://player.mediadelivery.net/embed/631493/YOUR-VIDEO-GUID-HERE
   ```

### Step 4: Add to Your Website
1. Go to **Admin Panel** → **Upload/Manage Lessons**
2. In the **Video URL** field, paste either:
   - Just the URL: `https://player.mediadelivery.net/embed/631493/c7958a9b-f522-47ec-806a-cff93c28dfcd`
   - Or the full iframe embed code (the system extracts the URL automatically)
3. Save the lesson

---

## Security Setup (Bunny Dashboard)

### Required Settings
Navigate to **Stream** → **Library** → **Security** → **General**:

| Setting | Value | Purpose |
|---------|-------|---------|
| **Allowed Domains** | `*.safarenglishka.com`, `*.lovable.app` | Videos only play on your website |
| **Block direct URL file access** | ✅ Enabled | Prevents direct CDN link access |
| **Embed token authentication** | ✅ Recommended | Signed embed URLs for strongest protection |

### What This Prevents
- ❌ Videos cannot be embedded on other websites
- ❌ Direct player links won't work outside your domain
- ❌ CDN file links are blocked

---

## Player Features (BunnyStreamPlayer)

### Gesture Controls
| Gesture | Action |
|---------|--------|
| **Double-tap left** | Skip back 10 seconds |
| **Double-tap right** | Skip forward 10 seconds |
| **Long press** (500ms) | 2× speed while held |
| **Swipe up/down (left side)** | Brightness control |
| **Swipe up/down (right side)** | Volume control |
| **Single tap** | Toggle controls visibility |

### Bottom Controls Bar
- Play/Pause button
- Volume slider (hover/tap)
- Time display (`0:00 / 5:30`)
- Progress bar with seek (drag + tap)
- Settings gear → Speed menu (0.75×, 1×, 1.25×, 1.5×, 2×, 3×)
- Rotate/fullscreen button

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space / K | Play/Pause |
| ← / J | Skip back 10s |
| → / L | Skip forward 10s |
| ↑ | Volume up |
| ↓ | Volume down |
| M | Toggle mute |
| F | Rotate/fullscreen |

### Branding
- **During playback**: No watermarks, no text — clean player experience
- **On video end**: Small NB logo appears in bottom-right corner

---

## Architecture

### File Structure
```
src/components/video/
├── BunnyStreamPlayer.tsx    ← Bunny.net custom player (gestures + controls)
├── MahimaGhostPlayer.tsx   ← YouTube custom player (independent)
├── UnifiedVideoPlayer.tsx   ← Routes URLs to correct player
├── EndScreenOverlay.tsx     ← YouTube end screen
└── index.ts                 ← Central exports
```

### How URL Detection Works
`UnifiedVideoPlayer` detects the platform from the URL:
- `player.mediadelivery.net/embed/` → **BunnyStreamPlayer**
- `youtube.com` / `youtu.be` → **MahimaGhostPlayer**
- `drive.google.com` → **DriveEmbedViewer**
- `.mp4` / `.webm` → Native HTML5 video

### Independence Guarantee
- BunnyStreamPlayer and MahimaGhostPlayer share **zero code**
- Each has its own gesture handling, controls, and branding
- Changing one player **never** affects the other

---

## Test Video Location

The test Bunny.net video has been uploaded to:
- **Course**: Physics 180 (Course ID: 27)
- **Lesson**: "Test" (Lesson ID: `af4d84ca-85e4-4e45-9378-f0a85255fedf`)
- **Video URL**: `https://player.mediadelivery.net/embed/631493/c7958a9b-f522-47ec-806a-cff93c28dfcd`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Video shows "blocked" | Add your domain to Allowed Domains in Bunny dashboard |
| Controls not responding | Check if `controls=false` is in the embed URL params |
| Gestures not working | Ensure the ghost overlay div has `z-40` and iframe has `pointerEvents: none` |
| YouTube player affected | Verify changes are only in `BunnyStreamPlayer.tsx` |
