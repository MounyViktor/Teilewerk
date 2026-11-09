# Teilewerk für das iPhone

Lager- und Rechnungsverwaltung für gebrauchte Roller-Teile als Offline-Web-App.
Nach der Installation läuft sie ohne PC, Server und Internet. Alle Daten bleiben auf dem iPhone.
Das bisherige Teilewerk in `C:\Projects\Teilewerk` ist davon unabhängig. Die beiden tauschen keine Daten aus.

## Einrichten

Die App-Dateien müssen einmal unter einer **HTTPS-Adresse** erreichbar sein, damit das iPhone sie installieren kann.
Über `http://` im WLAN geht es nicht: Ohne HTTPS gibt es keinen Offline-Betrieb und keine Rechnungen.
Dort liegen nur die Programmdateien. Deine Teile, Kunden und Rechnungen werden nie hochgeladen.

### 1. App bauen

```powershell
cd C:\Projects\Teilewerk-iPhone
npm install
npm run build
```

Das Ergebnis liegt im Ordner `dist`.

### 2. Kostenlos veröffentlichen

Zum Beispiel bei Cloudflare Pages (kostenloses Konto nötig): ein neues Pages-Projekt mit direktem Hochladen anlegen und den Ordner `dist` hochladen.
GitHub Pages oder Netlify gehen genauso.

**Behalte diese Adresse dauerhaft.** Der Speicher des iPhones gehört zur Adresse. Unter einer neuen Adresse wäre die App zunächst leer, dann hilft nur das Einspielen einer Sicherung.

### 3. Auf dem iPhone installieren

1. Adresse in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Teilewerk ab jetzt **nur über das neue Icon** öffnen. iOS trennt die Daten von Safari und Home-Bildschirm-App.
4. Einmal mit Internet öffnen, kurz warten, dann im Flugmodus prüfen, ob die App startet.
5. Unter **Mehr → Einstellungen** Name, Anschrift und Steuernummer eintragen.

## Roller, Fotos und Dokumente

Im **Lager** gibt es Teile und Roller. Roller haben eigene Felder (FIN, Kennzeichen, Erstzulassung, Kilometerstand, Papiere, Ankauf). Die Rechnung nennt die Fahrzeugdaten, die Anzeige lässt FIN, Kennzeichen und Ankaufspreis weg.

**Fotos aus Dropbox:** Auf „Fotos auswählen“ tippen, dann „Datei auswählen“ und Dropbox. Dafür muss die Dropbox-App in „Dateien“ aktiviert sein. Standortdaten werden auch hier entfernt.

**Dokumente** (PDF oder Bild) lassen sich an Rollern, Teilen und Verkäufen ablegen und sind Teil der Sicherung. Dokumente eines Verkaufs lassen sich ab der ersten Rechnung nicht mehr löschen, nur noch ergänzen.

## Gewährleistung auf 1 Jahr verkürzen

Das geht nur, wenn der Käufer **vor** der verbindlichen Kaufzusage eigens informiert wird und ausdrücklich und gesondert zustimmt (§ 476 Abs. 2 BGB).

- **Per Chat:** Beim Verkauf die Chat-Nachricht oder die Vereinbarung als PDF senden, bevor der Käufer zusagt. Seine Antwort „Einverstanden: 1 Jahr Gewährleistung“ als Screenshot sichern.
- **Vor Ort:** Beim Verkauf **Vereinbarung als PDF erstellen**, ausdrucken oder am iPhone zeigen und als eigenes Blatt **vor** dem Kaufvertrag unterschreiben lassen. Uhrzeit eintragen und fotografieren.
- **Danach:** Haken „Auf 1 Jahr verkürzt“ setzen, beide Zeitpunkte und den Nachweis eintragen und den Screenshot oder das Foto unter **Nachweise und Dokumente** ablegen.

Ohne Zustimmung gelten 2 Jahre, dann bleibt der Haken aus. Der Text ist ein Vorschlag und sollte einmal anwaltlich geprüft werden.

## Ausgaben und Verträge

Unter **Ausgaben** erfasst du Einkäufe mit Kategorie (Werkzeug, Verbrauchsmaterial, Roller, Rollerteile neu, Rollerteile gebraucht, Sonstiges), Betrag brutto und Beleg. Pro Jahr gibt es Summen und einen ZIP-Export mit CSV und allen Belegen.
Der Ankaufspreis am Roller im Lager ist nur eine interne Angabe: Den Ankauf zusätzlich als Ausgabe eintragen, sonst fehlt er in der Auswertung.

Unter **Mehr → Verträge** legst du Verträge mit Art, Vertragspartner, Datum und Dokumenten ab. Zahlungen dafür, etwa die Autoversicherung, trägst du selbst als Ausgabe in der Kategorie „Verträge und Versicherungen“ ein, auf Wunsch direkt über den Knopf am Vertrag. Es wird nichts automatisch gebucht. Beides ist Teil der Sicherung.

Das Feld **Ausgaben (€ pro Monat)** am Vertrag fließt in die monatlichen Kosten auf der Übersicht: alle laufenden Verträge plus die Ausgaben des aktuellen Monats. Eine als Ausgabe eingetragene Rate desselben Vertrags zählt dabei nicht doppelt. In die Jahres-Ausgaben und den Export kommt nur, was als Ausgabe eingetragen ist.

## Vorlagen

Unter **Mehr → Vorlagen zum Herunterladen** gibt es leere Vordrucke mit den Daten aus den Einstellungen: Gewährleistungsbelehrung, Gewährleistungsverkürzung, Kaufvertrag, Ankaufbeleg und Rechnung.
Eine von Hand ausgefüllte Rechnung danach unter **Rechnungen** importieren, damit ihre Nummer nicht noch einmal vergeben wird.

## Verpackungsregister LUCID

Seit dem 12.08.2026 gelten PPWR und VerpackDG. Ob du dich registrieren musst, hängt nicht davon ab, ob die Ware gebraucht ist, sondern von deiner Rolle bei der Verpackung. Trage in den Einstellungen deine Nummer ein oder, wenn es geklärt ist, „nicht erforderlich“.

## Rechnungsnummern und Export

Die Nummern laufen im bisherigen Format weiter: `VS` + Jahr + Monat + laufende Nummer, zum Beispiel `VS20261100008`. Ohne andere Einstellung startet die App bei `00008`. Der Zähler läuft über Monate und Jahre durch.
Unter **Mehr → Einstellungen** lässt sich die nächste Nummer ändern, solange die App keine Rechnung enthält. Danach ist sie gesperrt.

Unter **Rechnungen** erstellt **Export erstellen** eine ZIP-Datei mit allen PDFs und der CSV-Liste des gewählten Jahres. Über das Teilen-Menü lässt sie sich in Dropbox speichern.
### Bestehende Rechnungen importieren

Unter **Rechnungen → Bestehende Rechnungen importieren** lassen sich Rechnungen übernehmen, die außerhalb der App entstanden sind: eine Import-ZIP oder einzeln als PDF mit Nummer, Datum, Käufer und Betrag.
Das PDF bleibt unverändert, die Rechnung zählt zur Rechnungssumme und erscheint in CSV, Export und Sicherung. Importierte Rechnungen lassen sich nicht ändern, löschen oder in der App stornieren.
Vorhandene Nummern und gleiche laufende Nummern werden übersprungen. Neue Rechnungen zählen hinter der höchsten importierten Nummer weiter.

Eine Import-ZIP enthält die PDFs und eine Datei `rechnungen.json`:

```json
{
  "format": "teilewerk-rechnungen-import",
  "version": 1,
  "invoices": [
    { "number": "VS20260800002", "issued_on": "2026-08-24", "buyer_name": "Name", "total_cents": 3000, "file": "VS20260800002.pdf" }
  ]
}
```

## Datensicherung (wichtig)

Die Daten liegen nur auf diesem iPhone. Sie sind weg, wenn die App gelöscht wird, und auch iOS kann den Speicher von Web-Apps in Ausnahmefällen löschen.
Rechnungen müssen 8 Jahre aufbewahrt werden (§ 147 AO, § 14b UStG).

- **Nach jeder Rechnung:** „PDF jetzt sichern“ tippen und „In Dateien sichern“ wählen, am besten in iCloud Drive.
- **Regelmäßig:** Unter **Mehr → Sicherung erstellen → Jetzt speichern** eine Komplett-Sicherung anlegen. Die App erinnert daran, sobald eine neue Rechnung ungesichert ist oder eine Änderung länger als 7 Tage zurückliegt.
- **Zusätzlich:** Die Sicherung auch auf ein anderes Gerät kopieren. iPhone-Backups allein sind nicht geprüft.
- **Regelmäßig testen:** Lässt sich die ZIP-Datei öffnen und sind die PDFs darin lesbar?

Die ZIP-Datei enthält alle Rechnungs-PDFs, Fotos und `rechnungen.csv`, lesbar auch ohne die App.
Eingespielt wird sie unter **Mehr**. Das geht nur, solange die App leer ist, damit nie vorhandene Rechnungen überschrieben werden. Jedes PDF wird dabei gegen seine Prüfsumme geprüft.

## Grenzen gegenüber dem PC-Teilewerk

| Thema | PC-Teilewerk | iPhone-App |
|---|---|---|
| Rechnungen sperren | Datenbank-Trigger | Nur innerhalb der App. Wer die App oder ihre Daten löscht, umgeht die Sperre. |
| Speicher | PostgreSQL auf dem PC | Browser-Speicher des iPhones, nicht dauerhaft garantiert |
| Zugriff | Auch von anderen Geräten | Nur dieses iPhone |
| Foto aufnehmen | Mehrere Dateien | Eines pro Aufnahme, aus der Mediathek auch mehrere |

Kläre mit deinem Steuerberater, ob diese Art der Aufbewahrung für dich ausreicht, bevor du dich darauf verlässt.
Die App ist ein Hilfsmittel und ersetzt keine Rechts- oder Steuerberatung.

Nicht getestet ist das Verhalten auf einem echten iPhone (Kamera, Teilen-Menü, Home-Bildschirm-Modus). Geprüft wurde mit Edge und der WebKit-Engine auf Windows.

## Aktualisieren

Die App liegt unter <https://teilewerk-app.pages.dev>. Nach einer Änderung im Projektordner bauen und an **dieselbe Adresse** hochladen:

```powershell
npm run build
npx wrangler pages deploy dist --project-name teilewerk-app --branch main
```

Die App lädt die neue Version im Hintergrund beim nächsten Start mit Internet. Deine Daten bleiben erhalten. Sichere sie trotzdem vorher.

## Entwicklung

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests der Geschäftsregeln (Nummernkreis, Storno, Gewährleistung, Sicherung) |
| `npm run build` | Typprüfung und Build nach `dist` |
| `npm run preview` | Fertigen Build lokal ansehen (localhost zählt als sicher, auch offline) |

Technik: React, Vite, TypeScript, IndexedDB, `pdfkit` (PDF wie im PC-Teilewerk), `fflate` (ZIP), `vite-plugin-pwa` (Offline-Betrieb).
Rechtstexte stehen in `src/lib/legal.ts`, die Regeln in `src/lib/business.ts`.
