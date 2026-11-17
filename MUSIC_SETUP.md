# Jercle Music setup

The Music page is implemented in `index.html`, `music.css`, and `music.js`. It includes real Spotify OAuth (Authorization Code + PKCE), the Spotify Web Playback SDK, shared Firebase Firestore Blend rooms, a combined top-tracks playlist, and private Spotify playlist export. The site does **not** include any Spotify client secret or fake song streams.

## 1. Create and configure a Spotify Developer app

1. Sign in at https://developer.spotify.com/dashboard with an eligible Spotify account and create an app of type **Web API** and **Web Playback SDK** (where available).
2. Set this exact **Redirect URI**: `https://midnightred04.github.io/Jercle/index.html`. If the site moves to Cloudflare or a custom domain, add that new site's exact `/index.html` URI as well.
3. Under Spotify's Development Mode, the **app owner needs Spotify Premium** and there is a **five-authorized-user limit** for new apps. Add each participating friend's Spotify account to the app's allowlist in the Spotify Developer Dashboard. Full in-browser streaming via the Web Playback SDK also requires **Spotify Premium for the listener**.
4. Open Jercle, log in with the existing Jercle password, go to **Music → Set up Spotify**, and paste your Spotify **Client ID** (32 hexadecimal characters). **Never paste or store a Client Secret.** The Client ID is public; the browser saves it only for that browser. Each invited member using a different device will need the same Client ID until it is configured as a shared public setting.
5. Click **Save and connect**, approve Spotify's permission request, and return to Jercle.

This uses the *current* Spotify API endpoints: `GET /me/top/tracks`, `POST /me/playlists`, and `POST /playlists/{id}/items`. Older playlist endpoints are deprecated/removed for new Development Mode apps. No personal access tokens are written to Firebase; the browser holds its own Spotify access/refresh token in **sessionStorage** and requests minimal necessary OAuth scopes. As for any browser-only app, a secure hosting and content-security setup is important.

## 2. Enable Firestore collaboration

Blends are stored under `musicBlends/{roomId}` and each voluntarily participating Spotify user contributes a minimal top-track snapshot under `musicBlends/{roomId}/members/{spotifyUserId}`.

Jercle currently uses a **shared Firebase Authentication user account**. As a result, Firestore cannot independently distinguish which Jercle group member is making a change: this is **trusted-group collaboration**, not secure account-level identity isolation. For strong per-user access control, Jercle will need individual Firebase identities and server-side verification. Do not make these collections publicly readable/writable.

In **Firebase Console → Firestore Database → Rules**, integrate an additional match block into your existing `match /databases/{database}/documents` (do not overwrite existing rules). Change `YOUR_JERCLE_AUTH_UID` to the exact authenticated UID already used for your Jercle group:

```
match /musicBlends/{blendId} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == 'YOUR_JERCLE_AUTH_UID';
  match /members/{memberId} {
    allow read, create, update, delete: if request.auth != null
      && request.auth.uid == 'YOUR_JERCLE_AUTH_UID';
  }
}
```

This enables the current group-only demo, but any user of the shared group login could technically alter another member's contribution. Upgrade identity/rules before offering this beyond a trusted friend group. Members are asked to share their own top tracks when they join a Blend, and can remove their own contribution using **Leave Blend**.

## 3. Use it

1. Spotify-connect each account, then **Create a Blend**.
2. Click **Share invite** to copy a link for friends. Alternatively friends can **Join a Blend** with its ten-character code.
3. Each friend signs into Jercle, connects their own allowed Spotify account, and joins the same Blend. Firestore updates the shared list in real time.
4. The shared mix promotes tracks liked by multiple contributors and round-robins unique favourites from each member. Click a song to start Spotify Premium playback in the embedded player. Queue, play/pause, back/next, shuffle, repeat and progress seeking are interactive.
5. **Save to Spotify** creates a private playlist in the currently connected Spotify account.

## Limitations and testing

- **Spotify itself does not expose its native Blend algorithm.** Jercle Blend is an independently implemented shared-top-tracks mix.
- In-browser streaming depends on user Premium eligibility, SDK availability, and Spotify's current developer policies. Without the Client ID, no real account connection can occur.
- Firestore security rules are **not** deployed by GitHub; they must be updated in Firebase Console.
- A successful deployment to GitHub Pages is not proof that OAuth, playback or cross-user syncing work; each must be tested with real approved Spotify accounts.
- Existing Jercle content, other routes, Firebase configuration, and the snake game are left intact apart from adding Music navigation.
