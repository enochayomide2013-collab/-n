import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  CameraPreset,
  FloraDensity,
  FloraSpecimenInfo,
  WeatherMode,
} from './math';
import { createProceduralTextures } from './textures';
import { createTerrariumVessel } from './vessel';
import { createFloraSystem } from './flora';
import { createWeatherSystem } from './weather';

// Pre-allocated scratch vectors/colors for zero-GC render loop
const _skyColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetCtrlLook = new THREE.Vector3();
const _mouseVec = new THREE.Vector2();

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [4.65, 3.05, 5.15], target: [0, 1.48, 0] },
  canopy: { pos: [2.85, 2.75, 3.1], target: [-0.25, 1.65, -0.2] },
  pond: { pos: [2.75, 1.85, 2.95], target: [0.55, 0.92, 0.45] },
  macro: { pos: [2.25, 1.55, 2.55], target: [-0.3, 1.18, 0.25] },
};

export interface TerrariumSceneOptions {
  container: HTMLElement;
  initialSeed: number;
  initialDensity: FloraDensity;
  initialGrowth: number;
  onSelectSpecimen: (specimen: FloraSpecimenInfo | null) => void;
  onTimeAdvance: (newTime: number) => void;
  onContextLostChange?: (lost: boolean) => void;
}

export interface TerrariumSceneHandle {
  setTimeOfDay: (hour: number) => void;
  setAutoCycle: (enabled: boolean) => void;
  setWeather: (mode: WeatherMode) => void;
  setMistLevel: (level: number) => void;
  setVentOpen: (open: number) => void;
  setGlassVisible: (visible: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setAutoRotate: (enabled: boolean) => void;
  rebuildFlora: (seed: number, density: FloraDensity, growthStage: number) => void;
  setGrowthStage: (growthStage: number) => void;
  getSpecimens: () => FloraSpecimenInfo[];
  dispose: () => void;
}

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function mountTerrariumScene(
  opts: TerrariumSceneOptions
): TerrariumSceneHandle {
  const { container } = opts;
  const isSoftwareGl = detectSoftwareGl();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111a16);
  scene.fog = new THREE.FogExp2(0x111a16, 0.042);

  // Mandatory Studio Environment Reflection (RoomEnvironment via PMREMGenerator)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
  camera.position.set(...CAMERA_PRESETS.overview.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...CAMERA_PRESETS.overview.target);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.065;
  controls.minDistance = 2.6;
  controls.maxDistance = 11.5;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.enablePan = true;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.65;
  controls.update();

  // Studio 3-point + Diurnal Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x88b4c8, 0x263222, 0.72);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
  keyLight.position.set(5.5, 8.0, 4.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  const d = 4.6;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 24;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x7fb4c8, 0.65);
  rimLight.position.set(-5.0, 4.5, -5.5);
  scene.add(rimLight);

  // Subtle interior conservatory grow/firefly warm point light at night
  const interiorLight = new THREE.PointLight(0xffcf8a, 0.25, 6.5, 1.8);
  interiorLight.position.set(0, 3.25, 0);
  scene.add(interiorLight);

  // Lightning flash light for storm weather
  const lightningLight = new THREE.PointLight(0xd9eaff, 0, 25, 1.2);
  lightningLight.position.set(-4, 7.5, 3);
  scene.add(lightningLight);

  // Studio softbox RectAreaLights for crisp brass/glass bevel highlights (skipped on software GL)
  let rectLightA: THREE.RectAreaLight | null = null;
  let rectLightB: THREE.RectAreaLight | null = null;
  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    rectLightA = new THREE.RectAreaLight(0xfff5e4, 2.2, 4.5, 3.0);
    rectLightA.position.set(4.5, 4.0, 4.0);
    rectLightA.lookAt(0, 1.5, 0);
    scene.add(rectLightA);

    rectLightB = new THREE.RectAreaLight(0x9ac6dc, 1.4, 4.0, 3.0);
    rectLightB.position.set(-4.5, 3.2, -3.5);
    rectLightB.lookAt(0, 1.5, 0);
    scene.add(rectLightB);
  }

  // Procedural Textures, Vessel, Flora, and Weather Systems
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = createProceduralTextures(maxAniso);
  const vessel = createTerrariumVessel(textures, isSoftwareGl, opts.initialSeed);
  scene.add(vessel.root);

  const flora = createFloraSystem(textures);
  flora.rebuild(opts.initialSeed, opts.initialDensity, opts.initialGrowth);
  scene.add(flora.root);

  const weatherSys = createWeatherSystem(textures);
  scene.add(weatherSys.root);

  // Pre-warm shaders once on hardware GPUs
  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Mutable simulation state
  let timeOfDay = 10.5;
  let autoCycle = false;
  let weatherMode: WeatherMode = 'clear';
  let mistLevel = 0.25;
  let targetVentOpen = 0.2;
  let smoothVentOpen = 0.2;
  let currentSeed = opts.initialSeed;

  // Damped camera preset animation state
  let cameraTransitionActive = false;
  controls.addEventListener('start', () => {
    cameraTransitionActive = false;
  });

  // Fast Layer-1 Raycasting for specimen click/hover
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);

  let pointerDownX = 0;
  let pointerDownY = 0;
  let lastHoverCheck = 0;

  const updateMouseFromEvent = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    _mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (moved > 6) return; // user was orbiting, not clicking

    updateMouseFromEvent(e);
    raycaster.setFromCamera(_mouseVec, camera);
    const hits = raycaster.intersectObjects(flora.interactables, false);
    if (hits.length > 0) {
      const info = hits[0].object.userData.specimenInfo as FloraSpecimenInfo | undefined;
      if (info) {
        flora.setHighlightedSpecimen(info.id);
        opts.onSelectSpecimen(info);
        return;
      }
    }
    flora.setHighlightedSpecimen(null);
    opts.onSelectSpecimen(null);
  };

  const onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - lastHoverCheck < 65) return;
    lastHoverCheck = now;

    updateMouseFromEvent(e);
    raycaster.setFromCamera(_mouseVec, camera);
    const hits = raycaster.intersectObjects(flora.interactables, false);
    renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    opts.onContextLostChange?.(true);
  };
  const onContextRestored = () => {
    opts.onContextLostChange?.(false);
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // Diurnal atmosphere & lighting evaluator
  function applyDayNightLighting(hour: number, lightningFlash: number) {
    // Solar elevation curve: sunrise ~6, noon ~13, sunset ~19.5
    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle); // +1 noon, -1 midnight
    const dayFactor = THREE.MathUtils.smoothstep(sunElev, -0.2, 0.35);
    const nightFactor = 1 - dayFactor;
    const twilight = Math.exp(-Math.pow((sunElev - 0.04) / 0.18, 2));

    // Overcast dampening during rain/storm
    const overcast =
      weatherMode === 'storm'
        ? 0.58
        : weatherMode === 'rain'
          ? 0.38
          : weatherMode === 'mist'
            ? 0.2
            : 0.0;

    // Sky / backdrop color synced with FogExp2
    // Night: deep botanical obsidian #0b1115 -> Dawn/Dusk: slate plum/amber #28242c -> Day: soft conservatory slate #1b2824
    const r = THREE.MathUtils.lerp(0.045, 0.135, dayFactor) + twilight * 0.095;
    const g = THREE.MathUtils.lerp(0.068, 0.195, dayFactor) + twilight * 0.045;
    const b = THREE.MathUtils.lerp(0.092, 0.185, dayFactor) + twilight * 0.035;

    _skyColor.setRGB(
      r * (1 - overcast * 0.45) + lightningFlash * 0.25,
      g * (1 - overcast * 0.4) + lightningFlash * 0.28,
      b * (1 - overcast * 0.25) + lightningFlash * 0.35
    );
    (scene.background as THREE.Color).copy(_skyColor);
    (scene.fog as THREE.FogExp2).color.copy(_skyColor);

    // Key light orbits smoothly overhead during day, switches to cool lunar rim at night
    const arcX = Math.cos(sunAngle) * 7.5;
    const arcY = Math.max(2.2, Math.abs(sunElev) * 8.5 + 1.8);
    const arcZ = 4.2 + Math.sin(sunAngle) * 1.5;
    keyLight.position.set(arcX, arcY, arcZ);

    // Sun color temperature: warm amber at dawn/dusk, crisp warm daylight at noon, cool silver-blue at night
    _sunColor.setRGB(
      THREE.MathUtils.lerp(0.55, 1.0, dayFactor) + twilight * 0.12,
      THREE.MathUtils.lerp(0.68, 0.94, dayFactor) - twilight * 0.15,
      THREE.MathUtils.lerp(0.95, 0.84, dayFactor) - twilight * 0.3
    );
    keyLight.color.copy(_sunColor);
    keyLight.intensity =
      (THREE.MathUtils.lerp(0.75, 2.65, dayFactor) + twilight * 0.45) *
      (1 - overcast * 0.48);

    // Cool Hemisphere fill contrasting warm key
    _hemiSky.setRGB(
      THREE.MathUtils.lerp(0.24, 0.58, dayFactor),
      THREE.MathUtils.lerp(0.34, 0.72, dayFactor),
      THREE.MathUtils.lerp(0.52, 0.78, dayFactor)
    );
    _hemiGround.setRGB(
      THREE.MathUtils.lerp(0.08, 0.18, dayFactor),
      THREE.MathUtils.lerp(0.11, 0.22, dayFactor),
      THREE.MathUtils.lerp(0.1, 0.15, dayFactor)
    );
    hemiLight.color.copy(_hemiSky);
    hemiLight.groundColor.copy(_hemiGround);
    hemiLight.intensity = THREE.MathUtils.lerp(0.52, 0.88, dayFactor);

    // Interior warm brass conservatory filament brightens at dusk & night
    interiorLight.intensity = 0.2 + nightFactor * 1.65;
    rimLight.intensity = THREE.MathUtils.lerp(0.95, 0.55, dayFactor);
    lightningLight.intensity = lightningFlash * 16.0;

    if (rectLightA) {
      rectLightA.intensity = THREE.MathUtils.lerp(0.7, 2.4, dayFactor);
    }
    if (rectLightB) {
      rectLightB.intensity = THREE.MathUtils.lerp(1.1, 1.5, dayFactor);
    }

    return { nightFactor };
  }

  // Frame loop with Software-WebGL fence pacing (`afterDraw(tick)`)
  const clock = new THREE.Clock();
  let frameId = 0;
  let disposed = false;
  let lastUiTimeSync = 0;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;

    if (autoCycle) {
      timeOfDay = (timeOfDay + dt * 0.75) % 24;
      if (elapsed - lastUiTimeSync > 0.1) {
        lastUiTimeSync = elapsed;
        opts.onTimeAdvance(timeOfDay);
      }
    }

    // Smooth camera preset damping
    if (cameraTransitionActive) {
      const lambda = 1 - Math.exp(-5.5 * dt);
      camera.position.lerp(_targetCamPos, lambda);
      controls.target.lerp(_targetCtrlLook, lambda);
      if (
        camera.position.distanceTo(_targetCamPos) < 0.015 &&
        controls.target.distanceTo(_targetCtrlLook) < 0.015
      ) {
        camera.position.copy(_targetCamPos);
        controls.target.copy(_targetCtrlLook);
        cameraTransitionActive = false;
      }
    }

    controls.update();

    // Smooth roof vent lid damping
    smoothVentOpen = THREE.MathUtils.damp(smoothVentOpen, targetVentOpen, 6.5, dt);

    // Day/Night & Weather updates
    const nightPre = 1 - THREE.MathUtils.smoothstep(Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2), -0.2, 0.35);
    const { lightningFlash, rainIntensity } = weatherSys.update(
      dt,
      elapsed,
      weatherMode,
      mistLevel,
      nightPre
    );
    const { nightFactor } = applyDayNightLighting(timeOfDay, lightningFlash);

    const windStrength =
      (weatherMode === 'storm'
        ? 0.9
        : weatherMode === 'rain'
          ? 0.48
          : weatherMode === 'mist'
            ? 0.22
            : 0.12) *
      (0.45 + smoothVentOpen * 0.55);

    flora.updateAnimation(elapsed, windStrength, nightFactor);

    const humidityRatio = Math.min(
      1,
      mistLevel * 0.65 + (weatherMode === 'rain' || weatherMode === 'storm' ? 0.45 : 0.05)
    );
    vessel.updateAnimation(elapsed, rainIntensity, humidityRatio, smoothVentOpen, nightFactor);

    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  tick();

  return {
    setTimeOfDay: (hour: number) => {
      timeOfDay = hour;
    },
    setAutoCycle: (enabled: boolean) => {
      autoCycle = enabled;
    },
    setWeather: (mode: WeatherMode) => {
      weatherMode = mode;
    },
    setMistLevel: (level: number) => {
      mistLevel = level;
    },
    setVentOpen: (open: number) => {
      targetVentOpen = open;
    },
    setGlassVisible: (visible: boolean) => {
      vessel.setGlassVisible(visible);
    },
    setAudioEnabled: (enabled: boolean) => {
      weatherSys.setAudioEnabled(enabled);
    },
    setCameraPreset: (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS[preset];
      _targetCamPos.set(...cfg.pos);
      _targetCtrlLook.set(...cfg.target);
      cameraTransitionActive = true;
    },
    setAutoRotate: (enabled: boolean) => {
      controls.autoRotate = enabled;
    },
    rebuildFlora: (seed: number, density: FloraDensity, growthStage: number) => {
      currentSeed = seed;
      vessel.updateTerrainForSeed(currentSeed);
      flora.rebuild(currentSeed, density, growthStage);
      opts.onSelectSpecimen(null);
    },
    setGrowthStage: (growthStage: number) => {
      flora.setGrowthStage(growthStage);
    },
    getSpecimens: () => flora.specimens,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      flora.dispose();
      vessel.dispose();
      weatherSys.dispose();
      textures.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
