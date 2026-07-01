import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, Text, ActivityIndicator, LayoutChangeEvent, Dimensions } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { createFallbackCarGroup, loadShowroomCarGroup, preloadShowroomModel } from '../../lib/loadGltfModelNative';

type Props = {
  modelAsset: number;
  height?: number;
  width?: number;
  autoRotate?: boolean;
};

type SceneRefs = {
  carGroup: THREE.Group | null;
  rotationY: number;
  dragging: boolean;
  autoRotate: boolean;
};

const { width: SCREEN_W } = Dimensions.get('window');

function disposeGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => m.dispose?.());
  });
}

export default function CarShowroomViewer({
  modelAsset,
  height = 260,
  width,
  autoRotate = true,
}: Props) {
  const backgroundColor = 0x14141c;
  const sceneRef = useRef<SceneRefs>({
    carGroup: null,
    rotationY: 0,
    dragging: false,
    autoRotate,
  });
  const dragStartX = useRef(0);
  const dragBaseRotation = useRef(0);
  const lastFrameMs = useRef(0);
  const frameRef = useRef<number | null>(null);
  const scene3d = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const mountedRef = useRef(true);

  const [layoutW, setLayoutW] = useState(width ?? 0);
  const [loadingGlb, setLoadingGlb] = useState(true);
  const [glReady, setGlReady] = useState(false);

  const effectiveW = Math.round(width ?? layoutW ?? SCREEN_W - 56);

  sceneRef.current.autoRotate = autoRotate;

  useEffect(() => {
    mountedRef.current = true;
    preloadShowroomModel(modelAsset);
    return () => { mountedRef.current = false; };
  }, [modelAsset]);

  useEffect(() => {
    if (width && width > 0) setLayoutW(width);
  }, [width]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setLayoutW((prev) => (prev === w ? prev : w));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        sceneRef.current.dragging = true;
        dragStartX.current = evt.nativeEvent.pageX;
        dragBaseRotation.current = sceneRef.current.rotationY;
      },
      onPanResponderMove: (evt) => {
        const deltaX = evt.nativeEvent.pageX - dragStartX.current;
        sceneRef.current.rotationY = dragBaseRotation.current + deltaX * 0.012;
        sceneRef.current.carGroup?.rotation.set(0, sceneRef.current.rotationY, 0);
      },
      onPanResponderRelease: () => { sceneRef.current.dragging = false; },
      onPanResponderTerminate: () => { sceneRef.current.dragging = false; },
    }),
  ).current;

  const startRenderLoop = useCallback((gl: ExpoWebGLRenderingContext, renderer: Renderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    lastFrameMs.current = performance.now();
    const tick = (now: number) => {
      if (!mountedRef.current) return;
      frameRef.current = requestAnimationFrame(tick);
      const delta = Math.min((now - lastFrameMs.current) / 1000, 0.05);
      lastFrameMs.current = now;
      const refs = sceneRef.current;
      if (refs.carGroup && refs.autoRotate && !refs.dragging) {
        refs.rotationY += delta * 0.5;
        refs.carGroup.rotation.y = refs.rotationY;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    requestAnimationFrame(tick);
  }, []);

  const swapCarGroup = useCallback((scene: THREE.Scene, next: THREE.Group) => {
    const prev = sceneRef.current.carGroup;
    if (prev) {
      scene.remove(prev);
      disposeGroup(prev);
    }
    next.rotation.y = sceneRef.current.rotationY;
    sceneRef.current.carGroup = next;
    scene.add(next);
  }, []);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    glRef.current = gl;
    setGlReady(true);
    setLoadingGlb(true);

    const w = gl.drawingBufferWidth || effectiveW;
    const h = gl.drawingBufferHeight || height;
    const renderer = new Renderer({ gl, antialias: false, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(1);
    renderer.setClearColor(backgroundColor);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene3d.current = scene;

    const camera = new THREE.PerspectiveCamera(42, w / Math.max(h, 1), 0.1, 200);
    camera.position.set(0, 1.35, 5.4);
    camera.lookAt(0, 0.75, 0);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x99bbff, 0.65);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a2a38, metalness: 0.35, roughness: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.55, 48),
      new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    scene.add(ring);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    scene.add(shadow);

    swapCarGroup(scene, createFallbackCarGroup());
    startRenderLoop(gl, renderer, scene, camera);

    try {
      const carGroup = await loadShowroomCarGroup(modelAsset);
      if (!mountedRef.current || scene3d.current !== scene) return;
      swapCarGroup(scene, carGroup);
    } catch (err) {
      console.error('CarShowroomViewer load:', err);
    } finally {
      if (mountedRef.current) setLoadingGlb(false);
    }
  }, [effectiveW, height, modelAsset, startRenderLoop, swapCarGroup]);

  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
  }, []);

  const canMountGl = effectiveW > 0;

  return (
    <View
      style={[s.wrap, { height, width: canMountGl ? effectiveW : '100%' }]}
      collapsable={false}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      {canMountGl ? (
        <GLView
          key={`gl-${effectiveW}x${height}`}
          collapsable={false}
          style={{ width: effectiveW, height }}
          onContextCreate={onContextCreate}
        />
      ) : (
        <View style={[s.placeholder, { height }]}>
          <ActivityIndicator color="#FF2D55" />
        </View>
      )}

      {loadingGlb ? (
        <View style={s.badge} pointerEvents="none">
          <ActivityIndicator size="small" color="#FF2D55" />
          <Text style={s.badgeText}>Loading car…</Text>
        </View>
      ) : null}

      {glReady && !loadingGlb ? (
        <Text style={s.hint} pointerEvents="none">Drag to rotate</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: '#14141c',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  placeholder: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14141c',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  hint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
  },
});