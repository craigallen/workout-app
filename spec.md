# Workout Tracker App: MVP Spec and Build Prompt

Nov 6, 2026 · @Craig Allen

## Overview

The app is for one user on a phone. It's hosted on Firebase Hosting, with Google sign-in and data stored in Firebase, and it replaces the Weightlifting Tracking Google Sheet. You log a lifting session in under a minute, see where the week stands, and the app tells you when to train and when to move up a plate position.

It encodes one plan: 3 sessions per Monday to Sunday week on any days, alternating workouts A and B, each done as Full (\~35 min), Short (\~20 min) or Minimum (\~10 min). The equipment is a Marcy MWM-988 (loads logged as plate positions) plus a kettlebell and dumbbells (loads logged in lb).

**MVP goals**

- Logging a session takes under 60 seconds, with last session's numbers prefilled.
- The home screen answers three questions at a glance: how many sessions this week, should I train today, and which workout is next.
- Progression hints appear automatically when an exercise is ready to move up.
- Existing history imports from the Google Sheet once, so no data is lost.
- Data is saved in Firestore behind Google sign-in. It survives a lost phone or a cleared browser, and logging still works with a weak signal in the home gym.

**Non-goals for the MVP**

- Only one user. Only your Google account can sign in, with no sharing, roles or sign-up flow.
- No server code of its own. Firebase and a static build on Firebase Hosting only, with no API routes and no Cloud Functions.
- No push notifications or reminders.
- No charts or exercise library beyond the plan's exercises.
- No editing of the plan itself in the UI. The plan lives in one config file.

## Decisions and open items

The build decisions are settled. Two items are still open.

| Area | Decision |
| --- | --- |
| Device | Phone browser, mobile-first layout |
| Hosting | Firebase Hosting, a static Vite build deployed with the Firebase CLI (changed from Vercel on Nov 7, 2026: redirect sign-in works on phones without workarounds when served from `firebaseapp.com`) |
| Database | Cloud Firestore on Firebase's free Spark plan |
| Sign-in | Firebase Authentication with Google sign-in, restricted to your Google account by Firestore security rules |
| Google Sheet | Replaced. Its Workouts tab is imported once as a CSV, then the Sheet is retired |
| Check-ins and reviews | Replaced in the app: behind-pace banner, weekly review, monthly review. The three scheduled tasks are turned off at go-live |
| Backups | CSV export and import for each collection, plus a JSON full backup |
| Front-end stack | React + TypeScript + Vite, plain CSS |
| Units | Plate positions for Marcy exercises, lb for kettlebell and dumbbells, inches for waist |
| Session timer | Manual minutes field, with an optional start/stop timer |

**Open items**

- [ ] **No push notifications.** The in-app reviews only show up when you open the app. The scheduled tasks pushed to your phone, which is what catches a slide. Before turning them off, decide whether that's acceptable, or set a recurring phone reminder (for example Sunday evening and Wednesday evening) to open the app.
- [ ] **Firebase pausing.** Confirm in the current Firebase docs that free Spark projects aren't paused or deleted for inactivity before relying on it.

## Features

The MVP has eleven features, in build order. Items marked *Later* are out of scope. Features 3 to 5 replace the scheduled Sunday check-in, Wednesday nudge and monthly review.

1. **Sign-in.** One "Sign in with Google" button. Signed-out users see nothing else. Any other Google account gets a clear "not authorized" message. Sign-out lives on the Plan tab.
2. **This week dashboard.** Sessions this week vs target, sessions still needed, days since the last session, a "Train today?" verdict, the next workout (A or B), and this week's walk and yoga minutes.
3. **Behind-pace banner** (replaces the Wednesday nudge). A banner at the top of Today when, from Wednesday on, the week has no session, or when the last session was 3 or more days ago. It says how many sessions are still needed by Sunday, which workout is next, and offers a one-tap Start Minimum.
4. **Weekly review** (replaces the Sunday check-in). A card for last week, shown at the top of Today from Sunday through Tuesday and always available on the Progress tab. It shows sessions vs target, the Full/Short/Minimum mix, average energy, walk and yoga minutes, gaps of 3+ days, the target streak, exercises ready to move up, exercises not logged in 2 weeks, and the measurement reminder.
5. **Monthly review** (replaces the monthly review). On the Progress tab, for the last full calendar month vs the month before, with stats and rule-based notes (see Data model and rules). A "Copy for Claude" button copies a plain-text summary plus the month's sessions to the clipboard, so you can paste it into Claude for written feedback and suggestions.
6. **Log a session.** Pick A or B (next one preselected) and Full, Short or Minimum. The app lists exactly the exercises and set counts for that choice, with targets and last session's load and reps prefilled. Enter load and reps per set, energy 1 to 5, minutes and optional notes. Any exercise can be skipped. One tap saves.
   - An "Easy week" toggle prefills one plate position lighter and about half the sets.
7. **Progression hints.** On the log screen and in history, a badge on any exercise that hit the top of its rep range on every set in its last two logged sessions: "Move up to 8" for a Marcy exercise, "Go heavier" for kettlebell or dumbbell work.
8. **History.** On the Progress tab, sessions newest first, each showing date, workout, length, minutes and energy. Tap to view, edit or delete.
9. **Body.** Measurements (weight in lb, waist in inches, body fat in %, notes) and walks and yoga (date, type, minutes), each with a quick-add form and a list.
10. **Plan reference.** Read-only screen with workouts A and B, session lengths and the rules, plus the weekly target setting.
11. **Backup and restore** (see CSV and JSON formats below).
    - **Export:** three CSV files (sessions, measurements, walks and yoga) and one JSON file with everything. The sessions CSV uses the same layout as the old Sheet's Workouts tab, so it opens cleanly in Google Sheets or Excel.
    - **Import:** the old Sheet's Workouts CSV, the app's own CSVs, or the JSON backup. Every import shows a preview (counts, date range, rows that failed to parse) and skips records that already exist, so importing the same file twice changes nothing.

*Later:* push notifications (they need a server or Cloud Functions, which the free plan setup avoids), written AI feedback inside the app (needs an API key on a server), a native app with Expo reusing the same Firebase project, progress charts per exercise, PWA install and editing the plan in the UI.

## Data model and rules

Data lives in Firestore under the signed-in user's id. The plan is a static config file in the code, not data. The data set is small (hundreds of sessions over years), so the app loads it all with live listeners and computes every rule on the client.

```
users/{uid}                      // { weeklyTarget: 3, schemaVersion: 1 }
users/{uid}/sessions/{id}        // Session
users/{uid}/measurements/{id}    // Measurement
users/{uid}/activities/{id}      // Activity (walks, yoga)
```

```ts
type WorkoutId = 'A' | 'B';
type Length = 'Full' | 'Short' | 'Minimum';

interface Exercise {
  id: string;            // 'gobletSquat', 'legCurlR', ...
  name: string;
  station: string;       // 'leg developer', 'high pulley', 'kettlebell / dumbbells'
  loadType: 'plate' | 'lb' | 'none';
  repMin: number;
  repMax: number;
  unit: 'reps' | 'seconds';
}

interface PlanItem { exerciseId: string; sets: number } // sets for a Full session

interface Entry {
  exerciseId: string;
  load: number | null;   // plate position or lb; null = bodyweight
  sets: number[];        // reps (or seconds) per set, in order
}

interface Session {
  id: string;
  date: string;          // 'YYYY-MM-DD', local date
  workout: WorkoutId | null;  // null for imported history
  length: Length | null;
  easyWeek: boolean;
  minutes: number | null;
  energy: 1 | 2 | 3 | 4 | 5 | null;
  notes: string;
  entries: Entry[];
  source: 'app' | 'sheetImport';
  createdAt: Timestamp;  // Firestore server timestamps
  updatedAt: Timestamp;
}

interface Measurement { id: string; date: string; weightLb: number | null; waistIn: number | null; bodyFatPct: number | null; notes: string }
interface Activity { id: string; date: string; type: 'Walk' | 'Yoga' | 'Other'; minutes: number; notes: string }
```

**Security rules.** Each user can read and write only their own `users/{uid}` tree, and only an allowlisted email can sign in. This is a sketch. Check the syntax against the current Firestore rules docs and test it in the Rules Playground before deploying.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == uid
        && request.auth.token.email == 'YOUR_GOOGLE_EMAIL';
    }
  }
}
```

**Plan config** (sets x reps for a Full session, in order):

| # | Workout A | Workout B |
| --- | --- | --- |
| 1 | Goblet squat (lb), 3 x 10-15 | Goblet squat (lb), 3 x 10-15 |
| 2 | Lat pulldown (plate), 3 x 8-12 | Seated row (plate), 3 x 10-12 |
| 3 | Chest press (plate), 3 x 10-12 | Romanian deadlift (lb), 3 x 8-12 |
| 4 | Leg curl R (plate), 2 x 10-12 | Leg extension (plate), 2 x 10-12 |
| 5 | Leg curl L (plate), 2 x 10-12 | Lateral raise / upright row (plate), 2 x 10-15 |
| 6 | Triceps pushdown (plate), 2 x 12-15 | Preacher curl (plate), 2 x 10-12 |
| 7 | Plank / cable crunch, 2 x 30-45 sec | Plank / cable crunch, 2 x 30-45 sec |

**Rules** (pure functions in one module, all unit-tested):

1. **Week** is Monday to Sunday in local time.
2. **Session contents:** Full = every plan item at its sets. Short = the first 3 items at 3 sets each. Minimum = the first 2 items at 2 sets each. Easy week = the same items, sets halved and rounded up, and plate loads prefilled one lower (lb loads unchanged).
3. **Sessions this week** = sessions dated from this Monday through today. **Still needed** = max(0, target − that count).
4. **Days since last** = whole days between the last session's date and today.
5. **Train today?**
   - No sessions ever, or days since last ≥ 3 (two full days off): "Yes, at least the Minimum".
   - Still needed ≥ days left in the week including today: "Yes, needed to hit this week's target".
   - Already trained today: "Done for today".
   - Otherwise: "Optional".
6. **Next workout** = the opposite of the most recent session with a workout set. Default A.
7. **Ready to move up:** take the exercise's last two entries across all sessions, skipping easy-week sessions. Ready when both entries have every set at or above repMax, both have at least the planned number of sets for their session, and both used the same load. The hint shows load + 1 for plate exercises, "Go heavier" for lb, and "Add weight" when the load is null.
8. **Easy week due:** count consecutive completed weeks, ending last week, with at least 2 sessions, stopping at the last week that contained an easy-week session. At 6 or more, show the notice.
9. **Measurement reminder:** no measurement, or the latest is more than 28 days old.

**Review rules** (pure functions in `reviews.ts`, all unit-tested):

1. **Behind pace:** today is Wednesday or later and the week has 0 sessions, or days since last ≥ 3. Dismissible for the rest of the day.
2. **Weekly review** covers last Monday to Sunday: sessions vs target, the count of each length, average energy across sessions that have one, walk and yoga minutes, every run of 3+ days with no session, the streak of consecutive completed weeks that met the target, exercises ready to move up (rule 7 above), plan exercises with no entry in the last 14 days, and the measurement reminder (rule 9).
3. **Monthly review** covers the last full calendar month, with each number shown next to the month before:
   - sessions per week, weeks that met the target, and the longest gap
   - the Full/Short/Minimum mix, the A/B balance, and sessions by weekday
   - average energy, plus average energy on Minimum days vs Full days
   - per exercise: load at the start and end of the month, and *stalled* when the load hasn't changed in 4+ weeks of entries
   - *missed bumps*: sessions where an exercise was ready to move up but was logged at the same load
   - the measurement change since the first entry (weight, waist, body fat), and walk and yoga minutes
   - weeks of steady training since the last easy week, and the phase review date (early February 2027)
4. **Monthly notes:** a short list of rule-based notes, each shown only when its condition holds. Examples:
   - "3+ Minimum sessions in a row. Try a Short next."
   - "Average energy under 2.5 for 2 weeks. Consider an easy week."
   - "\[Exercise\] stalled 4+ weeks. Check form, or drop a notch and build back."
   - "You hit the target 4 weeks running."
   - "Waist down X in since you started."
5. **Copy for Claude:** plain text with the monthly stats, the notes, and the month's sessions in the sessions-CSV layout, starting with one line asking for feedback, suggestions for the plan and motivation tips.

**CSV and JSON formats** (pure functions in `csv.ts` and `backup.ts`, all unit-tested):

- **Sessions CSV (import and export):** the old Sheet's Workouts layout. Rows 1-3 are headers (exercise names, station, target) and data starts on row 4. The columns are the date, one column per exercise, then Time, A/B, Session and Energy. Export adds Easy week and Notes columns at the end. Import maps columns by the header text in row 1, never by position, and accepts the file with or without the extra columns.
- **Cell format:** dates are m/d/yy. A cell is `6 x 12/12/12` (load 6, sets 12,12,12), `25 x 15/15/15` for lb loads, `15/15/15` (no load), or `30/25/0` for plank seconds (drop trailing zeros). An empty cell means the exercise was skipped. Leg curl R and L are separate columns.
- **Measurements CSV:** Date, Weight (lb), Waist (in), Body fat (%), Notes. **Walks and yoga CSV:** Date, Activity, Minutes, Notes. Both have one header row.
- **JSON backup:** `{ schemaVersion, exportedAt, settings, sessions, measurements, activities }` with every field, so a restore loses nothing. CSV is the readable copy and JSON is the exact copy.
- **Duplicates:** a session matches an existing one when the date and the entries are the same. Measurements and activities match on all fields. Matches are skipped and counted in the preview.
- **Files:** named `workouts-sessions-YYYY-MM-DD.csv`, and so on. Each one downloads separately, so no zip library is needed.

## Screens and UX

The layout is mobile first, for a phone held in one hand between sets. Signed in, there's a bottom tab bar of five tabs. Signed out, there's a single sign-in screen.

| Screen | What's on it |
| --- | --- |
| Sign in | App name and a "Sign in with Google" button. A "This account isn't authorized" message for any other account. |
| Today | The behind-pace banner when it applies, and the weekly review card (Sunday through Tuesday). Then the This week card (sessions x/3, still needed, days since last, Train today?, walk/yoga minutes), the next workout and a large Start session button. |
| Log | Step 1: A/B and Full/Short/Minimum, plus the easy-week toggle. Step 2: one card per exercise with target, last time, a load stepper and one reps field per set, plus a progression badge. Step 3: minutes, energy 1-5, notes, Save. |
| Progress | Three sections: Weekly review (last week, with a back arrow to earlier weeks), Monthly review (with Copy for Claude), and History (sessions newest first; tap to view, edit or delete with a confirm). |
| Body | Two sections: Measurements (add form and list) and Walks & yoga (quick add and list). |
| Plan | Workouts A and B, session lengths, rules, weekly target setting, Backup and restore (export and import), sign out. |

**UX rules**

- Tap targets are at least 44 px, and number fields open the numeric keyboard (`inputmode="numeric"`).
- Reps fields prefill from last time, so a repeat of last session is just Save.
- A reps field left empty means the set wasn't done. An exercise with no reps entered is not saved.
- An unsaved session draft survives a page reload (kept in localStorage until saved).
- Saving works with no signal. A small "Saved, will sync" indicator shows until Firestore confirms the write.
- Dark and light themes follow the system setting.

## Tech stack and structure

The stack is Vite, React and TypeScript on Firebase Hosting, with the Firebase JS SDK for sign-in and data and no other backend.

- **Firebase:** one project on the free Spark plan, with Authentication (Google provider) and Cloud Firestore. Use the modular SDK, importing only `app`, `auth` and `firestore`.
- **Offline:** turn on Firestore's persistent local cache so the app loads and saves with no signal. Use the setup the current Firebase docs recommend for the web SDK.
- **Google sign-in on a phone:** popup and redirect sign-in behave differently in mobile Safari and Chrome. Follow Firebase's current guidance for mobile web, and test sign-in on your phone in the first deploy, not at the end.
- **Config:** the Firebase web config goes in `VITE_FIREBASE_*` environment variables, in `.env.local`, which is read at build time for local dev and for deploys. The app is opened at `PROJECT_ID.firebaseapp.com` (the `web.app` address redirects there), which is the auth domain.
- **Rules:** keep `firestore.rules` in the repo and deploy it with the Firebase CLI or paste it into the console.
- **Firebase Hosting:** `firebase.json` serves `dist` (`npm run deploy` builds and deploys). The app has no URL routes (tabs are state), so no rewrites are needed.
- **State:** React context that holds the auth user and the live Firestore data. Pure rule functions take that data and return what the screens show.
- **Styling:** one plain CSS file with CSS variables for the themes. No UI kit, no router.
- **Tests:** Vitest for `rules.ts`, `reviews.ts`, `csv.ts`, `backup.ts` and `dates.ts`. Firestore code is tested by hand against the acceptance criteria. The Firebase emulator is *Later*.

```
src/
  plan.ts            // exercises + workouts A/B (the plan config)
  types.ts           // the interfaces above
  lib/
    firebase.ts      // initializeApp, auth, firestore with offline cache
    db.ts            // listeners + add/update/delete for each collection
    rules.ts         // week math, train-today, next workout, progression, easy week
    reviews.ts       // behind-pace, weekly review, monthly review, notes, copy-for-Claude text
    csv.ts           // CSV parse + export for sessions, measurements, activities
    backup.ts        // JSON export + restore, duplicate matching
    dates.ts         // local-date helpers (stored dates are plain YYYY-MM-DD)
  state/
    AuthGate.tsx     // sign-in screen vs app
    store.tsx        // context with user + live data
  screens/
    SignIn.tsx  Today.tsx  Log.tsx  Progress.tsx  Body.tsx  Plan.tsx
  components/        // Stepper, Card, TabBar, SyncIndicator, ImportPreview
  App.tsx  main.tsx  styles.css
firestore.rules
.env.example         // VITE_FIREBASE_* keys, no values
```

Stored dates are plain `YYYY-MM-DD` strings in local time, so a session logged at 11pm stays on that day.

## Acceptance criteria

The MVP is done when every box below is ticked on your phone, against the Firebase Hosting deploy.

- [ ] `npm install`, `npm run dev` and `npm test` work locally, and `npm run build` and `npm run deploy` succeed.
- [ ] Google sign-in works on the phone. Signing in with a different Google account shows "not authorized" and no data can be read or written (confirmed in the Rules Playground too).
- [ ] Importing the current Workouts CSV creates 13 sessions dated 6/21/26 to 9/30/26, with no parse errors. The 6/21/26 lat pulldown reads as load 5, sets 12/12/12. Running the import twice adds nothing the second time.
- [ ] Exporting sessions to CSV and importing that file into a fresh account recreates the same sessions, including easy week and notes. The exported CSV opens in Google Sheets in the old Workouts layout.
- [ ] Exporting JSON and restoring it into a fresh account recreates every session, measurement, activity and setting exactly.
- [ ] Right after that import (with today 11/6/26), the dashboard shows 0 of 3 this week, 37 days since the last session, "Yes, at least the Minimum" and next workout A. The behind-pace banner shows.
- [ ] A Short A session lists goblet squat, lat pulldown and chest press at 3 sets each. A Minimum B session lists goblet squat and seated row at 2 sets each.
- [ ] Logging the same exercise at the same load with every set at its rep max in two sessions in a row shows the move-up badge. One set below the max does not.
- [ ] Easy-week sessions are skipped by the progression rule and reset the easy-week count.
- [ ] With the imported history, the monthly review for August 2026 shows 6 sessions and lists the lifts that were ready to move up but logged at the same load. Copy for Claude puts a readable summary on the clipboard.
- [ ] Unit tests cover week boundaries (Sunday night vs Monday morning), every Train today? branch, the behind-pace rule, A/B alternation, weekly and monthly review stats, every monthly note, CSV round-trips and the 28-day measurement reminder.
- [ ] A session saved in airplane mode shows "Saved, will sync" and appears in Firestore once the phone is back online.
- [ ] Data logged on the phone appears after signing in on a laptop browser.
- [ ] Logging a Full session with prefilled values takes under 60 seconds.

## Build prompt

Export this doc as Markdown and save it as `SPEC.md` in an empty project folder. Have the Workouts tab saved as a CSV, then paste the prompt below into Claude Code.

```markdown
Build the workout tracker MVP described in SPEC.md in this folder. Read the whole spec before writing code.

Constraints:
- Vite + React + TypeScript, plain CSS, Firebase JS SDK (Auth with Google sign-in + Cloud Firestore), deployed as a static site on Firebase Hosting.
- No other backend: no API routes, no Cloud Functions, no other database or auth service.
- Keep dependencies to Vite, React, TypeScript, firebase and Vitest unless you ask me first. Write the CSV parsing yourself (quoted fields included) rather than adding a library, unless you show me why one is needed.
- Build only what the spec lists. Anything marked Later is out of scope.
- Check Firebase APIs against their current docs rather than memory, and tell me when you're unsure a function or setting exists.
- If a requirement is ambiguous or seems wrong, stop and ask me rather than guessing.

Work in this order, and stop for my review after each step:
1. Scaffold the project, add plan.ts and types.ts from the spec, and set up Vitest.
2. Write lib/rules.ts, lib/reviews.ts, lib/csv.ts, lib/backup.ts and lib/dates.ts as pure functions, with unit tests covering every rule, review stat, note and CSV/JSON round-trip in the spec. Run the tests and show me the results.
3. Walk me through the Firebase console setup: create the project, enable Google sign-in, create Firestore, and deploy firestore.rules with my email. Then add lib/firebase.ts (with the offline cache), the AuthGate and the sign-in screen, and .env.example.
4. Deploy to Firebase Hosting now, so I can test sign-in on my phone before we build more.
5. Build lib/db.ts, the store, and the Today (with the behind-pace banner and weekly review card) and Log screens. Make sure logging works end to end on my phone.
6. Build the Progress (weekly review, monthly review with Copy for Claude, history), Body and Plan screens, and Backup and restore with import previews.
7. Go through the acceptance criteria one by one and report which pass. Fix any that don't.
```
