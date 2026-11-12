// Modele low-poly: drzewa, skały, krzaki, wodorosty, kopalnia, ognisko, szałas, most, postacie.
import * as THREE from 'three';
import { T, W, H, idx, toWorld, toTile, heightToY } from '../world/world.js';
import { VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from '../ai/data.js';

export const modelsMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  makeLabel(a) {
    const el = document.createElement('div');
    el.className = 'agent-label';
    el.innerHTML = `<div class="bubble"></div><div class="name" style="--c:#${a.color.toString(16).padStart(6, '0')}">${a.name}</div>`;
    el.addEventListener('click', () => this.onPick && this.onPick(a));
    this.labelLayer.appendChild(el);
    return el;
  },
};
