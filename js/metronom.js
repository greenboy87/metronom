/* ============================================================
   METRONOM-TAKTGEBER
   Toene werden mit kleinem Vorlauf auf die Audiouhr (ctx.currentTime)
   gelegt - nie direkt per Timer ausgeloest, ein Browser-Timer
   verrutscht um zig Millisekunden. Der Timer weckt nur den Planer.
   Er laeuft in einem Worker, weil ein Hintergrund-Tab normale
   Timer auf 1 Sekunde drosselt und das Metronom dann stottern wuerde.
   Die Anzeige folgt per requestAnimationFrame der Audiouhr.
   ============================================================ */

const TEMPO_MIN = 20, TEMPO_MAX = 260;
const VORLAUF = 0.12;          // Sekunden, die im Voraus geplant werden
const WECK_TAKT_MS = 25;

const metronom = {
    // Einstellungen - werden von app.js gesetzt und gespeichert
    bpm: 100,
    zaehler: 4,
    nenner: 4,
    betonung: ['hoch', 'tief', 'tief', 'tief'],
    unterteilung: 1,
    klang: 'klick',
    trainer: { an: false, schritt: 5, alleTakte: 4, ziel: 140 },
    stille: { an: false, hoeren: 1, still: 1 },

    // Rueckrufe fuer die Anzeige
    beiSchlag: null,           // ({schlag, sub, takt, still}) im Moment des Erklingens
    beiTempoAenderung: null,   // (bpm) wenn der Tempo-Trainer das Tempo aendert
    beiStopp: null,

    laeuft: false
};

let mNaechsteZeit = 0, mSchlag = 0, mSub = 0, mTakt = 0;
let mAnzeigeSchlange = [], mGeplanteKnoten = [], mRafId = 0;
let mWecker = null;

function weckerHolen() {
    if (mWecker) return mWecker;
    try {
        const code = 'let t=null;onmessage=e=>{if(e.data==="start"){clearInterval(t);t=setInterval(()=>postMessage(0),'
            + WECK_TAKT_MS + ');}else{clearInterval(t);t=null;}};';
        mWecker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    } catch (e) {
        // Fallback ohne Worker (z.B. sehr alte Browser): normaler Timer.
        let t = null;
        mWecker = {
            onmessage: null,
            postMessage(befehl) {
                clearInterval(t);
                if (befehl === 'start') t = setInterval(() => this.onmessage && this.onmessage(), WECK_TAKT_MS);
            }
        };
    }
    mWecker.onmessage = planer;
    return mWecker;
}

function tempoBegrenzen(bpm) {
    return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm)));
}

function istStillerTakt(takt) {
    const s = metronom.stille;
    if (!s.an) return false;
    const runde = Math.max(1, s.hoeren) + Math.max(1, s.still);
    return (takt % runde) >= Math.max(1, s.hoeren);
}

function planeSchritt(ctx, zeit) {
    const still = istStillerTakt(mTakt);
    let art = null;
    if (mSub === 0) {
        const b = metronom.betonung[mSchlag] || 'tief';
        if (b !== 'aus') art = b;
    } else {
        art = 'sub';
    }
    if (art && !still) {
        for (const knoten of spieleKlang(ctx, zeit, art, metronom.klang)) {
            mGeplanteKnoten.push({ knoten, zeit });
        }
    }
    mAnzeigeSchlange.push({ zeit, schlag: mSchlag, sub: mSub, takt: mTakt, still, art });
}

function weiterzaehlen() {
    mNaechsteZeit += 60 / metronom.bpm / metronom.unterteilung;
    mSub++;
    if (mSub >= metronom.unterteilung) {
        mSub = 0;
        mSchlag++;
        if (mSchlag >= metronom.zaehler) {
            mSchlag = 0;
            mTakt++;
            tempoTrainerSchritt();
        }
    }
}

/* Tempo-Trainer: alle N Takte um X BPM naeher ans Ziel - funktioniert
   in beide Richtungen (schneller werden oder langsamer werden). */
function tempoTrainerSchritt() {
    const t = metronom.trainer;
    if (!t.an || mTakt === 0 || mTakt % Math.max(1, t.alleTakte) !== 0) return;
    const ziel = tempoBegrenzen(t.ziel);
    if (metronom.bpm === ziel) return;
    const schritt = Math.max(1, Math.abs(t.schritt));
    const neu = metronom.bpm < ziel
        ? Math.min(ziel, metronom.bpm + schritt)
        : Math.max(ziel, metronom.bpm - schritt);
    metronom.bpm = neu;
    if (metronom.beiTempoAenderung) metronom.beiTempoAenderung(neu);
}

function planer() {
    const ctx = audioCtx;
    if (!metronom.laeuft || !ctx) return;
    // Aenderungen an Taktart/Unterteilung waehrend des Laufens abfangen
    if (mSchlag >= metronom.zaehler) { mSchlag = 0; mSub = 0; }
    if (mSub >= metronom.unterteilung) mSub = 0;
    // Nach einem Haenger (Tab lange schlafend) nicht alles nachholen
    if (mNaechsteZeit < ctx.currentTime - 0.2) mNaechsteZeit = ctx.currentTime + 0.05;
    while (mNaechsteZeit < ctx.currentTime + VORLAUF) {
        planeSchritt(ctx, mNaechsteZeit);
        weiterzaehlen();
    }
    mGeplanteKnoten = mGeplanteKnoten.filter(e => e.zeit > ctx.currentTime - 0.5);
    audioMarkeNachziehen();
}

function anzeigeSchleife() {
    const ctx = audioCtx;
    if (!metronom.laeuft || !ctx) return;
    let letzter = null;
    while (mAnzeigeSchlange.length && mAnzeigeSchlange[0].zeit <= ctx.currentTime) {
        letzter = mAnzeigeSchlange.shift();
    }
    if (letzter && metronom.beiSchlag) metronom.beiSchlag(letzter);
    mRafId = requestAnimationFrame(anzeigeSchleife);
}

function metronomStarten() {
    return audioBereit().then(ctx => {
        if (metronom.laeuft) return;
        metronom.laeuft = true;
        mSchlag = 0; mSub = 0; mTakt = 0;
        mAnzeigeSchlange = [];
        mNaechsteZeit = ctx.currentTime + 0.08;
        planer();
        weckerHolen().postMessage('start');
        mRafId = requestAnimationFrame(anzeigeSchleife);
    });
}

function metronomStoppen() {
    if (!metronom.laeuft) return;
    metronom.laeuft = false;
    if (mWecker) mWecker.postMessage('stopp');
    cancelAnimationFrame(mRafId);
    // Schon geplante Toene einzeln abbrechen, sonst klickt es nach dem Stopp noch.
    for (const { knoten } of mGeplanteKnoten) {
        try { knoten.stop(); } catch (e) { /* schon fertig */ }
    }
    mGeplanteKnoten = [];
    mAnzeigeSchlange = [];
    if (metronom.beiStopp) metronom.beiStopp();
}

/* Vorgabe fuer die Betonung je Taktart: erster Schlag hoch, bei
   zusammengesetzten Achteltakten (6/8, 9/8, 12/8) jede Dreiergruppe. */
function standardBetonung(zaehler, nenner) {
    const zusammengesetzt = nenner === 8 && zaehler % 3 === 0 && zaehler > 3;
    return Array.from({ length: zaehler }, (_, i) =>
        (i === 0 || (zusammengesetzt && i % 3 === 0)) ? 'hoch' : 'tief');
}

/* Italienische Tempobezeichnungen mit deutscher Uebersetzung. */
const TEMPO_NAMEN = [
    [40, 'Grave', 'schwer, sehr langsam'],
    [60, 'Largo', 'breit'],
    [66, 'Larghetto', 'etwas breit'],
    [76, 'Adagio', 'langsam'],
    [108, 'Andante', 'gehend'],
    [120, 'Moderato', 'mäßig'],
    [156, 'Allegro', 'schnell, fröhlich'],
    [176, 'Vivace', 'lebhaft'],
    [200, 'Presto', 'sehr schnell'],
    [Infinity, 'Prestissimo', 'äußerst schnell']
];
function tempoName(bpm) {
    const [, name, deutsch] = TEMPO_NAMEN.find(([grenze]) => bpm < grenze);
    return { name, deutsch };
}
