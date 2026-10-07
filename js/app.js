/* ============================================================
   APP: Verdrahtung mit der Seite - Einstellungen, Anzeige,
   Tippen, Tastatur, Theme, Speichern in localStorage.
   ============================================================ */

const SPEICHER_SCHLUESSEL = 'metronom-einstellungen';
const $ = id => document.getElementById(id);

/* ---------- Speichern / Laden ---------- */
let uebungszeitMs = 0, blitzAn = true;

function speichern() {
    try {
        localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({
            bpm: metronom.bpm, zaehler: metronom.zaehler, nenner: metronom.nenner,
            betonung: metronom.betonung, unterteilung: metronom.unterteilung,
            klang: metronom.klang, lautstaerke, trainer: metronom.trainer,
            stille: metronom.stille, uebungszeitMs, blitzAn
        }));
    } catch (e) { /* privater Modus o.ae. - dann eben ohne Speichern */ }
}

function laden() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') return;
    if (Number.isFinite(d.bpm)) metronom.bpm = tempoBegrenzen(d.bpm);
    if (Number.isInteger(d.zaehler) && d.zaehler >= 1 && d.zaehler <= 12) metronom.zaehler = d.zaehler;
    if ([2, 4, 8].includes(d.nenner)) metronom.nenner = d.nenner;
    if (Array.isArray(d.betonung) && d.betonung.length === metronom.zaehler
        && d.betonung.every(b => ['hoch', 'tief', 'aus'].includes(b))) metronom.betonung = d.betonung;
    else metronom.betonung = standardBetonung(metronom.zaehler, metronom.nenner);
    if ([1, 2, 3, 4].includes(d.unterteilung)) metronom.unterteilung = d.unterteilung;
    if (KLAENGE[d.klang]) metronom.klang = d.klang;
    if (Number.isFinite(d.lautstaerke)) lautstaerkeSetzen(d.lautstaerke);
    if (d.trainer && typeof d.trainer === 'object') Object.assign(metronom.trainer, d.trainer);
    if (d.stille && typeof d.stille === 'object') Object.assign(metronom.stille, d.stille);
    if (Number.isFinite(d.uebungszeitMs)) uebungszeitMs = d.uebungszeitMs;
    if (typeof d.blitzAn === 'boolean') blitzAn = d.blitzAn;
}

/* ---------- Toast ---------- */
let toastTimer = 0;
function zeigeToast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------- Tempo ---------- */
let drehrad = null;

function tempoAnzeigen() {
    const bpm = metronom.bpm;
    $('rad-bpm').textContent = bpm;
    const { name, deutsch } = tempoName(bpm);
    $('rad-name').textContent = name;
    $('rad-deutsch').textContent = deutsch;
    $('rad-notenwert').textContent = { 2: '𝅗𝅥 =', 4: '♩ =', 8: '♪ =' }[metronom.nenner];
    if (drehrad) drehrad.zeichnen();
}

let speicherTimer = 0;
function tempoSetzen(bpm) {
    metronom.bpm = tempoBegrenzen(bpm);
    tempoAnzeigen();
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(speichern, 300);
}

/* ---------- Schläge (Betonung) ---------- */
const BETONUNG_FOLGE = { hoch: 'tief', tief: 'aus', aus: 'hoch' };
const BETONUNG_TEXT = { hoch: 'hoch', tief: 'tief', aus: 'aus' };

function schlaegeZeichnen() {
    const box = $('schlaege');
    box.innerHTML = '';
    box.style.setProperty('--anzahl', metronom.zaehler);
    metronom.betonung.forEach((b, i) => {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = `schlag ist-${b}`;
        k.dataset.index = i;
        k.setAttribute('aria-label', `Schlag ${i + 1}: ${BETONUNG_TEXT[b]}`);
        k.innerHTML = `<span class="schlag-balken"></span><span class="schlag-zahl">${i + 1}</span><span class="schlag-art">${BETONUNG_TEXT[b]}</span>`;
        box.appendChild(k);
    });
    zaehlhilfeZeichnen();
}

$('schlaege').addEventListener('click', e => {
    const k = e.target.closest('.schlag');
    if (!k) return;
    const i = Number(k.dataset.index);
    metronom.betonung[i] = BETONUNG_FOLGE[metronom.betonung[i]];
    schlaegeZeichnen();
    speichern();
    // Kurz vorhören, wie der Schlag jetzt klingt
    if (!metronom.laeuft && metronom.betonung[i] !== 'aus') {
        audioBereit().then(ctx => spieleKlang(ctx, ctx.currentTime + 0.01, metronom.betonung[i], metronom.klang)).catch(() => {});
    }
});

/* ---------- Zählhilfe ---------- */
const ZWISCHEN_SILBEN = { 1: [], 2: ['+'], 3: ['ta', 'te'], 4: ['e', '+', 'e'] };
const UNTERTEILUNG_TEXT = {
    1: 'Nur die Grundschläge.',
    2: 'Achtel: „1 + 2 +“ – zwei Klicks pro Schlag.',
    3: 'Triolen: „1 ta te“ – drei Klicks pro Schlag.',
    4: 'Sechzehntel: „1 e + e“ – vier Klicks pro Schlag.'
};

function zaehlhilfeZeichnen() {
    const box = $('zaehlhilfe');
    box.innerHTML = '';
    for (let s = 0; s < metronom.zaehler; s++) {
        const gruppe = document.createElement('span');
        gruppe.className = 'silben-gruppe';
        [String(s + 1), ...ZWISCHEN_SILBEN[metronom.unterteilung]].forEach((silbe, sub) => {
            const el = document.createElement('span');
            el.className = sub === 0 ? 'silbe haupt' : 'silbe';
            el.dataset.pos = `${s}-${sub}`;
            el.textContent = silbe;
            gruppe.appendChild(el);
        });
        box.appendChild(gruppe);
    }
}

/* ---------- Anzeige im Takt ---------- */
let letzteSilbe = null;
metronom.beiSchlag = ({ schlag, sub, still, art }) => {
    if (letzteSilbe) letzteSilbe.classList.remove('aktiv');
    letzteSilbe = $('zaehlhilfe').querySelector(`[data-pos="${schlag}-${sub}"]`);
    if (letzteSilbe) letzteSilbe.classList.add('aktiv');

    $('still-hinweis').classList.toggle('hidden', !still);
    document.body.classList.toggle('stiller-takt', still);

    if (sub !== 0) return;
    document.querySelectorAll('.schlag.aktiv').forEach(el => el.classList.remove('aktiv'));
    const k = $('schlaege').children[schlag];
    if (k) k.classList.add('aktiv');

    const mitte = $('rad-mitte');
    mitte.classList.remove('puls', 'puls-hoch');
    void mitte.offsetWidth; // Animation neu starten
    if (art) mitte.classList.add(art === 'hoch' ? 'puls-hoch' : 'puls');

    if (blitzAn && art && !still) {
        const b = $('blitz');
        b.className = 'blitz';
        void b.offsetWidth;
        b.classList.add(art === 'hoch' ? 'an-hoch' : 'an');
    }
};

metronom.beiTempoAenderung = bpm => {
    tempoAnzeigen();
    if (bpm === tempoBegrenzen(metronom.trainer.ziel)) zeigeToast(`🎯 Ziel erreicht: ${bpm} BPM`);
};

metronom.beiStopp = () => {
    document.querySelectorAll('.schlag.aktiv, .silbe.aktiv').forEach(el => el.classList.remove('aktiv'));
    letzteSilbe = null;
    $('still-hinweis').classList.add('hidden');
    document.body.classList.remove('stiller-takt');
};

/* ---------- Start / Stopp ---------- */
let wachHalten = null, uebungStart = 0, uebungTimer = 0;

function wachHaltenAn() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(w => { wachHalten = w; }).catch(() => {});
}
function wachHaltenAus() {
    if (wachHalten) { wachHalten.release().catch(() => {}); wachHalten = null; }
}
document.addEventListener('visibilitychange', () => {
    if (metronom.laeuft && document.visibilityState === 'visible') wachHaltenAn();
});

function uebungszeitAnzeigen() {
    const ms = uebungszeitMs + (uebungStart ? Date.now() - uebungStart : 0);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sek = s % 60;
    $('uebungszeit').textContent = h
        ? `${h}:${String(m).padStart(2, '0')}:${String(sek).padStart(2, '0')}`
        : `${m}:${String(sek).padStart(2, '0')}`;
}

function laufZustandAnzeigen() {
    const an = metronom.laeuft;
    $('start-knopf').textContent = an ? '■ Stopp' : '▶ Start';
    $('start-knopf').classList.toggle('laeuft', an);
    $('rad-mitte').classList.toggle('laeuft', an);
}

function umschalten() {
    if (metronom.laeuft) {
        metronomStoppen();
        if (uebungStart) { uebungszeitMs += Date.now() - uebungStart; uebungStart = 0; }
        clearInterval(uebungTimer);
        uebungszeitAnzeigen();
        wachHaltenAus();
        speichern();
        laufZustandAnzeigen();
        return;
    }
    metronomStarten().then(() => {
        uebungStart = Date.now();
        clearInterval(uebungTimer);
        uebungTimer = setInterval(uebungszeitAnzeigen, 1000);
        wachHaltenAn();
        laufZustandAnzeigen();
    }).catch(() => zeigeToast('Kein Ton möglich – tippe noch einmal auf Start.'));
}

$('start-knopf').addEventListener('click', umschalten);
$('rad-mitte').addEventListener('click', umschalten);
$('uebungszeit-reset').addEventListener('click', () => {
    uebungszeitMs = 0;
    if (uebungStart) uebungStart = Date.now();
    uebungszeitAnzeigen();
    speichern();
});

document.querySelectorAll('[data-tempo-schritt]').forEach(k =>
    k.addEventListener('click', () => tempoSetzen(metronom.bpm + Number(k.dataset.tempoSchritt))));

/* ---------- Tempo tippen ---------- */
let tippZeiten = [];
function tippen() {
    const jetzt = performance.now();
    if (tippZeiten.length && jetzt - tippZeiten[tippZeiten.length - 1] > 2000) tippZeiten = [];
    tippZeiten.push(jetzt);
    if (tippZeiten.length > 8) tippZeiten.shift();

    const feld = $('tipp-feld');
    feld.classList.remove('tippt');
    void feld.offsetWidth;
    feld.classList.add('tippt');

    if (tippZeiten.length < 2) {
        $('tipp-info').textContent = 'weiter tippen …';
        return;
    }
    const abstand = (tippZeiten[tippZeiten.length - 1] - tippZeiten[0]) / (tippZeiten.length - 1);
    tempoSetzen(60000 / abstand);
    $('tipp-info').textContent = `${tippZeiten.length}× getippt → ${metronom.bpm} BPM`;
}
// pointerdown statt click: reagiert sofort beim Aufsetzen des Fingers,
// ein click kommt erst beim Loslassen und wuerde das Tempo verfaelschen.
$('tipp-feld').addEventListener('pointerdown', e => { e.preventDefault(); tippen(); });
$('tipp-feld').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); tippen(); }
});

/* ---------- Taktart ---------- */
function taktartSetzen(zaehler, nenner) {
    metronom.zaehler = Math.max(1, Math.min(12, zaehler));
    metronom.nenner = nenner;
    metronom.betonung = standardBetonung(metronom.zaehler, metronom.nenner);
    taktartAnzeigen();
    schlaegeZeichnen();
    tempoAnzeigen();
    speichern();
}
function taktartAnzeigen() {
    $('zaehler-anzeige').textContent = metronom.zaehler;
    $('nenner-wahl').value = String(metronom.nenner);
    const text = `${metronom.zaehler}/${metronom.nenner}`;
    document.querySelectorAll('#taktart-vorlagen .chip').forEach(c =>
        c.classList.toggle('gewaehlt', c.dataset.takt === text));
}
$('taktart-vorlagen').addEventListener('click', e => {
    const c = e.target.closest('[data-takt]');
    if (!c) return;
    const [z, n] = c.dataset.takt.split('/').map(Number);
    taktartSetzen(z, n);
});
$('zaehler-minus').addEventListener('click', () => taktartSetzen(metronom.zaehler - 1, metronom.nenner));
$('zaehler-plus').addEventListener('click', () => taktartSetzen(metronom.zaehler + 1, metronom.nenner));
$('nenner-wahl').addEventListener('change', e => taktartSetzen(metronom.zaehler, Number(e.target.value)));
$('betonung-zuruecksetzen').addEventListener('click', () => taktartSetzen(metronom.zaehler, metronom.nenner));

/* ---------- Unterteilung, Klang, Lautstärke ---------- */
function auswahlAnzeigen() {
    document.querySelectorAll('#unterteilung-wahl .chip').forEach(c =>
        c.classList.toggle('gewaehlt', Number(c.dataset.unterteilung) === metronom.unterteilung));
    $('unterteilung-text').textContent = UNTERTEILUNG_TEXT[metronom.unterteilung];
    document.querySelectorAll('#klang-wahl .chip').forEach(c =>
        c.classList.toggle('gewaehlt', c.dataset.klang === metronom.klang));
}
$('unterteilung-wahl').addEventListener('click', e => {
    const c = e.target.closest('[data-unterteilung]');
    if (!c) return;
    metronom.unterteilung = Number(c.dataset.unterteilung);
    auswahlAnzeigen();
    zaehlhilfeZeichnen();
    speichern();
});
$('klang-wahl').addEventListener('click', e => {
    const c = e.target.closest('[data-klang]');
    if (!c) return;
    metronom.klang = c.dataset.klang;
    auswahlAnzeigen();
    speichern();
    if (!metronom.laeuft) {
        audioBereit().then(ctx => spieleKlang(ctx, ctx.currentTime + 0.01, 'hoch', metronom.klang)).catch(() => {});
    }
});
$('lautstaerke').addEventListener('input', e => { lautstaerkeSetzen(e.target.value); });
$('lautstaerke').addEventListener('change', speichern);
$('blitz-an').addEventListener('change', e => { blitzAn = e.target.checked; speichern(); });

/* ---------- Tempo-Trainer & stille Takte ---------- */
function zahlAus(id, min, max, vorgabe) {
    const n = parseInt($(id).value, 10);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : vorgabe;
}
function trainerUebernehmen() {
    const t = metronom.trainer;
    t.an = $('trainer-an').checked;
    t.alleTakte = zahlAus('trainer-takte', 1, 32, 4);
    t.schritt = zahlAus('trainer-schritt', 1, 30, 5);
    t.ziel = zahlAus('trainer-ziel', TEMPO_MIN, TEMPO_MAX, 140);
    const s = metronom.stille;
    s.an = $('stille-an').checked;
    s.hoeren = zahlAus('stille-hoeren', 1, 16, 2);
    s.still = zahlAus('stille-still', 1, 16, 2);
    speichern();
}
['trainer-an', 'trainer-takte', 'trainer-schritt', 'trainer-ziel', 'stille-an', 'stille-hoeren', 'stille-still']
    .forEach(id => $(id).addEventListener('change', trainerUebernehmen));

function formularFuellen() {
    const t = metronom.trainer, s = metronom.stille;
    $('trainer-an').checked = !!t.an;
    $('trainer-takte').value = t.alleTakte;
    $('trainer-schritt').value = t.schritt;
    $('trainer-ziel').value = t.ziel;
    $('stille-an').checked = !!s.an;
    $('stille-hoeren').value = s.hoeren;
    $('stille-still').value = s.still;
    $('lautstaerke').value = lautstaerke;
    $('blitz-an').checked = blitzAn;
    if (t.an) $('trainer-karte').open = true;
    if (s.an) $('stille-karte').open = true;
}

/* ---------- Tastatur ---------- */
document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
        // Leertaste auf einem fokussierten Knopf wuerde ihn zusaetzlich ausloesen
        e.preventDefault();
        umschalten();
    } else if (e.key === 't' || e.key === 'T') {
        tippen();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        tempoSetzen(metronom.bpm + (e.shiftKey ? 5 : 1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        tempoSetzen(metronom.bpm - (e.shiftKey ? 5 : 1));
    }
});

/* ---------- Theme & Hilfe ---------- */
function themeSetzen(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f8fafc' : '#0b1120';
}
(() => {
    let gespeichert = null;
    try { gespeichert = localStorage.getItem('metronom-theme'); } catch (e) { /* egal */ }
    const hell = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    themeSetzen(gespeichert || (hell ? 'light' : 'dark'));
})();
$('theme-knopf').addEventListener('click', () => {
    const neu = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    themeSetzen(neu);
    try { localStorage.setItem('metronom-theme', neu); } catch (e) { /* egal */ }
});
$('hilfe-knopf').addEventListener('click', () => $('hilfe').showModal());

/* ---------- Start ---------- */
laden();
drehrad = drehradEinrichten({ holeTempo: () => metronom.bpm, aendereTempo: tempoSetzen });
taktartAnzeigen();
schlaegeZeichnen();
auswahlAnzeigen();
formularFuellen();
tempoAnzeigen();
uebungszeitAnzeigen();
laufZustandAnzeigen();
