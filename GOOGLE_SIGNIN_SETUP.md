# Google Sign-In Setup Instructions

## ✅ What's Already Done:
1. ✅ Mobile app code is implemented with Google OAuth
2. ✅ Backend endpoint `/api/auth/google/mobile` exists
3. ✅ Google client IDs are configured
4. ✅ Required packages are installed

## 🔧 Final Setup Steps:

### 1. Add Redirect URI to Google Cloud Console:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to: APIs & Services → Credentials
3. Click on your Web OAuth client: `1014910278236-9ipov4c1e18kusu6m79kjjf3ipr502uv`
4. In "Authorized redirect URIs" add:
   ```
   https://auth.expo.io/@yasiruravidith/mobile
   ```
5. Click "SAVE"

### 2. OAuth Consent Screen:
1. Go to: APIs & Services → OAuth consent screen
2. Make sure these fields are filled:
   - App name: "Notes App" (or your preferred name)
   - User support email: your email
   - Developer contact email: your email
3. Add your test email (`yasiruravidith123@gmail.com`) to "Test users"
4. Save the configuration

### 3. Start Your Servers:

**Backend:**
```bash
cd "D:\DEV\Note app\backend"
npm start
```

**Mobile App:**
```bash
cd "D:\DEV\Note app\mobile"
npx expo start
```

### 4. Test the Flow:
1. Open Expo Go on your phone
2. Scan the QR code
3. Tap "Sign in with Google"
4. Select your Google account
5. You should be redirected back to your app

## 🐛 Troubleshooting:

### If you get "redirect_uri_mismatch":
- Double-check the redirect URI is exactly: `https://auth.expo.io/@yasiruravidith/mobile`
- Make sure you're editing the correct OAuth client in Google Cloud Console

### If you get "access_blocked":
- Add your email to Test users in OAuth consent screen
- Make sure required fields are filled in consent screen

### If backend connection fails:
- Make sure backend is running on port 3001
- Check your IP address hasn't changed (currently: 192.168.1.100)

## 📱 How It Works:

1. User taps "Sign in with Google"
2. Opens Google OAuth in browser
3. User selects account and approves
4. Google redirects to Expo proxy: `https://auth.expo.io/@yasiruravidith/mobile`
5. Expo proxy redirects back to your app with tokens
6. App sends ID token to your backend: `POST /api/auth/google/mobile`
7. Backend verifies token with Google and creates user session
8. Backend returns JWT token to mobile app
9. App stores token and navigates to home screen

## 🎉 You're Ready!

After completing step 1 (adding redirect URI), your Google Sign-in should work perfectly!