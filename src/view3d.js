// 3D 전체 구조: 악기마다 원판 탑 하나, 아래부터 1번 원판
// THREE, THREE.OrbitControls는 index.html에서 미리 불러온 전역값

const X_GAP = 2.7, Y_GAP = 0.6;

// opts: { towers(): [{label, count, mute}], paint(canvas, t, d), onSelect(t, d), tok() }
export function createView3D(el, opts){
  const THREE = window.THREE;
  if (!THREE || !THREE.OrbitControls){
    el.innerHTML = '<div class="fallback">3D 화면을 불러오지 못했어요. 악기와 원판 버튼으로 편집은 그대로 할 수 있어요.</div>';
    return { rebuild(){}, update(){}, refresh(){}, resetView(){} };
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = true; controls.screenSpacePanning = true;
  controls.minDistance = 3; controls.maxDistance = 60; controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(4, 10, 6); scene.add(dl);

  let group = null, discs = [], textures = {}, selRing = null, fit = null;

  new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const first = !camera.userData.sized;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.userData.sized = true;
    computeFit();
    if (first) resetView();
  }).observe(el);

  // 드래그가 아닌 클릭이면 원판 선택
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => down = { x: e.clientX, y: e.clientY });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, camera);
    const hits = ray.intersectObjects(discs.map(o => o.mesh));
    if (hits.length){ const u = hits[0].object.userData; opts.onSelect(u.t, u.d); }
  });

  function makeLabel(text, tok){
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = tok.fg; ctx.font = '36px "Do Hyeon", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(2.0, 0.5, 1);
    return sp;
  }

  function resetView(){
    if (!fit) return;
    camera.position.copy(fit.pos); controls.target.copy(fit.target); controls.update();
  }

  function rebuild(refit){
    const tok = opts.tok();
    if (group){
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      scene.remove(group);
    }
    group = new THREE.Group(); discs = []; textures = {};
    const towers = opts.towers(), T = towers.length, offX = (T - 1) * X_GAP / 2;
    const L = Math.max(1, ...towers.map(t => t.count));
    const discGeo = new THREE.CylinderGeometry(1, 1, 0.12, 64);
    const sideCol = new THREE.Color(tok.disc), baseCol = new THREE.Color(tok.shelf);

    towers.forEach((tw, t) => {
      const x = t * X_GAP - offX, towerH = (tw.count - 1) * Y_GAP;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.1, 64), new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.9 }));
      base.position.set(x, -0.2, 0); group.add(base);
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, towerH + 0.6, 16), new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.6 }));
      spindle.position.set(x, towerH / 2 + 0.05, 0); group.add(spindle);
      const label = makeLabel(tw.label, tok);
      label.position.set(x, -0.75, 1.3); group.add(label);

      for (let d = 0; d < tw.count; d++){
        const c = document.createElement('canvas'); c.width = c.height = 512;
        opts.paint(c, t, d);
        const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
        textures[t + '-' + d] = { tex, canvas: c };
        const op = tw.mute ? 0.45 : 1;
        const mats = [
          new THREE.MeshStandardMaterial({ color: sideCol, roughness: 0.5, transparent: op < 1, opacity: op }),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, transparent: op < 1, opacity: op }),
          new THREE.MeshStandardMaterial({ color: sideCol, transparent: op < 1, opacity: op })
        ];
        const mesh = new THREE.Mesh(discGeo, mats);
        mesh.position.set(x, d * Y_GAP, 0); mesh.userData = { t, d }; group.add(mesh);
        const glow = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.035, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(tok.glow) }));
        glow.rotation.x = Math.PI / 2; glow.position.copy(mesh.position); glow.visible = false; group.add(glow);
        discs.push({ mesh, glow, t, d, mute: tw.mute });
      }
    });
    selRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.05, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(tok.accent) }));
    selRing.rotation.x = Math.PI / 2; group.add(selRing);
    scene.add(group);

    lastSize = { H: (L - 1) * Y_GAP, W: T * X_GAP };
    computeFit();
    if (refit) resetView();
  }

  // 화면 비율까지 고려해서 탑 전체가 들어오는 카메라 거리
  let lastSize = { H: 0, W: X_GAP };
  function computeFit(){
    const { H, W } = lastSize;
    const vf = camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * (camera.aspect || 1));
    const needW = (W / 2 + 1.4) / Math.tan(hf / 2);
    const needH = (H / 2 + 1.6) / Math.tan(vf / 2);
    const dist = Math.max(needW, needH, 6) * 0.95;
    fit = { pos: new THREE.Vector3(0, H / 2 + dist * 0.55, dist * 0.84), target: new THREE.Vector3(0, H / 2 - 0.2, 0) };
  }

  // s: { rot(t,d) → 회전각 또는 null, playing, sel:{t,d} }
  function update(s){
    for (const o of discs){
      const r = s.rot(o.t, o.d);
      o.mesh.rotation.y = r == null ? 0 : r;
      o.glow.visible = r != null && s.playing && !o.mute;
      if (o.t === s.sel.t && o.d === s.sel.d) selRing.position.copy(o.mesh.position);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function refresh(t, d){
    const e = textures[t + '-' + d];
    if (!e) return;
    opts.paint(e.canvas, t, d);
    e.tex.needsUpdate = true;
  }

  return { rebuild, update, refresh, resetView };
}
