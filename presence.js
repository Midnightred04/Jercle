// Shared Firebase Realtime Database presence for every authenticated Jercle page.
// Each open page gets a separate session. Firebase removes sessions on disconnect.
import { realtimeDatabaseURL } from './firebase-config.js';
import { getDatabase, ref, onValue, onDisconnect, set, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

export function startJerclePresence(app, auth, onCount = () => {}) {
  if (!realtimeDatabaseURL) {
    onCount(null, 'Realtime Database setup required');
    return () => {};
  }
  const account = auth.currentUser;
  if (!account) {
    onCount(null, 'Sign in to view live users');
    return () => {};
  }
  const db = getDatabase(app, realtimeDatabaseURL);
  const sessionId = crypto.randomUUID();
  const sessionRef = ref(db, 'presence/' + account.uid + '/' + sessionId);
  let stopped = false;
  let registered = false;
  const unsubscribeConnection = onValue(ref(db, '.info/connected'), async snapshot => {
    if (stopped || snapshot.val() !== true) return;
    try {
      await onDisconnect(sessionRef).remove();
      if (!stopped) {
        await set(sessionRef, { connectedAt: serverTimestamp() });
        registered = true;
      }
    } catch (error) {
      console.error('Jercle presence registration failed', error);
      onCount(null, 'Presence unavailable');
    }
  }, error => { console.error('Connection monitor failed', error); onCount(null, 'Presence unavailable'); });
  const unsubscribeCount = onValue(ref(db, 'presence'), snapshot => {
    const accounts = snapshot.val() || {};
    const count = Object.values(accounts).reduce((sum, sessions) => sum + Object.keys(sessions || {}).length, 0);
    onCount(count, null);
  }, error => { console.error('Presence counter failed', error); onCount(null, 'Check database rules'); });
  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribeConnection();
    unsubscribeCount();
    // Explicit logout: remove promptly rather than waiting for disconnect.
    void remove(sessionRef).catch(error => console.warn('Presence cleanup failed', error));
  };
}
