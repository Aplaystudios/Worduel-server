# Google Auth Setup Guide

Follow these steps to enable "Sign in with Google" in Worduel.

---

## 1. Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it "Worduel" → click **Create**

---

## 2. Configure the OAuth Consent Screen

1. In the left menu: **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → click **Create**
3. Fill in:
   - App name: `Worduel`
   - User support email: your email
   - Developer contact information: your email
4. Click **Save and Continue** through all remaining steps (no extra scopes needed)

---

## 3. Create OAuth 2.0 Credentials

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `Worduel Web`
4. Under **Authorized JavaScript origins**, click **Add URI** and add both:
   - `https://worduel-server.onrender.com` (production)
   - `http://localhost:3000` (local dev)
5. Click **Create**
6. A dialog shows your credentials — copy the **Client ID**
   - It looks like: `123456789-abcdefgh.apps.googleusercontent.com`

---

## 4. Add the Client ID to the App

### In `public/index.html`

Find the line containing `data-client_id` and replace the placeholder:

```html
data-client_id="YOUR_GOOGLE_CLIENT_ID"
```

Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID. The Client ID is **not a secret** — it's safe to hardcode in HTML.

### On Render (production environment)

1. Open your Render service dashboard
2. Go to **Environment** tab
3. Add a new variable:
   - Key: `GOOGLE_CLIENT_ID`
   - Value: your Client ID
4. Click **Save Changes** — the service will redeploy automatically

---

## 5. Verify It Works

1. Open the app → navigate to the auth screen
2. A **Sign in with Google** button should appear below the login/register forms
3. Click it → Google popup → select your account → you're logged in
4. Your Worduel username is auto-generated from your Google display name (e.g. `johnsmith`)
5. Existing username/password accounts are unaffected

---

## Notes

- Google users start with 1000 balance and 1000 MMR (same as registered accounts)
- If the same Google account signs in again later, it recognizes the existing player by their Google ID
- Password-based accounts cannot be "linked" to Google in the current implementation — they remain separate accounts
