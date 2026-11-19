import * as THREE from 'three';
import {
  GLASS_WALL_TOP_Y,
  groundHeightAt,
  PLINTH_TOP_Y,
  POND_CENTER_X,
  POND_CENTER_Z,
  ROOF_APEX_Y,
  SOIL_BASE_Y,
  TERRARIUM_RADIUS_INNER,
  TERRARIUM_RADIUS_OUTER,
  WATER_LEVEL_Y,
} from './math';
import type { ProceduralTextureSet } from './textures';

export interface VesselController {
  root: THREE.Group;
  glassGroup: THREE.Group;
  ventLidGroup: THREE.Group;
  waterMaterial: THREE.MeshPhysicalMaterial;
  glassMaterial: THREE.MeshPhysicalMaterial;
  updateTerrainForSeed: (seed: number) => void;
  updateAnimation: (
    elapsed: number,
    rainIntensity: number,
    humidityRatio: number,
    ventOpenRatio: number,
    nightFactor: number
  ) => void;
  setGlassVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createTerrariumVessel(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
  initialSeed: number
): VesselController {
  const root = new THREE.Group();
  root.name = 'WardianTerrariumVessel';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  // Shared studio tabletop surface & contact shadow
  const tableGeo = new THREE.CircleGeometry(18, 64);
  tableGeo.rotateX(-Math.PI / 2);
  const tableMat = new THREE.MeshStandardMaterial({
    color: 0x101714,
    roughness: 0.88,
    metalness: 0.06,
  });
  const tableMesh = new THREE.Mesh(tableGeo, tableMat);
  tableMesh.position.y = -0.002;
  tableMesh.receiveShadow = true;
  root.add(tableMesh);
  geometriesToDispose.push(tableGeo);
  materialsToDispose.push(tableMat);

  // Soft radial contact shadow plane directly beneath the walnut pedestal
  const shadowGeo = new THREE.PlaneGeometry(5.6, 5.6);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.58,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.004;
  root.add(shadowPlane);
  geometriesToDispose.push(shadowGeo);
  materialsToDispose.push(shadowMat);

  // 1. Turned Walnut Pedestal Plinth (LatheGeometry)
  const plinthPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(2.38, 0.0),
    new THREE.Vector2(2.42, 0.06),
    new THREE.Vector2(2.34, 0.14),
    new THREE.Vector2(2.26, 0.19),
    new THREE.Vector2(2.28, 0.28),
    new THREE.Vector2(2.18, PLINTH_TOP_Y),
    new THREE.Vector2(0.0, PLINTH_TOP_Y),
  ];
  const walnutGeo = new THREE.LatheGeometry(plinthPoints, 8);
  walnutGeo.rotateY(Math.PI / 8);
  const walnutMat = new THREE.MeshStandardMaterial({
    map: textures.walnutAlbedo,
    roughness: 0.56,
    metalness: 0.05,
  });
  const walnutMesh = new THREE.Mesh(walnutGeo, walnutMat);
  walnutMesh.castShadow = true;
  walnutMesh.receiveShadow = true;
  root.add(walnutMesh);
  geometriesToDispose.push(walnutGeo);
  materialsToDispose.push(walnutMat);

  // 2. Anisotropic Brushed Brass Rim Collar & Base Trim
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb99352,
    metalness: 0.92,
    roughness: 0.22,
    anisotropy: 0.8,
    anisotropyRotation: Math.PI / 4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  });
  materialsToDispose.push(brassMat);

  const darkBrassMat = new THREE.MeshStandardMaterial({
    color: 0x5c4727,
    metalness: 0.86,
    roughness: 0.38,
  });
  materialsToDispose.push(darkBrassMat);

  const brassCollarPoints = [
    new THREE.Vector2(2.16, PLINTH_TOP_Y - 0.02),
    new THREE.Vector2(2.23, PLINTH_TOP_Y + 0.01),
    new THREE.Vector2(2.22, PLINTH_TOP_Y + 0.065),
    new THREE.Vector2(2.13, PLINTH_TOP_Y + 0.065),
    new THREE.Vector2(2.13, PLINTH_TOP_Y - 0.02),
  ];
  const brassCollarGeo = new THREE.LatheGeometry(brassCollarPoints, 8);
  brassCollarGeo.rotateY(Math.PI / 8);
  const brassCollar = new THREE.Mesh(brassCollarGeo, brassMat);
  brassCollar.castShadow = true;
  brassCollar.receiveShadow = true;
  root.add(brassCollar);
  geometriesToDispose.push(brassCollarGeo);

  // Brass Nameplate Plaque on front face of plinth
  const plaqueGeo = new THREE.BoxGeometry(0.68, 0.14, 0.03);
  const plaqueMesh = new THREE.Mesh(plaqueGeo, brassMat);
  plaqueMesh.position.set(0, 0.16, 2.13);
  root.add(plaqueMesh);
  geometriesToDispose.push(plaqueGeo);

  // 3. Stratified Substrate Layers (Gravel -> Charcoal -> Topsoil)
  // Gravel band
  const gravelGeo = new THREE.CylinderGeometry(
    TERRARIUM_RADIUS_INNER,
    TERRARIUM_RADIUS_INNER + 0.03,
    0.18,
    8
  );
  gravelGeo.rotateY(Math.PI / 8);
  const gravelMat = new THREE.MeshStandardMaterial({
    map: textures.gravelAlbedo,
    roughness: 0.88,
    metalness: 0.02,
  });
  const gravelMesh = new THREE.Mesh(gravelGeo, gravelMat);
  gravelMesh.position.y = PLINTH_TOP_Y + 0.09;
  gravelMesh.receiveShadow = true;
  root.add(gravelMesh);
  geometriesToDispose.push(gravelGeo);
  materialsToDispose.push(gravelMat);

  // Activated Charcoal Band
  const charcoalGeo = new THREE.CylinderGeometry(
    TERRARIUM_RADIUS_INNER - 0.01,
    TERRARIUM_RADIUS_INNER,
    0.07,
    8
  );
  charcoalGeo.rotateY(Math.PI / 8);
  const charcoalMat = new THREE.MeshStandardMaterial({
    color: 0x1b1d1c,
    roughness: 0.94,
    metalness: 0.04,
  });
  const charcoalMesh = new THREE.Mesh(charcoalGeo, charcoalMat);
  charcoalMesh.position.y = PLINTH_TOP_Y + 0.215;
  charcoalMesh.receiveShadow = true;
  root.add(charcoalMesh);
  geometriesToDispose.push(charcoalGeo);
  materialsToDispose.push(charcoalMat);

  // Sculpted Loam Terrain Mesh (Octagonal disk with radial subdivisions)
  const terrainGeo = new THREE.CylinderGeometry(
    TERRARIUM_RADIUS_INNER - 0.01,
    TERRARIUM_RADIUS_INNER - 0.01,
    0.26,
    40,
    1,
    false
  );
  // Also build a high-resolution top terrain surface clipped to the octagonal perimeter
  const radialRings = 28;
  const angularSegs = 48;
  const terrainTopGeo = new THREE.RingGeometry(0.001, TERRARIUM_RADIUS_INNER, angularSegs, radialRings);
  terrainTopGeo.rotateX(-Math.PI / 2);

  // Clip circular perimeter into octagon shape
  const posAttr = terrainTopGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.0001) {
      const angle = Math.atan2(z, x);
      const sector = Math.PI / 4;
      const offsetAngle = ((angle % sector) + sector) % sector - sector / 2;
      const octScale = Math.cos(sector / 2) / Math.cos(offsetAngle);
      const maxR = (TERRARIUM_RADIUS_INNER - 0.02) * octScale;
      const t = Math.min(1, r / TERRARIUM_RADIUS_INNER);
      const newR = t * maxR;
      posAttr.setX(i, Math.cos(angle) * newR);
      posAttr.setZ(i, Math.sin(angle) * newR);
    }
  }

  // Soil sidewall skirt connecting charcoal band up to terrain edge
  const skirtGeo = new THREE.CylinderGeometry(
    TERRARIUM_RADIUS_INNER - 0.02,
    TERRARIUM_RADIUS_INNER - 0.01,
    0.22,
    8,
    1,
    true
  );
  skirtGeo.rotateY(Math.PI / 8);

  const soilMat = new THREE.MeshStandardMaterial({
    map: textures.soilAlbedo,
    bumpMap: textures.soilBump,
    bumpScale: 0.035,
    roughness: 0.9,
    metalness: 0.01,
  });
  materialsToDispose.push(soilMat);

  const skirtMesh = new THREE.Mesh(skirtGeo, soilMat);
  skirtMesh.position.y = PLINTH_TOP_Y + 0.36;
  skirtMesh.receiveShadow = true;
  root.add(skirtMesh);
  geometriesToDispose.push(skirtGeo);

  const terrainMesh = new THREE.Mesh(terrainTopGeo, soilMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  root.add(terrainMesh);
  geometriesToDispose.push(terrainTopGeo);
  geometriesToDispose.push(terrainGeo);

  const updateTerrainForSeed = (seed: number) => {
    const p = terrainTopGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = groundHeightAt(x, z, seed);
      p.setY(i, y);
    }
    p.needsUpdate = true;
    terrainTopGeo.computeVertexNormals();
    terrainTopGeo.computeBoundingSphere();
  };
  updateTerrainForSeed(initialSeed);

  // 4. Micro-Pond Water Surface (MeshPhysicalMaterial + onBeforeCompile animated ripples)
  const waterGeo = new THREE.CircleGeometry(0.68, 40);
  waterGeo.rotateX(-Math.PI / 2);
  // Subtle elliptical pond footprint
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wPos.count; i++) {
    wPos.setX(i, wPos.getX(i) * 0.98);
    wPos.setZ(i, wPos.getZ(i) * 0.84);
  }
  waterGeo.computeVertexNormals();

  const waterUniforms = {
    uTime: { value: 0 },
    uRainStrength: { value: 0 },
  };

  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1d4b4a,
    roughness: 0.07,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.84,
    ior: 1.333,
    reflectivity: 0.9,
  });

  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uRainStrength = waterUniforms.uRainStrength;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uRainStrength;\nvarying vec2 vWaterUv;\n` +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWaterUv = uv;
      float d1 = length(position.xz);
      float d2 = length(position.xz - vec2(0.18, -0.14));
      float d3 = length(position.xz - vec2(-0.2, 0.16));
      float ambientWave = sin(d1 * 18.0 - uTime * 2.2) * 0.0025;
      float rainDrop1 = sin(d2 * 38.0 - uTime * 9.5) * exp(-d2 * 3.8) * 0.009 * uRainStrength;
      float rainDrop2 = sin(d3 * 34.0 - uTime * 8.2 + 2.1) * exp(-d3 * 3.5) * 0.008 * uRainStrength;
      transformed.y += ambientWave + rainDrop1 + rainDrop2;
      `
    );
    shader.fragmentShader =
      `uniform float uTime;\nuniform float uRainStrength;\nvarying vec2 vWaterUv;\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float edgeDist = length(vWaterUv - vec2(0.5)) * 2.0;
      float rippleRing = sin(edgeDist * 26.0 - uTime * 7.0) * 0.5 + 0.5;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.72, 0.72), rippleRing * 0.12 * uRainStrength);
      `
    );
  };

  const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
  waterMesh.position.set(POND_CENTER_X, WATER_LEVEL_Y, POND_CENTER_Z);
  waterMesh.receiveShadow = true;
  root.add(waterMesh);
  geometriesToDispose.push(waterGeo);
  materialsToDispose.push(waterMaterial);

  // 5. Octagonal Brass Frame & Optical Glass Conservatory Enclosure
  const glassGroup = new THREE.Group();
  glassGroup.name = 'GlassEnclosure';
  root.add(glassGroup);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe6f2ef,
    metalness: 0.0,
    roughness: 0.06,
    roughnessMap: textures.condensationRoughness,
    transmission: isSoftwareGl ? 0 : 0.93,
    transparent: true,
    opacity: isSoftwareGl ? 0.24 : 1.0,
    ior: 1.52,
    thickness: 0.32,
    attenuationColor: new THREE.Color(0xdcf0e8),
    attenuationDistance: 4.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materialsToDispose.push(glassMaterial);

  const sides = 8;
  const wallHeight = GLASS_WALL_TOP_Y - PLINTH_TOP_Y;
  const cornerRadius = TERRARIUM_RADIUS_OUTER;
  const wallFaceWidth = 2 * cornerRadius * Math.sin(Math.PI / sides);
  const apothem = cornerRadius * Math.cos(Math.PI / sides);

  // 8 Corner Mullion Posts + 8 Wall Glass Panes + 8 Roof Ribs + 8 Triangular Roof Glass Panes
  const mullionGeo = new THREE.CylinderGeometry(0.032, 0.038, wallHeight + 0.06, 8);
  const paneGeo = new THREE.PlaneGeometry(wallFaceWidth - 0.04, wallHeight - 0.04);
  geometriesToDispose.push(mullionGeo, paneGeo);

  const eavesRingPoints = [
    new THREE.Vector2(cornerRadius - 0.1, GLASS_WALL_TOP_Y - 0.03),
    new THREE.Vector2(cornerRadius + 0.05, GLASS_WALL_TOP_Y),
    new THREE.Vector2(cornerRadius + 0.03, GLASS_WALL_TOP_Y + 0.07),
    new THREE.Vector2(cornerRadius - 0.1, GLASS_WALL_TOP_Y + 0.04),
  ];
  const eavesGeo = new THREE.LatheGeometry(eavesRingPoints, 8);
  eavesGeo.rotateY(Math.PI / 8);
  const eavesMesh = new THREE.Mesh(eavesGeo, brassMat);
  eavesMesh.castShadow = true;
  glassGroup.add(eavesMesh);
  geometriesToDispose.push(eavesGeo);

  // Roof apex brass ring (where the vent cap sits)
  const apexRadius = 0.42;
  const apexRingGeo = new THREE.TorusGeometry(apexRadius, 0.035, 10, 8);
  apexRingGeo.rotateX(Math.PI / 2);
  apexRingGeo.rotateY(Math.PI / 8);
  const apexRingMesh = new THREE.Mesh(apexRingGeo, brassMat);
  apexRingMesh.position.y = ROOF_APEX_Y - 0.16;
  glassGroup.add(apexRingMesh);
  geometriesToDispose.push(apexRingGeo);

  for (let i = 0; i < sides; i++) {
    const cornerAngle = (i * Math.PI * 2) / sides + Math.PI / sides;
    const faceAngle = (i * Math.PI * 2) / sides;

    // Corner vertical brass mullion
    const mullion = new THREE.Mesh(mullionGeo, brassMat);
    mullion.position.set(
      Math.cos(cornerAngle) * cornerRadius,
      PLINTH_TOP_Y + wallHeight / 2,
      Math.sin(cornerAngle) * cornerRadius
    );
    mullion.castShadow = true;
    glassGroup.add(mullion);

    // Wall glass pane
    const pane = new THREE.Mesh(paneGeo, glassMaterial);
    pane.position.set(
      Math.cos(faceAngle) * apothem,
      PLINTH_TOP_Y + wallHeight / 2,
      Math.sin(faceAngle) * apothem
    );
    pane.rotation.y = -faceAngle + Math.PI / 2;
    pane.renderOrder = 10;
    glassGroup.add(pane);

    // Diagonal brass roof rib from corner up to apex ring
    const startVec = new THREE.Vector3(
      Math.cos(cornerAngle) * cornerRadius,
      GLASS_WALL_TOP_Y + 0.03,
      Math.sin(cornerAngle) * cornerRadius
    );
    const endVec = new THREE.Vector3(
      Math.cos(cornerAngle) * apexRadius,
      ROOF_APEX_Y - 0.16,
      Math.sin(cornerAngle) * apexRadius
    );
    const ribLen = startVec.distanceTo(endVec);
    const ribGeo = new THREE.CylinderGeometry(0.022, 0.028, ribLen, 6);
    geometriesToDispose.push(ribGeo);
    const rib = new THREE.Mesh(ribGeo, brassMat);
    rib.position.copy(startVec).lerp(endVec, 0.5);
    rib.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      endVec.clone().sub(startVec).normalize()
    );
    rib.castShadow = true;
    glassGroup.add(rib);

    // Trapezoidal roof glass panel between adjacent ribs
    const nextCornerAngle = ((i + 1) * Math.PI * 2) / sides + Math.PI / sides;
    const b1 = new THREE.Vector3(
      Math.cos(cornerAngle) * (cornerRadius - 0.02),
      GLASS_WALL_TOP_Y + 0.03,
      Math.sin(cornerAngle) * (cornerRadius - 0.02)
    );
    const b2 = new THREE.Vector3(
      Math.cos(nextCornerAngle) * (cornerRadius - 0.02),
      GLASS_WALL_TOP_Y + 0.03,
      Math.sin(nextCornerAngle) * (cornerRadius - 0.02)
    );
    const t2 = new THREE.Vector3(
      Math.cos(nextCornerAngle) * apexRadius,
      ROOF_APEX_Y - 0.16,
      Math.sin(nextCornerAngle) * apexRadius
    );
    const t1 = new THREE.Vector3(
      Math.cos(cornerAngle) * apexRadius,
      ROOF_APEX_Y - 0.16,
      Math.sin(cornerAngle) * apexRadius
    );

    const roofPaneGeo = new THREE.BufferGeometry();
    const roofVerts = new Float32Array([
      b1.x, b1.y, b1.z,
      b2.x, b2.y, b2.z,
      t2.x, t2.y, t2.z,
      b1.x, b1.y, b1.z,
      t2.x, t2.y, t2.z,
      t1.x, t1.y, t1.z,
    ]);
    const roofUvs = new Float32Array([
      0, 0, 1, 0, 0.85, 1,
      0, 0, 0.85, 1, 0.15, 1,
    ]);
    roofPaneGeo.setAttribute('position', new THREE.BufferAttribute(roofVerts, 3));
    roofPaneGeo.setAttribute('uv', new THREE.BufferAttribute(roofUvs, 2));
    roofPaneGeo.computeVertexNormals();
    geometriesToDispose.push(roofPaneGeo);

    const roofPane = new THREE.Mesh(roofPaneGeo, glassMaterial);
    roofPane.renderOrder = 11;
    glassGroup.add(roofPane);
  }

  // 6. Hinged Brass Ventilation Finial Cap (pivoted at back edge of apex ring)
  const ventLidGroup = new THREE.Group();
  ventLidGroup.position.set(0, ROOF_APEX_Y - 0.16, -apexRadius);
  glassGroup.add(ventLidGroup);

  const lidPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(apexRadius + 0.06, 0.0),
    new THREE.Vector2(apexRadius + 0.04, 0.04),
    new THREE.Vector2(0.22, 0.14),
    new THREE.Vector2(0.08, 0.22),
    new THREE.Vector2(0.11, 0.27),
    new THREE.Vector2(0.04, 0.34),
    new THREE.Vector2(0.0, 0.38),
  ];
  const lidGeo = new THREE.LatheGeometry(lidPoints, 8);
  lidGeo.rotateY(Math.PI / 8);
  const lidMesh = new THREE.Mesh(lidGeo, brassMat);
  lidMesh.position.set(0, 0, apexRadius);
  lidMesh.castShadow = true;
  ventLidGroup.add(lidMesh);
  geometriesToDispose.push(lidGeo);

  // Subtle interior grow-light ring filament tucked under apex ring (warm glow at dusk/night)
  const growRingGeo = new THREE.TorusGeometry(apexRadius - 0.07, 0.014, 8, 24);
  growRingGeo.rotateX(Math.PI / 2);
  const growRingMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b8,
    emissive: 0xffcf88,
    emissiveIntensity: 0.15,
    roughness: 0.3,
  });
  const growRingMesh = new THREE.Mesh(growRingGeo, growRingMat);
  growRingMesh.position.y = ROOF_APEX_Y - 0.19;
  glassGroup.add(growRingMesh);
  geometriesToDispose.push(growRingGeo);
  materialsToDispose.push(growRingMat);

  const updateAnimation = (
    elapsed: number,
    rainIntensity: number,
    humidityRatio: number,
    ventOpenRatio: number,
    nightFactor: number
  ) => {
    waterUniforms.uTime.value = elapsed;
    waterUniforms.uRainStrength.value = rainIntensity;

    // Hinged lid rotates upward smoothly around back hinge (-X rotation tilts front up)
    ventLidGroup.rotation.x = -ventOpenRatio * 0.58;

    // Condensation & glass roughness subtly increase with humidity
    glassMaterial.roughness = 0.03 + humidityRatio * 0.14;
    if (isSoftwareGl) {
      glassMaterial.opacity = 0.2 + humidityRatio * 0.1;
    }

    // Subtle interior conservatory brass rim warm filament glow at night
    growRingMat.emissiveIntensity = 0.08 + nightFactor * 1.4;
  };

  const setGlassVisible = (visible: boolean) => {
    glassGroup.visible = visible;
  };

  const dispose = () => {
    geometriesToDispose.forEach((g) => g.dispose());
    materialsToDispose.forEach((m) => m.dispose());
  };

  return {
    root,
    glassGroup,
    ventLidGroup,
    waterMaterial,
    glassMaterial,
    updateTerrainForSeed,
    updateAnimation,
    setGlassVisible,
    dispose,
  };
}
