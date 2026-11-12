// Renderowanie 3D (Three.js): scena, światło, pora dnia, aktualizacja obiektów co klatkę, kamera.
// Modele i teren są w models.js i terrain.js.
import * as THREE from 'three';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { T, W, H, idx, toWorld, toTile, heightToY } from '../world/world.js';
import { VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from '../ai/data.js';
import { modelsMethods } from './models.js';
import { Instancer } from './instances.js';
import { terrainMethods } from './terrain.js';


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
    if (world.bridgeChanged) {
      world.bridgeChanged = false;
      for (const br of world.bridges) br.tiles.forEach((t) => { if (world.type[idx(t.i, t.j)] === T.BRIDGE) this.addBridgeTile(t.i, t.j, br); });
    }
    const fires = [];
    for (const [s, g] of this.structMeshes) {
      if (s.kind !== 'campfire') continue;
      const fl = g.getObjectByName('flame'), fl2 = g.getObjectByName('flame2');
      const k = 1 + Math.sin(rt * 13 + s.id) * 0.15 + Math.sin(rt * 7.3) * 0.1;
      fl.scale.set(1, k, 1); fl2.scale.set(1, 2 - k, 1);
      fires.push({ g, k, d: g.position.distanceToSquared(this.controls.target) });
    }
    fires.sort((a, b) => a.d - b.d);
    this.fireLights.forEach((l, n) => {
      const f = fires[n];
      l.intensity = f ? (1 - dl) * 6 * f.k + 0.5 : 0;
      if (f) l.position.set(f.g.position.x, f.g.position.y + 0.7, f.g.position.z);
    });

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
        // dymek: wypowiedź, a gdy model właśnie myśli nad odpowiedzią – „💭”
        const text = !a.alive ? '💀' : a.asleep ? 'Zzz...' : a.bubble ? a.bubble.text : a.llmBusy ? '💭 …' : '';
        if (bubble.textContent !== text) bubble.textContent = text;
        bubble.classList.toggle('script', !!(a.bubble && a.bubble.script));
        bubble.style.display = text && opts.bubbles ? '' : 'none';
        el.classList.toggle('dead', !a.alive);
        el.classList.toggle('sel', a === selected);
      }
    }

    // śledzenie wybranego agenta
    if (selected && opts.follow) {
      const target = new THREE.Vector3(selected.x, world.groundHeight(selected.x, selected.z), selected.z);
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

  pick(clientX, clientY) {
    const m = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hits = this.raycaster.intersectObjects([...this.agentMeshes.values()], true);
    return hits.length ? hits[0].object.userData.agent : null;
  }
}

Object.assign(Renderer.prototype, modelsMethods, terrainMethods);
