
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, t) => {
    const x = clamp((t - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };
  const now = () => performance.now();

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return (h >>> 0);
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ t >>> 15, 1 | t);
      x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function randRange(rng, min, max) {
    return min + (max - min) * rng();
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function hsla(h, s, l, a = 1) {
    return `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a})`;
  }

  function makePalette(rng) {
    const palettes = [
      { sky: [206, 70, 95], neb: [268, 70, 75], accent: [42, 90, 82], ring: [192, 72, 82], glow: [60, 95, 92] },
      { sky: [222, 58, 96], neb: [318, 52, 80], accent: [34, 92, 84], ring: [188, 68, 88], glow: [80, 88, 94] },
      { sky: [198, 60, 94], neb: [292, 58, 81], accent: [52, 88, 85], ring: [210, 64, 85], glow: [58, 94, 90] },
      { sky: [214, 66, 97], neb: [260, 60, 80], accent: [24, 88, 82], ring: [178, 70, 86], glow: [48, 96, 94] },
    ];
    const base = palettes[Math.floor(rng() * palettes.length)];
    const alt = palettes[Math.floor(rng() * palettes.length)];
    const mix = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
    return {
      sky: mix(base.sky, alt.sky, rng() * 0.35),
      neb: mix(base.neb, alt.neb, rng() * 0.35),
      accent: mix(base.accent, alt.accent, rng() * 0.25),
      ring: mix(base.ring, alt.ring, rng() * 0.25),
      glow: mix(base.glow, alt.glow, rng() * 0.35),
      dust: [220, 25, 98]
    };
  }

  function makeSeed() {
    const options = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += options[Math.floor(Math.random() * options.length)];
    return s;
  }


  function roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function makeNoise(seed) {
    const rng = mulberry32(seed);
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad = (hash, x, y) => {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp2 = (a, b, t) => a + (b - a) * t;
    const noise2D = (x, y) => {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x);
      const v = fade(y);
      const aa = perm[X + perm[Y]];
      const ab = perm[X + perm[Y + 1]];
      const ba = perm[X + 1 + perm[Y]];
      const bb = perm[X + 1 + perm[Y + 1]];
      return lerp2(
        lerp2(grad(aa, x, y), grad(ba, x - 1, y), u),
        lerp2(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
        v
      );
    };
    return { noise2D };
  }

  class Storage {
    constructor() {
      this.db = null;
      this.ready = this._open();
    }
    _open() {
      return new Promise((resolve) => {
        if (!('indexedDB' in window)) return resolve(null);
        const req = indexedDB.open('tiny-universe', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => resolve(null);
      });
    }
    async get(key) {
      await this.ready;
      if (!this.db) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      return new Promise((resolve) => {
        const tx = this.db.transaction('state', 'readonly');
        const store = tx.objectStore('state');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    }
    async set(key, value) {
      await this.ready;
      if (!this.db) {
        localStorage.setItem(key, JSON.stringify(value));
        return;
      }
      return new Promise((resolve) => {
        const tx = this.db.transaction('state', 'readwrite');
        tx.objectStore('state').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    async remove(key) {
      await this.ready;
      if (!this.db) {
        localStorage.removeItem(key);
        return;
      }
      return new Promise((resolve) => {
        const tx = this.db.transaction('state', 'readwrite');
        tx.objectStore('state').delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseSource = null;
      this.noiseGain = null;
      this.windGain = null;
      this.radioGain = null;
      this.bedGain = null;
      this.started = false;
      this.volume = 0.28;
      this.drift = 0;
    }

    async start() {
      if (this.started) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      const bed = this.ctx.createOscillator();
      bed.type = 'sine';
      bed.frequency.value = 55;
      const bedFilter = this.ctx.createBiquadFilter();
      bedFilter.type = 'lowpass';
      bedFilter.frequency.value = 180;
      this.bedGain = this.ctx.createGain();
      this.bedGain.gain.value = 0.08;
      bed.connect(bedFilter);
      bedFilter.connect(this.bedGain);
      this.bedGain.connect(this.master);
      bed.start();

      const pulse = this.ctx.createOscillator();
      pulse.type = 'triangle';
      pulse.frequency.value = 110;
      const pulseFilter = this.ctx.createBiquadFilter();
      pulseFilter.type = 'bandpass';
      pulseFilter.frequency.value = 260;
      pulseFilter.Q.value = 0.7;
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = 0.02;
      pulse.connect(pulseFilter);
      pulseFilter.connect(this.radioGain);
      this.radioGain.connect(this.master);
      pulse.start();

      const bufferSize = 2 * this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 380;
      const lowFilter = this.ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 1700;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0.015;
      noise.connect(noiseFilter);
      noiseFilter.connect(lowFilter);
      lowFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.master);
      noise.start();

      const wind = this.ctx.createOscillator();
      wind.type = 'sine';
      wind.frequency.value = 0.11;
      const windLFO = this.ctx.createOscillator();
      windLFO.type = 'sine';
      windLFO.frequency.value = 0.03;
      const windGainNode = this.ctx.createGain();
      windGainNode.gain.value = 120;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 900;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.03;
      windLFO.connect(windGainNode);
      windGainNode.connect(wind.frequency);
      wind.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      wind.start();
      windLFO.start();

      this.bedOsc = bed;
      this.pulseOsc = pulse;
      this.windOsc = wind;
      this.windLFO = windLFO;
      this.started = true;
    }

    setVolume(v) {
      this.volume = clamp(v, 0, 1);
      if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }

    setActivity(speed) {
      if (!this.started) return;
      const t = this.ctx.currentTime;
      const s = clamp(speed, 0.2, 4);
      if (this.bedOsc) this.bedOsc.frequency.setTargetAtTime(48 + s * 4, t, 0.05);
      if (this.pulseOsc) this.pulseOsc.frequency.setTargetAtTime(98 + s * 12, t, 0.05);
      if (this.bedGain) this.bedGain.gain.setTargetAtTime(0.06 + s * 0.02, t, 0.12);
      if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(0.013 + s * 0.006, t, 0.12);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0.022 + s * 0.015, t, 0.12);
    }

    pulse(strength = 1) {
      if (!this.started) return;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 160 + Math.random() * 80;
      o.connect(g);
      g.connect(this.master);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04 * strength, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.start(t);
      o.stop(t + 0.75);
    }

    stop() {
      if (this.ctx) this.ctx.close().catch(() => {});
      this.started = false;
    }
  }

  class Chronicle {
    constructor(el) {
      this.el = el;
      this.timer = null;
      this.hideTimer = null;
      this.current = '';
    }
    show(text, duration = 5200) {
      if (!text) return;
      this.current = text;
      this.el.textContent = text;
      this.el.classList.add('show');
      clearTimeout(this.timer);
      clearTimeout(this.hideTimer);
      this.timer = setTimeout(() => {
        this.el.classList.remove('show');
      }, duration);
      this.hideTimer = setTimeout(() => {
        if (this.el.textContent === text) this.el.classList.remove('show');
      }, duration + 650);
    }
  }

  class Planet {
    constructor(index, rng, noise, palette, starRadius, systemScale) {
      this.index = index;
      this.rng = rng;
      this.noise = noise;
      this.name = Planet.makeName(rng);
      this.radius = randRange(rng, 26, 84) * (index > 3 ? 0.92 : 1);
      this.orbit = starRadius * 2.7 + index * randRange(rng, 84, 124) * systemScale;
      this.phase = rng() * TAU;
      this.speed = randRange(rng, 0.035, 0.16) / Math.pow(index + 1, 0.26);
      this.tilt = randRange(rng, -0.35, 0.35);
      this.ecc = randRange(rng, 0.02, 0.14);
      this.spin = randRange(rng, -0.02, 0.02);
      this.clouds = randRange(rng, 0.22, 0.75);
      this.detail = randRange(rng, 0.45, 0.95);
      this.lights = randRange(rng, 0.2, 0.92);
      this.rings = rng() > 0.68;
      this.ringTilt = randRange(rng, -0.5, 0.5);
      this.moons = rng() > 0.6 ? Math.floor(randRange(rng, 1, 3)) : 0;
      this.atmosphere = randRange(rng, 0.35, 0.88);
      this.palette = this.makeSurfacePalette(palette, rng);
      this.texture = this.buildTexture();
      this.moonData = Array.from({ length: this.moons }, (_, i) => ({
        radius: randRange(rng, 5, 11),
        dist: this.radius * randRange(rng, 1.5, 2.2) + i * randRange(rng, 8, 16),
        phase: rng() * TAU,
        speed: randRange(rng, 0.6, 1.4) / (i + 1)
      }));
      this.artifact = rng() > 0.68;
      this.artifactPhase = rng() * TAU;
      this.artifactKind = this.artifact ? pick(rng, ['relay', 'obelisk', 'ring', 'shard']) : null;
    }

    static makeName(rng) {
      const syllables = ['al', 've', 'ri', 'xo', 'na', 'th', 'or', 'iu', 'en', 'sa', 'lu', 'mi', 'ra', 'ty', 'ul', 'ae', 'no', 'qu', 'or', 'is'];
      const count = Math.floor(randRange(rng, 2, 4));
      let s = '';
      for (let i = 0; i < count; i++) s += pick(rng, syllables);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    makeSurfacePalette(base, rng) {
      const shift = randRange(rng, -22, 24);
      return {
        land1: [base.neb[0] + shift, base.neb[1] + randRange(rng, -6, 8), base.neb[2] + randRange(rng, -8, 4)],
        land2: [base.accent[0] + shift, base.accent[1] + randRange(rng, -12, 12), base.accent[2] + randRange(rng, -8, 8)],
        sea: [base.sky[0] + randRange(rng, -12, 10), base.sky[1] + randRange(rng, -10, 10), base.sky[2] + randRange(rng, -8, 8)],
        glow: [base.glow[0] + randRange(rng, -10, 12), base.glow[1] + randRange(rng, -10, 8), base.glow[2] + randRange(rng, -6, 8)],
      };
    }

    buildTexture() {
      const size = 512;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const { land1, land2, sea, glow } = this.palette;

      const grad = g.createRadialGradient(size * 0.35, size * 0.25, 30, size * 0.48, size * 0.48, size * 0.55);
      grad.addColorStop(0, `rgba(${sea[0]},${sea[1]},${sea[2]},1)`);
      grad.addColorStop(0.55, `rgba(${land1[0]},${land1[1]},${land1[2]},1)`);
      grad.addColorStop(1, `rgba(${land2[0]},${land2[1]},${land2[2]},1)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);

      const n = this.noise.noise2D;
      g.globalAlpha = 0.9;
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const nx = x / size * 5.5;
          const ny = y / size * 5.5;
          const v = (n(nx + this.index * 3.2, ny + this.index * 1.7) * 0.5 + 0.5);
          if (v > 0.14) {
            const landMix = smoothstep(0.18, 0.78, v);
            const a = 0.2 + landMix * 0.65;
            const r = lerp(sea[0], land2[0], landMix);
            const gg = lerp(sea[1], land2[1], landMix);
            const b = lerp(sea[2], land2[2], landMix);
            g.fillStyle = `rgba(${r|0},${gg|0},${b|0},${a})`;
            g.fillRect(x, y, 4, 4);
          }
        }
      }

      // continents
      g.globalCompositeOperation = 'screen';
      for (let i = 0; i < 18; i++) {
        const x = (0.2 + i * 0.041 + this.rng() * 0.08) * size;
        const y = (0.2 + (n(i * 1.3, i * 0.7) * 0.5 + 0.5) * 0.55) * size;
        const rx = randRange(this.rng, 50, 120);
        const ry = randRange(this.rng, 35, 100);
        const hue = randRange(this.rng, -10, 16);
        const cgrad = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
        cgrad.addColorStop(0, `rgba(${glow[0]+hue},${glow[1]},${glow[2]},0.35)`);
        cgrad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cgrad;
        g.beginPath();
        g.ellipse(x, y, rx, ry, this.rng() * TAU, 0, TAU);
        g.fill();
      }

      // clouds
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 0.55;
      g.filter = 'blur(8px)';
      for (let i = 0; i < 36; i++) {
        const x = this.rng() * size;
        const y = this.rng() * size;
        const r = randRange(this.rng, 24, 72);
        const alpha = randRange(this.rng, 0.05, 0.13) * this.clouds;
        g.fillStyle = `rgba(255,255,255,${alpha})`;
        g.beginPath();
        g.ellipse(x, y, r * 1.5, r, this.rng() * TAU, 0, TAU);
        g.fill();
      }
      g.filter = 'none';
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      // luminous city side
      g.globalCompositeOperation = 'screen';
      for (let i = 0; i < 260; i++) {
        const x = this.rng() * size;
        const y = this.rng() * size;
        const v = n(x / 70, y / 70);
        if (v > 0.45) {
          g.fillStyle = `rgba(255,255,255,${(v - 0.42) * 0.12 * this.lights})`;
          g.fillRect(x, y, 2, 2);
        }
      }
      g.globalCompositeOperation = 'source-over';

      return c;
    }

    positionAt(time, scale = 1) {
      const angle = this.phase + time * this.speed * scale;
      const ecc = 1 + Math.sin(angle * 2 + this.index) * this.ecc * 0.4;
      const x = Math.cos(angle) * this.orbit * ecc;
      const y = Math.sin(angle * 0.72 + this.tilt) * this.orbit * 0.34;
      const z = Math.sin(angle + this.index * 2.11);
      return { x, y, z, angle };
    }
  }

  class Universe {
    constructor(seed) {
      this.seed = seed || makeSeed();
      this.seedInt = hashString(this.seed);
      this.rng = mulberry32(this.seedInt);
      this.noise = makeNoise(this.seedInt ^ 0xBADDCAFE);
      this.palette = makePalette(this.rng);
      this.createdAt = Date.now();
      this.age = 0;
      this.timeScale = 1;
      this.timeScaleTarget = 1;
      this.activity = 0.22;
      this.camera = { x: 0, y: 0 };
      this.cameraTarget = { x: 0, y: 0 };
      this.simTime = this.rng() * 1000;
      this.star = {
        radius: randRange(this.rng, 60, 92),
        hue: this.palette.glow[0],
        glow: this.palette.glow,
        pulse: randRange(this.rng, 0.2, 0.7),
        flicker: randRange(this.rng, 0.02, 0.06),
        name: Universe.makeName(this.rng, true),
        type: pick(this.rng, ['Aurum', 'Cendre', 'Lumen', 'Helio', 'Eosphor', 'Serein'])
      };
      this.systemName = `${Universe.makeName(this.rng, false)} ${pick(this.rng, ['I', 'II', 'III', 'IV', 'V', 'VI'])}`;
      this.planets = this.makePlanets();
      this.events = [];
      this.nextEventAt = 4 + randRange(this.rng, 3, 12);
      this.nextChronicleAt = 6 + randRange(this.rng, 7, 18);
      this.lastChronicle = '';
      this.messageHue = this.palette.sky[0];
      this.artifactLog = this.planets.filter(p => p.artifact);
    }

    static makeName(rng, star = false) {
      const s1 = star ? ['Astra', 'Hel', 'Lum', 'Or', 'Sol', 'Ael', 'Vey', 'Cyr', 'Iri', 'Nox'] : ['Va', 'El', 'Or', 'Ni', 'Ta', 'Sa', 'Qu', 'Re', 'Lo', 'Mi', 'Ae', 'Th', 'Ur'];
      const s2 = star ? ['ron', 'axis', 'elle', 'ora', 'ium', 'eth', 'ar', 'esis', 'ara', 'ion'] : ['ra', 'len', 'tis', 'dor', 'mar', 'vyn', 'sol', 'ris', 'dell', 'vex'];
      const s3 = star ? [' Prime', ' Zenith', ' Minor', ' Drift', ' Halo', ' Veil'] : ['', '', '', ''];
      return `${pick(rng, s1)}${pick(rng, s2)}${pick(rng, s3)}`.replace(/\s+/g, ' ').trim();
    }

    makePlanets() {
      const count = Math.floor(randRange(this.rng, 4, 8));
      const out = [];
      const systemScale = randRange(this.rng, 0.92, 1.12);
      for (let i = 0; i < count; i++) {
        out.push(new Planet(i, this.rng, this.noise, this.palette, this.star.radius, systemScale));
      }
      return out;
    }

    update(dt, input) {
      this.age += dt;
      this.simTime += dt * this.timeScale;
      this.activity = lerp(this.activity, input.activityTarget, 0.02);
      this.timeScale = lerp(this.timeScale, this.timeScaleTarget, 0.08);

      const drift = 0.0005 + this.timeScale * 0.00016;
      this.cameraTarget.x = Math.cos(this.simTime * 0.07) * 56 + Math.sin(this.simTime * 0.021) * 24 + input.tumble.x * 0.55;
      this.cameraTarget.y = Math.sin(this.simTime * 0.051) * 34 + Math.cos(this.simTime * 0.017) * 20 + input.tumble.y * 0.55;
      this.camera.x = lerp(this.camera.x, this.cameraTarget.x, drift);
      this.camera.y = lerp(this.camera.y, this.cameraTarget.y, drift);

      for (const ev of this.events) {
        ev.life -= dt;
        ev.phase += dt * ev.rate;
      }
      this.events = this.events.filter(ev => ev.life > 0);

      this.nextEventAt -= dt * (0.4 + this.timeScale * 0.22 + this.activity * 0.18);
      this.nextChronicleAt -= dt * (0.3 + this.timeScale * 0.15);

      if (this.nextEventAt <= 0) {
        this.spawnEvent();
        this.nextEventAt = randRange(this.rng, 4.5, 12.5) / (0.65 + this.activity * 0.6);
      }
    }

    spawnEvent(forceType = null) {
      const type = forceType || pick(this.rng, ['flare', 'comet', 'rift', 'artifact', 'mist', 'pulse']);
      const intensity = randRange(this.rng, 0.5, 1.0);
      const baseAngle = this.rng() * TAU;
      const radius = this.star.radius * randRange(this.rng, 1.1, 6.5);
      this.events.push({
        type,
        intensity,
        life: randRange(this.rng, 3.5, 9.5),
        rate: randRange(this.rng, 0.8, 2.6),
        angle: baseAngle,
        radius,
        phase: this.rng() * TAU,
      });
    }

    maybeChronicle() {
      if (this.nextChronicleAt > 0) return null;
      this.nextChronicleAt = randRange(this.rng, 9, 21) / (0.8 + this.activity * 0.8);
      const planet = pick(this.rng, this.planets);
      const event = pick(this.rng, ['signal', 'echo', 'veil', 'tide', 'orbit', 'horizon', 'archive', 'drift']);
      const lines = [
        `Un signal de ${planet.name} traverse la couronne stellaire comme une respiration ancienne.`,
        `Les nuages de ${planet.name} se déchirent, laissant voir une mer de lumière sous la croûte.`,
        `Une archive orbitale enregistre une pulsation inhabituelle près de ${planet.name}.`,
        `Les observateurs notent une dérive silencieuse. ${planet.name} semble retenir sa nuit.`,
        `Un ${event} cosmique s’étire autour de ${planet.name}, précis comme une mesure, doux comme une prière.`,
        `Des structures inconnues ont été repérées au-delà de ${planet.name}. Elles n’émettent presque rien.`,
        `Les anneaux de ${planet.name} brillent plus fort. Quelque chose circule dans leur poussière.`,
        `La surface de ${planet.name} reflète une lumière qui n’appartient à aucune étoile visible.`,
        `Les artefacts du bord externe se réveillent. Un murmure traverse le vide près de ${planet.name}.`,
      ];
      return pick(this.rng, lines);
    }

    triggerTap(x, y) {
      this.events.push({
        type: 'pulse',
        intensity: 1,
        life: 1.8,
        rate: 4,
        angle: Math.atan2(y, x),
        radius: Math.hypot(x, y),
        phase: 0,
      });
    }

    setSpeedFromGesture(deltaX) {
      const norm = clamp(deltaX / 240, -1, 1);
      const target = 1 + norm * 3.3;
      this.timeScaleTarget = clamp(target, 0.15, 5.5);
      return this.timeScaleTarget;
    }

    resetSpeed() {
      this.timeScaleTarget = 1;
    }
  }

  class Renderer {
    constructor(canvas, universe) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      this.universe = universe;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.noiseDots = [];
      this.starfield = [];
      this.generateStarfield();
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    generateStarfield() {
      const rng = mulberry32(this.universe.seedInt ^ 0x11223344);
      this.starfield = [];
      for (let i = 0; i < 340; i++) {
        this.starfield.push({
          x: rng() * 2 - 1,
          y: rng() * 2 - 1,
          z: rng(),
          s: randRange(rng, 0.7, 2.2),
          hue: randRange(rng, 180, 235),
          phase: rng() * TAU,
          tw: randRange(rng, 0.5, 1.8),
          alpha: randRange(rng, 0.18, 0.9)
        });
      }
      this.noiseDots = [];
      for (let i = 0; i < 1100; i++) {
        this.noiseDots.push({
          x: rng() * 2 - 1,
          y: rng() * 2 - 1,
          r: randRange(rng, 0.2, 1.4),
          a: randRange(rng, 0.02, 0.12)
        });
      }
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.floor(window.innerWidth);
      this.height = Math.floor(window.innerHeight);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    render(time) {
      const ctx = this.ctx;
      const { width: w, height: h, universe } = this;
      ctx.clearRect(0, 0, w, h);

      const p = universe.palette;
      const sky = `hsl(${p.sky[0]}, ${p.sky[1]}%, ${p.sky[2]}%)`;
      const neb = `hsl(${p.neb[0]}, ${p.neb[1]}%, ${p.neb[2]}%)`;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(255,255,255,0.95)');
      bg.addColorStop(0.35, sky);
      bg.addColorStop(1, 'rgba(219,226,240,0.94)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // painterly clouds / nebulae
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cx = w * 0.5 + universe.camera.x;
      const cy = h * 0.5 + universe.camera.y;
      const nebulaGrad = ctx.createRadialGradient(cx * 0.7, cy * 0.6, 40, cx, cy, Math.max(w, h) * 0.72);
      nebulaGrad.addColorStop(0, `hsla(${p.neb[0]}, ${p.neb[1]}%, ${p.neb[2]}%, 0.52)`);
      nebulaGrad.addColorStop(0.45, `hsla(${p.accent[0]}, ${p.accent[1]}%, ${p.accent[2]}%, 0.22)`);
      nebulaGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = nebulaGrad;
      ctx.filter = 'blur(24px)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.58, h * 0.42, Math.sin(time * 0.00003) * 0.35, 0, TAU);
      ctx.fill();
      ctx.filter = 'none';

      // distant dust
      for (const d of this.noiseDots) {
        const px = w * 0.5 + d.x * w * 0.9 + universe.camera.x * 0.14;
        const py = h * 0.5 + d.y * h * 0.9 + universe.camera.y * 0.14;
        ctx.fillStyle = `rgba(255,255,255,${d.a})`;
        ctx.fillRect(px, py, d.r, d.r);
      }
      ctx.restore();

      this.drawStarfield(time);
      this.drawSystem(time);
      this.drawEvents(time);

      // subtle vignette
      const v = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.12, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      v.addColorStop(0, 'rgba(255,255,255,0)');
      v.addColorStop(1, 'rgba(60, 68, 94, 0.20)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }

    drawStarfield(time) {
      const ctx = this.ctx;
      const { width: w, height: h, universe } = this;
      ctx.save();
      const driftX = universe.camera.x * 0.08;
      const driftY = universe.camera.y * 0.08;
      for (const s of this.starfield) {
        const px = w * 0.5 + s.x * w * 0.65 + driftX * (0.2 + s.z * 0.8);
        const py = h * 0.5 + s.y * h * 0.65 + driftY * (0.2 + s.z * 0.8);
        const tw = (Math.sin(time * 0.0012 * s.tw + s.phase) * 0.5 + 0.5);
        const a = s.alpha * (0.55 + tw * 0.45);
        const r = s.s * (0.7 + tw * 0.9);
        const halo = ctx.createRadialGradient(px, py, 0, px, py, r * 4.5);
        halo.addColorStop(0, `rgba(255,255,255,${a})`);
        halo.addColorStop(0.24, `hsla(${s.hue}, 100%, 95%, ${a * 0.55})`);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawSystem(time) {
      const ctx = this.ctx;
      const { width: w, height: h, universe } = this;
      const cx = w * 0.5 + universe.camera.x;
      const cy = h * 0.5 + universe.camera.y * 0.85;
      const star = universe.star;
      const pulse = 0.72 + Math.sin(universe.simTime * star.pulse) * 0.12 + Math.sin(universe.simTime * 3.1) * 0.03;
      const starRadius = star.radius;

      // star glow layers
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 5; i++) {
        const rr = starRadius * (2.2 + i * 0.95) * pulse;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        grad.addColorStop(0, `rgba(255,255,255,${0.96 - i * 0.1})`);
        grad.addColorStop(0.18, `hsla(${star.hue}, 100%, 96%, ${0.76 - i * 0.09})`);
        grad.addColorStop(0.5, `hsla(${star.glow[0]}, ${star.glow[1]}%, ${star.glow[2]}%, ${0.16 - i * 0.018})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // star body
      const core = ctx.createRadialGradient(cx - 3, cy - 5, 2, cx, cy, starRadius * 1.05);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(0.3, `hsla(${star.hue}, 100%, 93%, 0.96)`);
      core.addColorStop(0.7, `hsla(${star.hue}, ${star.glow[1]}%, 76%, 0.95)`);
      core.addColorStop(1, `hsla(${star.hue}, ${star.glow[1]}%, 62%, 0.92)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, starRadius, 0, TAU);
      ctx.fill();

      // atmospheric rings around star
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `hsla(${star.glow[0]}, 100%, 92%, 0.12)`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, starRadius * (2.5 + i * 0.8), starRadius * (1.5 + i * 0.5), 0.35, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      // orbits and planets
      const t = universe.simTime;
      const order = [...universe.planets].sort((a, b) => a.positionAt(t).z - b.positionAt(t).z);
      for (const p of order) {
        const pos = p.positionAt(t, universe.timeScale);
        const px = cx + pos.x * 1.15;
        const py = cy + pos.y * 0.95;
        const dist = Math.hypot(pos.x, pos.y);

        // orbit track
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.03 * (1 - p.index / universe.planets.length)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, p.orbit * 1.14, p.orbit * 0.42, p.tilt * 0.6, 0, TAU);
        ctx.stroke();
        ctx.restore();

        if (p.rings) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = `hsla(${universe.palette.ring[0]}, ${universe.palette.ring[1]}%, ${universe.palette.ring[2]}%, 0.45)`;
          ctx.lineWidth = Math.max(1.5, p.radius * 0.09);
          ctx.beginPath();
          ctx.ellipse(px, py, p.radius * 2.3, p.radius * 1.05, p.ringTilt, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = Math.max(1.2, p.radius * 0.04);
          ctx.beginPath();
          ctx.ellipse(px, py, p.radius * 2.7, p.radius * 1.3, p.ringTilt, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }

        // shadow side and atmosphere
        ctx.save();
        ctx.translate(px, py);
        const scale = 1 + Math.sin(t * 0.2 + p.index) * 0.01;
        ctx.scale(scale, scale);
        ctx.drawImage(p.texture, -p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.globalCompositeOperation = 'multiply';
        const shadow = ctx.createRadialGradient(-p.radius * 0.4, -p.radius * 0.4, p.radius * 0.4, 0, 0, p.radius * 1.05);
        shadow.addColorStop(0, 'rgba(0,0,0,0)');
        shadow.addColorStop(1, 'rgba(16, 20, 34, 0.42)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'screen';
        const atmosphere = ctx.createRadialGradient(0, 0, p.radius * 0.55, 0, 0, p.radius * 1.14);
        atmosphere.addColorStop(0.5, `rgba(255,255,255,0)`);
        atmosphere.addColorStop(1, `hsla(${p.palette.glow[0]}, ${p.palette.glow[1]}%, ${p.palette.glow[2]}%, ${0.14 * p.atmosphere})`);
        ctx.fillStyle = atmosphere;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 1.04, 0, TAU);
        ctx.fill();

        // terminator highlight
        ctx.globalCompositeOperation = 'screen';
        const lightAngle = Math.atan2(-py + cy, -px + cx);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = Math.max(1, p.radius * 0.06);
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 0.98, lightAngle - 0.55, lightAngle + 0.55);
        ctx.stroke();
        ctx.restore();

        // moons
        if (p.moons) {
          for (const m of p.moonData) {
            const ma = t * m.speed + m.phase;
            const mx = px + Math.cos(ma) * m.dist * 0.18;
            const my = py + Math.sin(ma * 0.8) * m.dist * 0.08;
            ctx.save();
            const g = ctx.createRadialGradient(mx - 1, my - 1, 0, mx, my, m.radius * 3);
            g.addColorStop(0, 'rgba(255,255,255,0.95)');
            g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(mx, my, m.radius, 0, TAU);
            ctx.fill();
            ctx.restore();
          }
        }

        // rare artifact around planet orbit
        if (p.artifact) {
          const ap = p.artifactPhase + t * 0.05;
          const ax = px + Math.cos(ap) * (p.radius * 1.9);
          const ay = py + Math.sin(ap) * (p.radius * 1.0);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          if (p.artifactKind === 'relay') {
            ctx.beginPath();
            ctx.arc(ax, ay, 6, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ax, ay, 2.2, 0, TAU);
            ctx.fill();
          } else if (p.artifactKind === 'obelisk') {
            roundedRectPath(ctx, ax - 3, ay - 12, 6, 24, 2);
            ctx.stroke();
          } else if (p.artifactKind === 'ring') {
            ctx.beginPath();
            ctx.ellipse(ax, ay, 14, 6, ap, 0, TAU);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(ax, ay - 10);
            ctx.lineTo(ax + 8, ay);
            ctx.lineTo(ax, ay + 10);
            ctx.lineTo(ax - 8, ay);
            ctx.closePath();
            ctx.stroke();
          }
          ctx.restore();
        }

        // label flicker very subtle
        const labelAlpha = smoothstep(0.12, 0.6, 1 - dist / (p.orbit * 1.8));
        if (labelAlpha > 0.25) {
          ctx.save();
          ctx.fillStyle = `rgba(26, 30, 44, ${0.12 * labelAlpha})`;
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.name, px, py + p.radius + 16);
          ctx.restore();
        }
      }
    }

    drawEvents(time) {
      const ctx = this.ctx;
      const { width: w, height: h, universe } = this;
      const cx = w * 0.5 + universe.camera.x;
      const cy = h * 0.5 + universe.camera.y * 0.85;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const e of universe.events) {
        const progress = 1 - e.life / (e.life + 0.0001);
        const radius = e.radius + progress * 220 * e.intensity;
        const wobble = Math.sin(e.phase + time * 0.002) * 12;
        const x = cx + Math.cos(e.angle) * (e.radius * 1.1 + wobble);
        const y = cy + Math.sin(e.angle * 0.82) * (e.radius * 0.38 + wobble * 0.15);
        const alpha = clamp(e.life / 8, 0, 1);

        if (e.type === 'pulse') {
          const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.9);
          g.addColorStop(0, `rgba(255,255,255,${0.7 * alpha})`);
          g.addColorStop(0.25, `rgba(255,255,255,${0.22 * alpha})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, radius * 0.7, 0, TAU);
          ctx.fill();
        } else if (e.type === 'flare') {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          g.addColorStop(0, `hsla(${universe.star.hue}, 100%, 97%, ${0.55 * alpha})`);
          g.addColorStop(0.4, `hsla(${universe.palette.glow[0]}, ${universe.palette.glow[1]}%, ${universe.palette.glow[2]}%, ${0.2 * alpha})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, TAU);
          ctx.fill();
        } else if (e.type === 'comet') {
          ctx.strokeStyle = `rgba(255,255,255,${0.18 * alpha})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x - 60, y - 24);
          ctx.lineTo(x + 18, y + 9);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${0.45 * alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, TAU);
          ctx.fill();
        } else if (e.type === 'rift') {
          ctx.strokeStyle = `rgba(255,255,255,${0.25 * alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(x, y, radius * 0.7, radius * 0.28, e.phase * 0.3, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.4 * alpha;
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.arc(x, y, 18 + progress * 18, 0, TAU);
          ctx.fill();
        } else if (e.type === 'artifact') {
          ctx.strokeStyle = `rgba(255,255,255,${0.22 * alpha})`;
          ctx.lineWidth = 1.5;
          roundedRectPath(ctx, x - 12, y - 12, 24, 24, 6);
          ctx.stroke();
        } else if (e.type === 'mist') {
          const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.75);
          g.addColorStop(0, `rgba(255,255,255,${0.1 * alpha})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, radius * 0.58, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  class App {
    constructor() {
      this.canvas = document.getElementById('universe');
      this.chronicleEl = document.getElementById('chronicle');
      this.hintEl = document.getElementById('hint');
      this.systemNameEl = document.getElementById('systemName');
      this.resetBtn = document.getElementById('resetBtn');
      this.speedFill = document.getElementById('speedFill');
      this.volumeSlider = document.getElementById('volumeSlider');

      this.storage = new Storage();
      this.audio = new AudioEngine();
      this.chronicle = new Chronicle(this.chronicleEl);
      this.universe = null;
      this.renderer = null;
      this.last = now();
      this.saveTimer = 0;
      this.hintTimer = 8;
      this.input = {
        activityTarget: 0.22,
        tumble: { x: 0, y: 0 },
        isDragging: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        moved: false,
        pointerId: null,
        lastTapTime: 0
      };
    }

    async init() {
      await this.storage.ready;
      const saved = await this.storage.get('universe');
      const seed = saved?.seed || makeSeed();
      this.universe = new Universe(seed);
      if (saved) this.restore(saved);
      this.systemNameEl.textContent = this.universe.systemName;
      this.renderer = new Renderer(this.canvas, this.universe);
      this.setupEvents();
      this.volumeSlider.value = String(saved?.volume ?? 0.28);
      this.audio.setVolume(Number(this.volumeSlider.value));
      this.startLoop();
      this.autoStartAudio();
      if (!saved) {
        this.chronicle.show(this.initialChronicle(), 6200);
      } else if (saved.lastChronicle) {
        this.chronicle.show(saved.lastChronicle, 5200);
      }
      if (!saved) this.hintEl.style.opacity = '1';
    }

    initialChronicle() {
      const u = this.universe;
      return `Le système ${u.systemName} s’allume en silence. Une étoile ${u.star.type} veille sur ${u.planets.length} mondes.`;
    }

    restore(saved) {
      this.universe.seed = saved.seed || this.universe.seed;
      this.universe.seedInt = hashString(this.universe.seed);
      this.universe.timeScale = saved.timeScale ?? 1;
      this.universe.timeScaleTarget = saved.timeScaleTarget ?? this.universe.timeScale;
      this.universe.simTime = saved.simTime ?? this.universe.simTime;
      this.universe.age = saved.age ?? 0;
      this.universe.createdAt = saved.createdAt ?? Date.now();
      this.universe.lastChronicle = saved.lastChronicle || '';
      this.universe.systemName = saved.systemName || this.universe.systemName;
      this.universe.star.name = saved.starName || this.universe.star.name;
      this.universe.activity = saved.activity ?? 0.22;
      this.universe.camera.x = saved.cameraX ?? 0;
      this.universe.camera.y = saved.cameraY ?? 0;
      this.universe.cameraTarget.x = this.universe.camera.x;
      this.universe.cameraTarget.y = this.universe.camera.y;
      this.universe.nextEventAt = saved.nextEventAt ?? this.universe.nextEventAt;
      this.universe.nextChronicleAt = saved.nextChronicleAt ?? this.universe.nextChronicleAt;
    }

    serialize() {
      return {
        seed: this.universe.seed,
        createdAt: this.universe.createdAt,
        age: this.universe.age,
        simTime: this.universe.simTime,
        timeScale: this.universe.timeScale,
        timeScaleTarget: this.universe.timeScaleTarget,
        activity: this.universe.activity,
        cameraX: this.universe.camera.x,
        cameraY: this.universe.camera.y,
        systemName: this.universe.systemName,
        starName: this.universe.star.name,
        lastChronicle: this.universe.lastChronicle,
        nextEventAt: this.universe.nextEventAt,
        nextChronicleAt: this.universe.nextChronicleAt,
        volume: this.audio.volume
      };
    }

    setupEvents() {
      const canvas = this.canvas;
      const onDown = async (e) => {
        canvas.setPointerCapture?.(e.pointerId);
        this.input.isDragging = true;
        this.input.pointerId = e.pointerId;
        this.input.startX = e.clientX;
        this.input.startY = e.clientY;
        this.input.lastX = e.clientX;
        this.input.lastY = e.clientY;
        this.input.moved = false;
        this.input.activityTarget = 1;
        this.hintEl.style.opacity = '0';
        await this.audio.start();
        this.audio.pulse(0.5);
      };
      const onMove = (e) => {
        if (!this.input.isDragging || this.input.pointerId !== e.pointerId) return;
        const dx = e.clientX - this.input.startX;
        const dy = e.clientY - this.input.startY;
        const adx = e.clientX - this.input.lastX;
        const ady = e.clientY - this.input.lastY;
        this.input.lastX = e.clientX;
        this.input.lastY = e.clientY;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) this.input.moved = true;
        const target = this.universe.setSpeedFromGesture(dx);
        this.audio.setActivity(target);
        this.input.tumble.x += adx * 0.25;
        this.input.tumble.y += ady * 0.25;
        this.speedFill.style.width = `${clamp(target / 5.5, 0.05, 1) * 100}%`;
      };
      const onUp = (e) => {
        if (this.input.pointerId !== e.pointerId) return;
        const moved = this.input.moved;
        this.input.isDragging = false;
        this.input.pointerId = null;
        this.universe.resetSpeed();
        this.speedFill.style.width = `${(1 / 5.5) * 100}%`;
        if (!moved) {
          const cx = e.clientX - window.innerWidth * 0.5;
          const cy = e.clientY - window.innerHeight * 0.5;
          this.universe.triggerTap(cx, cy);
          this.audio.pulse(1.0);
          this.input.tumble.x += (Math.random() - 0.5) * 44;
          this.input.tumble.y += (Math.random() - 0.5) * 44;
        }
        this.input.activityTarget = 0.3;
      };

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      this.resetBtn.addEventListener('click', async () => {
        const ok = confirm('Réinitialiser Tiny Universe ?');
        if (!ok) return;
        await this.storage.remove('universe');
        location.reload();
      });

      this.volumeSlider.addEventListener('input', async () => {
        const v = Number(this.volumeSlider.value);
        this.audio.setVolume(v);
      });

      window.addEventListener('beforeunload', () => {
        this.saveSync();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.saveSync();
      });
    }

    async autoStartAudio() {
      const v = Number(this.volumeSlider.value);
      this.audio.setVolume(v);
      const tryStart = async () => {
        await this.audio.start();
        this.audio.setVolume(Number(this.volumeSlider.value));
        this.audio.setActivity(this.universe.timeScale);
      };
      window.addEventListener('pointerdown', tryStart, { once: true, passive: true });
      window.addEventListener('touchstart', tryStart, { once: true, passive: true });
      window.addEventListener('keydown', tryStart, { once: true });
      // Best effort immediate start if allowed.
      try { await tryStart(); } catch (_) {}
    }

    startLoop() {
      const loop = (ts) => {
        const dt = Math.min(0.05, (ts - this.last) / 1000 || 0);
        this.last = ts;

        this.input.tumble.x *= 0.94;
        this.input.tumble.y *= 0.94;
        this.input.activityTarget = this.input.isDragging ? 1 : 0.22;

        this.universe.update(dt, this.input);

        const chronicleText = this.universe.maybeChronicle();
        if (chronicleText) {
          this.universe.lastChronicle = chronicleText;
          this.chronicle.show(chronicleText, 5600);
          this.audio.pulse(0.55);
        }

        if (Math.abs(this.universe.timeScaleTarget - 1) < 0.08 && !this.input.isDragging) {
          this.universe.resetSpeed();
        }

        this.renderer.render(ts);

        this.saveTimer += dt;
        this.hintTimer -= dt;
        if (this.hintTimer <= 0 && this.hintEl.style.opacity !== '0') {
          this.hintEl.style.opacity = '0.52';
        }
        if (this.saveTimer > 4.5) {
          this.saveTimer = 0;
          this.saveSync();
        }

        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    async saveSync() {
      const state = this.serialize();
      await this.storage.set('universe', state);
    }
  }

  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (_) {}
    }
  }

  const app = new App();
  registerSW();
  app.init().catch((err) => {
    console.error(err);
    document.getElementById('chronicle').textContent = 'Tiny Universe a rencontré une turbulence au décollage.';
    document.getElementById('chronicle').classList.add('show');
  });

})();
