/* ============================================================
   AUDIO: Tonausgabe und die drei Metronom-Klaenge.
   Uebernommen aus der Rhythmus-Werkstatt: Safari-Entsperren,
   Haenger-Erkennung und ein dauerhafter Gain-Knoten fuer die
   Lautstaerke, damit der Regler live wirkt.
   ============================================================ */

let audioCtx = null, audioEntsperrt = false;
let lautstaerkeKnoten = null, lautstaerke = 0.7;

/* Ein AudioContext kann 'running' melden und trotzdem ins Leere rendern,
   wenn ein Geraetewechsel (Bluetooth, Beamer per HDMI) ihm die Ausgabe
   wegnimmt. Verraet sich daran, dass currentTime stehen bleibt. */
let audioCtxZeitmarke = 0, audioCtxWanduhr = 0, audioGeraeteWechsel = false;
function audioContextHaengt() {
    if (!audioCtx || audioCtx.state !== 'running' || !audioCtxWanduhr) return false;
    const wandDelta = Date.now() - audioCtxWanduhr;
    const ctxDelta = audioCtx.currentTime - audioCtxZeitmarke;
    return wandDelta > 500 && ctxDelta < 0.05;
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { audioGeraeteWechsel = true; });
}

function lautstaerkeZiel(ctx) {
    if (!lautstaerkeKnoten || lautstaerkeKnoten.context !== ctx) {
        lautstaerkeKnoten = ctx.createGain();
        lautstaerkeKnoten.gain.value = lautstaerke;
        lautstaerkeKnoten.connect(ctx.destination);
    }
    return lautstaerkeKnoten;
}
function lautstaerkeSetzen(wert) {
    lautstaerke = Math.max(0, Math.min(1, Number(wert)));
    if (lautstaerkeKnoten) lautstaerkeKnoten.gain.value = lautstaerke;
}

/* Safari bleibt stumm, solange nicht in einer Geste ein (stiller) Puffer lief. */
function entsperreAudio(ctx) {
    if (!ctx || audioEntsperrt) return;
    try {
        const quelle = ctx.createBufferSource();
        quelle.buffer = ctx.createBuffer(1, 1, 22050);
        quelle.connect(ctx.destination);
        quelle.start(0);
        audioEntsperrt = true;
    } catch (e) { /* dann beim naechsten Versuch */ }
}

function baueAudioContextNeu(Ctor) {
    if (audioCtx) { try { audioCtx.close(); } catch (e) { /* schon zu */ } }
    audioCtx = new Ctor();
    audioCtxZeitmarke = 0; audioCtxWanduhr = 0; audioGeraeteWechsel = false;
    audioEntsperrt = false;
    entsperreAudio(audioCtx);
    return audioCtx;
}

/* Liefert einen laufenden AudioContext (als Promise), egal in welchem
   Zustand er vorher war. Muss aus einer Nutzergeste heraus aufgerufen
   werden. */
function audioBereit() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return Promise.reject(new Error('kein Web Audio'));
    if (!audioCtx || audioCtx.state === 'closed' || audioCtx.state === 'interrupted'
        || audioGeraeteWechsel || audioContextHaengt()) {
        baueAudioContextNeu(Ctor);
    }
    entsperreAudio(audioCtx);
    const ctx = audioCtx;
    const fertig = () => {
        audioCtxZeitmarke = ctx.currentTime;
        audioCtxWanduhr = Date.now();
        return ctx;
    };
    if (ctx.state === 'running') return Promise.resolve(fertig());
    return ctx.resume().then(fertig);
}

/* Waehrend das Metronom laeuft, regelmaessig die Marken nachziehen - sonst
   meldet audioContextHaengt() nach einer Pause faelschlich einen Haenger. */
function audioMarkeNachziehen() {
    if (!audioCtx) return;
    audioCtxZeitmarke = audioCtx.currentTime;
    audioCtxWanduhr = Date.now();
}

/* ---------- Klaenge ----------
   art: 'hoch' (betont), 'tief' (normaler Schlag), 'sub' (Unterteilung).
   Jeder Klang liefert die Quellknoten zurueck, damit ein Stopp schon
   geplante Toene einzeln abbrechen kann. */

const KLANG_TONHOEHE = {
    klick: { hoch: 1760, tief: 1046, sub: 1318 },
    holz:  { hoch: 1500, tief: 900,  sub: 1200 },
    piep:  { hoch: 880,  tief: 440,  sub: 660 }
};
const KLANG_PEGEL = { hoch: 1, tief: 0.8, sub: 0.35 };

function klickKlang(ctx, zeit, art) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = KLANG_TONHOEHE.klick[art];
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(0.45 * KLANG_PEGEL[art], zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
    o.connect(g); g.connect(lautstaerkeZiel(ctx));
    o.start(zeit); o.stop(zeit + 0.07);
    return [o];
}

/* Holzblock: gedaempftes Rauschen durch ein schmales Bandpass-Filter. */
function holzKlang(ctx, zeit, art) {
    const laenge = Math.floor(ctx.sampleRate * 0.05);
    const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) daten[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / laenge, 8);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = KLANG_TONHOEHE.holz[art]; filter.Q.value = 9;
    const g = ctx.createGain();
    g.gain.value = 2.2 * KLANG_PEGEL[art];
    quelle.connect(filter); filter.connect(g); g.connect(lautstaerkeZiel(ctx));
    quelle.start(zeit);
    return [quelle];
}

/* Piepton: weicher Sinus, etwas laenger - angenehm ueber Kopfhoerer. */
function piepKlang(ctx, zeit, art) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = KLANG_TONHOEHE.piep[art];
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(0.7 * KLANG_PEGEL[art], zeit + 0.004);
    g.gain.setValueAtTime(0.7 * KLANG_PEGEL[art], zeit + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.11);
    o.connect(g); g.connect(lautstaerkeZiel(ctx));
    o.start(zeit); o.stop(zeit + 0.13);
    return [o];
}

const KLAENGE = { klick: klickKlang, holz: holzKlang, piep: piepKlang };
function spieleKlang(ctx, zeit, art, klang) {
    return (KLAENGE[klang] || klickKlang)(ctx, zeit, art);
}
