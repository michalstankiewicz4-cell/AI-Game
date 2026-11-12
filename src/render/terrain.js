// Teren, morze i mgła niewiedzy (widok "oczami AI").
import * as THREE from 'three';
import { T, W, H, idx, toWorld, toTile, heightToY } from '../world/world.js';
import { VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from '../ai/data.js';

const COLORS = {
  sand: new THREE.Color(0xe8d49a), grass: new THREE.Color(0x6dbb4f), grass2: new THREE.Color(0x4f9a3c),
  rock: new THREE.Color(0x8d8a85), rock2: new THREE.Color(0x6f6c68), seabed: new THREE.Color(0xc9b47c), deep: new THREE.Color(0x2a5d7a),
  pond: new THREE.Color(0x3fa7d6),
};

export const terrainMethods = {
  buildTerrain(world) {
    const sub = 2; // podział kafelka dla gładszego kształtu
    const nx = W * sub, nz = H * sub;
    const geo = new THREE.PlaneGeometry(W, H, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // wysokości w środkach kafelków
    const ty = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = idx(i, j), t = world.type[k];
      ty[k] = t === T.SEA ? Math.max(-2.2, world.height[k] * 1.4) - 0.3 : t === T.POND ? -0.15 : heightToY(world.height[k], t);
    }
    const sample = (x, z) => {
      // biliniowa interpolacja środków kafelków
      const fx = x + W / 2 - 0.5, fz = z + H / 2 - 0.5;
      const i0 = Math.max(0, Math.min(W - 2, Math.floor(fx))), j0 = Math.max(0, Math.min(H - 2, Math.floor(fz)));
      const u = Math.max(0, Math.min(1, fx - i0)), v = Math.max(0, Math.min(1, fz - j0));
      const a = ty[idx(i0, j0)], b = ty[idx(i0 + 1, j0)], c = ty[idx(i0, j0 + 1)], d = ty[idx(i0 + 1, j0 + 1)];
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    };
    const col = new THREE.Color();
    this.vtTile = new Int32Array(pos.count);
    for (let n = 0; n < pos.count; n++) {
      const x = pos.getX(n), z = pos.getZ(n);
      let y = sample(x, z);
      const jitter = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      if (y > 0.3) y += jitter * 0.06;
      pos.setY(n, y);
      const ti = Math.max(0, Math.min(W - 1, Math.floor(x + W / 2))), tj = Math.max(0, Math.min(H - 1, Math.floor(z + H / 2)));
      const t = world.type[idx(ti, tj)];
      this.vtTile[n] = idx(ti, tj);
      if (y < 0.05) col.copy(COLORS.seabed).lerp(COLORS.deep, Math.min(1, -y / 2));
      else if (t === T.POND || y < 0.35) col.copy(COLORS.sand);
      else if (t === T.ROCK || y > 2.2) col.copy(COLORS.rock).lerp(COLORS.rock2, Math.abs(jitter));
      else if (t === T.SAND) col.copy(COLORS.sand);
      else col.copy(COLORS.grass).lerp(COLORS.grass2, Math.abs(jitter) * 0.8);
      colors.set([col.r, col.g, col.b], n * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.baseColors = Float32Array.from(colors);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
    // stawy
    const pondGeo = new THREE.PlaneGeometry(1.05, 1.05); pondGeo.rotateX(-Math.PI / 2);
    const pondMat = new THREE.MeshStandardMaterial({ color: COLORS.pond, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (world.type[idx(i, j)] !== T.POND) continue;
      const m = new THREE.Mesh(pondGeo, pondMat);
      const p = toWorld(i, j); m.position.set(p.x, 0.22, p.z);
      this.scene.add(m);
    }
    // mgła wiedzy nad morzem (widok "oczami AI")
    this.fogData = new Uint8Array(W * H * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, W, H, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter; this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.flipY = false;
    this.fogTex.colorSpace = THREE.SRGBColorSpace;
    // płaszczyzna 3x większa od mapy; poza mapą tekstura rozciąga brzeg (zawsze nieznany)
    const fogGeo = new THREE.PlaneGeometry(W * 3, H * 3); fogGeo.rotateX(-Math.PI / 2);
    // PlaneGeometry po obrocie: v=1 przy z=-H/2, więc odwracamy współrzędne v
    const uv = fogGeo.attributes.uv;
    for (let n = 0; n < uv.count; n++) { uv.setX(n, 0.5 + (uv.getX(n) - 0.5) * 3); uv.setY(n, 0.5 + (0.5 - uv.getY(n)) * 3); }
    this.fogPlane = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    this.fogPlane.position.y = 0.12; this.fogPlane.renderOrder = 2; this.fogPlane.visible = false;
    this.scene.add(this.fogPlane);
    // stożek widzenia
    const pts = [0, 0.02, 0];
    const N = 96;
    for (let n = 0; n <= N; n++) {
      const th = -Math.PI + (n / N) * Math.PI * 2;
      const r = Math.max(VIEW_NEAR, Math.min(VIEW_RANGE, VIEW_RANGE * (1 - Math.abs(th) / 1.25)));
      const rr = Math.abs(th) <= 0.12 ? VIEW_RANGE : r;
      pts.push(Math.sin(th) * rr, 0, Math.cos(th) * rr);
    }
    const idxs = [];
    for (let n = 1; n <= N; n++) idxs.push(0, n, n + 1);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); cg.setIndex(idxs);
    this.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.renderOrder = 3; this.cone.visible = false;
    this.scene.add(this.cone);
    this.fogFor = null; this.fogT = 0;
  },

  buildSea() {
    const size = Math.max(W, H) * 3;
    const geo = new THREE.PlaneGeometry(size, size, 64, 64);
    geo.rotateX(-Math.PI / 2);
    this.seaBase = Float32Array.from(geo.attributes.position.array);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b8fc9, transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.05, flatShading: true });
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.receiveShadow = true;
    this.scene.add(this.sea);
  },

  // mgła: to, czego agent nie widział, jest przyciemnione
  applyFog(agent) {
    const colAttr = this.terrain.geometry.attributes.color;
    const c = colAttr.array, b = this.baseColors;
    if (!agent) {
      c.set(b); colAttr.needsUpdate = true; this.fogPlane.visible = false; this.fogFor = null; return;
    }
    const seen = agent.seen;
    const fr = 0.11, fg = 0.13, fb = 0.18;
    for (let n = 0; n < this.vtTile.length; n++) {
      const k = n * 3;
      if (seen[this.vtTile[n]]) { c[k] = b[k]; c[k + 1] = b[k + 1]; c[k + 2] = b[k + 2]; }
      else { c[k] = b[k] * 0.25 + fr * 0.75; c[k + 1] = b[k + 1] * 0.25 + fg * 0.75; c[k + 2] = b[k + 2] * 0.25 + fb * 0.75; }
    }
    colAttr.needsUpdate = true;
    const d = this.fogData;
    for (let k = 0; k < W * H; k++) {
      d[k * 4] = 28; d[k * 4 + 1] = 33; d[k * 4 + 2] = 46; d[k * 4 + 3] = seen[k] ? 0 : 235;
    }
    this.fogTex.needsUpdate = true;
    this.fogPlane.visible = true;
    this.fogFor = agent;
  },
};
