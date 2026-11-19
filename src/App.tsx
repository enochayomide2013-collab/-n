import { FileSpreadsheet, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { GoogleFormsModal } from './components/GoogleFormsModal';
import { TerrariumCanvas } from './components/TerrariumCanvas';
import {
  CameraPreset,
  computeEnvironmentMetrics,
  FloraDensity,
  FloraSpecimenInfo,
  formatHourToTime,
  TerrariumEnvironmentSnapshot,
  WeatherMode,
} from './terrarium/math';
import type { TerrariumSceneHandle } from './terrarium/TerrariumScene';

export default function App() {
  const sceneRef = useRef<TerrariumSceneHandle | null>(null);

  const [seed, setSeed] = useState(402);
  const [timeOfDay, setTimeOfDay] = useState(10.5);
  const [autoCycle, setAutoCycle] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>('clear');
  const [mistLevel, setMistLevel] = useState(0.25);
  const [ventOpen, setVentOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [density, setDensity] = useState<FloraDensity>('balanced');
  const [growthStage, setGrowthStage] = useState(0.92);
  const [glassVisible, setGlassVisible] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [autoRotate, setAutoRotate] = useState(false);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [selectedSpecimen, setSelectedSpecimen] =
    useState<FloraSpecimenInfo | null>(null);
  const [formsModalOpen, setFormsModalOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const metrics = useMemo(
    () => computeEnvironmentMetrics(timeOfDay, weather, ventOpen ? 1 : 0.2),
    [timeOfDay, weather, ventOpen]
  );

  const snapshot: TerrariumEnvironmentSnapshot = useMemo(
    () => ({
      seed,
      timeOfDay,
      timeLabel: formatHourToTime(timeOfDay),
      weather,
      humidity: metrics.humidity,
      temperatureC: metrics.temperatureC,
      ventOpen: ventOpen ? 1 : 0.2,
      growthStage,
      density,
    }),
    [seed, timeOfDay, weather, metrics, ventOpen, growthStage, density]
  );

  // Keyboard shortcut 'H' for Cinema / Zen mode HUD collapse
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSceneReady = useCallback((handle: TerrariumSceneHandle) => {
    sceneRef.current = handle;
  }, []);

  const handleChangeTime = (hour: number) => {
    setTimeOfDay(hour);
    sceneRef.current?.setTimeOfDay(hour);
  };

  const handleToggleAutoCycle = () => {
    setAutoCycle((prev) => {
      const next = !prev;
      sceneRef.current?.setAutoCycle(next);
      return next;
    });
  };

  const handleChangeWeather = (mode: WeatherMode) => {
    setWeather(mode);
    sceneRef.current?.setWeather(mode);
    if (mode === 'mist' && mistLevel < 0.45) {
      setMistLevel(0.65);
      sceneRef.current?.setMistLevel(0.65);
    }
  };

  const handleChangeMistLevel = (val: number) => {
    setMistLevel(val);
    sceneRef.current?.setMistLevel(val);
  };

  const handleToggleVent = () => {
    setVentOpen((prev) => {
      const next = !prev;
      sceneRef.current?.setVentOpen(next ? 1.0 : 0.15);
      return next;
    });
  };

  const handleToggleAudio = () => {
    setAudioEnabled((prev) => {
      const next = !prev;
      sceneRef.current?.setAudioEnabled(next);
      return next;
    });
  };

  const handleChangeDensity = (nextDensity: FloraDensity) => {
    setDensity(nextDensity);
    sceneRef.current?.rebuildFlora(seed, nextDensity, growthStage);
  };

  const handleChangeGrowthStage = (val: number) => {
    setGrowthStage(val);
    sceneRef.current?.setGrowthStage(val);
  };

  const handleToggleGlass = () => {
    setGlassVisible((prev) => {
      const next = !prev;
      sceneRef.current?.setGlassVisible(next);
      return next;
    });
  };

  const handleRegenerateSeed = () => {
    const nextSeed = Math.floor(100 + Math.random() * 899);
    setSeed(nextSeed);
    sceneRef.current?.rebuildFlora(nextSeed, density, growthStage);
  };

  const handleSelectCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneRef.current?.setCameraPreset(preset);
  };

  const handleToggleAutoRotate = () => {
    setAutoRotate((prev) => {
      const next = !prev;
      sceneRef.current?.setAutoRotate(next);
      return next;
    });
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d1411]">
      {/* Full-Bleed Three.js Viewport */}
      <TerrariumCanvas
        initialSeed={seed}
        initialDensity={density}
        initialGrowth={growthStage}
        onSceneReady={handleSceneReady}
        onSelectSpecimen={setSelectedSpecimen}
        onTimeAdvance={setTimeOfDay}
        onContextLostChange={setContextLost}
      />

      {/* WebGL Context Lost Fallback Notice */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1411]/95 p-6 text-center">
          <div className="max-w-sm rounded-2xl bg-[#141e19] border border-white/12 p-6">
            <h2 className="font-display text-lg text-[#eef2ec]">
              Graphics Context Paused
            </h2>
            <p className="text-xs text-[#aab8ae] mt-2 leading-relaxed">
              The 3D viewport was temporarily suspended by the browser. Reload or
              switch back to resume rendering.
            </p>
          </div>
        </div>
      )}

      {/* Minimal Top HUD (No Center Viewport Occlusion, Zero Pills, Zero Pulsing Dots) */}
      <header className="fixed top-0 left-0 right-0 z-20 flex items-start justify-between gap-4 px-5 py-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-0.5">
          <h1 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-[#eef2ec] whitespace-nowrap">
            Verdant Conservatory
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#9fb0a5] font-mono-tabular whitespace-nowrap">
            <span>Seed #{seed}</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.humidity}% RH</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.temperatureC.toFixed(1)}°C</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFormsModalOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101814]/92 hover:bg-[#17231d] border border-white/14 text-xs font-medium text-[#eef2ec] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#84cc96]" />
          <span>Care Log (Google Forms)</span>
        </button>
      </header>

      {/* Specimen Inspector Card (only shown when user clicks a plant in 3D) */}
      {selectedSpecimen && (
        <aside className="fixed top-20 left-5 z-20 w-[min(300px,88vw)] rounded-2xl bg-[#101814]/95 border border-white/12 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-medium text-[#eef2ec]">
                {selectedSpecimen.commonName}
              </h2>
              <p className="text-xs italic text-[#84cc96]">
                {selectedSpecimen.latinName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSpecimen(null)}
              className="p-1 rounded-md text-[#9aa99f] hover:text-white cursor-pointer"
              aria-label="Close specimen card"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-white/8 flex flex-col gap-1.5 text-xs text-[#b7c4bb]">
            <div>
              <span className="text-[#7e8e83]">Family: </span>
              <span>{selectedSpecimen.family}</span>
            </div>
            <div>
              <span className="text-[#7e8e83]">Zone: </span>
              <span>{selectedSpecimen.microclimate}</span>
            </div>
            <div>
              <span className="text-[#7e8e83]">Hydration: </span>
              <span>{selectedSpecimen.hydration}</span>
            </div>
            <div className="font-mono-tabular">
              <span className="text-[#7e8e83] font-sans">Substrate Elev: </span>
              <span>+{selectedSpecimen.elevationCm.toFixed(1)} cm</span>
            </div>
            <p className="text-[#96a79c] mt-1 leading-relaxed">
              {selectedSpecimen.notes}
            </p>
          </div>
        </aside>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        timeOfDay={timeOfDay}
        onChangeTimeOfDay={handleChangeTime}
        autoCycle={autoCycle}
        onToggleAutoCycle={handleToggleAutoCycle}
        weather={weather}
        onChangeWeather={handleChangeWeather}
        mistLevel={mistLevel}
        onChangeMistLevel={handleChangeMistLevel}
        ventOpen={ventOpen}
        onToggleVent={handleToggleVent}
        audioEnabled={audioEnabled}
        onToggleAudio={handleToggleAudio}
        density={density}
        onChangeDensity={handleChangeDensity}
        growthStage={growthStage}
        onChangeGrowthStage={handleChangeGrowthStage}
        glassVisible={glassVisible}
        onToggleGlass={handleToggleGlass}
        onRegenerateSeed={handleRegenerateSeed}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        autoRotate={autoRotate}
        onToggleAutoRotate={handleToggleAutoRotate}
      />

      {/* Google Forms Care Log Modal */}
      <GoogleFormsModal
        open={formsModalOpen}
        onClose={() => setFormsModalOpen(false)}
        snapshot={snapshot}
        specimens={sceneRef.current?.getSpecimens() ?? []}
      />
    </main>
  );
}
