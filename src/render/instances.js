// Instancjonowanie: tysiące drzew, skał i krzaków rysowane kilkudziesięcioma wywołaniami zamiast tysięcy.
// Każdy zasób nadal jest budowany jako zwykła THREE.Group (niewstawiona do sceny); jej siatki
// trafiają do wspólnych InstancedMesh pogrupowanych po (geometria, materiał).
import * as THREE from 'three';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class Pool {
  constructor(scene, geo, mat, shadow) {
    this.scene = scene; this.geo = geo; this.mat = mat; this.shadow = shadow;
    this.cap = 0; this.used = 0; this.free = []; this.mesh = null;
    this.grow(64);
  }
  grow(cap) {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = this.shadow; m.receiveShadow = true;
    m.frustumCulled = false; // instancje są rozrzucone po całej mapie
    for (let k = 0; k < cap; k++) m.setMatrixAt(k, ZERO);
    if (this.mesh) {
      m.instanceMatrix.array.set(this.mesh.instanceMatrix.array);
      this.scene.remove(this.mesh); this.mesh.dispose();
    }
    m.count = this.used || 0;
    this.mesh = m; this.cap = cap;
    this.scene.add(m);
  }
  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.used >= this.cap) this.grow(this.cap * 2);
    this.used++;
    this.mesh.count = this.used;
    return this.used - 1;
  }
  release(slot) { this.mesh.setMatrixAt(slot, ZERO); this.free.push(slot); this.mesh.instanceMatrix.needsUpdate = true; }
  set(slot, matrix) { this.mesh.setMatrixAt(slot, matrix); this.mesh.instanceMatrix.needsUpdate = true; }
}

export class Instancer {
  constructor(scene) { this.scene = scene; this.pools = new Map(); }
  pool(geo, mat, shadow) {
    const key = geo.uuid + '|' + mat.uuid;
    let p = this.pools.get(key);
    if (!p) { p = new Pool(this.scene, geo, mat, shadow); this.pools.set(key, p); }
    return p;
  }
  // przypisz siatkom grupy miejsca w pulach
  attach(group) {
    const parts = [];
    group.traverse((o) => { if (o.isMesh) { const p = this.pool(o.geometry, o.material, o.castShadow); parts.push({ o, p, slot: p.alloc() }); } });
    group.userData.parts = parts;
    this.sync(group);
  }
  // przepisz macierze po zmianie widoczności / skali / pozycji
  sync(group) {
    group.updateMatrixWorld(true);
    for (const { o, p, slot } of group.userData.parts) {
      let vis = true;
      for (let n = o; n; n = n.parent) if (!n.visible) { vis = false; break; }
      p.set(slot, vis ? o.matrixWorld : ZERO);
    }
  }
  detach(group) {
    for (const { p, slot } of group.userData.parts || []) p.release(slot);
    group.userData.parts = [];
  }
  get drawCalls() { return this.pools.size; }
}
