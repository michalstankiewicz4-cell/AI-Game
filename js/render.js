// Renderowanie 3D (Three.js) w stylu gładkiego low-poly.
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { T, W, H, idx, toWorld, toTile, heightToY } from './world.js';
import { VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from './agent.js';

const COLORS = {
  sand: new THREE.Color(0xe8d49a), grass: new THREE.Color(0x6dbb4f), grass2: new THREE.Color(0x4f9a3c),
  rock: new THREE.Color(0x8d8a85), rock2: new THREE.Color(0x6f6c68), seabed: new THREE.Color(0xc9b47c), deep: new THREE.Color(0x2a5d7a),
  pond: new THREE.Color(0x3fa7d6),
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 180;
    this.raycaster = new THREE.Raycaster();
    this.labelLayer = document.getElementById('labels');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.makeShared();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  makeShared() {
    const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
    this.mat = {
      trunk: M(0x7a5230), leaves: M(0x3f8f3a), leaves2: M(0x2f7a35), palmLeaf: M(0x58a83f), stump: M(0x9b7448),
      rock: M(0x8f8c88), bush: M(0x3e8b40), berry: M(0x5a3fc0, { roughness: 0.4 }), plank: M(0xa47a4c), post: M(0x6e4b2a),
      skin: M(0xf0c8a0), dark: M(0x222222), stone: M(0x777777), flame: new THREE.MeshBasicMaterial({ color: 0xffa030 }),
      fish: M(0xff8a3d), bird: M(0xf4f4f4), birdWing: M(0xdadada), beak: M(0xf0a020), ghost: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
      dead: M(0x777777), weed: M(0x2f6b2a), thatch: M(0xc9a35a), iron: M(0xb0603a),
    };
    this.geo = {
      trunk: new THREE.CylinderGeometry(0.09, 0.14, 1, 6), cone: new THREE.ConeGeometry(0.55, 1, 7), round: new THREE.IcosahedronGeometry(0.5, 0),
      stump: new THREE.CylinderGeometry(0.14, 0.17, 0.25, 6), rock: new THREE.DodecahedronGeometry(0.35, 0), bush: new THREE.IcosahedronGeometry(0.33, 0),
      berry: new THREE.IcosahedronGeometry(0.06, 0), plank: new THREE.BoxGeometry(1.02, 0.08, 1.15), post: new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5),
      fish: new THREE.ConeGeometry(0.09, 0.35, 5), birdBody: new THREE.IcosahedronGeometry(0.13, 0), wing: new THREE.BoxGeometry(0.32, 0.02, 0.13),
      palmLeaf: new THREE.ConeGeometry(0.16, 0.9, 4), weed: new THREE.ConeGeometry(0.06, 0.7, 4), ghost: new THREE.BoxGeometry(0.9, 0.04, 0.9),
    };
  }

  // ---------- świat ----------
  build(world) {
    this.world = world;
    if (this.scene) this.dispose();
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9fd6f0, 90, 260);
    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a7040, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    this.sun.castShadow = true;
    const S = Math.max(W, H) * 0.6;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun, this.sun.target);

    this.buildTerrain(world);
    this.buildSea();
    this.resMeshes = new Map();
    for (const r of world.resources) this.addResMesh(r);
    this.structMeshes = new Map();
    this.bridgeMeshes = new Map();
    this.ghosts = new Map();
    for (const br of world.bridges) for (const t of br.tiles) {
      const g = new THREE.Mesh(this.geo.ghost, this.mat.ghost);
      const p = toWorld(t.i, t.j);
      g.position.set(p.x, 0.12, p.z);
      scene.add(g); this.ghosts.set(idx(t.i, t.j), g);
    }
    this.fishMeshes = new Map();
    this.birdMeshes = new Map();
    this.agentMeshes = new Map();
    this.labelLayer.innerHTML = '';
    this.labels = new Map();

    const c = this.center = new THREE.Vector3(0, 0, 0);
    this.camera.position.set(c.x - W * 0.15, Math.max(W, H) * 0.55, c.z + H * 0.85);
    this.controls.target.copy(c);
    this.controls.update();
  }

  dispose() {
    this.scene.traverse((o) => { if (o.geometry && !Object.values(this.geo).includes(o.geometry)) o.geometry.dispose(); });
  }

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
    const fogGeo = new THREE.PlaneGeometry(W, H); fogGeo.rotateX(-Math.PI / 2);
    // PlaneGeometry po obrocie: v=1 przy z=-H/2, więc odwracamy współrzędne v
    const uv = fogGeo.attributes.uv;
    for (let n = 0; n < uv.count; n++) uv.setY(n, 1 - uv.getY(n));
    this.fogPlane = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false }));
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
    this.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.renderOrder = 3; this.cone.visible = false;
    this.scene.add(this.cone);
    this.fogFor = null; this.fogT = 0;
  }

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
  }

  buildSea() {
    const size = Math.max(W, H) * 3;
    const geo = new THREE.PlaneGeometry(size, size, 90, 90);
    geo.rotateX(-Math.PI / 2);
    this.seaBase = Float32Array.from(geo.attributes.position.array);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b8fc9, transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.05, flatShading: true });
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.receiveShadow = true;
    this.scene.add(this.sea);
  }

  addResMesh(r) {
    const g = new THREE.Group();
    const m = this.mat, G = this.geo;
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, name) => {
      const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
      o.castShadow = true; o.receiveShadow = true; if (name) o.name = name; g.add(o); return o;
    };
    if (r.kind === 'tree') {
      const pine = (r.id % 3) !== 0;
      const full = new THREE.Group(); full.name = 'full';
      g.add(full);
      const t = new THREE.Mesh(G.trunk, m.trunk); t.position.y = 0.5; t.castShadow = true; full.add(t);
      if (pine) {
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(G.cone, k % 2 ? m.leaves2 : m.leaves);
          c.position.y = 1.0 + k * 0.45; c.scale.setScalar(1.1 - k * 0.28); c.castShadow = true; full.add(c);
        }
      } else {
        const c = new THREE.Mesh(G.round, m.leaves); c.position.y = 1.35; c.scale.set(1.3, 1.2, 1.3); c.castShadow = true; full.add(c);
        const c2 = new THREE.Mesh(G.round, m.leaves2); c2.position.set(0.25, 1.65, 0.1); c2.scale.setScalar(0.8); c2.castShadow = true; full.add(c2);
      }
      add(G.stump, m.stump, 0, 0.12, 0).name = 'stump';
    } else if (r.kind === 'palm') {
      const full = new THREE.Group(); full.name = 'full'; g.add(full);
      for (let k = 0; k < 4; k++) {
        const t = new THREE.Mesh(G.trunk, m.trunk); t.scale.set(0.8, 0.5, 0.8);
        t.position.set(k * 0.06, 0.25 + k * 0.45, 0); t.rotation.z = -0.12 * k; t.castShadow = true; full.add(t);
      }
      for (let k = 0; k < 6; k++) {
        const l = new THREE.Mesh(G.palmLeaf, m.palmLeaf);
        const a = k / 6 * Math.PI * 2;
        l.position.set(0.25 + Math.cos(a) * 0.35, 1.95, Math.sin(a) * 0.35);
        l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        l.scale.set(1, 1, 0.3); l.castShadow = true; full.add(l);
      }
      add(G.stump, m.stump, 0, 0.12, 0).name = 'stump';
    } else if (r.kind === 'rock') {
      add(G.rock, m.rock, 0, 0.18, 0, 1.2, 0.8, 1).name = 'main';
      add(G.rock, m.rock, 0.25, 0.1, 0.15, 0.6, 0.5, 0.6);
    } else if (r.kind === 'bush') {
      add(G.bush, m.bush, 0, 0.28, 0, 1.2, 0.9, 1.2);
      add(G.bush, m.bush, 0.2, 0.22, 0.1, 0.8, 0.7, 0.8);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7;
        add(G.berry, m.berry, Math.cos(a) * 0.32, 0.3 + (k % 2) * 0.12, Math.sin(a) * 0.32).name = 'berry' + k;
      }
    } else if (r.kind === 'seaweed') {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3;
        add(this.geo.weed, this.mat.weed, Math.cos(a) * 0.25, -0.2, Math.sin(a) * 0.25, 1, 0.8 + (k % 3) * 0.25, 1).name = 'weed' + k;
      }
    } else if (r.kind === 'mine') {
      // wejście do kopalni: drewniana rama i ciemny otwór
      const hole = add(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 8, 1, false, 0, Math.PI), m.dark, 0, 0.1, -0.35);
      hole.rotation.set(Math.PI / 2, 0, Math.PI / 2); hole.scale.set(1, 1, 1);
      add(new THREE.BoxGeometry(0.1, 0.9, 0.1), m.post, -0.5, 0.45, 0);
      add(new THREE.BoxGeometry(0.1, 0.9, 0.1), m.post, 0.5, 0.45, 0);
      add(new THREE.BoxGeometry(1.2, 0.12, 0.14), m.post, 0, 0.92, 0);
      add(new THREE.BoxGeometry(0.35, 0.22, 0.25), m.plank, 0.8, 0.12, 0.45);
      add(G.rock, m.iron, 0.8, 0.28, 0.45, 0.35, 0.3, 0.35);
      add(G.rock, m.rock, -0.8, 0.15, 0.5, 0.7, 0.5, 0.7);
    }
    const y = r.kind === 'seaweed' ? 0 : this.world.tileY(r.i, r.j);
    g.position.set(r.x, y, r.z);
    g.rotation.y = r.kind === 'mine' ? (r.rot || 0) : r.rot;
    if (r.kind !== 'mine') g.scale.setScalar(r.scale);
    this.scene.add(g);
    this.resMeshes.set(r, g);
    this.updateResMesh(r);
  }

  updateResMesh(r) {
    const g = this.resMeshes.get(r);
    if (!g) return;
    if (r.removed) { this.scene.remove(g); this.resMeshes.delete(r); return; }
    if (r.kind === 'tree' || r.kind === 'palm') {
      const full = g.getObjectByName('full');
      const grown = r.growth >= 1;
      full.visible = r.growth > 0.15;
      full.scale.setScalar(grown ? 1 : 0.3 + r.growth * 0.6);
      g.getObjectByName('stump').visible = !grown && r.growth < 0.5;
    } else if (r.kind === 'bush') {
      for (let k = 0; k < 4; k++) g.getObjectByName('berry' + k).visible = k < r.berries;
    } else if (r.kind === 'seaweed') {
      for (let k = 0; k < 5; k++) g.getObjectByName('weed' + k).visible = k < 2 + r.amount;
    } else if (r.kind === 'rock') {
      const s = 0.55 + Math.min(r.stone, 6) * 0.1;
      g.getObjectByName('main').scale.set(1.2 * s, 0.8 * s, s);
    }
  }

  addStructure(s) {
    const g = new THREE.Group();
    const m = this.mat;
    if (s.kind === 'campfire') {
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2;
        const st = new THREE.Mesh(this.geo.rock, m.stone); st.scale.setScalar(0.32);
        st.position.set(Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32); st.castShadow = true; g.add(st);
      }
      for (let k = 0; k < 3; k++) {
        const l = new THREE.Mesh(this.geo.trunk, m.trunk); l.scale.set(0.7, 0.55, 0.7);
        l.rotation.set(Math.PI / 2.4, k * 2.1, 0); l.position.y = 0.12; g.add(l);
      }
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), m.flame); f.position.y = 0.3; f.name = 'flame'; g.add(f);
      const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), new THREE.MeshBasicMaterial({ color: 0xffe070 })); f2.position.y = 0.25; f2.name = 'flame2'; g.add(f2);
      const light = new THREE.PointLight(0xff9a40, 0, 9, 1.6); light.position.y = 0.7; light.name = 'light'; g.add(light);
    } else if (s.kind === 'shelter') {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.3, 4, 1, true), m.thatch);
      roof.position.y = 0.65; roof.rotation.y = Math.PI / 4; roof.castShadow = true; roof.receiveShadow = true;
      roof.material = m.thatch.clone(); roof.material.side = THREE.DoubleSide;
      g.add(roof);
      const pole = new THREE.Mesh(this.geo.post, m.post); pole.position.y = 0.75; g.add(pole);
    }
    g.position.set(s.x, this.world.tileY(s.i, s.j), s.z);
    this.scene.add(g);
    this.structMeshes.set(s, g);
  }

  addBridgeTile(i, j, br) {
    const k = idx(i, j);
    if (this.bridgeMeshes.has(k)) return;
    const horizontal = br.start.j === br.end.j;
    const g = new THREE.Group();
    const p = new THREE.Mesh(this.geo.plank, this.mat.plank); p.castShadow = true; p.receiveShadow = true;
    p.position.y = 0.38; if (!horizontal) p.rotation.y = Math.PI / 2;
    g.add(p);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(this.geo.post, this.mat.post);
      if (horizontal) post.position.set(0, 0, s * 0.55); else post.position.set(s * 0.55, 0, 0);
      post.position.y = 0.1; post.castShadow = true; g.add(post);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 1.02 : 0.05, 0.05, horizontal ? 0.05 : 1.02), this.mat.post);
      if (horizontal) rail.position.set(0, 0.68, s * 0.55); else rail.position.set(s * 0.55, 0.68, 0);
      g.add(rail);
    }
    const w = toWorld(i, j); g.position.set(w.x, 0, w.z);
    this.scene.add(g); this.bridgeMeshes.set(k, g);
    const ghost = this.ghosts.get(k); if (ghost) { this.scene.remove(ghost); this.ghosts.delete(k); }
  }

  makeAgentMesh(a) {
    const g = new THREE.Group();
    const color = new THREE.MeshStandardMaterial({ color: a.color, flatShading: true, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.32, 3, 8), color);
    body.position.y = 0.42; body.castShadow = true; body.name = 'body'; g.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), this.mat.skin);
    head.position.y = 0.82; head.castShadow = true; head.name = 'head'; g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 8), color); hat.position.y = 0.95; g.add(hat);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), this.mat.dark); eye.position.set(s * 0.055, 0.84, 0.13); g.add(eye);
    }
    const arm = new THREE.Group(); arm.position.set(0.2, 0.55, 0); arm.name = 'arm'; g.add(arm);
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), this.mat.post); tool.position.y = -0.1; tool.rotation.x = 0.4; arm.add(tool);
    const head2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.05), this.mat.stone); head2.position.set(0, 0.07, 0.03); tool.add(head2);
    g.userData.agent = a;
    g.traverse((o) => { o.userData.agent = a; });
    this.scene.add(g);
    // marker zaznaczenia
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; ring.name = 'ring'; g.add(ring);
    return g;
  }

  makeLabel(a) {
    const el = document.createElement('div');
    el.className = 'agent-label';
    el.innerHTML = `<div class="bubble"></div><div class="name" style="--c:#${a.color.toString(16).padStart(6, '0')}">${a.name}</div>`;
    el.addEventListener('click', () => this.onPick && this.onPick(a));
    this.labelLayer.appendChild(el);
    return el;
  }

  // ---------- klatka ----------
  frame(world, agents, selected, rt, opts) {
    const scene = this.scene;
    // widok "oczami AI"
    const eye = opts.aiView && selected ? selected : null;
    if (eye) {
      this.fogT -= 1 / 60;
      if (this.fogFor !== eye || this.fogT <= 0) { this.fogT = 0.4; this.applyFog(eye); }
      this.cone.visible = eye.alive && !eye.asleep;
      this.cone.position.set(eye.x, world.groundHeight(eye.x, eye.z) + 0.3, eye.z);
      this.cone.rotation.y = eye.facing;
    } else if (this.fogFor) { this.applyFog(null); this.cone.visible = false; }
    else this.cone.visible = false;
    const inCone = (x, z) => {
      if (!eye) return true;
      const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz);
      if (d > VIEW_RANGE) return false;
      if (d <= VIEW_NEAR) return true;
      let a = Math.atan2(dx, dz) - eye.facing;
      while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      return Math.abs(a) <= viewHalfAngle(d) && !eye.asleep;
    };
    const known = (x, z) => { if (!eye) return true; const t = toTile(x, z); return !!eye.seen[idx(t.i, t.j)]; };
    if (eye || this.hadEye) {
      for (const [r, g] of this.resMeshes) g.visible = !eye || !!eye.seen[idx(r.i, r.j)];
      for (const [s, g] of this.structMeshes) g.visible = !eye || eye.knownStructs.has(s.id);
      for (const [k, g] of this.bridgeMeshes) g.visible = !eye || !!eye.seen[k];
      for (const [k, g] of this.ghosts) g.visible = !eye || !!eye.seen[k];
    }
    this.hadEye = !!eye;
    // pora dnia
    const dl = world.daylight();
    const f = world.dayFrac();
    const ang = (f - 0.25) * Math.PI * 2;
    const R = Math.max(W, H);
    this.sun.position.set(Math.cos(ang) * R, Math.max(8, Math.sin(ang) * R * 0.9) , R * 0.35);
    this.sun.intensity = 0.15 + dl * 2.3;
    this.sun.color.setHSL(0.1, 0.6, 0.6 + dl * 0.3);
    this.hemi.intensity = 0.25 + dl * 0.75;
    const sky = new THREE.Color(0x0b1530).lerp(new THREE.Color(0x9fd6f0), dl);
    if (dl > 0.05 && dl < 0.5 && (f < 0.35 || f > 0.7)) sky.lerp(new THREE.Color(0xf0a070), 0.35 * (1 - dl * 2));
    scene.background = sky; scene.fog.color.copy(sky);

    // fale
    const pos = this.sea.geometry.attributes.position, base = this.seaBase;
    for (let n = 0; n < pos.count; n++) {
      const x = base[n * 3], z = base[n * 3 + 2];
      pos.array[n * 3 + 1] = Math.sin(x * 0.35 + rt * 1.1) * 0.06 + Math.cos(z * 0.3 + rt * 0.8) * 0.06;
    }
    pos.needsUpdate = true;
    this.sea.geometry.computeVertexNormals();

    // zmiany zasobów
    for (const r of world.changed) {
      if (!this.resMeshes.has(r) && !r.removed) this.addResMesh(r); else this.updateResMesh(r);
    }
    world.changed.clear();
    if (world.structuresChanged) {
      world.structuresChanged = false;
      for (const s of world.structures) if (!this.structMeshes.has(s)) this.addStructure(s);
    }
    if (world.bridgeChanged) {
      world.bridgeChanged = false;
      for (const br of world.bridges) br.tiles.forEach((t) => { if (world.type[idx(t.i, t.j)] === T.BRIDGE) this.addBridgeTile(t.i, t.j, br); });
    }
    for (const [s, g] of this.structMeshes) {
      if (s.kind !== 'campfire') continue;
      const fl = g.getObjectByName('flame'), fl2 = g.getObjectByName('flame2');
      const k = 1 + Math.sin(rt * 13 + s.id) * 0.15 + Math.sin(rt * 7.3) * 0.1;
      fl.scale.set(1, k, 1); fl2.scale.set(1, 2 - k, 1);
      g.getObjectByName('light').intensity = (1 - dl) * 6 * k + 0.5;
    }

    // ryby
    const seenF = new Set();
    for (const fsh of world.fish) {
      seenF.add(fsh);
      let m = this.fishMeshes.get(fsh);
      if (!m) { m = new THREE.Mesh(this.geo.fish, this.mat.fish); m.rotation.order = 'YXZ'; scene.add(m); this.fishMeshes.set(fsh, m); }
      const jy = fsh.jump > 0 ? Math.sin((1 - fsh.jump) * Math.PI) * 0.9 : 0;
      m.position.set(fsh.x, -fsh.depth + jy, fsh.z);
      m.visible = inCone(fsh.x, fsh.z);
      m.rotation.y = -fsh.dir + Math.PI / 2; m.rotation.x = Math.PI / 2 + (fsh.jump > 0 ? (fsh.jump - 0.5) * 1.5 : 0);
    }
    for (const [fsh, m] of this.fishMeshes) if (!seenF.has(fsh)) { scene.remove(m); this.fishMeshes.delete(fsh); }

    // ptaki
    const seenB = new Set();
    for (const b of world.birds) {
      seenB.add(b);
      let g = this.birdMeshes.get(b);
      if (!g) {
        g = new THREE.Group();
        const body = new THREE.Mesh(this.geo.birdBody, this.mat.bird); body.scale.set(0.8, 0.8, 1.4); body.castShadow = true; g.add(body);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), this.mat.beak); beak.rotation.x = Math.PI / 2; beak.position.z = 0.2; g.add(beak);
        for (const s of [-1, 1]) {
          const wp = new THREE.Group(); wp.position.x = s * 0.06; wp.name = 'w' + s;
          const w = new THREE.Mesh(this.geo.wing, this.mat.birdWing); w.position.x = s * 0.16; w.castShadow = true; wp.add(w); g.add(wp);
        }
        scene.add(g); this.birdMeshes.set(b, g);
      }
      const prev = g.position.clone();
      g.position.set(b.x, b.y, b.z);
      const dx = b.x - prev.x, dz = b.z - prev.z;
      if (dx * dx + dz * dz > 1e-6) g.rotation.y = Math.atan2(dx, dz);
      const flap = b.state === 'landed' ? 0.1 : Math.sin(rt * (b.state === 'landing' ? 18 : 9) + b.id) * 0.7;
      g.getObjectByName('w-1').rotation.z = flap; g.getObjectByName('w1').rotation.z = -flap;
      g.visible = inCone(b.x, b.z);
    }
    for (const [b, g] of this.birdMeshes) if (!seenB.has(b)) { scene.remove(g); this.birdMeshes.delete(b); }

    // agenci
    const v = new THREE.Vector3();
    const wpx = window.innerWidth, hpx = window.innerHeight;
    for (const a of agents) {
      let g = this.agentMeshes.get(a);
      if (!g) { g = this.makeAgentMesh(a); this.agentMeshes.set(a, g); this.labels.set(a, this.makeLabel(a)); }
      const gy = world.groundHeight(a.x, a.z);
      const moving = a.task && a.task.path && a.task.path.length > 0;
      const bob = moving ? Math.abs(Math.sin(rt * 10 + a.id)) * 0.06 : 0;
      g.position.set(a.x, gy + bob, a.z);
      const arm = g.getObjectByName('arm');
      if (!a.alive || a.asleep) {
        g.rotation.set(-Math.PI / 2, a.facing, 0, 'YXZ'); g.position.y = gy + 0.18;
        if (!a.alive) g.getObjectByName('body').material.color.set(0x777777);
      } else {
        g.rotation.set(0, a.facing, 0);
        arm.rotation.x = a.working ? Math.sin(rt * 9 + a.id) * 1.0 - 0.6 : moving ? Math.sin(rt * 10) * 0.4 : 0;
      }
      g.getObjectByName('ring').visible = a === selected;
      const seenNow = a === eye || inCone(a.x, a.z);
      g.visible = seenNow;
      // etykieta
      const el = this.labels.get(a);
      v.set(a.x, gy + 1.25, a.z).project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && opts.labels && seenNow;
      el.style.display = visible ? '' : 'none';
      if (visible) {
        el.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * wpx}px, ${(-v.y * 0.5 + 0.5) * hpx}px)`;
        const bubble = el.firstChild;
        const text = !a.alive ? '💀' : a.asleep ? 'Zzz...' : a.bubble ? a.bubble.text : '';
        if (bubble.textContent !== text) bubble.textContent = text;
        bubble.style.display = text && opts.bubbles ? '' : 'none';
        el.classList.toggle('dead', !a.alive);
        el.classList.toggle('sel', a === selected);
      }
    }

    // śledzenie wybranego agenta
    if (selected && opts.follow) {
      const target = new THREE.Vector3(selected.x, world.groundHeight(selected.x, selected.z), selected.z);
      const delta = target.clone().sub(this.controls.target).multiplyScalar(0.08);
      this.controls.target.add(delta); this.camera.position.add(delta);
    }
    this.controls.update();
    this.renderer.render(scene, this.camera);
  }

  pick(clientX, clientY) {
    const m = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects([...this.agentMeshes.values()], true);
    return hits.length ? hits[0].object.userData.agent : null;
  }
}
