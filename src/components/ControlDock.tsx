import {
  Camera,
  ChevronDown,
  ChevronUp,
  CloudFog,
  CloudLightning,
  CloudRain,
  Eye,
  EyeOff,
  Flower2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Sun,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { useState } from 'react';
import {
  CameraPreset,
  FloraDensity,
  formatHourToTime,
  WeatherMode,
} from '../terrarium/math';

type DockTab = 'lighting' | 'weather' | 'botany' | 'camera';

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  timeOfDay: number;
  onChangeTimeOfDay: (hour: number) => void;
  autoCycle: boolean;
  onToggleAutoCycle: () => void;
  weather: WeatherMode;
  onChangeWeather: (mode: WeatherMode) => void;
  mistLevel: number;
  onChangeMistLevel: (val: number) => void;
  ventOpen: boolean;
  onToggleVent: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  density: FloraDensity;
  onChangeDensity: (d: FloraDensity) => void;
  growthStage: number;
  onChangeGrowthStage: (val: number) => void;
  glassVisible: boolean;
  onToggleGlass: () => void;
  onRegenerateSeed: () => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
}

export function ControlDock(props: ControlDockProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('lighting');

  const tabs: Array<{ id: DockTab; label: string; icon: typeof Sun }> = [
    { id: 'lighting', label: 'Lighting', icon: Sun },
    { id: 'weather', label: 'Weather', icon: CloudRain },
    { id: 'botany', label: 'Botany', icon: Flower2 },
    { id: 'camera', label: 'Camera', icon: Camera },
  ];

  const lightingPresets = [
    { label: 'Dawn', hour: 6.5 },
    { label: 'Noon', hour: 12.5 },
    { label: 'Dusk', hour: 18.6 },
    { label: 'Night', hour: 23.0 },
  ];

  const weatherOptions: Array<{
    id: WeatherMode;
    label: string;
    icon: typeof Sun;
  }> = [
    { id: 'clear', label: 'Clear', icon: Sun },
    { id: 'mist', label: 'Mist', icon: CloudFog },
    { id: 'rain', label: 'Rain', icon: CloudRain },
    { id: 'storm', label: 'Storm', icon: CloudLightning },
  ];

  const cameraPresets: Array<{ id: CameraPreset; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'canopy', label: 'Canopy' },
    { id: 'pond', label: 'Pond' },
    { id: 'macro', label: 'Macro' },
  ];

  const densityOptions: Array<{ id: FloraDensity; label: string }> = [
    { id: 'sparse', label: 'Sparse' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'lush', label: 'Lush' },
  ];

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(860px,94vw)] flex flex-col items-center pointer-events-none transition-transform duration-300 ease-out ${
        props.collapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Handle attached cleanly to top edge of dock */}
      <button
        type="button"
        onClick={props.onToggleCollapse}
        className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-t-xl bg-[#101814]/95 border border-b-0 border-white/12 text-xs font-medium text-[#cbd6ce] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        aria-expanded={!props.collapsed}
      >
        {props.collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-[#84cc96]" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-[#84cc96]" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Main Unified Bottom Control Dock (solid/rgba surface — zero backdrop-filter over WebGL) */}
      <div className="pointer-events-auto w-full rounded-2xl bg-[#101814]/95 border border-white/12 shadow-2xl px-4 py-3 flex flex-col gap-2.5">
        {/* Top Tab Row */}
        <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#84cc96]/18 text-[#9fe2af] border border-[#84cc96]/35'
                      : 'text-[#9aa99f] hover:text-[#eef2ec] border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs text-[#9aa99f] font-mono-tabular whitespace-nowrap shrink-0">
            <span>{formatHourToTime(props.timeOfDay)}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{props.weather}</span>
          </div>
        </div>

        {/* Active Tab Controls Row */}
        {activeTab === 'lighting' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[210px]">
              <span className="text-xs text-[#9aa99f] whitespace-nowrap shrink-0">
                Solar Cycle
              </span>
              <input
                type="range"
                min={0}
                max={23.95}
                step={0.05}
                value={props.timeOfDay}
                onChange={(e) => props.onChangeTimeOfDay(parseFloat(e.target.value))}
                className="conservatory-slider flex-1"
                aria-label="Time of day"
              />
              <span className="text-xs font-mono-tabular text-[#eef2ec] w-11 text-right shrink-0">
                {formatHourToTime(props.timeOfDay)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={props.onToggleAutoCycle}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  props.autoCycle
                    ? 'bg-[#84cc96] text-[#0c1410] border-[#84cc96]'
                    : 'bg-white/5 text-[#d7e2da] border-white/10 hover:bg-white/10'
                }`}
              >
                {props.autoCycle ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{props.autoCycle ? 'Pause' : 'Cycle'}</span>
              </button>

              {lightingPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => props.onChangeTimeOfDay(p.hour)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    Math.abs(props.timeOfDay - p.hour) < 0.8
                      ? 'bg-white/14 text-white border-white/25'
                      : 'bg-white/4 text-[#aab8ae] border-white/8 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'weather' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {weatherOptions.map((w) => {
                const Icon = w.icon;
                const active = props.weather === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => props.onChangeWeather(w.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      active
                        ? 'bg-[#84cc96] text-[#0c1410] border-[#84cc96]'
                        : 'bg-white/5 text-[#d7e2da] border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{w.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-[160px] max-w-[220px]">
              <span className="text-xs text-[#9aa99f] whitespace-nowrap shrink-0">
                Mist
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={props.mistLevel}
                onChange={(e) => props.onChangeMistLevel(parseFloat(e.target.value))}
                className="conservatory-slider flex-1"
                aria-label="Mist density"
              />
              <span className="text-xs font-mono-tabular text-[#eef2ec] w-9 text-right shrink-0">
                {Math.round(props.mistLevel * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={props.onToggleVent}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  props.ventOpen
                    ? 'bg-white/15 text-white border-white/25'
                    : 'bg-white/5 text-[#aab8ae] border-white/10 hover:text-white'
                }`}
              >
                <Wind className="w-3.5 h-3.5" />
                <span>{props.ventOpen ? 'Vent Open' : 'Vent Closed'}</span>
              </button>

              <button
                type="button"
                onClick={props.onToggleAudio}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  props.audioEnabled
                    ? 'bg-[#84cc96]/20 text-[#9fe2af] border-[#84cc96]/40'
                    : 'bg-white/5 text-[#aab8ae] border-white/10 hover:text-white'
                }`}
              >
                {props.audioEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span>{props.audioEnabled ? 'Audio On' : 'Audio Off'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'botany' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {densityOptions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => props.onChangeDensity(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    props.density === d.id
                      ? 'bg-[#84cc96] text-[#0c1410] border-[#84cc96]'
                      : 'bg-white/5 text-[#d7e2da] border-white/10 hover:bg-white/10'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-[170px] max-w-[230px]">
              <span className="text-xs text-[#9aa99f] whitespace-nowrap shrink-0">
                Growth
              </span>
              <input
                type="range"
                min={0.45}
                max={1.15}
                step={0.05}
                value={props.growthStage}
                onChange={(e) => props.onChangeGrowthStage(parseFloat(e.target.value))}
                className="conservatory-slider flex-1"
                aria-label="Flora growth stage"
              />
              <span className="text-xs font-mono-tabular text-[#eef2ec] w-10 text-right shrink-0">
                {Math.round(props.growthStage * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={props.onToggleGlass}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  props.glassVisible
                    ? 'bg-white/14 text-white border-white/25'
                    : 'bg-white/5 text-[#aab8ae] border-white/10 hover:text-white'
                }`}
              >
                {props.glassVisible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>{props.glassVisible ? 'Glass On' : 'Open Air'}</span>
              </button>

              <button
                type="button"
                onClick={props.onRegenerateSeed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/15 text-[#eef2ec] border border-white/12 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#84cc96]" />
                <span>Regenerate Flora</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'camera' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {cameraPresets.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => props.onSelectCameraPreset(cp.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    props.cameraPreset === cp.id
                      ? 'bg-[#84cc96] text-[#0c1410] border-[#84cc96]'
                      : 'bg-white/5 text-[#d7e2da] border-white/10 hover:bg-white/10'
                  }`}
                >
                  {cp.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={props.onToggleAutoRotate}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                props.autoRotate
                  ? 'bg-white/15 text-white border-white/25'
                  : 'bg-white/5 text-[#aab8ae] border-white/10 hover:text-white'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{props.autoRotate ? 'Auto-Orbit On' : 'Auto-Orbit Off'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
