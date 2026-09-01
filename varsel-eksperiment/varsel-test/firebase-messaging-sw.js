// Service worker for bakgrunnsvarsler (Firebase Cloud Messaging).
// Må ligge i samme mappe som varsel-test/index.html, siden en service worker
// bare kan kontrollere sider i sin egen mappe og undermapper (scope).

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// Samme Firebase-prosjekt som målkalenderen (maalkalender)
firebase.initializeApp({
  apiKey: "AIzaSyANIgaq9pbu9LABCUS1gXxvVWHt8gqSjAI",
  authDomain: "maalkalender.firebaseapp.com",
  projectId: "maalkalender",
  storageBucket: "maalkalender.firebasestorage.app",
  messagingSenderId: "1086811554153",
  appId: "1:1086811554153:web:8529ec52c19261217dbdf8"
});

const messaging = firebase.messaging();

// Vi sender kun "data"-felt fra serveren (ikke "notification"), slik at vi
// selv styrer visningen her og unngår doble varsler.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.data && payload.data.title) || "Målkalender-test";
  const body = (payload.data && payload.data.body) || "";

  self.registration.showNotification(title, {
    body,
    icon: "icon-192.png",
    badge: "icon-192.png",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(".");
    })
  );
});
