import * as THREE from 'three';
import { WeatherMode } from './math';
import type { ProceduralTextureSet } from './textures';

// Pre-allocated scratch helpers (zero GC in render loop)
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();
const _euler = new THREE.Euler();

interface RainDropState {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
}

interface MistSpriteState {
  sprite: THREE.Sprite;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
}

export interface WeatherController {
  root: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    mode: WeatherMode,
    mistLevel: number,
    nightFactor: number
  ) => { lightningFlash: number; rainIntensity: number };
  setAudioEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

class ProceduralRainAudio {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private enabled = false;

  setEnabled(next: boolean) {
    this.enabled = next;
    if (next) {
      this.ensureStarted();
      if (this.ctx?.state === 'suspended') {
        void this.ctx.resume();
      }
    } else if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    }
  }

  private ensureStarted() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink-ish rain noise buffer
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    this.ctx = ctx;
    this.filterNode = filter;
    this.gainNode = gain;
  }

  update(mode: WeatherMode, mistLevel: number) {
    if (!this.ctx || !this.gainNode || !this.filterNode) return;
    if (!this.enabled) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      return;
    }

    let targetGain = 0.015;
    let targetFreq = 900;
    if (mode === 'mist') {
      targetGain = 0.03 + mistLevel * 0.03;
      targetFreq = 650;
    } else if (mode === 'rain') {
      targetGain = 0.14;
      targetFreq = 1400;
    } else if (mode === 'storm') {
      targetGain = 0.24;
      targetFreq = 1850;
    }

    this.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.25);
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.25);
  }

  triggerThunder() {
    if (!this.enabled || !this.ctx || !this.gainNode) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(68, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 1.4);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.65);
  }

  dispose() {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export function createWeatherSystem(textures: ProceduralTextureSet): WeatherController {
  const root = new THREE.Group();
  root.name = 'WeatherEffects';

  const audio = new ProceduralRainAudio();

  // 1. Instanced Raindrop Streaks (exterior + canopy rain)
  const rainCount = 240;
  const rainGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.36, 4);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xcbe6f2,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const rainInstanced = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainInstanced.frustumCulled = false;
  rainInstanced.visible = false;
  root.add(rainInstanced);

  const drops: RainDropState[] = [];
  for (let i = 0; i < rainCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * 5.8;
    drops.push({
      x: Math.cos(angle) * rad,
      y: Math.random() * 7.5,
      z: Math.sin(angle) * rad,
      speed: 7.5 + Math.random() * 4.5,
      len: 0.75 + Math.random() * 0.65,
    });
  }

  // 2. Interior Volumetric Mist Sprites drifting above moss & pond
  const mistGroup = new THREE.Group();
  root.add(mistGroup);
  const mistSprites: MistSpriteState[] = [];
  const mistCount = 12;
  const mistMaterials: THREE.SpriteMaterial[] = [];

  for (let i = 0; i < mistCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures.mistPuff,
      color: 0xdcece8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    mistMaterials.push(mat);
    const sprite = new THREE.Sprite(mat);
    const angle = (i / mistCount) * Math.PI * 2;
    const rad = 0.25 + (i % 3) * 0.42;
    const bx = Math.cos(angle) * rad;
    const by = 0.96 + (i % 4) * 0.24;
    const bz = Math.sin(angle) * rad;
    sprite.position.set(bx, by, bz);
    const size = 1.15 + (i % 3) * 0.38;
    sprite.scale.set(size, size * 0.52, 1);
    mistGroup.add(sprite);

    mistSprites.push({
      sprite,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      phase: i * 1.1,
      speed: 0.28 + (i % 4) * 0.08,
    });
  }

  // 3. Interior Floating Pollen / Night Fireflies
  const moteCount = 46;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 1.55;
    motePositions[i * 3] = Math.cos(a) * r;
    motePositions[i * 3 + 1] = 0.95 + Math.random() * 1.55;
    motePositions[i * 3 + 2] = Math.sin(a) * r;

    moteSeeds[i * 3] = Math.random() * Math.PI * 2;
    moteSeeds[i * 3 + 1] = 0.4 + Math.random() * 0.7;
    moteSeeds[i * 3 + 2] = 0.1 + Math.random() * 0.2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xf4e8b4,
    size: 0.045,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motePoints = new THREE.Points(moteGeo, moteMat);
  root.add(motePoints);

  let nextLightningTimer = 2.6;
  let lightningEnergy = 0;
  let smoothRain = 0;
  let smoothMist = 0;

  const update = (
    dt: number,
    elapsed: number,
    mode: WeatherMode,
    mistLevel: number,
    nightFactor: number
  ) => {
    const targetRain = mode === 'rain' ? 0.65 : mode === 'storm' ? 1.0 : 0.0;
    const targetMist =
      mode === 'mist'
        ? Math.max(0.55, mistLevel)
        : mode === 'rain' || mode === 'storm'
          ? Math.max(0.35, mistLevel * 0.85)
          : mistLevel * 0.55;

    const dampFactor = 1 - Math.exp(-3.5 * dt);
    smoothRain += (targetRain - smoothRain) * dampFactor;
    smoothMist += (targetMist - smoothMist) * dampFactor;

    // Raindrops update
    if (smoothRain > 0.02) {
      rainInstanced.visible = true;
      rainMat.opacity = 0.52 * smoothRain;
      const tiltZ = mode === 'storm' ? 0.22 : 0.06;
      _euler.set(0, 0, tiltZ);
      _quat.setFromEuler(_euler);

      const activeCount = Math.floor(rainCount * smoothRain);
      for (let i = 0; i < rainCount; i++) {
        if (i >= activeCount) {
          _scale.set(0, 0, 0);
          _pos.set(0, -10, 0);
          _mat.compose(_pos, _quat, _scale);
          rainInstanced.setMatrixAt(i, _mat);
          continue;
        }
        const d = drops[i];
        d.y -= d.speed * dt * (mode === 'storm' ? 1.35 : 1.0);
        d.x -= tiltZ * d.speed * dt * 1.4;
        if (d.y < 0.05) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 5.8;
          d.x = Math.cos(a) * r;
          d.z = Math.sin(a) * r;
          d.y = 6.5 + Math.random() * 1.5;
        }
        _pos.set(d.x, d.y, d.z);
        _scale.set(1, d.len, 1);
        _mat.compose(_pos, _quat, _scale);
        rainInstanced.setMatrixAt(i, _mat);
      }
      rainInstanced.instanceMatrix.needsUpdate = true;
    } else {
      rainInstanced.visible = false;
    }

    // Mist puffs update
    mistGroup.visible = smoothMist > 0.02;
    if (mistGroup.visible) {
      for (let i = 0; i < mistSprites.length; i++) {
        const ms = mistSprites[i];
        ms.sprite.position.x = ms.baseX + Math.sin(elapsed * ms.speed + ms.phase) * 0.28;
        ms.sprite.position.y = ms.baseY + Math.cos(elapsed * ms.speed * 0.7 + ms.phase) * 0.08;
        ms.sprite.position.z = ms.baseZ + Math.cos(elapsed * ms.speed * 0.9 + ms.phase) * 0.24;
        mistMaterials[i].opacity = smoothMist * 0.28;
      }
    }

    // Floating pollen / firefly motes
    const posAttr = moteGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < moteCount; i++) {
      const ph = moteSeeds[i * 3];
      const sp = moteSeeds[i * 3 + 1];
      const amp = moteSeeds[i * 3 + 2];
      const bx = posAttr.getX(i);
      const by = posAttr.getY(i);
      const bz = posAttr.getZ(i);
      posAttr.setXYZ(
        i,
        bx + Math.sin(elapsed * sp + ph) * amp * dt,
        THREE.MathUtils.clamp(by + Math.cos(elapsed * sp * 0.8 + ph) * amp * dt, 0.9, 2.55),
        bz + Math.cos(elapsed * sp * 0.9 + ph) * amp * dt
      );
    }
    posAttr.needsUpdate = true;

    // Color transitions from golden pollen (day) to bioluminescent fireflies (night)
    moteMat.color.setRGB(
      THREE.MathUtils.lerp(0.95, 0.52, nightFactor),
      THREE.MathUtils.lerp(0.9, 0.98, nightFactor),
      THREE.MathUtils.lerp(0.68, 0.66, nightFactor)
    );
    moteMat.size = THREE.MathUtils.lerp(0.036, 0.068, nightFactor);
    moteMat.opacity = THREE.MathUtils.lerp(0.32, 0.88, nightFactor) * (1 - smoothRain * 0.35);

    // Storm lightning flashes
    if (mode === 'storm') {
      nextLightningTimer -= dt;
      if (nextLightningTimer <= 0) {
        lightningEnergy = 1.0;
        nextLightningTimer = 3.2 + Math.random() * 5.2;
        audio.triggerThunder();
      }
    }
    lightningEnergy = Math.max(0, lightningEnergy - dt * 3.8);

    audio.update(mode, mistLevel);

    return {
      lightningFlash: lightningEnergy,
      rainIntensity: smoothRain,
    };
  };

  const setAudioEnabled = (enabled: boolean) => {
    audio.setEnabled(enabled);
  };

  const dispose = () => {
    rainGeo.dispose();
    rainMat.dispose();
    mistMaterials.forEach((m) => m.dispose());
    moteGeo.dispose();
    moteMat.dispose();
    audio.dispose();
  };

  return {
    root,
    update,
    setAudioEnabled,
    dispose,
  };
}
