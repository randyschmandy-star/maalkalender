// Kjøres av GitHub Actions (.github/workflows/send-notifications.yml).
// Sjekker Firestore for aktive abonnementer i "notifyTests" og sender et
// push-varsel til dem som har passert sitt valgte intervall siden sist.

import admin from "firebase-admin";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("Mangler FIREBASE_SERVICE_ACCOUNT (GitHub secret).");
  process.exit(1);
}

const serviceAccount = JSON.parse(raw);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();
const COLLECTION = "notifyTests";

async function main() {
  const now = Date.now();
  const snapshot = await db.collection(COLLECTION).where("enabled", "==", true).get();

  if (snapshot.empty) {
    console.log("Ingen aktive abonnenter.");
    return;
  }

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const { token, intervalMinutes, lastSent } = data;

    if (!token || !intervalMinutes) {
      console.log(`Hopper over ${docSnap.id}: mangler token eller intervall.`);
      continue;
    }

    const intervalMs = Number(intervalMinutes) * 60 * 1000;
    const due = !lastSent || now - lastSent >= intervalMs;
    if (!due) continue;

    try {
      await messaging.send({
        token,
        data: {
          title: "Målkalender-test",
          body: `Testvarsel – hvert ${intervalMinutes}. minutt`,
        },
      });
      await docSnap.ref.update({ lastSent: now });
      console.log(`Sendt varsel til ${docSnap.id}.`);
    } catch (err) {
      console.error(`Feil ved sending til ${docSnap.id}: ${err.message}`);
      // Ugyldig/utløpt token – skru av abonnementet så vi ikke prøver igjen.
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-argument"
      ) {
        await docSnap.ref.update({ enabled: false });
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
