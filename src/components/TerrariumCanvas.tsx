import { useEffect, useRef } from 'react';
import { FloraDensity, FloraSpecimenInfo } from '../terrarium/math';
import { mountTerrariumScene, TerrariumSceneHandle } from '../terrarium/TerrariumScene';

interface TerrariumCanvasProps {
  initialSeed: number;
  initialDensity: FloraDensity;
  initialGrowth: number;
  onSceneReady: (handle: TerrariumSceneHandle) => void;
  onSelectSpecimen: (specimen: FloraSpecimenInfo | null) => void;
  onTimeAdvance: (newTime: number) => void;
  onContextLostChange: (lost: boolean) => void;
}

export function TerrariumCanvas({
  initialSeed,
  initialDensity,
  initialGrowth,
  onSceneReady,
  onSelectSpecimen,
  onTimeAdvance,
  onContextLostChange,
}: TerrariumCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({
    onSceneReady,
    onSelectSpecimen,
    onTimeAdvance,
    onContextLostChange,
  });

  callbacksRef.current = {
    onSceneReady,
    onSelectSpecimen,
    onTimeAdvance,
    onContextLostChange,
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const handle = mountTerrariumScene({
      container: el,
      initialSeed,
      initialDensity,
      initialGrowth,
      onSelectSpecimen: (spec) => callbacksRef.current.onSelectSpecimen(spec),
      onTimeAdvance: (t) => callbacksRef.current.onTimeAdvance(t),
      onContextLostChange: (lost) => callbacksRef.current.onContextLostChange(lost),
    });

    callbacksRef.current.onSceneReady(handle);

    return () => {
      handle.dispose();
    };
    // Mount WebGL canvas once so React HUD updates never tear down the scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full z-0"
      aria-label="Interactive 3D Glass Terrarium Viewport"
    />
  );
}
