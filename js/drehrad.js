/* ============================================================
   DREHRAD: Tempo durch Drehen am Ring.
   Pointer-Events statt Touch/Mouse getrennt (laeuft so auf iPad,
   Handy und Whiteboard gleich). Gezaehlt wird der Drehwinkel seit
   dem letzten Ereignis: GRAD_PRO_BPM Grad = 1 BPM. Das Strichmuster
   dreht sich mit dem Tempo mit, damit es sich wie ein echter Knopf
   anfuehlt. Der Bogen zeigt, wo im Bereich 20-260 das Tempo liegt.
   ============================================================ */

const GRAD_PRO_BPM = 6;           // 360 Grad = 60 BPM
const RAD_MITTE = 150;
const BOGEN_START = -135, BOGEN_ENDE = 135, BOGEN_RADIUS = 104;

function polar(winkelGrad, radius) {
    const w = (winkelGrad - 90) * Math.PI / 180;
    return [RAD_MITTE + radius * Math.cos(w), RAD_MITTE + radius * Math.sin(w)];
}
function bogenPfad(von, bis, radius) {
    const [x1, y1] = polar(von, radius), [x2, y2] = polar(bis, radius);
    const gross = (bis - von) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${gross} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function drehradEinrichten({ holeTempo, aendereTempo }) {
    const rad = document.getElementById('drehrad');
    const drehteil = document.getElementById('rad-drehteil');
    const striche = document.getElementById('rad-striche');
    const bereich = document.getElementById('rad-bereich');
    document.getElementById('rad-bereich-hinten').setAttribute('d', bogenPfad(BOGEN_START, BOGEN_ENDE, BOGEN_RADIUS));

    // 60 Striche auf dem Ring, jeder fuenfte laenger
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 60; i++) {
        const lang = i % 5 === 0;
        const [x1, y1] = polar(i * 6, lang ? 141 : 138);
        const [x2, y2] = polar(i * 6, lang ? 115 : 118);
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('class', lang ? 'rad-strich lang' : 'rad-strich');
        striche.appendChild(l);
    }

    function zeichnen() {
        const bpm = holeTempo();
        drehteil.setAttribute('transform', `rotate(${(bpm * GRAD_PRO_BPM) % 360} ${RAD_MITTE} ${RAD_MITTE})`);
        const anteil = (bpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
        const bis = BOGEN_START + anteil * (BOGEN_ENDE - BOGEN_START);
        bereich.setAttribute('d', anteil > 0.002 ? bogenPfad(BOGEN_START, bis, BOGEN_RADIUS) : '');
        rad.setAttribute('aria-valuenow', bpm);
    }

    function winkelVon(e) {
        const r = rad.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        return { winkel: Math.atan2(y, x) * 180 / Math.PI, abstand: Math.hypot(x, y) / (r.width / 2) };
    }

    let ziehen = null; // { id, letzter, rest }
    rad.addEventListener('pointerdown', e => {
        const { winkel, abstand } = winkelVon(e);
        // Nur der Ring dreht - die Mitte ist der Start/Stopp-Knopf.
        if (abstand < 0.62 || abstand > 1.08) return;
        e.preventDefault();
        rad.setPointerCapture(e.pointerId);
        rad.classList.add('dreht');
        ziehen = { id: e.pointerId, letzter: winkel, rest: 0 };
    });
    rad.addEventListener('pointermove', e => {
        if (!ziehen || e.pointerId !== ziehen.id) return;
        const { winkel } = winkelVon(e);
        let d = winkel - ziehen.letzter;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        ziehen.letzter = winkel;
        ziehen.rest += d;
        const schritte = Math.trunc(ziehen.rest / GRAD_PRO_BPM);
        if (schritte !== 0) {
            ziehen.rest -= schritte * GRAD_PRO_BPM;
            const vorher = holeTempo();
            aendereTempo(vorher + schritte);
            if (holeTempo() !== vorher && navigator.vibrate) navigator.vibrate(4);
        }
    });
    const loslassen = e => {
        if (!ziehen || e.pointerId !== ziehen.id) return;
        ziehen = null;
        rad.classList.remove('dreht');
    };
    rad.addEventListener('pointerup', loslassen);
    rad.addEventListener('pointercancel', loslassen);

    // Mausrad und Tastatur als Alternativen
    rad.addEventListener('wheel', e => {
        e.preventDefault();
        aendereTempo(holeTempo() + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
    }, { passive: false });
    rad.addEventListener('keydown', e => {
        const schritt = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (schritt) {
            e.preventDefault();
            e.stopPropagation();
            aendereTempo(holeTempo() + schritt * (e.shiftKey ? 5 : 1));
        }
    });

    zeichnen();
    return { zeichnen };
}
