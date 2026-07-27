import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Piece } from '../lib/packing';
import { RotateCw, RefreshCw, Box, Eye, Palette, Pause, Play, Footprints, Move } from 'lucide-react';

interface FurniturePreviewProps {
  pieces: Piece[];
  onCaptureCanvas?: (getCanvasDataUrl: () => string | null) => void;
}

export const FurniturePreview: React.FC<FurniturePreviewProps> = ({ pieces, onCaptureCanvas }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  
  // Color scheme state: 'white', 'bicolor', 'mdf', 'dark'
  const [colorScheme, setColorScheme] = useState<'white' | 'bicolor' | 'mdf' | 'dark'>('white');
  
  // Leg style state: 'none', 'palito', 'rodape'
  const [legStyle, setLegStyle] = useState<'none' | 'palito' | 'rodape'>('none');

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const furnitureGroupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Auto-detect leg style from pieces on initial load or piece changes
  useEffect(() => {
    const hasLegPieces = pieces.some(p => /pé|pe|perna|leg/i.test(p.name));
    if (hasLegPieces) {
      setLegStyle('palito');
    }
  }, [pieces]);

  // Setup Three.js Scene
  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || 340;
    const height = 360;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060913');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(210, 160, 240);
    cameraRef.current = camera;

    // Renderer with preserveDrawingBuffer enabled for PDF capture
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    if (onCaptureCanvas) {
      onCaptureCanvas(() => {
        if (rendererRef.current) {
          try {
            return rendererRef.current.domElement.toDataURL('image/png');
          } catch (e) {
            console.error(e);
          }
        }
        return null;
      });
    }

    // Clean previous canvas
    currentMount.innerHTML = '';
    currentMount.appendChild(renderer.domElement);

    // OrbitControls with Panning Enabled
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.panSpeed = 1.0;
    controls.screenSpacePanning = true; // 2D screen space panning
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.minDistance = 30;
    controls.maxDistance = 1200;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff7ed, 1.3);
    dirLight1.position.set(160, 260, 160);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.5);
    dirLight2.position.set(-160, 120, -160);
    scene.add(dirLight2);

    // Floor Grid & Shadow Receiver
    const gridHelper = new THREE.GridHelper(500, 25, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    const planeGeo = new THREE.PlaneGeometry(800, 800);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowPlane = new THREE.Mesh(planeGeo, planeMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate;
        controlsRef.current.autoRotateSpeed = 1.5;
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle Window Resize
    const handleResize = () => {
      if (!currentMount) return;
      const newWidth = currentMount.clientWidth;
      camera.aspect = newWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update AutoRotate state
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Build 3D Furniture Model & Auto-Fit Camera
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing furniture meshes
    const objectsToRemove: THREE.Object3D[] = [];
    scene.children.forEach(child => {
      if (child.name === 'furnitureGroup') {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach(obj => scene.remove(obj));

    if (!pieces || pieces.length === 0) return;

    const furnitureGroup = new THREE.Group();
    furnitureGroup.name = 'furnitureGroup';
    furnitureGroupRef.current = furnitureGroup;

    // Expand pieces by quantity
    const expandedPieces: { name: string; height: number; width: number; ab?: number }[] = [];
    pieces.forEach(p => {
      for (let i = 0; i < p.quantity; i++) {
        expandedPieces.push({
          name: p.name,
          height: p.height / 10, // mm to cm
          width: p.width / 10,
          ab: p.ab !== undefined ? p.ab / 10 : undefined, // mm to cm
        });
      }
    });

    // Material definitions
    let mdfColor = 0xf8fafc;  // White default
    let sideColor = 0xf8fafc;
    let mdfEdge = 0x94a3b8;
    let sideEdge = 0x94a3b8;

    if (colorScheme === 'bicolor') {
      sideColor = 0xf8fafc; // White sides
      sideEdge = 0x94a3b8;
      mdfColor = 0xd97706;  // Wood shelves
      mdfEdge = 0xfef08a;
    } else if (colorScheme === 'mdf') {
      sideColor = 0xd97706; // Amber Wood
      mdfColor = 0xd97706;
      mdfEdge = 0xfef08a;
      sideEdge = 0xfef08a;
    } else if (colorScheme === 'dark') {
      sideColor = 0x1e293b;
      mdfColor = 0x334155;
      mdfEdge = 0xf59e0b;
      sideEdge = 0xf59e0b;
    }

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: 0.35,
      metalness: 0.05,
      wireframe: wireframe,
    });

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: mdfColor,
      roughness: 0.4,
      metalness: 0.05,
      wireframe: wireframe,
    });

    const edgeMaterialWood = new THREE.LineBasicMaterial({ color: mdfEdge });
    const edgeMaterialSide = new THREE.LineBasicMaterial({ color: sideEdge });

    const thickness = 1.5; // 15mm MDF

    // Categorize pieces
    const sides = expandedPieces.filter(p => /lateral|lado|side/i.test(p.name));
    const tops = expandedPieces.filter(p => /tampo|topo|teto|cobertura|base superior|top/i.test(p.name));
    const bases = expandedPieces.filter(p => /base|fundo inf|inferior|chão|bottom/i.test(p.name));
    const backs = expandedPieces.filter(p => /fundo|costa|traseiro|back/i.test(p.name));
    const doors = expandedPieces.filter(p => /porta|portas|door/i.test(p.name));
    const drawers = expandedPieces.filter(p => /gaveta|frente/i.test(p.name));

    // Shelves and horizontal dividers
    const shelves = expandedPieces.filter(
      p =>
        !/lateral|lado|side|tampo|topo|teto|cobertura|base superior|top|base|chão|fundo|costa|porta|portas|gaveta/i.test(p.name)
    );

    // Calculate dimensions
    let cabinetHeight = 70;
    let cabinetWidth = 45;
    let cabinetDepth = 35;

    if (sides.length > 0) {
      cabinetHeight = Math.max(...sides.map(s => Math.max(s.height, s.width)));
      cabinetDepth = Math.min(...sides.map(s => Math.min(s.height, s.width))) || 35;
    }

    if (shelves.length > 0 || tops.length > 0 || bases.length > 0) {
      const horiz = [...shelves, ...tops, ...bases];
      const maxHoriz = Math.max(...horiz.map(h => Math.max(h.height, h.width)));
      if (maxHoriz > 0) cabinetWidth = maxHoriz;
    }

    const halfW = cabinetWidth / 2;
    const halfH = cabinetHeight / 2;
    const halfD = cabinetDepth / 2;

    const createBoxMesh = (
      w: number,
      h: number,
      d: number,
      posX: number,
      posY: number,
      posZ: number,
      isSide: boolean = false
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = isSide ? sideMaterial : woodMaterial;
      const edgeMat = isSide ? edgeMaterialSide : edgeMaterialWood;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Outline edge
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, edgeMat);
      mesh.add(line);

      furnitureGroup.add(mesh);
      return mesh;
    };

    // 1. Side Panels (Laterais)
    if (sides.length >= 2) {
      createBoxMesh(thickness, cabinetHeight, cabinetDepth, -halfW + thickness / 2, halfH, 0, true);
      createBoxMesh(thickness, cabinetHeight, cabinetDepth, halfW - thickness / 2, halfH, 0, true);
    } else if (sides.length === 1) {
      createBoxMesh(thickness, cabinetHeight, cabinetDepth, -halfW + thickness / 2, halfH, 0, true);
    }

    // 2. Top (Tampo / Cobertura)
    const topsWithAb = tops.filter(t => t.ab !== undefined);
    const topsWithoutAb = tops.filter(t => t.ab === undefined);

    if (topsWithAb.length > 0) {
      topsWithAb.forEach(top => {
        const topY = thickness + top.ab!;
        createBoxMesh(cabinetWidth - thickness * 2, thickness, cabinetDepth, 0, topY, 0, false);
      });
    }
    if (topsWithAb.length === 0 || topsWithoutAb.length > 0) {
      const topY = cabinetHeight - thickness / 2;
      createBoxMesh(cabinetWidth - thickness * 2, thickness, cabinetDepth, 0, topY, 0, false);
    }

    // 3. Base (Inferior / Chão)
    const baseY = thickness / 2;
    createBoxMesh(cabinetWidth - thickness * 2, thickness, cabinetDepth, 0, baseY, 0, false);

    // 4. Back Panel (Fundo)
    if (backs.length > 0) {
      const backThickness = 0.8;
      createBoxMesh(cabinetWidth - thickness * 2, cabinetHeight - thickness * 2, backThickness, 0, halfH, -halfD + backThickness / 2, false);
    }

    // 5. Shelves (Prateleiras)
    if (shelves.length > 0) {
      const shelvesWithAb = shelves.filter(s => s.ab !== undefined);
      const shelvesWithoutAb = shelves.filter(s => s.ab === undefined);

      shelvesWithAb.forEach(shelf => {
        const shelfY = thickness + shelf.ab!;
        createBoxMesh(cabinetWidth - thickness * 2, thickness, cabinetDepth - 2, 0, shelfY, 1, false);
      });

      if (shelvesWithoutAb.length > 0) {
        const usableHeight = cabinetHeight - thickness * 2;
        const stepY = usableHeight / (shelvesWithoutAb.length + 1);
        shelvesWithoutAb.forEach((_, idx) => {
          const shelfY = thickness + stepY * (idx + 1);
          createBoxMesh(cabinetWidth - thickness * 2, thickness, cabinetDepth - 2, 0, shelfY, 1, false);
        });
      }
    }

    // 6. Drawers (Gavetas)
    if (drawers.length > 0) {
      const drawerHeight = 14;
      drawers.forEach((_, idx) => {
        const dY = thickness + drawerHeight / 2 + idx * (drawerHeight + 2);
        createBoxMesh(cabinetWidth - thickness * 2 - 1, drawerHeight, 1.5, 0, dY, halfD - 0.75, false);
      });
    }

    // 7. Doors (Portas)
    if (doors.length > 0) {
      const doorW = (cabinetWidth - thickness * 2) / Math.max(1, doors.length);
      const doorH = cabinetHeight - thickness * 2;
      doors.forEach((_, idx) => {
        const doorX = -halfW + thickness + doorW / 2 + idx * doorW;
        const doorMesh = createBoxMesh(doorW - 0.4, doorH - 0.4, 1.5, doorX, halfH, halfD - 0.75, true);
        
        // Puxador metálico
        const handleGeo = new THREE.CylinderGeometry(0.4, 0.4, doorH * 0.4, 8);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
        const handleMesh = new THREE.Mesh(handleGeo, handleMat);
        handleMesh.position.set(idx === 0 ? doorW / 2 - 2 : -doorW / 2 + 2, 0, 1.2);
        doorMesh.add(handleMesh);
      });
    }

    // 8. Legs Handling
    let legOffset = 0;
    if (legStyle === 'palito') {
      const legLength = 16.5;
      const tiltAngle = 0.32; // ~18.3° splay angle para fora
      legOffset = Math.cos(tiltAngle) * legLength;

      // Criar pé palito retrô cônico realista com suporte e ponteira
      const createRetroPalitoLeg = () => {
        const legGroup = new THREE.Group();

        // 1. Corpo principal em Madeira Mel/Freijó (Cônico: topo largo 2.1cm, base fina 0.9cm)
        const legGeo = new THREE.CylinderGeometry(2.1, 0.9, legLength, 32);
        const woodMat = new THREE.MeshStandardMaterial({
          color: 0xb45309, // Madeira warm retro oak
          roughness: 0.35,
          metalness: 0.05,
          wireframe: wireframe,
        });
        const legMesh = new THREE.Mesh(legGeo, woodMat);
        legMesh.position.y = -legLength / 2;
        legMesh.castShadow = true;
        legMesh.receiveShadow = true;
        legGroup.add(legMesh);

        // Linhas de borda suaves no pé
        const edges = new THREE.EdgesGeometry(legGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x78350f }));
        legMesh.add(line);

        // 2. Chapa de Fixação Metálica no topo (suporte sob a base do móvel)
        const plateGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.4, 24);
        const plateMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.4,
          metalness: 0.5,
          wireframe: wireframe,
        });
        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
        plateMesh.position.y = 0.2;
        legGroup.add(plateMesh);

        // 3. Ponteira / Sapatilha de proteção emborrachada na base
        const tipGeo = new THREE.CylinderGeometry(0.95, 0.85, 1.0, 24);
        const tipMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.6,
          metalness: 0.2,
          wireframe: wireframe,
        });
        const tipMesh = new THREE.Mesh(tipGeo, tipMat);
        tipMesh.position.y = -legLength - 0.3;
        legGroup.add(tipMesh);

        return legGroup;
      };

      const marginX = Math.min(5, halfW * 0.25);
      const marginZ = Math.min(5, halfD * 0.25);

      const legConfig = [
        // Front-Left (Abertura para fora: esquerda -X e frente +Z)
        { x: -halfW + marginX, z: halfD - marginZ, rotZ: -tiltAngle, rotX: -tiltAngle },
        // Front-Right (Abertura para fora: direita +X e frente +Z)
        { x: halfW - marginX, z: halfD - marginZ, rotZ: tiltAngle, rotX: -tiltAngle },
        // Back-Left (Abertura para fora: esquerda -X e trás -Z)
        { x: -halfW + marginX, z: -halfD + marginZ, rotZ: -tiltAngle, rotX: tiltAngle },
        // Back-Right (Abertura para fora: direita +X e trás -Z)
        { x: halfW - marginX, z: -halfD + marginZ, rotZ: tiltAngle, rotX: tiltAngle },
      ];

      legConfig.forEach(cfg => {
        const legGroup = createRetroPalitoLeg();
        legGroup.position.set(cfg.x, 0, cfg.z);
        legGroup.rotation.z = cfg.rotZ;
        legGroup.rotation.x = cfg.rotX;
        furnitureGroup.add(legGroup);
      });
    } else if (legStyle === 'rodape') {
      legOffset = 6;
      createBoxMesh(cabinetWidth - thickness * 2, legOffset, cabinetDepth - 4, 0, -legOffset / 2, 0, false);
    }

    furnitureGroup.position.y = legOffset;
    scene.add(furnitureGroup);

    // Auto-Framing: Calculate bounding box so tall furniture is perfectly framed without cuts
    fitCameraToFurniture(furnitureGroup);
  }, [pieces, wireframe, colorScheme, legStyle]);

  // Fit Camera to Furniture Bounding Box
  const fitCameraToFurniture = (group: THREE.Group) => {
    if (!controlsRef.current || !cameraRef.current) return;

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const camera = cameraRef.current;

    // FOV calculation
    const fovRad = (camera.fov * Math.PI) / 180;
    let cameraDistance = Math.abs(maxDimension / (2 * Math.tan(fovRad / 2))) * 1.55;
    cameraDistance = Math.max(90, Math.min(cameraDistance, 900));

    controlsRef.current.target.copy(center);
    camera.position.set(center.x + cameraDistance * 0.75, center.y + cameraDistance * 0.35, center.z + cameraDistance * 0.95);
    controlsRef.current.update();
  };

  // Reset Camera View & Pan
  const handleResetView = () => {
    if (furnitureGroupRef.current) {
      fitCameraToFurniture(furnitureGroupRef.current);
    } else if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(210, 160, 240);
      controlsRef.current.target.set(0, 35, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between h-full shadow-lg relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide">Modelo 3D Interativo</h3>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Leg Style Switcher */}
          <button
            onClick={() => setLegStyle(legStyle === 'none' ? 'palito' : legStyle === 'palito' ? 'rodape' : 'none')}
            className={`px-2 py-1 rounded border text-xs flex items-center gap-1 font-semibold transition-colors ${
              legStyle !== 'none'
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Alternar Estilo de Pés (Sem Pés, Pés Palito, Rodapé)"
          >
            <Footprints className="w-3.5 h-3.5" />
            <span className="capitalize text-[11px]">
              {legStyle === 'none' ? 'No Chão' : legStyle === 'palito' ? 'Pés Palito' : 'Rodapé'}
            </span>
          </button>

          {/* Color Preset */}
          <button
            onClick={() =>
              setColorScheme(
                colorScheme === 'white'
                  ? 'bicolor'
                  : colorScheme === 'bicolor'
                  ? 'mdf'
                  : colorScheme === 'mdf'
                  ? 'dark'
                  : 'white'
              )
            }
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors"
            title="Alternar Cor do Móvel (Branco, Bicolor, Madeira, Escuro)"
          >
            <Palette className="w-3.5 h-3.5 text-amber-400" />
            <span className="capitalize text-[11px] font-semibold">{colorScheme}</span>
          </button>

          {/* Wireframe */}
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-1.5 rounded border text-xs flex items-center transition-colors ${
              wireframe
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Modo Estrutural (Aramado)"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {/* Explicit Auto-Rotate Toggle Badge */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2.5 py-1 rounded border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
              autoRotate
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Ativar/Pausar Rotação 360°"
          >
            {autoRotate ? (
              <>
                <Pause className="w-3 h-3 text-amber-400" />
                <span>360° On</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-slate-400" />
                <span>360° Off</span>
              </>
            )}
          </button>

          {/* Reset View & Camera framing */}
          <button
            onClick={handleResetView}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 transition-colors"
            title="Centralizar Câmera / Mover para Enquadrar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3D Canvas Mount Point */}
      <div className="relative rounded-lg overflow-hidden border border-slate-800/80 bg-gradient-to-b from-slate-950 to-[#060913]">
        <div ref={mountRef} className="w-full cursor-grab active:cursor-grabbing" style={{ height: '340px' }} />

        {/* Enhanced Controls Overlay instructions */}
        <div className="absolute bottom-2 left-2 pointer-events-none bg-slate-950/85 backdrop-blur border border-slate-800 px-2.5 py-1 rounded text-[10px] text-slate-300 flex items-center gap-2 flex-wrap">
          <span>🖱️ Esquerdo: Girar</span>
          <span>•</span>
          <span>🖱️ Direito / Arraste 2 dedos: Mover (Pan)</span>
          <span>•</span>
          <span>🔍 Scroll: Zoom</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-2.5 text-center italic">
        Renderização 3D ajustada automaticamente para enquadrar móveis de qualquer altura sem cortes.
      </p>
    </div>
  );
};
