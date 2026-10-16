JERCLE V1 — LOCAL PASSWORD + OPTIONAL FIREBASE

Start: cd into this folder and run python3 -m http.server 8000
Open http://localhost:8000
LOCAL demo password: jercle123 (edit DEMO_PASSWORD in script.js)

WITHOUT FIREBASE: Events are temporary and vanish on refresh.
WITH FIREBASE: Cloud events persist; Firebase Auth verifies the SAME password.

ZERO-COST FIREBASE SPARK SETUP
1. Create Firebase Spark project at console.firebase.google.com. Do not add billing.
2. Project settings > Your apps > Register Web app. Copy apiKey, authDomain, projectId, appId into firebase-config.js.
3. Authentication > Sign-in method > Enable Email/Password. Under Users, Add user using a dedicated Jercle email and password equal to DEMO_PASSWORD. IMPORTANT: Since DEMO_PASSWORD is public in script.js, this is NOT PRIVATE. Never use sensitive event content with this password approach.
4. Copy the dedicated user's UID into ALLOWED_UID in firebase-config.js.
5. Build > Firestore Database > Create database (choose an appropriate region). Before adding data, open Rules tab and paste firestore.rules, replacing REPLACE_WITH_JERCLE_USER_UID with the exact UID. Publish the rules.
6. Authentication > Settings > Authorized domains: add localhost if necessary (and later your site domain).
7. Refresh localhost:8000 and enter the password. Add an event, refresh, log in again, and confirm it persisted.
8. Do NOT publish private hangout data with a hardcoded password. Upgrade to a non-hardcoded Firebase Auth login before letting friends use it.

If you see permission-denied, check rules are published and UID is identical.
If login fails, verify the dedicated email, account password, and Firebase config.
No Cloud Functions or paid features are used.
