# Varsel-eksperiment – oppsett

Dette er et isolert eksperiment, adskilt fra selve målkalenderen, men det
gjenbruker samme GitHub-konto/Pages og samme Firebase-prosjekt
(`maalkalender`). Ingenting her rører de eksisterende målkalender-filene.

## Filene og hvor de skal ligge i repoet

```
repo-rot/
  varsel-test/
    index.html                 <- testsiden
    firebase-messaging-sw.js   <- service worker for bakgrunnsvarsler
  scripts/
    send-notifications.mjs     <- kjøres av GitHub Actions
    package.json
  .github/
    workflows/
      send-notifications.yml   <- den planlagte jobben (cron)
```

Legg disse til i det samme repoet som målkalenderen (eller et helt eget
repo, om du vil holde det enda mer atskilt – da må du bare også sette opp
GitHub Pages for det repoet).

## Hvordan det henger sammen

1. Du åpner `varsel-test/index.html` i nettleseren, trykker "Be om
   tillatelse og aktiver", velger intervall og lagrer.
2. Siden logger deg anonymt inn (samme mønster som målkalenderen), henter
   en FCM-token fra nettleseren, og lagrer token + valgt intervall i en ny
   Firestore-samling: `notifyTests/{din-anonyme-id}`.
3. En GitHub Actions-jobb kjører automatisk hvert 5. minutt, leser denne
   samlingen, og sender et push-varsel til alle der intervallet deres har
   "forfalt" siden forrige gang. Varselet vises av service workeren selv om
   fanen/appen er lukket.

Selve intervallet (10 min / time / 3 timer / egendefinert) styres altså av
logikken i skriptet, ikke av selve cron-tidsplanen – cron-jobben kjører
oftere (hvert 5. min) og sjekker bare hvem som er "på tur".

## Manuelle steg du må gjøre (kan ikke gjøres av meg)

### 1. Generer en VAPID-nøkkel for web push

Firebase Console → velg prosjektet `maalkalender` → tannhjulet
(Prosjektinnstillinger) → fanen **Cloud Messaging** → under
"Web-konfigurasjon" / "Web Push-sertifikater" → **Generer nøkkelpar**.

Kopier nøkkelen og lim den inn i `varsel-test/index.html`, der det står:

```js
const VAPID_KEY = "PASTE_VAPID_KEY_HERE";
```

### 2. Generer en service account-nøkkel (for GitHub Actions)

Firebase Console → Prosjektinnstillinger → fanen **Tjenestekontoer**
(Service accounts) → **Generer ny privat nøkkel**. Dette laster ned en
JSON-fil.

**Ikke legg denne filen i repoet** – den gir full admin-tilgang til
Firebase-prosjektet ditt. Den skal kun inn som en GitHub-hemmelighet
(neste steg).

### 3. Legg JSON-filen inn som en GitHub-hemmelighet

I GitHub-repoet: **Settings → Secrets and variables → Actions → New
repository secret**

- Navn: `FIREBASE_SERVICE_ACCOUNT`
- Verdi: lim inn hele innholdet i JSON-filen fra steg 2

### 4. Utvid Firestore-reglene

Firebase Console → **Firestore Database → Regler**. Legg til denne regelen
ved siden av den som allerede finnes for målkalenderen sin `users`-samling:

```
match /notifyTests/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

(GitHub Actions-skriptet bruker admin-SDK-et og er ikke omfattet av disse
reglene – de gjelder kun nettsiden/nettleseren.)

### 5. Commit og push

Push filene til GitHub. Pages bygger automatisk, og testsiden blir
tilgjengelig på undermappen, f.eks. `https://maalkalender.graabe.in/varsel-test/`
(avhengig av hvordan Pages er satt opp for repoet).

## Testing

- For å teste med én gang i stedet for å vente på cron-tidsplanen: gå til
  **Actions**-fanen i GitHub-repoet → velg workflowen "Send interval
  notifications" → trykk **Run workflow**.
- Sjekk kjøreloggen der for å se om varselet ble sendt, eller om noe feilet
  (f.eks. manglende hemmelighet, ugyldig token, feil i Firestore-reglene).

## Kjente begrensninger (verdt å vite før dette ev. bygges inn i selve appen)

- **iPhone/Safari**: push-varsler fungerer kun hvis siden er lagt til på
  Hjem-skjermen som en app (PWA), og krever iOS 16.4 eller nyere. Vanlig
  Safari-fane støtter det ikke.
- **Cron-presisjon**: GitHub Actions' tidsplanlagte jobber kan bli forsinket
  noen minutter ved høy last hos GitHub, og blir automatisk skrudd av
  dersom repoet er helt uten aktivitet i 60 dager (må da re-aktiveres
  manuelt). Fint for eksperimentering, men ikke like presist eller robust
  som en ordentlig serverjobb.
- **Ikoner**: service workeren refererer til `icon-192.png` i samme mappe.
  Den finnes ikke i `varsel-test/`, så varselet vil vises uten ikon inntil
  du evt. kopierer ikonfilen dit fra hovedappen.
