import * as THREE from 'three';

export interface ProceduralTextureSet {
  walnutAlbedo: THREE.CanvasTexture;
  soilAlbedo: THREE.CanvasTexture;
  soilBump: THREE.CanvasTexture;
  gravelAlbedo: THREE.CanvasTexture;
  barkAlbedo: THREE.CanvasTexture;
  barkBump: THREE.CanvasTexture;
  leafAlbedo: THREE.CanvasTexture;
  fernAlbedo: THREE.CanvasTexture;
  condensationRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  mistPuff: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function configureDataTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Turned Walnut Wood Grain
  const [walnutCanvas, wCtx] = makeCanvas(512, 512);
  wCtx.fillStyle = '#3b2416';
  wCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const wave = Math.sin(y * 0.08) * 10 + Math.sin(y * 0.23) * 4;
    const tone = Math.floor(32 + Math.sin((y + wave) * 0.14) * 14);
    wCtx.fillStyle = `rgb(${tone + 26}, ${tone + 6}, ${Math.max(8, tone - 6)})`;
    wCtx.fillRect(0, y, 512, 1);
  }
  wCtx.globalAlpha = 0.08;
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    wCtx.fillStyle = i % 2 === 0 ? '#180c06' : '#6f482c';
    wCtx.fillRect(x, y, 28 + Math.random() * 60, 1.5);
  }
  const walnutAlbedo = configureColorTexture(walnutCanvas, maxAnisotropy, 2, 1);

  // 2. Rich Loam Soil + Moss Flecks & Bump Map
  const [soilCanvas, sCtx] = makeCanvas(512, 512);
  const [soilBumpCanvas, sbCtx] = makeCanvas(512, 512);
  sCtx.fillStyle = '#2b2017';
  sCtx.fillRect(0, 0, 512, 512);
  sbCtx.fillStyle = '#7f7f7f';
  sbCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 4.5;
    const v = Math.random();
    if (v < 0.65) {
      sCtx.fillStyle = v < 0.3 ? '#1e160f' : '#3a2b1e';
    } else if (v < 0.88) {
      sCtx.fillStyle = '#4c3a28';
    } else {
      sCtx.fillStyle = '#314728'; // subtle moss humus speck
    }
    sCtx.beginPath();
    sCtx.arc(x, y, r, 0, Math.PI * 2);
    sCtx.fill();

    const gray = Math.floor(70 + Math.random() * 140);
    sbCtx.fillStyle = `rgb(${gray},${gray},${gray})`;
    sbCtx.beginPath();
    sbCtx.arc(x, y, r, 0, Math.PI * 2);
    sbCtx.fill();
  }
  const soilAlbedo = configureColorTexture(soilCanvas, maxAnisotropy, 3, 3);
  const soilBump = configureDataTexture(soilBumpCanvas, maxAnisotropy, 3, 3);

  // 3. Stratified Drainage Gravel Band
  const [gravelCanvas, gCtx] = makeCanvas(512, 256);
  gCtx.fillStyle = '#534e47';
  gCtx.fillRect(0, 0, 512, 256);
  const pebbleColors = ['#7c756b', '#938a7c', '#635d55', '#423d37', '#aba091'];
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    const rx = 2.5 + Math.random() * 5.5;
    const ry = 2 + Math.random() * 4;
    gCtx.fillStyle = pebbleColors[i % pebbleColors.length];
    gCtx.beginPath();
    gCtx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    gCtx.fill();
  }
  const gravelAlbedo = configureColorTexture(gravelCanvas, maxAnisotropy, 4, 1);

  // 4. Bonsai Bark Albedo + Bump
  const [barkCanvas, bCtx] = makeCanvas(256, 512);
  const [barkBumpCanvas, bbCtx] = makeCanvas(256, 512);
  bCtx.fillStyle = '#4c3b2f';
  bCtx.fillRect(0, 0, 256, 512);
  bbCtx.fillStyle = '#808080';
  bbCtx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    const w = 2 + Math.random() * 6;
    const h = 18 + Math.random() * 65;
    bCtx.fillStyle = i % 3 === 0 ? '#2f231b' : i % 3 === 1 ? '#614d3d' : '#58624b';
    bCtx.fillRect(x, y, w, h);
    const gv = i % 2 === 0 ? 45 : 195;
    bbCtx.fillStyle = `rgb(${gv},${gv},${gv})`;
    bbCtx.fillRect(x, y, w, h);
  }
  const barkAlbedo = configureColorTexture(barkCanvas, maxAnisotropy, 2, 3);
  const barkBump = configureDataTexture(barkBumpCanvas, maxAnisotropy, 2, 3);

  // 5. Veined Broadleaf Orchid Texture
  const [leafCanvas, lCtx] = makeCanvas(512, 512);
  const grad = lCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1e4b30');
  grad.addColorStop(0.55, '#2b6741');
  grad.addColorStop(1, '#3d7f51');
  lCtx.fillStyle = grad;
  lCtx.fillRect(0, 0, 512, 512);

  // Central midrib & lateral botanical veins
  lCtx.strokeStyle = 'rgba(176, 224, 168, 0.52)';
  lCtx.lineWidth = 4;
  lCtx.beginPath();
  lCtx.moveTo(256, 505);
  lCtx.lineTo(256, 12);
  lCtx.stroke();

  lCtx.lineWidth = 2;
  for (let i = 1; i <= 11; i++) {
    const y = 480 - i * 40;
    lCtx.strokeStyle = `rgba(176, 224, 168, ${0.42 - i * 0.02})`;
    lCtx.beginPath();
    lCtx.moveTo(256, y);
    lCtx.quadraticCurveTo(150, y - 24, 34, y - 62);
    lCtx.stroke();

    lCtx.beginPath();
    lCtx.moveTo(256, y);
    lCtx.quadraticCurveTo(362, y - 24, 478, y - 62);
    lCtx.stroke();
  }
  const leafAlbedo = configureColorTexture(leafCanvas, maxAnisotropy);

  // 6. Delicate Fern Leaflet Texture
  const [fernCanvas, fCtx] = makeCanvas(256, 256);
  const fGrad = fCtx.createLinearGradient(0, 0, 0, 256);
  fGrad.addColorStop(0, '#2a6b38');
  fGrad.addColorStop(1, '#589c52');
  fCtx.fillStyle = fGrad;
  fCtx.fillRect(0, 0, 256, 256);
  fCtx.strokeStyle = 'rgba(195, 232, 160, 0.45)';
  fCtx.lineWidth = 3;
  fCtx.beginPath();
  fCtx.moveTo(128, 256);
  fCtx.lineTo(128, 0);
  fCtx.stroke();
  const fernAlbedo = configureColorTexture(fernCanvas, maxAnisotropy);

  // 7. Glass Condensation Droplet Roughness Map
  const [condCanvas, cCtx] = makeCanvas(512, 512);
  cCtx.fillStyle = '#080808';
  cCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 950; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 5.2;
    const rg = cCtx.createRadialGradient(x, y, 0.2, x, y, r);
    rg.addColorStop(0, 'rgba(210, 210, 210, 0.85)');
    rg.addColorStop(0.75, 'rgba(140, 140, 140, 0.45)');
    rg.addColorStop(1, 'rgba(10, 10, 10, 0)');
    cCtx.fillStyle = rg;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();
  }
  const condensationRoughness = configureDataTexture(condCanvas, maxAnisotropy, 2, 2);

  // 8. Soft Radial Contact Shadow
  const [shadowCanvas, shCtx] = makeCanvas(256, 256);
  const shGrad = shCtx.createRadialGradient(128, 128, 16, 128, 128, 124);
  shGrad.addColorStop(0, 'rgba(4, 7, 5, 0.92)');
  shGrad.addColorStop(0.55, 'rgba(4, 7, 5, 0.48)');
  shGrad.addColorStop(1, 'rgba(4, 7, 5, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.needsUpdate = true;

  // 9. Soft Mist Puff Texture
  const [mistCanvas, mCtx] = makeCanvas(256, 256);
  const mGrad = mCtx.createRadialGradient(128, 128, 8, 128, 128, 124);
  mGrad.addColorStop(0, 'rgba(226, 240, 236, 0.55)');
  mGrad.addColorStop(0.45, 'rgba(210, 230, 226, 0.25)');
  mGrad.addColorStop(1, 'rgba(200, 224, 220, 0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 256, 256);
  const mistPuff = new THREE.CanvasTexture(mistCanvas);
  mistPuff.colorSpace = THREE.SRGBColorSpace;
  mistPuff.needsUpdate = true;

  const all = [
    walnutAlbedo,
    soilAlbedo,
    soilBump,
    gravelAlbedo,
    barkAlbedo,
    barkBump,
    leafAlbedo,
    fernAlbedo,
    condensationRoughness,
    contactShadow,
    mistPuff,
  ];

  return {
    walnutAlbedo,
    soilAlbedo,
    soilBump,
    gravelAlbedo,
    barkAlbedo,
    barkBump,
    leafAlbedo,
    fernAlbedo,
    condensationRoughness,
    contactShadow,
    mistPuff,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
