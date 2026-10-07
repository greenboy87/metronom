# Hinweise für Claude Code

## Zweck

Metronom für Schülerinnen und Schüler: Taktart, Betonung je Schlag
(hoch / tief / aus), Tempo per Drehrad oder Tippen, Unterteilung
(Achtel, Triolen, Sechzehntel), Zählhilfe, Tempo-Trainer, stille Takte,
Übungszeit. Rein statisch über GitHub Pages, keine Schülerdaten,
Einstellungen nur in `localStorage` des Geräts.

## Nicht in einen Cloud-Ordner legen

Dieses Repository darf nicht in einem synchronisierten Ordner liegen
(iCloud Drive, OneDrive, Dropbox). Solche Dienste benennen bei Konflikten
um, statt zusammenzuführen, und beschädigen dabei `.git`.

## Abgleich zwischen mehreren Rechnern

Läuft über GitHub, nicht über Dateisynchronisation: `git pull` vor dem
Arbeiten, `git commit` und `git push` danach. Vor einem Urteil über den
Stand eines Ordners erst `git fetch` oder `git ls-remote origin main`.

## Kein Tailwind

Auf dem Entwicklungsrechner gibt es kein Node. Eigenes CSS mit
CSS-Variablen fürs Theme (`css/stil.css`), dunkel als Voreinstellung,
hell per `html[data-theme="light"]`.

## Architektur

- `js/audio.js` - AudioContext-Handling aus der Rhythmus-Werkstatt
  übernommen (Safari-Entsperren, Hänger-Erkennung bei Gerätewechsel,
  ein dauerhafter Gain-Knoten für die Lautstärke) plus die drei Klänge
  Klick / Holzblock / Piepton in den Arten `hoch`, `tief`, `sub`.
- `js/metronom.js` - der Taktgeber. Töne werden mit 120 ms Vorlauf auf
  `ctx.currentTime` geplant. Der Weck-Timer läuft in einem Blob-Worker,
  weil Hintergrund-Tabs normale Timer auf 1 s drosseln. Die Anzeige
  folgt per `requestAnimationFrame` einer Warteschlange mit den
  Audio-Zeitpunkten. Beim Stopp werden geplante Knoten einzeln
  gestoppt. Enthält auch Tempo-Trainer, stille Takte, Standard-Betonung
  je Taktart und die italienischen Tempobezeichnungen.
- `js/drehrad.js` - SVG-Drehrad mit Pointer-Events: 6° Drehung = 1 BPM.
  Nur der Ring dreht; die Mitte ist der Start/Stopp-Knopf.
- `js/app.js` - Verdrahtung, Speichern/Laden, Tippen (auf `pointerdown`,
  nicht `click`), Tastatur (Leertaste, T, Pfeile), Theme, Bildschirm-
  Wachhalten (Wake Lock) während das Metronom läuft.

## Cache-Busting bei jedem Push

Die `<script>`/`<link>`-Tags in `index.html` hängen `?v=N` an - dieselbe
Zahl wie `APP_VERSION` in `js/version.js`. Bei jeder inhaltlichen
Änderung **beides zusammen** hochzählen, sonst liefert GitHub Pages bis
zu 10 Minuten noch alte JS/CSS-Dateien aus.
