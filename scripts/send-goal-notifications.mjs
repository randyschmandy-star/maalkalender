// Kjøres av GitHub Actions (.github/workflows/send-goal-notifications.yml).
// Går gjennom alle brukere i "users"-samlingen, finner mål som er planlagt
// for "i dag" (i norsk tid), har varsling skrudd på med et bestemt
// klokkeslett, ikke allerede er fullført i dag, og hvor klokkeslettet har
// passert uten at det allerede er varslet om i dag — og sender da ett
// push-varsel til alle enheter brukeren har aktivert. Jobben kjører hvert
// 5. minutt, så presisjonen på klokkeslettet er ±5 minutter.

import admin from "firebase-admin";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("Mangler FIREBASE_SERVICE_ACCOUNT (GitHub secret).");
  process.exitCode = 1;
  throw new Error("Mangler FIREBASE_SERVICE_ACCOUNT");
}

const serviceAccount = JSON.parse(raw);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();
const TIME_ZONE = "Europe/Oslo";

// --- Dato-hjelpere (portert fra klienten, men med eksplisitt norsk tidssone
// siden GitHub Actions kjører i UTC) ---

function todayKeyInTz() {
  // en-CA gir YYYY-MM-DD, samme format som toKey() i appen.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
function nowClockInTz() {
  // Gir "HH:MM" i norsk tid, uavhengig av hvilken tidssone CI-serveren selv kjører i.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date());
}
function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isNativelyScheduled(g, dateKey) {
  if (g.type === "once") return g.date === dateKey;
  if (g.type === "daily") {
    if (g.createdAt && dateKey < g.createdAt) return false;
    if (!g.weekdays || g.weekdays.length === 0) return true;
    return g.weekdays.includes(fromKey(dateKey).getDay());
  }
  return false;
}
function isPostponedAway(postponements, dateKey, goalId) {
  return postponements.some((p) => p.goalId === goalId && p.from === dateKey);
}
function goalsForDate(data, dateKey) {
  const postponements = Array.isArray(data.postponements) ? data.postponements : [];
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const base = goals.filter((g) => isNativelyScheduled(g, dateKey) && !isPostponedAway(postponements, dateKey, g.id));
  const pushedIds = postponements.filter((p) => p.to === dateKey).map((p) => p.goalId);
  const extra = goals.filter((g) => pushedIds.includes(g.id) && !base.some((b) => b.id === g.id));
  return [...base, ...extra];
}
function doneIdsFor(data, dateKey) {
  return (data.completions && data.completions[dateKey]) || [];
}

async function main() {
  const todayKey = todayKeyInTz();
  const nowClock = nowClockInTz();

  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    console.log("Ingen brukere funnet.");
    return;
  }

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    let tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
    if (tokens.length === 0) continue;

    const todaysGoals = goalsForDate(data, todayKey);
    const doneIds = doneIdsFor(data, todayKey);
    const notifyLastSent = data.notifyLastSent || {};
    const lastSentUpdates = {};

    for (const g of todaysGoals) {
      if (!g.notify || !g.notify.enabled || !g.notify.time) continue;
      if (doneIds.includes(g.id)) continue; // allerede fullført i dag

      // Klokkeslettet er passert i dag, og vi har ikke allerede varslet om
      // dette målet i dag (notifyLastSent lagrer datonøkkelen den ble sendt).
      const timePassed = nowClock >= g.notify.time;
      const alreadySentToday = notifyLastSent[g.id] === todayKey;
      if (!timePassed || alreadySentToday) continue;

      const remainingTokens = [];
      let anySent = false;
      for (const token of tokens) {
        try {
          await messaging.send({
            token,
            data: {
              title: "Målkalender",
              body: `Husk: ${g.text}`,
            },
          });
          anySent = true;
          remainingTokens.push(token);
        } catch (err) {
          console.error(`Feil ved sending (mål "${g.text}", bruker ${userDoc.id}): ${err.message}`);
          const isDeadToken =
            err.code === "messaging/registration-token-not-registered" ||
            err.code === "messaging/invalid-argument";
          if (!isDeadToken) remainingTokens.push(token); // behold ved forbigående feil
        }
      }

      if (anySent) {
        lastSentUpdates[g.id] = todayKey;
        console.log(`Sendt varsel for "${g.text}" (kl. ${g.notify.time}) til bruker ${userDoc.id}.`);
      }

      if (remainingTokens.length !== tokens.length) {
        tokens = remainingTokens;
        await userDoc.ref.update({ fcmTokens: tokens });
      }
    }

    if (Object.keys(lastSentUpdates).length > 0) {
      const updates = {};
      for (const [goalId, dateKey] of Object.entries(lastSentUpdates)) {
        updates[`notifyLastSent.${goalId}`] = dateKey;
      }
      await userDoc.ref.update(updates);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
// Merk: bevisst INGEN process.exit() her — se forklaring i varsel-eksperimentets
// send-notifications.mjs. Et eksplisitt process.exit() rett etter siste
// console.log kan kutte prosessen før utskriften er flushet til CI-loggen.
