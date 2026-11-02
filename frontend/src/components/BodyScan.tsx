import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Stylised "total-body scan": a human silhouette drawn as stacked horizontal contour
// lines (cross-section ellipses), slowly rotating, with lesion markers. Purely illustrative.
type Ell = [number, number, number]; // centre x, radius x, radius z

function sections(y: number): Ell[] {
  const out: Ell[] = [];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  // head
  if (y > 1.59 && y < 1.84) { const t = (y - 1.715) / 0.125; const r = 0.095 * Math.sqrt(Math.max(0, 1 - t * t)); if (r > 0.01) out.push([0, r * 0.92, r]); }
  // neck
  if (y >= 1.47 && y <= 1.57) out.push([0, 0.045, 0.048]);
  // torso: shoulders -> waist -> hips
  if (y >= 0.86 && y < 1.47) {
    let w: number;
    if (y > 1.38) w = lerp(0.075, 0.2, (1.47 - y) / 0.09);
    else if (y > 1.12) w = lerp(0.2, 0.145, (1.38 - y) / 0.26);
    else w = lerp(0.145, 0.175, (1.12 - y) / 0.26);
    out.push([0, w, w * 0.55]);
  }
  // arms
  if (y >= 0.8 && y < 1.37) {
    const t = (1.37 - y) / 0.57;
    const r = lerp(0.048, 0.032, t) * Math.min(1, Math.sqrt(Math.max(0.05, (1.37 - y) / 0.04)));
    const x = lerp(0.235, 0.275, t);
    out.push([-x, r, r]); out.push([x, r, r]);
  }
  // legs
  if (y >= 0.02 && y < 0.88) {
    const t = (0.88 - y) / 0.86;
    const r = t < 0.5 ? lerp(0.085, 0.055, t / 0.5) : lerp(0.06, 0.04, (t - 0.5) / 0.5);
    const x = lerp(0.085, 0.07, t);
    out.push([-x, r, r * 1.05]); out.push([x, r, r * 1.05]);
  }
  return out;
}

export function BodyScan({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(-0.32, 0.95, 3.9);
    camera.lookAt(-0.32, 0.92, 0);

    const body = new THREE.Group(); scene.add(body);
    const pos: number[] = [];
    const seg = 56;
    for (let y = 0.02; y < 1.86; y += 0.013) {
      for (const [cx, rx, rz] of sections(y)) {
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
          pos.push(cx + Math.cos(a) * rx, y, Math.sin(a) * rz, cx + Math.cos(b) * rx, y, Math.sin(b) * rz);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    body.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd6dbe4, transparent: true, opacity: 0.55 })));

    // lesion markers on the surface (illustrative)
    const markers: { m: THREE.Mesh; base: number; hot?: boolean }[] = [];
    const spots: [number, number, number, boolean][] = [[-0.08, 1.3, -0.105, true], [0.1, 1.05, 0.08, false], [-0.27, 1.1, 0.03, false], [0.07, 0.55, 0.05, false], [0.12, 1.33, 0.1, false], [-0.05, 0.95, 0.09, false]];
    for (const [x, y, z, hot] of spots) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(hot ? 0.022 : 0.012, 16, 16), new THREE.MeshBasicMaterial({ color: hot ? 0xff6b4a : 0xf5f7fa, transparent: true }));
      m.position.set(x, y, z); body.add(m); markers.push({ m, base: hot ? 0.022 : 0.012, hot });
      if (hot) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.042, 40), new THREE.MeshBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        ring.position.copy(m.position); body.add(ring); markers.push({ m: ring, base: 1, hot: true });
      }
    }
    // scan plane
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.004), new THREE.MeshBasicMaterial({ color: 0x7fb2ff, transparent: true, opacity: 0.7 }));
    scene.add(plane);

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      body.rotation.y = Math.sin(t * 0.25) * 0.55 + Math.PI;
      plane.position.set(0, 0.05 + ((t * 0.35) % 1) * 1.8, 0.3);
      for (const k of markers) if (k.hot) { const s = 1 + 0.25 * Math.sin(t * 3); k.m.scale.setScalar(s); }
      renderer.render(scene, camera);
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);
  return <div ref={host} className={className} aria-hidden="true" />;
}
