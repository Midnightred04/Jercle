// Active browser sessions across all authenticated Jercle pages.
// Loading Realtime Database on demand keeps the rest of Jercle working if it is unavailable.
import { realtimeDatabaseURL } from './firebase-config.js';

export function startJerclePresence(app, auth, onCount = () => {}) {
  let stopped = false;
  let unsubscribeConnection = () => {};
  let unsubscribeCount = () => {};
  let removeSession = () => Promise.resolve();

  const report = (count, message = null) => {
    if (!stopped) onCount(count, message);
  };
  report(null, 'Connecting to live users…');

  async function start() {
    if (!realtimeDatabaseURL) {
      report(null, 'Realtime Database URL not configured');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      report(null, 'Please sign in to view live users');
      return;
    }
    try {
      const { getDatabase, ref, onValue, onDisconnect, set, remove, serverTimestamp } =
        await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js');
      if (stopped) return;
      const db = getDatabase(app, realtimeDatabaseURL);
      const id = crypto.randomUUID();
      const sessionRef = ref(db, 'presence/' + user.uid + '/' + id);
      removeSession = () => remove(sessionRef);

      unsubscribeCount = onValue(ref(db, 'presence'), snapshot => {
        const accounts = snapshot.val() || {};
        const count = Object.values(accounts).reduce(
          (total, sessions) => total + Object.keys(sessions || {}).length, 0
        );
        report(count);
      }, error => {
        console.error('Jercle live user count:', error);
        report(null, 'Unable to read presence. Check Realtime Database rules.');
      });

      unsubscribeConnection = onValue(ref(db, '.info/connected'), async snapshot => {
        if (stopped || snapshot.val() !== true) return;
        try {
          await onDisconnect(sessionRef).remove();
          if (stopped) return;
          await set(sessionRef, { connectedAt: serverTimestamp() });
        } catch (error) {
          console.error('Jercle presence registration:', error);
          report(null, 'Unable to register session. Check Realtime Database rules.');
        }
      }, error => {
        console.error('Jercle presence connection:', error);
        report(null, 'Unable to connect to Realtime Database.');
      });
    } catch (error) {
      console.error('Jercle presence initialization:', error);
      report(null, 'Live users unavailable. Check browser connection.');
    }
  }

  void start();
  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribeConnection();
    unsubscribeCount();
    void removeSession().catch(error => console.warn('Jercle session cleanup:', error));
  };
}
