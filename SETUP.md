# ZombieWave V5 – Setup & Deployment Guide

## Übersicht der Dateien

```
zombiewave-v5/
├── server.js          ← Backend (Node.js + Socket.io + MongoDB)
├── package.json       ← Abhängigkeiten
├── .env.example       ← Vorlage für Umgebungsvariablen
├── .gitignore
└── public/
    └── index.html     ← Das komplette Spiel (Frontend)
```

---

## Schritt 1 – MongoDB Atlas (Datenbank, kostenlos)

1. Gehe zu **https://cloud.mongodb.com** und registriere dich (kostenlos).
2. Erstelle einen neuen Cluster → wähle **„M0 Free Tier"**.
3. Wähle einen beliebigen Cloud-Anbieter und Region.
4. Unter **Database Access** → neuen User anlegen (z.B. `zwadmin`) mit Passwort.
5. Unter **Network Access** → IP `0.0.0.0/0` hinzufügen (erlaubt alle IPs).
6. Unter **Databases** → „Connect" → „Drivers" → Connection String kopieren.
   Er sieht so aus:
   ```
   mongodb+srv://zwadmin:DEINPASSWORT@cluster0.abc12.mongodb.net/?retryWrites=true&w=majority
   ```
7. Füge am Ende `/zombiewave` ein (vor dem `?`):
   ```
   mongodb+srv://zwadmin:DEINPASSWORT@cluster0.abc12.mongodb.net/zombiewave?retryWrites=true&w=majority
   ```

---

## Schritt 2 – GitHub Repository erstellen

1. Gehe zu **https://github.com** und melde dich an.
2. Klicke auf „New Repository" → Name z.B. `zombiewave-v5` → Public → Create.
3. Lade Git herunter falls nicht installiert: **https://git-scm.com**
4. Öffne ein Terminal / die Eingabeaufforderung im Projektordner:

```bash
cd zombiewave-v5
git init
git add .
git commit -m "Initial commit – ZombieWave V5"
git branch -M main
git remote add origin https://github.com/DEIN_USERNAME/zombiewave-v5.git
git push -u origin main
```

---

## Schritt 3 – Railway.app (Hosting, kostenlos)

1. Gehe zu **https://railway.app** und melde dich mit deinem GitHub-Account an.
2. Klicke auf **„New Project"** → **„Deploy from GitHub repo"**.
3. Wähle dein `zombiewave-v5` Repository aus.
4. Railway erkennt automatisch Node.js und startet den Server.

### Umgebungsvariablen setzen

In Railway → dein Projekt → **„Variables"** Tab → folgende Variablen hinzufügen:

| Variable        | Wert                                                     |
|----------------|----------------------------------------------------------|
| `MONGODB_URI`  | Dein MongoDB Connection String (aus Schritt 1)          |
| `JWT_SECRET`   | Ein langer zufälliger String, z.B. `meinGeheimesPasswort123!XYZ` |
| `NODE_ENV`     | `production`                                             |

> **Wichtig:** `PORT` muss NICHT gesetzt werden – Railway setzt das automatisch.

5. Nach dem Speichern der Variablen startet Railway den Server neu.
6. Unter **„Settings" → „Domains"** siehst du deine URL, z.B.:
   ```
   https://zombiewave-v5-production.up.railway.app
   ```

---

## Schritt 4 – Spiel öffnen & testen

1. Öffne deine Railway-URL im Browser.
2. Registriere einen Account.
3. Der **Admin-Account** `AdminMaik` mit Passwort `Maik-201225admin` wird automatisch richtig eingerichtet sobald du dich das erste Mal damit registrierst.

---

## Multiplayer benutzen

### Party erstellen (Leader)
1. Im Menü → **„Multiplayer"** Tab
2. Modus wählen (Koop oder Versus) + Schwierigkeit
3. **„Party erstellen"** klicken
4. Den **5-stelligen Code** (z.B. `AB3XY`) an Mitspieler schicken

### Party beitreten
1. Im Menü → **„Multiplayer"** Tab
2. Code in das Textfeld eingeben → **„Beitreten"**

### Spiel starten
- Alle Mitglieder können auf **„Bereit"** klicken
- Der **Leader** klickt auf **„▶ Spiel starten"**
- Alle Spieler starten gleichzeitig

---

## Sprache wechseln

Im Menü → **„Einstellungen"** Tab → 🇩🇪 Deutsch / 🇬🇧 English

---

## Lokales Testen (ohne Deployment)

Falls du das Spiel lokal testen willst:

1. **Node.js** installieren: https://nodejs.org (Version 18+)
2. Im Projektordner:
   ```bash
   npm install
   ```
3. Erstelle eine `.env` Datei (kopiere `.env.example` und fülle sie aus):
   ```
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=irgendeinGeheimerString
   PORT=3000
   ```
4. Server starten:
   ```bash
   npm start
   ```
5. Im Browser öffnen: **http://localhost:3000**

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| „MongoDB Fehler" | Connection String prüfen, IP Whitelist in MongoDB Atlas |
| Spiel lädt nicht | Railway Deployment-Logs prüfen (Tab „Deployments") |
| Socket-Verbindung bricht ab | Railway Free Tier schläft nach Inaktivität – erste Anfrage weckt es auf |
| Party-Code funktioniert nicht | Server-Logs prüfen, Code korrekt eingeben (5 Zeichen, Großbuchstaben) |

---

## Technologie-Stack

- **Frontend:** HTML5 Canvas + Vanilla JS + Socket.io Client
- **Backend:** Node.js + Express + Socket.io
- **Datenbank:** MongoDB Atlas (Mongoose ODM)
- **Auth:** JWT (JSON Web Tokens) + bcrypt (Passwort-Hashing)
- **Hosting:** Railway.app (kostenloses Tier)
- **Echtzeit:** WebSockets via Socket.io (Party-System, Spieler-Sync, Enemy-Sync)
