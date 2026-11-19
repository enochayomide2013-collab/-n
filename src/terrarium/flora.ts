import * as THREE from 'three';
import {
  FloraDensity,
  FloraSpecimenInfo,
  groundHeightAt,
  mulberry32,
  POND_CENTER_X,
  POND_CENTER_Z,
  SOIL_BASE_Y,
} from './math';
import type { ProceduralTextureSet } from './textures';

interface AnimatedFloraEntry {
  group: THREE.Group;
  phase: number;
  swayAmp: number;
  baseRotX: number;
  baseRotZ: number;
  baseScale: number;
}

export interface FloraController {
  root: THREE.Group;
  specimens: FloraSpecimenInfo[];
  interactables: THREE.Object3D[];
  rebuild: (seed: number, density: FloraDensity, growthStage: number) => void;
  setGrowthStage: (growthStage: number) => void;
  updateAnimation: (elapsed: number, windStrength: number, nightFactor: number) => void;
  setHighlightedSpecimen: (id: string | null) => void;
  dispose: () => void;
}

export function createFloraSystem(textures: ProceduralTextureSet): FloraController {
  const root = new THREE.Group();
  root.name = 'ProceduralFlora';

  let specimens: FloraSpecimenInfo[] = [];
  let interactables: THREE.Object3D[] = [];
  let animatedEntries: AnimatedFloraEntry[] = [];
  let mushroomCapMaterials: THREE.MeshStandardMaterial[] = [];
  let currentGeometries: THREE.BufferGeometry[] = [];
  let currentMaterials: THREE.Material[] = [];
  let highlightMap = new Map<string, THREE.Mesh[]>();
  let currentHighlightId: string | null = null;
  let currentGrowth = 0.88;

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    currentGeometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    currentMaterials.push(m);
    return m;
  };

  function registerSpecimen(
    group: THREE.Group,
    info: FloraSpecimenInfo,
    colliderRadius: number,
    colliderHeight: number
  ) {
    specimens.push(info);

    // Invisible simplified collider proxy on layer 1 for fast raycasting
    const colGeo = trackGeo(new THREE.CylinderGeometry(colliderRadius, colliderRadius * 1.1, colliderHeight, 8));
    colGeo.translate(0, colliderHeight / 2, 0);
    const colMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
    const collider = new THREE.Mesh(colGeo, colMat);
    collider.layers.set(1);
    collider.userData.specimenInfo = info;
    group.add(collider);
    interactables.push(collider);

    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child !== collider) {
        meshes.push(child as THREE.Mesh);
      }
    });
    highlightMap.set(info.id, meshes);
  }

  function clearCurrent() {
    while (root.children.length > 0) {
      root.remove(root.children[0]);
    }
    currentGeometries.forEach((g) => g.dispose());
    currentMaterials.forEach((m) => m.dispose());
    currentGeometries = [];
    currentMaterials = [];
    specimens = [];
    interactables = [];
    animatedEntries = [];
    mushroomCapMaterials = [];
    highlightMap.clear();
  }

  function createFernSpecimen(
    id: string,
    x: number,
    z: number,
    seed: number,
    rand: () => number
  ): THREE.Group {
    const group = new THREE.Group();
    const y = groundHeightAt(x, z, seed);
    group.position.set(x, y - 0.015, z);

    const stemMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b592d,
        roughness: 0.72,
        metalness: 0.02,
      })
    );
    const frondMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.fernAlbedo,
        color: new THREE.Color().setHSL(0.28 + (rand() - 0.5) * 0.04, 0.52, 0.42),
        roughness: 0.5,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
    );

    // Crown rhizome base
    const crownGeo = trackGeo(new THREE.DodecahedronGeometry(0.065, 1));
    crownGeo.scale(1.1, 0.7, 1.1);
    const crown = new THREE.Mesh(crownGeo, stemMat);
    crown.position.y = 0.02;
    group.add(crown);

    // Leaf pinna shape
    const pinnaShape = new THREE.Shape();
    pinnaShape.moveTo(0, 0);
    pinnaShape.quadraticCurveTo(0.045, 0.025, 0.095, 0.01);
    pinnaShape.quadraticCurveTo(0.045, -0.02, 0, 0);
    const pinnaGeo = trackGeo(new THREE.ShapeGeometry(pinnaShape, 5));

    const frondCount = 6 + Math.floor(rand() * 3);
    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const archLen = 0.42 + rand() * 0.24;
      const archH = 0.34 + rand() * 0.2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(Math.cos(angle) * archLen * 0.35, archH * 0.82, Math.sin(angle) * archLen * 0.35),
        new THREE.Vector3(Math.cos(angle) * archLen * 0.78, archH, Math.sin(angle) * archLen * 0.78),
        new THREE.Vector3(Math.cos(angle) * archLen, archH * 0.65, Math.sin(angle) * archLen),
      ]);
      const rachisGeo = trackGeo(new THREE.TubeGeometry(curve, 12, 0.009, 5, false));
      const rachis = new THREE.Mesh(rachisGeo, stemMat);
      rachis.castShadow = true;
      group.add(rachis);

      // Pairwise pinnae leaflets along the frond rachis
      const pairs = 6;
      for (let p = 1; p <= pairs; p++) {
        const t = 0.25 + (p / (pairs + 1)) * 0.72;
        const pt = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        const taper = Math.sin(t * Math.PI) * 1.15;

        for (const side of [-1, 1]) {
          const leaflet = new THREE.Mesh(pinnaGeo, frondMat);
          leaflet.position.copy(pt);
          leaflet.scale.set(0.75 * taper, 0.75 * taper, 1);
          leaflet.rotation.y = -angle + (side > 0 ? 0.3 : Math.PI - 0.3);
          leaflet.rotation.x = -0.35 + tangent.y * 0.5;
          leaflet.castShadow = true;
          leaflet.receiveShadow = true;
          group.add(leaflet);
        }
      }
    }

    // Coiled fiddlehead center shoot
    const coilCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0.02, 0.14, 0.01),
      new THREE.Vector3(0.05, 0.21, 0.02),
      new THREE.Vector3(0.02, 0.23, 0.01),
    ]);
    const coilGeo = trackGeo(new THREE.TubeGeometry(coilCurve, 10, 0.011, 5, false));
    const coil = new THREE.Mesh(coilGeo, stemMat);
    group.add(coil);

    registerSpecimen(
      group,
      {
        id,
        commonName: 'Maidenhair Fern',
        latinName: 'Adiantum raddianum',
        family: 'Pteridaceae',
        microclimate: 'Dappled Canopy · Shaded Moss Edge',
        hydration: 'High Moisture (75–90% RH)',
        elevationCm: Math.round((y - SOIL_BASE_Y) * 100) / 10,
        notes: 'Arching ebony rachis fronds thrive under steady mist cycles and indirect sunlight.',
      },
      0.34,
      0.55
    );

    return group;
  }

  function createBroadleafOrchid(
    id: string,
    x: number,
    z: number,
    seed: number,
    rand: () => number
  ): THREE.Group {
    const group = new THREE.Group();
    const y = groundHeightAt(x, z, seed);
    group.position.set(x, y - 0.015, z);

    const petioleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x39633c, roughness: 0.68 })
    );
    const leafMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: textures.leafAlbedo,
        roughness: 0.36,
        metalness: 0.02,
        clearcoat: 0.45,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
      })
    );
    const bloomMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf0d6c2,
        emissive: 0x26140c,
        roughness: 0.42,
      })
    );

    // Sculpted arched leaf blade using ShapeGeometry bent smoothly
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.11, 0.08, 0.14, 0.26, 0, 0.44);
    leafShape.bezierCurveTo(-0.14, 0.26, -0.11, 0.08, 0, 0);
    const leafGeo = trackGeo(new THREE.ShapeGeometry(leafShape, 12));
    // Curve the blade gently along its length
    const lPos = leafGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lPos.count; i++) {
      const ly = lPos.getY(i);
      const lx = lPos.getX(i);
      const bendZ = -Math.pow(ly / 0.44, 1.7) * 0.14;
      const cupZ = Math.abs(lx) * 0.24;
      lPos.setZ(i, bendZ + cupZ);
    }
    leafGeo.computeVertexNormals();

    const leafCount = 5 + Math.floor(rand() * 2);
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + rand() * 0.3;
      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(angle) * 0.07, 0.12, Math.sin(angle) * 0.07),
        new THREE.Vector3(Math.cos(angle) * 0.14, 0.21, Math.sin(angle) * 0.14),
      ]);
      const stemGeo = trackGeo(new THREE.TubeGeometry(stemCurve, 8, 0.012, 6, false));
      const stem = new THREE.Mesh(stemGeo, petioleMat);
      stem.castShadow = true;
      group.add(stem);

      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const tip = stemCurve.getPoint(1);
      leaf.position.copy(tip);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = -angle + Math.PI / 2;
      leaf.rotation.x = 0.72 + rand() * 0.24;
      const sc = 0.8 + rand() * 0.35;
      leaf.scale.setScalar(sc);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      group.add(leaf);
    }

    // Central jewel orchid flower spike with 3 miniature blossoms
    const spikeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.03, 0.28, 0.02),
      new THREE.Vector3(0.07, 0.56, -0.02),
    ]);
    const spikeGeo = trackGeo(new THREE.TubeGeometry(spikeCurve, 10, 0.01, 5, false));
    const spike = new THREE.Mesh(spikeGeo, petioleMat);
    spike.castShadow = true;
    group.add(spike);

    const petalGeo = trackGeo(new THREE.SphereGeometry(0.03, 8, 6));
    petalGeo.scale(1.2, 0.65, 0.8);
    for (let b = 0; b < 3; b++) {
      const bt = 0.68 + b * 0.15;
      const pos = spikeCurve.getPoint(bt);
      const blossom = new THREE.Mesh(petalGeo, bloomMat);
      blossom.position.copy(pos);
      blossom.position.x += (b % 2 === 0 ? 1 : -1) * 0.025;
      group.add(blossom);
    }

    registerSpecimen(
      group,
      {
        id,
        commonName: 'Jewel Broadleaf Orchid',
        latinName: 'Ludisia discolor',
        family: 'Orchidaceae',
        microclimate: 'Warm Terraced Loam · Filtered Light',
        hydration: 'Moderate Dew (65–80% RH)',
        elevationCm: Math.round((y - SOIL_BASE_Y) * 100) / 10,
        notes: 'Velvety veined foliage with waxy cuticles that bead condensation droplets.',
      },
      0.35,
      0.6
    );

    return group;
  }

  function createBonsaiTree(
    id: string,
    x: number,
    z: number,
    seed: number,
    rand: () => number
  ): THREE.Group {
    const group = new THREE.Group();
    const y = groundHeightAt(x, z, seed);
    group.position.set(x, y - 0.02, z);

    const barkMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.barkAlbedo,
        bumpMap: textures.barkBump,
        bumpScale: 0.025,
        roughness: 0.88,
        metalness: 0.02,
      })
    );

    // 1. Gnarled main trunk + buttress roots
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.08, 0.28, 0.04),
      new THREE.Vector3(0.06, 0.58, -0.05),
      new THREE.Vector3(0.14, 0.86, 0.03),
      new THREE.Vector3(0.04, 1.12, 0.08),
    ]);
    const trunkGeo = trackGeo(new THREE.TubeGeometry(trunkCurve, 18, 0.068, 8, false));
    // Taper trunk vertices from root flare to crown
    const tPos = trunkGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tPos.count; i++) {
      const py = tPos.getY(i);
      const t = THREE.MathUtils.clamp(py / 1.12, 0, 1);
      const taper = 1.18 - t * 0.68;
      const center = trunkCurve.getPoint(t);
      tPos.setX(i, center.x + (tPos.getX(i) - center.x) * taper);
      tPos.setZ(i, center.z + (tPos.getZ(i) - center.z) * taper);
    }
    trunkGeo.computeVertexNormals();
    const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    group.add(trunkMesh);

    // Exposed surface root buttresses
    for (let r = 0; r < 3; r++) {
      const ra = (r / 3) * Math.PI * 2 + 0.4;
      const rootCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.11, 0),
        new THREE.Vector3(Math.cos(ra) * 0.13, 0.04, Math.sin(ra) * 0.13),
        new THREE.Vector3(Math.cos(ra) * 0.24, -0.02, Math.sin(ra) * 0.24),
      ]);
      const rGeo = trackGeo(new THREE.TubeGeometry(rootCurve, 8, 0.024, 6, false));
      const rMesh = new THREE.Mesh(rGeo, barkMat);
      rMesh.castShadow = true;
      group.add(rMesh);
    }

    // 2. Secondary branches + layered bonsai foliage pads
    const branchSpecs = [
      { startT: 0.48, end: new THREE.Vector3(-0.34, 0.72, 0.16), padScale: 0.24 },
      { startT: 0.68, end: new THREE.Vector3(0.38, 0.94, -0.14), padScale: 0.22 },
      { startT: 0.82, end: new THREE.Vector3(-0.18, 1.08, -0.24), padScale: 0.21 },
      { startT: 1.0, end: new THREE.Vector3(0.06, 1.24, 0.1), padScale: 0.29 },
    ];

    const foliageColors = [0x2a5c34, 0x366d3d, 0x457d44];

    branchSpecs.forEach((b, idx) => {
      const origin = trunkCurve.getPoint(b.startT);
      const mid = origin.clone().lerp(b.end, 0.5);
      mid.y += 0.06;
      const bCurve = new THREE.CatmullRomCurve3([origin, mid, b.end]);
      const bGeo = trackGeo(new THREE.TubeGeometry(bCurve, 10, 0.025, 6, false));
      const bMesh = new THREE.Mesh(bGeo, barkMat);
      bMesh.castShadow = true;
      group.add(bMesh);

      // Foliage pad composed of 3 overlapping organic icosahedron clusters
      const padMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: foliageColors[idx % foliageColors.length],
          roughness: 0.62,
          metalness: 0.01,
        })
      );

      for (let c = 0; c < 3; c++) {
        const puffGeo = trackGeo(new THREE.IcosahedronGeometry(b.padScale * (0.72 + c * 0.12), 1));
        puffGeo.scale(1.35, 0.58, 1.25);
        const puff = new THREE.Mesh(puffGeo, padMat);
        puff.position.copy(b.end);
        puff.position.x += (c - 1) * b.padScale * 0.45 + (rand() - 0.5) * 0.04;
        puff.position.y += (c === 1 ? 0.05 : -0.02);
        puff.position.z += (rand() - 0.5) * 0.14;
        puff.rotation.y = rand() * Math.PI;
        puff.castShadow = true;
        puff.receiveShadow = true;
        group.add(puff);
      }
    });

    registerSpecimen(
      group,
      {
        id,
        commonName: 'Dwarf Hinoki Bonsai',
        latinName: 'Chamaecyparis obtusa',
        family: 'Cupressaceae',
        microclimate: 'Upper Moss Terrace · Primary Canopy',
        hydration: 'Balanced Mist (60–75% RH)',
        elevationCm: Math.round((y - SOIL_BASE_Y) * 100) / 10,
        notes: 'Hero canopy specimen anchoring the upper ridge with sculpted foliage clouds.',
      },
      0.42,
      1.35
    );

    return group;
  }

  function createMushroomCluster(
    id: string,
    x: number,
    z: number,
    seed: number,
    rand: () => number
  ): THREE.Group {
    const group = new THREE.Group();
    const y = groundHeightAt(x, z, seed);
    group.position.set(x, y - 0.01, z);

    const stemMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdbeee4,
        roughness: 0.45,
        metalness: 0.0,
      })
    );

    const capMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7be0c8,
        emissive: new THREE.Color(0x2ce8c2),
        emissiveIntensity: 0.18,
        roughness: 0.34,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
    );
    mushroomCapMaterials.push(capMat);

    // Lathe bell cap profile
    const capProfile = [
      new THREE.Vector2(0.0, 0.052),
      new THREE.Vector2(0.025, 0.048),
      new THREE.Vector2(0.052, 0.025),
      new THREE.Vector2(0.068, 0.0),
      new THREE.Vector2(0.055, 0.004),
      new THREE.Vector2(0.012, 0.022),
      new THREE.Vector2(0.0, 0.024),
    ];
    const capGeo = trackGeo(new THREE.LatheGeometry(capProfile, 16));

    const count = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
      const dist = i === 0 ? 0 : 0.05 + rand() * 0.06;
      const h = (i === 0 ? 0.22 : 0.11 + rand() * 0.09);
      const leanX = Math.cos(angle) * dist * 1.4;
      const leanZ = Math.sin(angle) * dist * 1.4;

      const sCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(angle) * dist * 0.4, 0, Math.sin(angle) * dist * 0.4),
        new THREE.Vector3(leanX * 0.7, h * 0.55, leanZ * 0.7),
        new THREE.Vector3(leanX, h, leanZ),
      ]);
      const sGeo = trackGeo(new THREE.TubeGeometry(sCurve, 8, 0.009, 6, false));
      const stem = new THREE.Mesh(sGeo, stemMat);
      stem.castShadow = true;
      group.add(stem);

      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(leanX, h - 0.012, leanZ);
      const sc = i === 0 ? 1.15 : 0.65 + rand() * 0.35;
      cap.scale.setScalar(sc);
      cap.rotation.z = -leanX * 1.5;
      cap.rotation.x = leanZ * 1.5;
      cap.castShadow = true;
      group.add(cap);
    }

    registerSpecimen(
      group,
      {
        id,
        commonName: 'Bioluminescent Mycena',
        latinName: 'Mycena chlorophos',
        family: 'Mycenaceae',
        microclimate: 'Damp Pond Bank · Twilight Bio-Glow',
        hydration: 'Saturated (85–95% RH)',
        elevationCm: Math.round((y - SOIL_BASE_Y) * 100) / 10,
        notes: 'Saprotrophic micro-fungi emitting a soft cyan-emerald luminescence after dusk.',
      },
      0.18,
      0.28
    );

    return group;
  }

  function createHardscapeElements(seed: number, rand: () => number) {
    // Sculpted river slate boulders
    const rockMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4b5350,
        roughness: 0.78,
        metalness: 0.08,
        flatShading: true,
      })
    );

    const rockPositions = [
      { x: -0.15, z: 0.32, s: 0.24 },
      { x: 0.26, z: 0.88, s: 0.18 },
      { x: 1.06, z: 0.15, s: 0.21 },
      { x: -0.95, z: -0.15, s: 0.22 },
      { x: 0.12, z: -0.92, s: 0.26 },
    ];

    rockPositions.forEach((rp, idx) => {
      const rGeo = trackGeo(new THREE.DodecahedronGeometry(rp.s, 1));
      const pos = rGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const n = 0.82 + 0.32 * Math.sin(vx * 9 + idx) * Math.cos(vz * 8 - idx);
        pos.setXYZ(i, vx * n * 1.2, vy * 0.72 * n, vz * n);
      }
      rGeo.computeVertexNormals();
      const rock = new THREE.Mesh(rGeo, rockMat);
      const ry = groundHeightAt(rp.x, rp.z, seed);
      rock.position.set(rp.x, ry + rp.s * 0.18, rp.z);
      rock.rotation.y = rand() * Math.PI * 2;
      rock.castShadow = true;
      rock.receiveShadow = true;
      root.add(rock);
    });

    // Driftwood arch bridging near the pond bank
    const woodMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.barkAlbedo,
        bumpMap: textures.barkBump,
        bumpScale: 0.02,
        color: 0x7b6a58,
        roughness: 0.84,
      })
    );
    const driftCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, groundHeightAt(-0.08, 0.22, seed) - 0.02, 0.22),
      new THREE.Vector3(0.24, groundHeightAt(0.24, 0.1, seed) + 0.26, 0.1),
      new THREE.Vector3(0.68, groundHeightAt(0.68, -0.12, seed) + 0.14, -0.12),
      new THREE.Vector3(0.95, groundHeightAt(0.95, -0.28, seed) - 0.03, -0.28),
    ]);
    const driftGeo = trackGeo(new THREE.TubeGeometry(driftCurve, 18, 0.052, 7, false));
    const driftMesh = new THREE.Mesh(driftGeo, woodMat);
    driftMesh.castShadow = true;
    driftMesh.receiveShadow = true;
    root.add(driftMesh);
  }

  function createInstancedMossAndPebbles(
    seed: number,
    density: FloraDensity,
    rand: () => number
  ) {
    // 1. Instanced Velvet Moss Cushions (> 60 repeated organic mounds)
    const mossCount = density === 'lush' ? 110 : density === 'balanced' ? 75 : 42;
    const mossGeo = trackGeo(new THREE.IcosahedronGeometry(0.11, 1));
    mossGeo.scale(1.25, 0.45, 1.15);
    const mossMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.0,
      })
    );
    const mossInstanced = new THREE.InstancedMesh(mossGeo, mossMat, mossCount);
    mossInstanced.castShadow = true;
    mossInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let attempts = 0;

    while (placed < mossCount && attempts < mossCount * 5) {
      attempts++;
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 1.66;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = groundHeightAt(x, z, seed);

      // Keep moss out of deep pond water
      const pondDist = Math.hypot(x - POND_CENTER_X, z - POND_CENTER_Z);
      if (pondDist < 0.56) continue;

      dummy.position.set(x, y - 0.01, z);
      dummy.rotation.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2);
      const sc = 0.85 + rand() * 0.45; // ±15%+ organic scale variation
      dummy.scale.set(sc * (0.9 + rand() * 0.2), sc * (0.8 + rand() * 0.35), sc);
      dummy.updateMatrix();
      mossInstanced.setMatrixAt(placed, dummy.matrix);

      color.setHSL(0.27 + (rand() - 0.5) * 0.05, 0.46 + rand() * 0.18, 0.24 + rand() * 0.14);
      mossInstanced.setColorAt(placed, color);
      placed++;
    }
    mossInstanced.count = placed;
    mossInstanced.instanceMatrix.needsUpdate = true;
    if (mossInstanced.instanceColor) mossInstanced.instanceColor.needsUpdate = true;
    mossInstanced.computeBoundingSphere();
    root.add(mossInstanced);

    // 2. Instanced River Pebbles lining the pond rim & drainage edge
    const pebbleCount = 54;
    const pebbleGeo = trackGeo(new THREE.DodecahedronGeometry(0.042, 1));
    pebbleGeo.scale(1.3, 0.55, 1.0);
    const pebbleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.06,
      })
    );
    const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
    pebbleInst.receiveShadow = true;

    for (let i = 0; i < pebbleCount; i++) {
      const a = (i / pebbleCount) * Math.PI * 2 + (rand() - 0.5) * 0.22;
      const rad = 0.48 + rand() * 0.24;
      const x = POND_CENTER_X + Math.cos(a) * rad * 0.98;
      const z = POND_CENTER_Z + Math.sin(a) * rad * 0.84;
      const y = groundHeightAt(x, z, seed);
      dummy.position.set(x, y + 0.005, z);
      dummy.rotation.set(rand() * 0.3, rand() * Math.PI, rand() * 0.3);
      const ps = 0.75 + rand() * 0.65;
      dummy.scale.setScalar(ps);
      dummy.updateMatrix();
      pebbleInst.setMatrixAt(i, dummy.matrix);
      const shade = 0.28 + rand() * 0.25;
      color.setRGB(shade * 1.02, shade, shade * 0.96);
      pebbleInst.setColorAt(i, color);
    }
    pebbleInst.instanceMatrix.needsUpdate = true;
    if (pebbleInst.instanceColor) pebbleInst.instanceColor.needsUpdate = true;
    pebbleInst.computeBoundingSphere();
    root.add(pebbleInst);
  }

  const rebuild = (seed: number, density: FloraDensity, growthStage: number) => {
    clearCurrent();
    currentGrowth = growthStage;
    const rand = mulberry32(seed);

    createHardscapeElements(seed, rand);
    createInstancedMossAndPebbles(seed, density, rand);

    // 1. Hero Dwarf Hinoki Bonsai anchored on the upper moss terrace
    const bonsaiX = -0.58 + (rand() - 0.5) * 0.16;
    const bonsaiZ = -0.45 + (rand() - 0.5) * 0.16;
    const bonsai = createBonsaiTree('specimen-bonsai', bonsaiX, bonsaiZ, seed, rand);
    bonsai.rotation.y = rand() * Math.PI * 2;
    bonsai.scale.setScalar(growthStage);
    root.add(bonsai);
    animatedEntries.push({
      group: bonsai,
      phase: rand() * Math.PI * 2,
      swayAmp: 0.012,
      baseRotX: 0,
      baseRotZ: 0,
      baseScale: 1,
    });

    // 2. Maidenhair Ferns
    const fernSlots =
      density === 'lush'
        ? [
            { x: 0.55, z: -0.75 },
            { x: -1.15, z: 0.32 },
            { x: -0.18, z: -1.05 },
            { x: 1.08, z: -0.32 },
          ]
        : density === 'balanced'
          ? [
              { x: 0.55, z: -0.72 },
              { x: -1.08, z: 0.32 },
              { x: 1.05, z: -0.26 },
            ]
          : [
              { x: 0.55, z: -0.72 },
              { x: -1.05, z: 0.32 },
            ];

    fernSlots.forEach((slot, idx) => {
      const fx = slot.x + (rand() - 0.5) * 0.18;
      const fz = slot.z + (rand() - 0.5) * 0.18;
      const fern = createFernSpecimen(`specimen-fern-${idx}`, fx, fz, seed, rand);
      const sc = 0.88 + rand() * 0.28;
      fern.scale.setScalar(sc * growthStage);
      root.add(fern);
      animatedEntries.push({
        group: fern,
        phase: rand() * Math.PI * 2,
        swayAmp: 0.028,
        baseRotX: 0,
        baseRotZ: 0,
        baseScale: sc,
      });
    });

    // 3. Jewel Broadleaf Orchids
    const orchidSlots =
      density === 'lush'
        ? [
            { x: -0.58, z: 0.84 },
            { x: 0.18, z: 1.15 },
            { x: -1.2, z: -0.45 },
          ]
        : density === 'balanced'
          ? [
              { x: -0.56, z: 0.84 },
              { x: -1.16, z: -0.44 },
            ]
          : [{ x: -0.56, z: 0.84 }];

    orchidSlots.forEach((slot, idx) => {
      const ox = slot.x + (rand() - 0.5) * 0.14;
      const oz = slot.z + (rand() - 0.5) * 0.14;
      const orchid = createBroadleafOrchid(`specimen-orchid-${idx}`, ox, oz, seed, rand);
      const sc = 0.9 + rand() * 0.24;
      orchid.scale.setScalar(sc * growthStage);
      root.add(orchid);
      animatedEntries.push({
        group: orchid,
        phase: rand() * Math.PI * 2,
        swayAmp: 0.02,
        baseRotX: 0,
        baseRotZ: 0,
        baseScale: sc,
      });
    });

    // 4. Bioluminescent Mycena Mushroom Clusters near pond damp bank
    const mushSlots = [
      { x: 0.12, z: 0.44 },
      { x: 1.18, z: 0.72 },
    ];
    mushSlots.forEach((slot, idx) => {
      const mx = slot.x + (rand() - 0.5) * 0.1;
      const mz = slot.z + (rand() - 0.5) * 0.1;
      const mush = createMushroomCluster(`specimen-mushroom-${idx}`, mx, mz, seed, rand);
      const sc = 0.95 + rand() * 0.2;
      mush.scale.setScalar(sc * growthStage);
      root.add(mush);
      animatedEntries.push({
        group: mush,
        phase: rand() * Math.PI * 2,
        swayAmp: 0.015,
        baseRotX: 0,
        baseRotZ: 0,
        baseScale: sc,
      });
    });
  };

  const setGrowthStage = (growthStage: number) => {
    currentGrowth = growthStage;
    for (let i = 0; i < animatedEntries.length; i++) {
      const entry = animatedEntries[i];
      entry.group.scale.setScalar(entry.baseScale * currentGrowth);
    }
  };

  const updateAnimation = (elapsed: number, windStrength: number, nightFactor: number) => {
    // Gentle breeze sway across all flora (zero allocations)
    const ampScale = 0.55 + windStrength * 1.8;
    for (let i = 0; i < animatedEntries.length; i++) {
      const entry = animatedEntries[i];
      const waveA = Math.sin(elapsed * 1.45 + entry.phase);
      const waveB = Math.cos(elapsed * 1.05 + entry.phase * 1.3);
      entry.group.rotation.z = entry.baseRotZ + waveA * entry.swayAmp * ampScale;
      entry.group.rotation.x = entry.baseRotX + waveB * entry.swayAmp * 0.65 * ampScale;
    }

    // Bioluminescence swells smoothly at twilight and night
    const glow = 0.1 + nightFactor * 1.35 + Math.sin(elapsed * 1.8) * 0.12 * nightFactor;
    for (let i = 0; i < mushroomCapMaterials.length; i++) {
      mushroomCapMaterials[i].emissiveIntensity = glow;
    }
  };

  const setHighlightedSpecimen = (id: string | null) => {
    if (currentHighlightId && highlightMap.has(currentHighlightId)) {
      highlightMap.get(currentHighlightId)!.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive && !mushroomCapMaterials.includes(mat)) {
          mat.emissive.setHex(0x000000);
        }
      });
    }
    currentHighlightId = id;
    if (id && highlightMap.has(id)) {
      highlightMap.get(id)!.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive && !mushroomCapMaterials.includes(mat)) {
          mat.emissive.setHex(0x1f4d35);
        }
      });
    }
  };

  const dispose = () => {
    clearCurrent();
  };

  return {
    root,
    get specimens() {
      return specimens;
    },
    get interactables() {
      return interactables;
    },
    rebuild,
    setGrowthStage,
    updateAnimation,
    setHighlightedSpecimen,
    dispose,
  };
}
