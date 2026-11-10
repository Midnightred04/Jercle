# Activate Brainstorm Like / Dislike voting

Jercle now shows Like and Dislike buttons below every brainstorm idea. Counts are stored in Firestore at `brainstorms/{ideaId}/votes/{browserId}` and update live for all connected members.

## Required one-time step: publish the vote rules in Firebase

The updated `firestore.rules` file is committed in GitHub, **but editing GitHub does not publish Firestore rules**. Without this step Jercle displays `Voting unavailable until Firestore rules are updated.`

1. Open the **existing** Firebase project `jercle-513906` at [Firebase Console](https://console.firebase.google.com/project/jercle-513906/firestore/rules).
2. Open **Firestore Database → Rules**.
3. **Keep the existing rules** for `snakeScores`, `events`, `brainstorms`, `announcements`, etc. (The GitHub `firestore.rules` may not include every rule currently active in the console.)
4. Find `match /brainstorms/{ideaId} {` in the rules currently deployed.
5. Insert the following block **inside that brainstorm match block**, before its closing `}`:

```
      match /votes/{voterId} {
        function validVote(d) {
          return d.keys().hasOnly(['vote','updatedAt'])
            && d.keys().hasAll(['vote','updatedAt'])
            && d.vote in ['like','dislike']
            && d.updatedAt is timestamp;
        }
        allow get, list: if member();
        allow create, update: if member()
          && voterId.matches('v_[a-f0-9-]{36}')
          && validVote(request.resource.data)
          && request.resource.data.updatedAt == request.time;
        allow delete: if member();
      }
```

This expects your existing deployed rules to define `member()` as the Jercle shared account check, like the rules in this repository. If the existing console rules use a different helper, adapt the check to your existing authenticated-member condition.

6. Click **Publish**. Rule updates may take a short time to propagate.
7. Open [Jercle Brainstorm](https://midnightred04.github.io/Jercle/#brainstorm), log in, and Like an idea. Refresh; the count and your selected button should persist. Check in another browser to confirm counts synchronize.

## Voting behavior

- Clicking Like or Dislike records one current choice for this browser on that idea.
- Clicking the selected choice again removes the vote.
- Selecting the other choice changes the vote.
- Reactions are displayed as live counts. Existing brainstorm posts also get voting.
- The whole group currently logs into Firebase as **one shared account**. Browser-based vote IDs do **not** establish unique personal identities and can be reset by clearing browser storage or using another browser/device. For trustworthy one-vote-per-person voting, Jercle would need individual sign-in identities.

Do not publish a replacement rules file that removes existing Snake leaderboard permissions.
