// Service worker for bakgrunnsvarsler (Firebase Cloud Messaging) for selve
// målkalenderen. Må ligge på rot-nivå i repoet (samme mappe som index.html)
// for å kunne kontrollere hele appen.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

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
  const title = (payload.data && payload.data.title) || "Målkalender";
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
