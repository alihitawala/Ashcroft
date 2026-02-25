/**
 * Sports Hub — Sound Effects (Web Audio API Synthesis)
 * No external audio files needed — all sounds generated programmatically.
 * 
 * Usage:
 *   <script src="js/sports-sounds.js"></script>
 *   sportsSounds.play('goal');
 *   sportsSounds.toggle(); // returns new state (true/false)
 * 
 * Sound Toggle UI Note:
 *   Add a button in the top-right of the sports page:
 *     <button id="sound-toggle" onclick="this.textContent = sportsSounds.toggle() ? '🔊' : '🔇'">🔊</button>
 *   Style: position:fixed or absolute, top-right, z-index high, 
 *   semi-transparent bg, border-radius 50%, ~36px square.
 *   Preference persists via localStorage key 'sports-sound'.
 */

class SportsSounds {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('sports-sound') !== 'false';
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (autoplay policy)
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    play(type) {
        if (!this.enabled) return;
        this.init();
        const fn = {
            goal: 'playGoalHorn',
            wicket: 'playWicket',
            tennis: 'playTennisHit',
            f1: 'playEngineRev',
            click: 'playClick',
            countdown: 'playTick',
            whistle: 'playWhistle',
            update: 'playUpdate'
        }[type];
        if (fn) this[fn]();
    }

    // ─── Goal Horn: exciting rising buzz with harmonics ───
    playGoalHorn() {
        const t = this.ctx.currentTime;
        const dur = 1.5;

        // Main horn — sawtooth for rich buzzy tone
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(200, t);
        osc1.frequency.exponentialRampToValueAtTime(500, t + 0.6);
        osc1.frequency.setValueAtTime(500, t + 0.6);
        osc1.frequency.exponentialRampToValueAtTime(600, t + dur);

        // Second harmonic for thickness
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(400, t);
        osc2.frequency.exponentialRampToValueAtTime(1000, t + 0.6);
        osc2.frequency.setValueAtTime(1000, t + 0.6);
        osc2.frequency.exponentialRampToValueAtTime(1200, t + dur);

        // Sub bass rumble
        const osc3 = this.ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(100, t);
        osc3.frequency.exponentialRampToValueAtTime(150, t + dur);

        // Gain envelope — swell in, sustain, fade
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 0.15);
        gain.gain.setValueAtTime(0.35, t + 0.8);
        gain.gain.linearRampToValueAtTime(0, t + dur);

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(0.15, t + 0.15);
        gain2.gain.linearRampToValueAtTime(0, t + dur);

        const gain3 = this.ctx.createGain();
        gain3.gain.setValueAtTime(0, t);
        gain3.gain.linearRampToValueAtTime(0.2, t + 0.1);
        gain3.gain.linearRampToValueAtTime(0, t + dur);

        // Slight distortion for grit
        const dist = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
        }
        dist.curve = curve;

        osc1.connect(gain).connect(dist).connect(this.ctx.destination);
        osc2.connect(gain2).connect(dist);
        osc3.connect(gain3).connect(this.ctx.destination);

        [osc1, osc2, osc3].forEach(o => { o.start(t); o.stop(t + dur); });
    }

    // ─── Wicket: sharp crack (filtered noise burst) ───
    playWicket() {
        const t = this.ctx.currentTime;
        const dur = 0.15;
        const sr = this.ctx.sampleRate;
        const len = sr * dur;

        // White noise buffer
        const buf = this.ctx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        // Bandpass for woody crack
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500;
        bp.Q.value = 2;

        // High shelf for snap
        const hi = this.ctx.createBiquadFilter();
        hi.type = 'highshelf';
        hi.frequency.value = 4000;
        hi.gain.value = 6;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        src.connect(bp).connect(hi).connect(gain).connect(this.ctx.destination);
        src.start(t);
    }

    // ─── Tennis Hit: short thwack (noise + tone) ───
    playTennisHit() {
        const t = this.ctx.currentTime;
        const dur = 0.1;
        const sr = this.ctx.sampleRate;
        const len = sr * dur;

        // Noise burst
        const buf = this.ctx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3000;
        bp.Q.value = 1.5;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = 0.4;

        // Tone ping
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + dur);

        const toneGain = this.ctx.createGain();
        toneGain.gain.setValueAtTime(0.25, t);
        toneGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        src.connect(bp).connect(noiseGain).connect(this.ctx.destination);
        osc.connect(toneGain).connect(this.ctx.destination);

        src.start(t);
        osc.start(t);
        osc.stop(t + dur);
    }

    // ─── F1 Engine Rev: powerful frequency-sweeping sawtooth ───
    playEngineRev() {
        const t = this.ctx.currentTime;
        const dur = 0.8;

        // Primary engine — sawtooth
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(100, t);
        osc1.frequency.exponentialRampToValueAtTime(800, t + 0.3);
        osc1.frequency.exponentialRampToValueAtTime(2000, t + 0.6);
        osc1.frequency.exponentialRampToValueAtTime(1500, t + dur);

        // Second engine harmonic
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(150, t);
        osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
        osc2.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
        osc2.frequency.exponentialRampToValueAtTime(2200, t + dur);

        // Lowpass to tame harshness
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
        lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
        lp.Q.value = 2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
        gain.gain.setValueAtTime(0.3, t + 0.6);
        gain.gain.linearRampToValueAtTime(0, t + dur);

        const gain2 = this.ctx.createGain();
        gain2.gain.value = 0.1;

        osc1.connect(lp).connect(gain).connect(this.ctx.destination);
        osc2.connect(gain2).connect(lp);

        osc1.start(t); osc1.stop(t + dur);
        osc2.start(t); osc2.stop(t + dur);
    }

    // ─── UI Click: clean short sine pip ───
    playClick() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
    }

    // ─── Countdown Tick: short sharp tick ───
    playTick() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.03);
    }

    // ─── Whistle: referee whistle (bonus) ───
    playWhistle() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2800, t);
        osc.frequency.setValueAtTime(3200, t + 0.15);
        osc.frequency.setValueAtTime(2800, t + 0.3);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        gain.gain.setValueAtTime(0.2, t + 0.35);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);

        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
    }

    // ─── Update notification: gentle two-tone chime ───
    playUpdate() {
        const t = this.ctx.currentTime;
        [0, 0.12].forEach((offset, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = i === 0 ? 600 : 900;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.15, t + offset);
            g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);
            osc.connect(g).connect(this.ctx.destination);
            osc.start(t + offset);
            osc.stop(t + offset + 0.15);
        });
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('sports-sound', this.enabled);
        return this.enabled;
    }
}

window.sportsSounds = new SportsSounds();
