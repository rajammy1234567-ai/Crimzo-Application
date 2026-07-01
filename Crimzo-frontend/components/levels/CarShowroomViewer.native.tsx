import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, PanResponder, Text, ActivityIndicator } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Props = {
  modelAsset: number;
  height?: number;
  autoRotate?: boolean;
};

type SceneRefs = {
  carGroup: THREE.Group | null;
  rotationY: number;
  dragging: boolean;
  autoRotate: boolean;
};

export default function CarShowroomViewer({
  modelAsset,
  height = 240,
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
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const frameRef = useRef<number | null>(null);

  sceneRef.current.autoRotate = autoRotate;

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
        if (sceneRef.current.carGroup) {
          sceneRef.current.carGroup.rotation.y = sceneRef.current.rotationY;
        }
      },
      onPanResponderRelease: (evt) => {
        const deltaX = evt.nativeEvent.pageX - dragStartX.current;
        sceneRef.current.rotationY = dragBaseRotation.current + deltaX * 0.012;
        sceneRef.current.dragging = false;
      },
      onPanResponderTerminate: () => {
        sceneRef.current.dragging = false;
      },
    }),
  ).current;

  const disposeScene = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    sceneRef.current.carGroup = null;
    rendererRef.current = null;
    glRef.current = null;
  }, []);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    disposeScene();
    glRef.current = gl;
    setLoading(true);
    setLoadError(null);

    const { drawingBufferWidth: width, drawingBufferHeight: heightPx } = gl;
    const renderer = new Renderer({ gl });
    renderer.setSize(width, heightPx);
    renderer.setClearColor(backgroundColor);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(backgroundColor, 8, 18);

    const camera = new THREE.PerspectiveCamera(42, width / heightPx, 0.1, 1000);
    camera.position.set(0, 1.15, 4.8);
    camera.lookAt(0, 0.45, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(5, 9, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.45);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffd6a0, 0.65);
    rimLight.position.set(0, 6, -9);
    scene.add(rimLight);

    const spot = new THREE.SpotLight(0xffffff, 1.1, 20, Math.PI / 5, 0.35, 1);
    spot.position.set(0, 8, 2);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);

    const groundGeo = new THREE.CircleGeometry(5.5, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x23232f,
      metalness: 0.55,
      roughness: 0.38,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    const ringGeo = new THREE.RingGeometry(1.35, 1.55, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2d55,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    try {
      const asset = Asset.fromModule(modelAsset);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;

      await new Promise<void>((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
          uri,
          (gltf) => {
            const carGroup = new THREE.Group();
            carGroup.add(gltf.scene);

            const box = new THREE.Box3().setFromObject(gltf.scene);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            gltf.scene.position.sub(center);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 2.35 / maxDim;
            carGroup.scale.set(scale, scale, scale);
            carGroup.position.y = 0.05;

            scene.add(carGroup);
            sceneRef.current.carGroup = carGroup;
            sceneRef.current.rotationY = 0;
            carGroup.rotation.y = 0;
            setLoading(false);
            resolve();
          },
          undefined,
          (err) => reject(err),
        );
      });
    } catch (err) {
      console.error('Showroom model load error:', err);
      setLoadError('Could not load 3D model');
      setLoading(false);
    }

    const render = () => {
      frameRef.current = requestAnimationFrame(render);
      const refs = sceneRef.current;
      if (refs.carGroup && refs.autoRotate && !refs.dragging) {
        refs.rotationY += 0.006;
        refs.carGroup.rotation.y = refs.rotationY;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  }, [disposeScene, modelAsset]);

  return (
    <View style={[s.container, { height }]} {...panResponder.panHandlers}>
      <GLView
        key={String(modelAsset)}
        style={s.glView}
        onContextCreate={onContextCreate}
      />
      {loading && !loadError ? (
        <View style={s.overlay}>
          <ActivityIndicator color="#FF2D55" />
          <Text style={s.overlayText}>Loading showroom…</Text>
        </View>
      ) : null}
      {loadError ? (
        <View style={s.overlay}>
          <Text style={s.errorText}>{loadError}</Text>
        </View>
      ) : null}
      <Text style={s.dragHint}>Drag to rotate</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#14141c',
    borderRadius: 16,
    overflow: 'hidden',
  },
  glView: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,15,0.55)',
    gap: 8,
  },
  overlayText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  errorText: { color: '#FF6B8A', fontSize: 12, fontWeight: '700' },
  dragHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.28)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});