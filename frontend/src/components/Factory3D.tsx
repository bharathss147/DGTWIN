import { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MachineData {
  id: string;
  name: string;
  processing_time: number;
  status: string;
  queue: number;
  utilization: number;
  completed: number;
  downtime: number;
}

interface Factory3DProps {
  machines?: MachineData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusColor(status: string): THREE.Color {
  const s = status.toLowerCase();
  if (s === 'running') return new THREE.Color('#22c55e');
  if (s === 'bottleneck') return new THREE.Color('#f97316');
  if (s === 'warning') return new THREE.Color('#eab308');
  if (s === 'failed' || s === 'offline') return new THREE.Color('#ef4444');
  if (s === 'maintenance') return new THREE.Color('#a855f7');
  return new THREE.Color('#64748b');
}

function getStatusHex(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running') return '#22c55e';
  if (s === 'bottleneck') return '#f97316';
  if (s === 'warning') return '#eab308';
  if (s === 'failed' || s === 'offline') return '#ef4444';
  if (s === 'maintenance') return '#a855f7';
  return '#64748b';
}

function isRunning(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'running' || s === 'bottleneck' || s === 'warning';
}

// ─── Machine Definitions ──────────────────────────────────────────────────────

const MACHINE_CONFIGS = [
  { id: 'M1', label: 'M1\nCutting',   xPos: -8, machineType: 'cutting'   },
  { id: 'M2', label: 'M2\nDrilling',  xPos: -4, machineType: 'drilling'  },
  { id: 'M3', label: 'M3\nAssembly',  xPos:  0, machineType: 'assembly'  },
  { id: 'M4', label: 'M4\nQuality',   xPos:  4, machineType: 'quality'   },
  { id: 'M5', label: 'M5\nPackaging', xPos:  8, machineType: 'packaging' },
];

// ─── Conveyor Belt ─────────────────────────────────────────────────────────────

interface ConveyorBeltProps {
  animate: boolean;
}

function ConveyorBelt({ animate }: ConveyorBeltProps) {
  const offsetRef = useRef(0);
  const stripeGroupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!animate) return;
    offsetRef.current = (offsetRef.current + delta * 1.2) % 2;
    if (stripeGroupRef.current) {
      stripeGroupRef.current.position.x = offsetRef.current - 1;
    }
  });

  const stripes = useMemo(() => {
    const arr: number[] = [];
    for (let i = -12; i < 12; i += 2) arr.push(i);
    return arr;
  }, []);

  return (
    <group>
      {/* Belt base */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[20, 0.12, 1.2]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} metalness={0.3} />
      </mesh>
      {/* Belt rails */}
      <mesh position={[0, 0.12, 0.65]}>
        <boxGeometry args={[20, 0.08, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, -0.65]}>
        <boxGeometry args={[20, 0.08, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Moving stripes */}
      <group ref={stripeGroupRef}>
        {stripes.map((x) => (
          <mesh key={x} position={[x, 0.12, 0]}>
            <boxGeometry args={[0.6, 0.02, 1.0]} />
            <meshStandardMaterial color="#0f172a" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Moving Products ──────────────────────────────────────────────────────────

interface MovingProductProps {
  startX: number;
  speed: number;
  color: string;
  animate: boolean;
}

function MovingProduct({ startX, speed, color, animate }: MovingProductProps) {
  const ref = useRef<THREE.Mesh>(null);
  const xRef = useRef(startX);

  useFrame((_, delta) => {
    if (!ref.current || !animate) return;
    xRef.current += delta * speed;
    if (xRef.current > 11) xRef.current = -11;
    ref.current.position.x = xRef.current;
  });

  return (
    <mesh ref={ref} position={[startX, 0.3, 0]} castShadow>
      <boxGeometry args={[0.35, 0.25, 0.35]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.5} metalness={0.2} />
    </mesh>
  );
}

// ─── Status Indicator Light ────────────────────────────────────────────────────

interface StatusLightProps {
  status: string;
  position: [number, number, number];
}

function StatusLight({ status, position }: StatusLightProps) {
  const ref = useRef<THREE.Mesh>(null);
  const color = getStatusColor(status);
  const isFailed = status.toLowerCase() === 'offline' || status.toLowerCase() === 'failed';
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (!ref.current) return;
    pulseRef.current += delta * (isFailed ? 3 : 2);
    const intensity = isFailed
      ? 0.3 + Math.abs(Math.sin(pulseRef.current)) * 0.4
      : 0.5 + Math.sin(pulseRef.current) * 0.2;
    (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.7}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  );
}

// ─── M1: Cutting Machine ──────────────────────────────────────────────────────

interface MachineBodyProps {
  status: string;
  selected: boolean;
  onClick: () => void;
}

function CuttingMachine({ status, selected, onClick }: MachineBodyProps) {
  const bladeRef = useRef<THREE.Mesh>(null);
  const color = getStatusColor(status);
  const active = isRunning(status);

  useFrame((_, delta) => {
    if (bladeRef.current && active) {
      bladeRef.current.rotation.y += delta * 4;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.4, 1.1, 1.0]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.35 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[1.6, 0.12, 1.2]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Blade disk */}
      <mesh ref={bladeRef} position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.05} />
      </mesh>
      {/* Blade shaft */}
      <mesh position={[0, 1.21, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.25, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.9} />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.6, 0.1, 1.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Status light */}
      <StatusLight status={status} position={[0.5, 1.3, 0.55]} />
      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── M2: Drilling Machine ─────────────────────────────────────────────────────

function DrillingMachine({ status, selected, onClick }: MachineBodyProps) {
  const drillRef = useRef<THREE.Group>(null);
  const color = getStatusColor(status);
  const active = isRunning(status);

  useFrame((_, delta) => {
    if (drillRef.current && active) {
      drillRef.current.rotation.y += delta * 6;
      drillRef.current.position.y = 1.5 + Math.sin(Date.now() * 0.003) * 0.1;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.6, 0.1, 1.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.2, 1.1, 1.0]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.35 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Column */}
      <mesh position={[0.4, 0.9, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1.8, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Drill arm */}
      <group ref={drillRef} position={[0, 1.5, 0]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.03, 0.5, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>
      {/* Top housing */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.7, 0.25, 0.7]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
      </mesh>
      <StatusLight status={status} position={[0.5, 1.3, 0.55]} />
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── M3: Assembly Machine ─────────────────────────────────────────────────────

function AssemblyMachine({ status, selected, onClick }: MachineBodyProps) {
  const armRef = useRef<THREE.Group>(null);
  const color = getStatusColor(status);
  const active = isRunning(status);

  useFrame(() => {
    if (armRef.current && active) {
      armRef.current.rotation.z = Math.sin(Date.now() * 0.0015) * 0.4;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.8, 0.1, 1.4]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.4, 0.9, 1.0]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.35 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Robotic arm base */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.2, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Arm segments */}
      <group ref={armRef} position={[0, 1.1, 0]}>
        <mesh position={[0.25, 0.2, 0]} rotation={[0, 0, -0.4]}>
          <boxGeometry args={[0.12, 0.55, 0.12]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.5, 0.45, 0]}>
          <boxGeometry args={[0.1, 0.4, 0.1]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Gripper */}
        <mesh position={[0.5, 0.7, 0]}>
          <boxGeometry args={[0.22, 0.08, 0.18]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.3} metalness={0.6} />
        </mesh>
      </group>
      <StatusLight status={status} position={[0.6, 1.1, 0.55]} />
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.05, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── M4: Quality Check ────────────────────────────────────────────────────────

function QualityMachine({ status, selected, onClick }: MachineBodyProps) {
  const scanRef = useRef<THREE.Mesh>(null);
  const color = getStatusColor(status);
  const active = isRunning(status);

  useFrame(() => {
    if (scanRef.current && active) {
      scanRef.current.position.z = Math.sin(Date.now() * 0.002) * 0.3;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.6, 0.1, 1.4]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.2, 0.9, 1.0]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.35 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Scanner frame left */}
      <mesh position={[-0.55, 1.2, 0]}>
        <boxGeometry args={[0.08, 0.9, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.7} />
      </mesh>
      {/* Scanner frame right */}
      <mesh position={[0.55, 1.2, 0]}>
        <boxGeometry args={[0.08, 0.9, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.7} />
      </mesh>
      {/* Scanner frame top */}
      <mesh position={[0, 1.65, 0]}>
        <boxGeometry args={[1.18, 0.08, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.7} />
      </mesh>
      {/* Scan beam */}
      <mesh ref={scanRef} position={[0, 1.2, 0]}>
        <boxGeometry args={[1.0, 0.04, 0.06]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={active ? 1.5 : 0.2} transparent opacity={0.8} />
      </mesh>
      <StatusLight status={status} position={[0.5, 1.7, 0]} />
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── M5: Packaging Machine ─────────────────────────────────────────────────────

function PackagingMachine({ status, selected, onClick }: MachineBodyProps) {
  const lidRef = useRef<THREE.Mesh>(null);
  const color = getStatusColor(status);
  const active = isRunning(status);

  useFrame(() => {
    if (lidRef.current && active) {
      lidRef.current.position.y = 1.55 + Math.abs(Math.sin(Date.now() * 0.002)) * 0.15;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.6, 0.1, 1.4]} />
        <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.4, 1.1, 1.2]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.35 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Box product */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#854d0e" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Lid */}
      <mesh ref={lidRef} position={[0, 1.55, 0]}>
        <boxGeometry args={[0.55, 0.06, 0.55]} />
        <meshStandardMaterial color="#713f12" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Press arm */}
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
      </mesh>
      <StatusLight status={status} position={[0.6, 1.1, 0.65]} />
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.05, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ─── Machine Label ────────────────────────────────────────────────────────────

interface MachineLabelProps {
  label: string;
  status: string;
  visible: boolean;
  position: [number, number, number];
}

function MachineLabel({ label, status, visible, position }: MachineLabelProps) {
  const color = getStatusColor(status);
  if (!visible) return null;
  return (
    <Text
      position={position}
      fontSize={0.22}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.01}
      outlineColor="#000000"
      textAlign="center"
    >
      {label}
    </Text>
  );
}

// ─── Full Machine Assembly ─────────────────────────────────────────────────────

interface MachineAssemblyProps {
  config: (typeof MACHINE_CONFIGS)[number];
  machineData?: MachineData;
  selected: boolean;
  showLabels: boolean;
  onSelect: () => void;
}

function MachineAssembly({ config, machineData, selected, showLabels, onSelect }: MachineAssemblyProps) {
  const status = machineData?.status ?? 'running';
  const pos: [number, number, number] = [config.xPos, 0, 0];

  const bodyProps: MachineBodyProps = { status, selected, onClick: onSelect };

  return (
    <group position={pos}>
      {config.machineType === 'cutting'   && <CuttingMachine   {...bodyProps} />}
      {config.machineType === 'drilling'  && <DrillingMachine  {...bodyProps} />}
      {config.machineType === 'assembly'  && <AssemblyMachine  {...bodyProps} />}
      {config.machineType === 'quality'   && <QualityMachine   {...bodyProps} />}
      {config.machineType === 'packaging' && <PackagingMachine {...bodyProps} />}
      <MachineLabel
        label={config.label}
        status={status}
        visible={showLabels}
        position={[0, 2.3, 0]}
      />
    </group>
  );
}

// ─── Grid Floor ───────────────────────────────────────────────────────────────

function GridFloor() {
  const ref = useRef<THREE.GridHelper>(null);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#050d1a" roughness={0.9} metalness={0.1} />
      </mesh>
      <gridHelper
        ref={ref}
        args={[40, 40, '#0f3460', '#0f3460']}
        position={[0, 0, 0]}
      />
    </group>
  );
}

// ─── Ambient Factory Structures ───────────────────────────────────────────────

function FactoryStructure() {
  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 2.5, -5]} receiveShadow>
        <boxGeometry args={[26, 5, 0.2]} />
        <meshStandardMaterial color="#050d1a" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Ceiling beams */}
      {[-8, -4, 0, 4, 8].map((x) => (
        <mesh key={x} position={[x, 4.5, -2.5]}>
          <boxGeometry args={[0.2, 0.3, 5]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {/* Overhead accent lights */}
      {[-6, -2, 2, 6].map((x) => (
        <group key={x} position={[x, 4.2, -2]}>
          <mesh>
            <boxGeometry args={[0.8, 0.1, 0.2]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} />
          </mesh>
          <pointLight color="#38bdf8" intensity={0.8} distance={5} decay={2} />
        </group>
      ))}
      {/* Column pillars */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <mesh key={x} position={[x, 2, -4.5]}>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ─── 3D Scene ────────────────────────────────────────────────────────────────

interface SceneProps {
  machines: MachineData[];
  selectedId: string | null;
  showLabels: boolean;
  animateConveyor: boolean;
  onSelectMachine: (id: string) => void;
}

function Scene({ machines, selectedId, showLabels, animateConveyor, onSelectMachine }: SceneProps) {
  const machineMap = useMemo(() => {
    const map = new Map<string, MachineData>();
    machines.forEach((m) => map.set(m.id, m));
    return map;
  }, [machines]);

  const productColors = ['#854d0e', '#1e40af', '#065f46', '#7c3aed', '#9f1239'];

  return (
    <>
      <ambientLight color="#0a1628" intensity={2.5} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024] as unknown as THREE.Vector2}
        color="#b0c4de"
      />
      <directionalLight position={[-5, 8, -3]} intensity={0.6} color="#1e3a5f" />
      <pointLight position={[0, 6, 2]} intensity={1.0} color="#22d3ee" distance={20} decay={2} />

      <GridFloor />
      <FactoryStructure />
      <ConveyorBelt animate={animateConveyor} />

      {productColors.map((color, i) => (
        <MovingProduct
          key={i}
          startX={-10 + i * 4}
          speed={1.5 + i * 0.15}
          color={color}
          animate={animateConveyor}
        />
      ))}

      {MACHINE_CONFIGS.map((cfg) => {
        const data = machineMap.get(cfg.id);
        return (
          <MachineAssembly
            key={cfg.id}
            config={cfg}
            machineData={data}
            selected={selectedId === cfg.id}
            showLabels={showLabels}
            onSelect={() => onSelectMachine(cfg.id)}
          />
        );
      })}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

interface InfoPanelProps {
  machine: MachineData | undefined;
  onClose: () => void;
}

function InfoPanel({ machine, onClose }: InfoPanelProps) {
  if (!machine) return null;
  const statusHex = getStatusHex(machine.status);
  return (
    <div className="f3d-info-panel">
      <div className="f3d-info-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="f3d-status-dot" style={{ background: statusHex }} />
          <strong>{machine.id} — {machine.name}</strong>
        </div>
        <button className="f3d-close-btn" onClick={onClose} aria-label="Close panel">✕</button>
      </div>
      <div className="f3d-info-grid">
        <InfoRow label="Status"      value={machine.status.toUpperCase()} color={statusHex} />
        <InfoRow label="Utilization" value={`${machine.utilization.toFixed(1)}%`} />
        <InfoRow label="Queue"       value={`${machine.queue} parts`} />
        <InfoRow label="Cycle"       value={`${machine.processing_time.toFixed(1)}s`} />
        <InfoRow label="Completed"   value={`${machine.completed} parts`} />
        <InfoRow label="Downtime"    value={`${machine.downtime}s`} />
      </div>
      <div className="f3d-util-bar">
        <div
          className="f3d-util-fill"
          style={{ width: `${Math.min(100, machine.utilization)}%`, background: statusHex }}
        />
      </div>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  color?: string;
}
function InfoRow({ label, value, color }: InfoRowProps) {
  return (
    <div className="f3d-info-row">
      <span className="f3d-info-label">{label}</span>
      <span className="f3d-info-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

// ─── Main Exported Component ──────────────────────────────────────────────────

export default function Factory3D({ machines = [] }: Factory3DProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [animateConveyor, setAnimateConveyor] = useState(true);
  const [cameraKey, setCameraKey] = useState(0);

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === selectedId),
    [machines, selectedId]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const resetCamera = useCallback(() => {
    setCameraKey((k) => k + 1);
  }, []);

  return (
    <section className="panel f3d-section">
      {/* Header */}
      <div className="panel-header f3d-header">
        <div>
          <h2 style={{ margin: 0 }}>3D Digital Twin</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Live production-line visualization
          </p>
        </div>
        <div className="f3d-controls">
          <button className="f3d-ctrl-btn" onClick={resetCamera} title="Reset camera">
            ↺ Reset Camera
          </button>
          <button
            className={`f3d-ctrl-btn ${animateConveyor ? 'active' : ''}`}
            onClick={() => setAnimateConveyor((v) => !v)}
          >
            {animateConveyor ? '⏸ Conveyor' : '▶ Conveyor'}
          </button>
          <button
            className={`f3d-ctrl-btn ${showLabels ? 'active' : ''}`}
            onClick={() => setShowLabels((v) => !v)}
          >
            {showLabels ? '◎ Labels On' : '◎ Labels Off'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="f3d-legend">
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#22c55e' }} />Running</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#f97316' }} />Bottleneck</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#eab308' }} />Warning</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#ef4444' }} />Offline</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#a855f7' }} />Maintenance</span>
      </div>

      {/* Canvas + overlay */}
      <div className="f3d-canvas-wrap">
        <Canvas
          key={cameraKey}
          shadows
          camera={{ position: [0, 9, 14], fov: 45 }}
          style={{ background: '#020c1b' }}
          gl={{ antialias: true, alpha: false }}
        >
          <Scene
            machines={machines}
            selectedId={selectedId}
            showLabels={showLabels}
            animateConveyor={animateConveyor}
            onSelectMachine={handleSelect}
          />
        </Canvas>

        {selectedId && (
          <InfoPanel machine={selectedMachine} onClose={() => setSelectedId(null)} />
        )}

        {!selectedId && (
          <div className="f3d-hint">Click a machine to inspect</div>
        )}
      </div>
    </section>
  );
}
