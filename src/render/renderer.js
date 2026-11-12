// Renderowanie 3D (Three.js): scena, światło, pora dnia, aktualizacja obiektów co klatkę, kamera.
// Modele i teren są w models.js i terrain.js.
import * as THREE from 'three';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { T, W, H, idx, toWorld, toTile, heightToY } from '../world/world.js';
import { VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from '../ai/data.js';
import { modelsMethods } from './models.js';
import { Instancer } from './instances.js';
import { terrainMethods } from './terrain.js';
import { PIECE_LH } from '../world/pieces.js';


const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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

  // jakość grafiki: 'high' (cienie, ostrzejszy obraz) albo 'low' (bez cieni, mniejsza rozdzielczość)
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(window.devicePixelRatio, 1) * 0.85 : Math.min(window.devicePixelRatio, 1.5));
    if (this.sun) this.sun.castShadow = q !== 'low';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    this.sun.castShadow = this.quality !== 'low';
    const S = Math.max(W, H) * 0.6;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun, this.sun.target);

    this.buildTerrain(world);
    this.buildSea();
    this.resMeshes = new Map();
    this.instancer = new Instancer(scene);
    // stała pula świateł ognisk: nowe ognisko nie wymusza przekompilowania wszystkich materiałów
    this.fireLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9a40, 0, 9, 1.6); scene.add(l); return l; });
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
    this.boarMeshes = new Map();
    this.pieceGroup = new THREE.Group(); scene.add(this.pieceGroup); world.piecesChanged = true;
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
      this.cone.scale.setScalar((eye.viewR || VIEW_RANGE) / VIEW_RANGE);
    } else if (this.fogFor) { this.applyFog(null); this.cone.visible = false; }
    else this.cone.visible = false;
    const inCone = (x, z) => {
      if (!eye) return true;
      const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz);
      const R = eye.viewR || VIEW_RANGE, mul = R / VIEW_RANGE; // w nocy postać widzi bliżej
      if (d > R) return false;
      if (d <= VIEW_NEAR) return true;
      let a = Math.atan2(dx, dz) - eye.facing;
      while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      return Math.abs(a) <= viewHalfAngle(d / mul) && !eye.asleep;
    };
    const known = (x, z) => { if (!eye) return true; const t = toTile(x, z); return !!eye.seen[idx(t.i, t.j)]; };
    if (eye || this.hadEye) {
      for (const [r, g] of this.resMeshes) { const v = !eye || !!eye.seen[idx(r.i, r.j)]; if (g.visible !== v) { g.visible = v; this.instancer.sync(g); } }
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
    // fale co drugą klatkę (przeliczanie normalnych jest kosztowne)
    this.seaTick = (this.seaTick || 0) + 1;
    if (this.seaTick % 2 === 0) {
      const pos = this.sea.geometry.attributes.position, base = this.seaBase;
      for (let n = 0; n < pos.count; n++) {
        const x = base[n * 3], z = base[n * 3 + 2];
        pos.array[n * 3 + 1] = Math.sin(x * 0.35 + rt * 1.1) * 0.06 + Math.cos(z * 0.3 + rt * 0.8) * 0.06;
      }
      pos.needsUpdate = true;
      this.sea.geometry.computeVertexNormals();
    }

    // zmiany zasobów
    for (const r of world.changed) {
      if (!this.resMeshes.has(r) && !r.removed) this.addResMesh(r); else this.updateResMesh(r);
    }
    world.changed.clear();
    if (world.structuresChanged) {
      world.structuresChanged = false;
      for (const s of world.structures) if (!this.structMeshes.has(s)) this.addStructure(s);
    }
    if (world.piecesChanged) { world.piecesChanged = false; this.buildPieces(world); }
    if (world.bridgeChanged) {
      world.bridgeChanged = false;
      for (const br of world.bridges) br.tiles.forEach((t) => { if (world.type[idx(t.i, t.j)] === T.BRIDGE) this.addBridgeTile(t.i, t.j, br); });
    }
    const fires = [];
    for (const [s, g] of this.structMeshes) {
      if (s.kind === 'stash') { g.visible = !!s.items && Object.values(s.items).some((v) => v > 0); continue; } // pusta kupka znika
      if (s.kind === 'field' || s.kind === 'planter') {
        // roślina rośnie (skala), dojrzała pokazuje plon; mokra ziemia ciemnieje po podlaniu
        const sc = s.kind === 'field' ? 1 : 0.55;
        const k = s.stage === 'planted' ? 0.15 + s.growth * 0.85 : s.stage === 'ripe' ? 1 : 0;
        const crop = s.crop || 'berry';
        for (const [name, c, ripe] of [['plant', 'berry'], ['fruit', 'berry', 1], ['ryePlant', 'rye'], ['ryeEars', 'rye', 1], ['flowerPlant', 'flower'], ['bloom', 'flower', 1]]) {
          const o = g.getObjectByName(name);
          o.visible = k > 0 && crop === c && (!ripe || s.stage === 'ripe');
          if (o.visible) o.scale.setScalar(sc * Math.max(0.01, k));
        }
        g.getObjectByName('wet').visible = s.water > 0;
        continue;
      }
      if (s.kind !== 'campfire') continue;
      const fl = g.getObjectByName('flame'), fl2 = g.getObjectByName('flame2');
      // ruszt dokłada się, gdy postać go zrobi
      if (s.grill && !g.getObjectByName('grill')) {
        const gr = new THREE.Group(); gr.name = 'grill';
        for (let k = -2; k <= 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.62), this.mat.post); b.position.set(k * 0.12, 0.42, 0); gr.add(b); }
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(this.geo.post, this.mat.post); p.scale.set(0.7, 0.36, 0.7); p.position.set(sx * 0.33, 0.21, 0); gr.add(p); }
        g.add(gr);
      }
      // wygasłe ognisko: bez płomieni i bez światła
      const lit = s.fuel > 0;
      fl.visible = fl2.visible = lit;
      if (!lit) continue;
      const k = 1 + Math.sin(rt * 13 + s.id) * 0.15 + Math.sin(rt * 7.3) * 0.1;
      fl.scale.set(1, k, 1); fl2.scale.set(1, 2 - k, 1);
      fires.push({ g, k, d: g.position.distanceToSquared(this.controls.target) });
    }
    // płonące pochodnie świecą jak małe ogniska
    for (const a of agents) {
      const g = this.agentMeshes.get(a);
      if (g && a.alive && !a.asleep && a.heldL === 'torch' && a.torchBurn > 0 && g.visible) fires.push({ g, k: 0.45 + Math.sin(rt * 15 + a.id) * 0.05, d: g.position.distanceToSquared(this.controls.target), torch: true });
    }
    fires.sort((a, b) => a.d - b.d);
    this.fireLights.forEach((l, n) => {
      const f = fires[n];
      l.intensity = f ? (1 - dl) * 6 * f.k + 0.5 : 0;
      if (f) l.position.set(f.g.position.x, f.g.position.y + (f.torch ? 1.1 : 0.7), f.g.position.z);
    });

    // płynny ruch: pozycja między poprzednim a bieżącym krokiem symulacji (krok trwa 0,1 s, klatka zwykle krócej)
    const al = world.alpha ?? 1;
    const lp = (o) => {
      if (o._px === undefined || Math.abs(o.x - o._px) + Math.abs(o.z - o._pz) > 3) return { x: o.x, y: o.y, z: o.z };
      return { x: o._px + (o.x - o._px) * al, y: o.y === undefined ? undefined : o._py + (o.y - o._py) * al, z: o._pz + (o.z - o._pz) * al };
    };
    const la = (cur, prev) => (prev === undefined ? cur : prev + wrapA(cur - prev) * al);
    // ryby
    const seenF = new Set();
    for (const fsh of world.fish) {
      seenF.add(fsh);
      let m = this.fishMeshes.get(fsh);
      if (!m) { m = new THREE.Mesh(this.geo.fish, this.mat.fish); m.rotation.order = 'YXZ'; scene.add(m); this.fishMeshes.set(fsh, m); }
      const jy = fsh.jump > 0 ? Math.sin((1 - fsh.jump) * Math.PI) * 0.9 : 0;
      const fp = lp(fsh);
      m.position.set(fp.x, -fsh.depth + jy, fp.z);
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
      const bp = lp(b);
      g.position.set(bp.x, bp.y, bp.z);
      const dx = bp.x - prev.x, dz = b.z - prev.z;
      if (dx * dx + dz * dz > 1e-6) g.rotation.y = Math.atan2(dx, dz);
      const flap = b.state === 'landed' ? 0.1 : Math.sin(rt * (b.state === 'landing' ? 18 : 9) + b.id) * 0.7;
      g.getObjectByName('w-1').rotation.z = flap; g.getObjectByName('w1').rotation.z = -flap;
      g.visible = inCone(b.x, b.z);
    }
    for (const [b, g] of this.birdMeshes) if (!seenB.has(b)) { scene.remove(g); this.birdMeshes.delete(b); }

    // dziki
    for (const b of world.boars || []) {
      let g = this.boarMeshes.get(b);
      if (!g) {
        g = new THREE.Group();
        const fur = this.mat.boar || (this.mat.boar = new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: 0.9, flatShading: true }));
        const tusk = this.mat.tusk || (this.mat.tusk = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.5 }));
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.75), fur); body.position.y = 0.36; body.castShadow = true; g.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.27, 0.3), fur); head.position.set(0, 0.36, 0.48); head.castShadow = true; g.add(head);
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), this.mat.post); snout.position.set(0, 0.32, 0.66); g.add(snout);
        for (const s of [-1, 1]) {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), tusk); t.position.set(s * 0.09, 0.28, 0.66); t.rotation.x = -0.6; g.add(t);
          for (const zz of [-0.25, 0.25]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), fur); l.position.set(s * 0.14, 0.11, zz); l.name = 'leg'; g.add(l); }
        }
        scene.add(g); this.boarMeshes.set(b, g);
      }
      const rp = lp(b);
      g.position.set(rp.x, world.groundHeight(rp.x, rp.z), rp.z);
      g.rotation.y = Math.PI / 2 - la(b.dir, b._pf);
      const run = b.state === 'charge' || b.state === 'flee';
      g.children.forEach((c) => { if (c.name === 'leg') c.rotation.x = Math.sin(rt * (run ? 18 : 8) + c.position.z * 10) * (run ? 0.6 : 0.3); });
      // upolowany dzik leży na boku, dopóki ktoś go nie oskóruje
      if (b.dead) { g.rotation.z = Math.PI / 2; g.position.y += 0.2; } else g.rotation.z = 0;
      g.visible = (!b.dead || !b.skinned) && inCone(b.x, b.z);
    }

    // agenci
    const v = new THREE.Vector3();
    const wpx = window.innerWidth, hpx = window.innerHeight;
    for (const a of agents) {
      let g = this.agentMeshes.get(a);
      if (!g) { g = this.makeAgentMesh(a); this.agentMeshes.set(a, g); this.labels.set(a, this.makeLabel(a)); }
      const ap = lp(a), ax = ap.x, az = ap.z, af = la(a.facing, a._pf);
      const gy = world.groundHeight(ax, az);
      const moving = a.task && a.task.path && a.task.path.length > 0;
      const bob = moving ? Math.abs(Math.sin(rt * 10 + a.id)) * 0.06 : 0;
      g.position.set(ax, gy + bob, az);
      const arm = g.getObjectByName('arm'), armL = g.getObjectByName('armL');
      if (!a.alive || a.asleep) {
        g.rotation.set(-Math.PI / 2, af, 0, 'YXZ'); g.position.y = gy + 0.18;
        if (!a.alive) g.getObjectByName('body').material.color.set(0x777777);
      } else {
        g.rotation.set(0, af, 0);
        arm.rotation.x = a.working ? Math.sin(rt * 9 + a.id) * 1.0 - 0.6 : moving ? Math.sin(rt * 10) * 0.4 : 0;
        // lewa ręka: z pochodnią albo tarczą trzymana przed sobą, pusta macha przy chodzeniu
        armL.rotation.x = a.heldL ? -0.7 : moving ? -Math.sin(rt * 10) * 0.4 : 0;
      }
      // przedmiot w ręku
      const want = !a.alive || a.asleep ? null : ({ ironAxe: 'axe', ironPick: 'pickaxe' }[a.held] || a.held || null);
      if (g.userData.held !== want) {
        for (const c of arm.children) if (c.name !== 'hand') c.visible = c.name === 'h_' + want;
        g.userData.held = want;
      }
      const wantL = !a.alive || a.asleep ? null : a.heldL || null;
      if (g.userData.heldL !== wantL) {
        for (const c of armL.children) if (c.name !== 'hand') c.visible = c.name === 'h_' + wantL;
        g.userData.heldL = wantL;
      }
      if (wantL === 'torch') { const f = armL.getObjectByName('tflame'); if (f) f.scale.set(1, 1 + Math.sin(rt * 15 + a.id) * 0.25, 1); }
      g.getObjectByName('ring').visible = a === selected;
      const seenNow = a === eye || inCone(a.x, a.z);
      g.visible = seenNow;
      // etykieta
      const el = this.labels.get(a);
      v.set(ax, gy + 1.25, az).project(this.camera);
      // dymek: wypowiedź, a gdy model właśnie myśli nad odpowiedzią – „💭”
      const text = !a.alive ? '💀' : a.asleep ? 'Zzz...' : a.bubble ? a.bubble.text : a.llmBusy ? '💭 …' : '';
      // imię i dymek włącza się niezależnie: etykieta jest widoczna, gdy pokazuje choć jedno z nich
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && seenNow && (opts.labels || (opts.bubbles && !!text));
      el.style.display = visible ? '' : 'none';
      if (visible) {
        el.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * wpx}px, ${(-v.y * 0.5 + 0.5) * hpx}px)`;
        const bubble = el.firstChild;
        el.lastChild.style.display = opts.labels ? '' : 'none';
        if (bubble.textContent !== text) bubble.textContent = text;
        bubble.classList.toggle('script', !!(a.bubble && a.bubble.script));
        bubble.style.display = text && opts.bubbles ? '' : 'none';
        el.classList.toggle('dead', !a.alive);
        el.classList.toggle('sel', a === selected);
      }
    }

    // śledzenie wybranego agenta
    if (selected && opts.follow) {
      const sp = lp(selected);
      const target = new THREE.Vector3(sp.x, world.groundHeight(sp.x, sp.z), sp.z);
      const flying = this.flyT > 0;
      const delta = target.clone().sub(this.controls.target).multiplyScalar(flying ? 0.14 : 0.08);
      this.controls.target.add(delta); this.camera.position.add(delta);
      if (flying) {
        this.flyT -= 1 / 60;
        // przy przelocie do postaci podjedź bliżej, jeśli kamera jest daleko
        const off = this.camera.position.clone().sub(this.controls.target);
        const d = off.length();
        if (d > 38) this.camera.position.copy(this.controls.target).add(off.multiplyScalar((d - (d - 38) * 0.1) / d));
      }
    }
    this.controls.update();
    this.renderer.render(scene, this.camera);
  }

  flyTo() { this.flyT = 1.5; }

  // deski z budowy: przebudowa całej grupy przy każdej zmianie (to tylko kilkadziesiąt prostych brył)
  buildPieces(world) {
    const g = this.pieceGroup;
    while (g.children.length) g.remove(g.children[0]);
    if (!this.pieceGeo) {
      this.pieceGeo = {
        floor: new THREE.BoxGeometry(0.98, 0.06, 0.98),
        wallX: new THREE.BoxGeometry(1.0, PIECE_LH, 0.07), wallZ: new THREE.BoxGeometry(0.07, PIECE_LH, 1.0),
        slopeZ: new THREE.BoxGeometry(1.02, 0.06, Math.hypot(1, 0.6)), slopeX: new THREE.BoxGeometry(Math.hypot(1, 0.6), 0.06, 1.02),
      };
    }
    const G = this.pieceGeo, A = Math.atan(0.6);
    const land = (i, j) => world.land(i, j);
    for (const p of world.pieces) {
      const c = toWorld(p.i, p.j);
      let m;
      if (p.type === 'floor') {
        m = new THREE.Mesh(G.floor, this.mat.plank);
        m.position.set(c.x, world.tileY(p.i, p.j) + p.lvl * PIECE_LH + 0.04, c.z);
      } else if (p.type === 'wall') {
        const ni = p.side === 'W' ? p.i - 1 : p.i, nj = p.side === 'N' ? p.j - 1 : p.j;
        const base = Math.max(land(p.i, p.j) ? world.tileY(p.i, p.j) : -9, land(ni, nj) ? world.tileY(ni, nj) : -9, 0);
        m = new THREE.Mesh(p.side === 'N' ? G.wallX : G.wallZ, this.mat.plank);
        m.position.set(p.side === 'W' ? c.x - 0.5 : c.x, base + p.lvl * PIECE_LH + PIECE_LH / 2, p.side === 'N' ? c.z - 0.5 : c.z);
      } else {
        const alongZ = p.side === 'N' || p.side === 'S';
        m = new THREE.Mesh(alongZ ? G.slopeZ : G.slopeX, this.mat.post);
        if (p.side === 'N') m.rotation.x = A; else if (p.side === 'S') m.rotation.x = -A;
        else if (p.side === 'E') m.rotation.z = A; else m.rotation.z = -A;
        m.position.set(c.x, world.tileY(p.i, p.j) + p.lvl * PIECE_LH + 0.3, c.z);
      }
      m.castShadow = true; m.receiveShadow = true;
      m.userData.piece = p;
      g.add(m);
    }
  }
  pickPiece(clientX, clientY) {
    if (!this.pieceGroup || !this.pieceGroup.children.length) return null;
    const m = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects(this.pieceGroup.children, false);
    return hits.length ? hits[0].object.userData.piece : null;
  }

  pick(clientX, clientY) {
    const m = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects([...this.agentMeshes.values()], true);
    return hits.length ? hits[0].object.userData.agent : null;
  }
}

Object.assign(Renderer.prototype, modelsMethods, terrainMethods);
