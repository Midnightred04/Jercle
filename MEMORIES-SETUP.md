# Jercle Memories v1 — connect the Google Drive account

The Memories page has been added to Jercle. To **actually save photos in your new Google Drive account**, the Firebase Cloud Functions backend in `functions/` must be deployed and authorized. GitHub Pages alone cannot safely hold the Google account's refresh token.

## What is already implemented
- **Test Upload** picks a picture, resizes it in the browser and uploads it securely.
- Firebase Authentication is checked by the server before upload, listing, or photo download.
- Files are written into **one specified folder** in the dedicated Google Drive account.
- The gallery shows newly uploaded photos, newest first, with their upload date and Dubai time.
- Photos are returned only to signed-in Jercle clients. No public Google Drive sharing links are created.
- v1 lists up to 24 most recent pictures. JPEG conversion is used for consistent compatibility.

## One-time setup (the Google account owner)

1. In [Google Drive](https://drive.google.com/), sign into the new account and create a folder, for example `Jercle Memories`. Open it and copy its ID from the URL after `/folders/`. Don't publish that account's password or access tokens in GitHub.
2. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project, enable **Google Drive API**, configure **OAuth consent screen**, and create an **OAuth client ID** (Web application). Keep the client ID and client secret private. If the consent app is in Testing mode, add your Google account as a test user. Note: Google may expire testing-mode refresh tokens after 7 days.
3. Generate an **offline OAuth refresh token** for this account using a trusted OAuth flow, such as [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/): open its settings, enable **Use your own OAuth credentials**, enter your client ID and secret, authorize the `https://www.googleapis.com/auth/drive` scope using the same Drive account, and exchange the authorization code for tokens. Save the **refresh token** securely. This grants broad Drive access, so use the dedicated Drive account only.
4. In Firebase Console, confirm the Firebase project is `jercle`, and ensure billing is enabled if required for 2nd-generation Cloud Functions. Install [Node.js](https://nodejs.org/) and [Firebase CLI](https://firebase.google.com/docs/cli) on your computer.
5. In a local copy of the GitHub repository, run:

```sh
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase functions:secrets:set JERCLE_DRIVE_OAUTH_JSON
```

When prompted for the secret, enter **one JSON object** with exactly these keys:

```json
{"client_id":"YOUR_GOOGLE_OAUTH_CLIENT_ID","client_secret":"YOUR_GOOGLE_OAUTH_CLIENT_SECRET","refresh_token":"YOUR_OFFLINE_REFRESH_TOKEN"}
```

**Never commit the real JSON or tokens to GitHub or paste them into Jercle's webpage.**

6. Create `functions/.env.jercle` on your own computer (the `.gitignore` prevents committing it) with:

```dotenv
DRIVE_FOLDER_ID=PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID
```

7. From the repository root, deploy just these functions:

```sh
firebase deploy --only functions:memories --project jercle
```

The callable endpoints are named `uploadMemory`, `listMemories`, and `getMemoryImage`, deployed to `asia-southeast1`. The frontend is already configured for this region.

## Test

Open [Jercle Memories](https://midnightred04.github.io/Jercle/#memories), log in, and click **Test Upload**. Select a photo smaller than 3 MB. After upload, it should show in the gallery with the Dubai date/time and appear in the configured Google Drive folder. Open the page from another signed-in browser to verify it is shared.

If the page says the Drive connection is not configured, the backend isn't deployed or isn't reachable yet. Check the Cloud Functions logs, Google Drive API activation, OAuth refresh token, and folder ID. If errors say permission denied, verify Firebase authentication and the allowed UID in `functions/index.js`.

## Privacy and limits

This is a private group gallery only to the extent the Jercle **shared Firebase login** stays private. Anyone with that shared login can view and upload photos. A stronger future version should give each person a separate Firebase identity and moderation controls. The GitHub Pages HTML/JS is public, but Drive credentials are never included in it. Uploaded photos remain private in Google Drive and are delivered through authenticated Firebase Functions.

The first version caps uploads at about 1.5 MB after browser compression and displays the latest 24 photos to limit data transfer. Cloud Functions and Drive API usage may incur costs.
