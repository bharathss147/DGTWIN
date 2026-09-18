import { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
  temperature?: number;
  vibration?: number;
  rpm?: number;
  power?: number;
  pressure?: number;
  health?: number;
  isolated?: boolean;
  isolation_reason?: string | null;
}

export interface RepairStatus {
  active: boolean;
  target_machine?: string | null;
  progress: number;
  current_task?: string | null;
}

interface Factory3DProps {
  machines?: MachineData[];
  repairStatus?: RepairStatus;
  selectedMachineId?: string | null;
  onSelectMachine?: (id: string | null) => void;
  presentationMode?: boolean;
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

function getStatusColor(status: string, isolated?: boolean): THREE.Color {
  if (isolated) return new THREE.Color('#ef4444');
  const s = status.toLowerCase();
  switch (s) {
    case 'running':     return new THREE.Color('#22c55e');
    case 'warning':     return new THREE.Color('#eab308');
    case 'anomaly':     return new THREE.Color('#f97316');
    case 'malfunction':
    case 'offline':
    case 'failed':      return new THREE.Color('#ef4444');
    case 'diagnosing':  return new THREE.Color('#06b6d4');
    case 'repairing':   return new THREE.Color('#a855f7');
    case 'testing':     return new THREE.Color('#3b82f6');
    case 'recovered':   return new THREE.Color('#10b981');
    case 'maintenance': return new THREE.Color('#c084fc');
    default:            return new THREE.Color('#64748b');
  }
}

function getStatusHex(status: string, isolated?: boolean): string {
  if (isolated) return '#ef4444';
  const s = status.toLowerCase();
  switch (s) {
    case 'running':     return '#22c55e';
    case 'warning':     return '#eab308';
    case 'anomaly':     return '#f97316';
    case 'malfunction':
    case 'offline':
    case 'failed':      return '#ef4444';
    case 'diagnosing':  return '#06b6d4';
    case 'repairing':   return '#a855f7';
    case 'testing':     return '#3b82f6';
    case 'recovered':   return '#10b981';
    case 'maintenance': return '#c084fc';
    default:            return '#64748b';
  }
}

function isMachineActive(status: string, isolated?: boolean): boolean {
  if (isolated) return false;
  const s = status.toLowerCase();
  return s === 'running' || s === 'warning' || s === 'bottleneck' || s === 'testing' || s === 'recovered';
}

// ─── Machine Configurations ───────────────────────────────────────────────────

const MACHINE_CONFIGS = [
  { id: 'M1', name: 'Cutting',       xPos: -8, defaultColor: '#1e3a5f' },
  { id: 'M2', name: 'Drilling',      xPos: -4, defaultColor: '#1e3a5f' },
  { id: 'M3', name: 'Assembly',      xPos:  0, defaultColor: '#1e3a5f' },
  { id: 'M4', name: 'Quality Check', xPos:  4, defaultColor: '#1e3a5f' },
  { id: 'M5', name: 'Packaging',     xPos:  8, defaultColor: '#1e3a5f' },
];

// ─── Factory Floor & Structural Elements ──────────────────────────────────────

function FactoryEnvironment() {
  return (
    <group>
      {/* Primary concrete floor with safety reflective coating */}
      <mesh position={[0, -0.05, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 18]} />
        <meshStandardMaterial color="#080e1a" roughness={0.7} metalness={0.25} />
      </mesh>

      {/* Industrial Grid floor overlay */}
      <gridHelper args={[34, 34, '#1e293b', '#0f172a']} position={[0, 0.001, 0]} />

      {/* Safety Yellow Demarcation Lanes along conveyor */}
      <mesh position={[0, 0.002, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 0.08]} />
        <meshBasicMaterial color="#eab308" transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.002, -1.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 0.08]} />
        <meshBasicMaterial color="#eab308" transparent opacity={0.7} />
      </mesh>

      {/* Production Input Staging Area (Loading Bay on Left) */}
      <group position={[-11.8, 0, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 2.2]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.15} />
        </mesh>
        <mesh position={[0, 0.4, -0.6]}>
          <boxGeometry args={[1.0, 0.8, 0.8]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.25, 0.5]}>
          <boxGeometry args={[0.9, 0.5, 0.7]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        <Text position={[0, 1.4, 0]} fontSize={0.28} color="#10b981" anchorX="center" anchorY="middle">
          INPUT STAGING
        </Text>
      </group>

      {/* Production Output Dispatch Area (Right) */}
      <group position={[11.8, 0, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 2.2]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.15} />
        </mesh>
        <mesh position={[0, 0.5, -0.4]}>
          <boxGeometry args={[1.1, 1.0, 0.8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.3, 0.5]}>
          <boxGeometry args={[0.8, 0.6, 0.7]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </mesh>
        <Text position={[0, 1.4, 0]} fontSize={0.28} color="#06b6d4" anchorX="center" anchorY="middle">
          OUTPUT DISPATCH
        </Text>
      </group>

      {/* Autonomous Maintenance Bay (Rear Center) */}
      <group position={[0, 0, 3.8]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.2, 2.4]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.15} />
        </mesh>
        {/* Maintenance Bay Dock Frame */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[3.8, 0.15, 2.0]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 1.2, -0.9]}>
          <boxGeometry args={[2.4, 0.8, 0.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
        </mesh>
        <Text position={[0, 1.8, -0.8]} fontSize={0.24} color="#a855f7" anchorX="center" anchorY="middle">
          AUTONOMOUS MAINTENANCE BAY
        </Text>
      </group>

      {/* Overhead Industrial Gantry & Lighting Trusses */}
      <group position={[0, 5.2, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[28, 0.15, 0.15]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 2.5]}>
          <boxGeometry args={[28, 0.15, 0.15]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Cross struts */}
        {[-10, -5, 0, 5, 10].map((x) => (
          <mesh key={x} position={[x, 0, 1.25]}>
            <boxGeometry args={[0.12, 0.12, 2.5]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Conveyor Belt & Dynamic Part Flow ────────────────────────────────────────

interface ConveyorWithFlowProps {
  machines: MachineData[];
  animate: boolean;
}

function ConveyorWithFlow({ machines, animate }: ConveyorWithFlowProps) {
  const stripeOffset = useRef(0);
  const stripesGroup = useRef<THREE.Group>(null);

  // Check if any machine is blocking conveyor flow
  const blockedMachine = machines.find((m) => m.isolated || m.status === 'malfunction' || m.status === 'offline');
  const blockedX = blockedMachine
    ? (MACHINE_CONFIGS.find((c) => c.id === blockedMachine.id)?.xPos ?? null)
    : null;

  useFrame((_, delta) => {
    if (!animate) return;
    stripeOffset.current = (stripeOffset.current + delta * 1.6) % 2;
    if (stripesGroup.current) {
      stripesGroup.current.position.x = stripeOffset.current - 1;
    }
  });

  const stripes = useMemo(() => {
    const list: number[] = [];
    for (let x = -13; x <= 13; x += 1.8) list.push(x);
    return list;
  }, []);

  // Moving payload parts along the conveyor
  const partItems = useMemo(
    () => [
      { id: 0, baseX: -11.0, color: '#38bdf8' },
      { id: 1, baseX: -7.5,  color: '#818cf8' },
      { id: 2, baseX: -4.8,  color: '#c084fc' },
      { id: 3, baseX: -1.2,  color: '#34d399' },
      { id: 4, baseX:  2.5,  color: '#fbbf24' },
      { id: 5, baseX:  6.0,  color: '#38bdf8' },
      { id: 6, baseX:  9.5,  color: '#34d399' },
    ],
    []
  );

  return (
    <group>
      {/* Belt base structure */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[24, 0.2, 1.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} metalness={0.4} />
      </mesh>

      {/* Side guard rails */}
      <mesh position={[0, 0.28, 0.72]}>
        <boxGeometry args={[24, 0.12, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.28, -0.72]}>
        <boxGeometry args={[24, 0.12, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Moving belt surface treads */}
      <group ref={stripesGroup}>
        {stripes.map((x) => (
          <mesh key={x} position={[x, 0.23, 0]}>
            <boxGeometry args={[0.5, 0.02, 1.25]} />
            <meshStandardMaterial color="#1e293b" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Conveyor Support Pillars */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.06, 0.65]}>
            <cylinderGeometry args={[0.06, 0.08, 0.24, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.06, -0.65]}>
            <cylinderGeometry args={[0.06, 0.08, 0.24, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Flowing Industrial Parts */}
      {partItems.map((part) => (
        <ConveyorPart
          key={part.id}
          baseX={part.baseX}
          color={part.color}
          blockedX={blockedX}
          animate={animate}
        />
      ))}
    </group>
  );
}

interface ConveyorPartProps {
  baseX: number;
  color: string;
  blockedX: number | null;
  animate: boolean;
}

function ConveyorPart({ baseX, color, blockedX, animate }: ConveyorPartProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const currentX = useRef(baseX);

  useFrame((_, delta) => {
    if (!meshRef.current || !animate) return;

    // Movement speed
    let speed = 1.6;

    // If an upstream machine is isolated/blocked, queue parts just before it
    if (blockedX !== null) {
      const distToBlock = blockedX - currentX.current;
      if (distToBlock > 0 && distToBlock < 2.0) {
        speed = Math.max(0, distToBlock * 0.4 - 0.2);
      }
    }

    currentX.current += delta * speed;
    if (currentX.current > 11.5) {
      currentX.current = -11.5;
    }

    meshRef.current.position.x = currentX.current;
  });

  return (
    <mesh ref={meshRef} position={[baseX, 0.38, 0]} castShadow>
      <boxGeometry args={[0.42, 0.28, 0.42]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

// ─── 3D Safety Isolation Barrier ──────────────────────────────────────────────

interface SafetyBarrierProps {
  xPos: number;
  active: boolean;
  reason?: string | null;
}

function SafetyIsolationBarrier({ xPos, active, reason }: SafetyBarrierProps) {
  const laserRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (!laserRef.current || !active) return;
    pulseRef.current += delta * 4;
    const op = 0.35 + Math.abs(Math.sin(pulseRef.current)) * 0.35;
    (laserRef.current.material as THREE.MeshBasicMaterial).opacity = op;
  });

  if (!active) return null;

  return (
    <group position={[xPos, 0, 0]}>
      {/* 4 Corner Warning Hazard Pylons */}
      {[
        [-1.2, 1.2],
        [ 1.2, 1.2],
        [-1.2, -1.2],
        [ 1.2, -1.2],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 1.4, 8]} />
            <meshStandardMaterial color="#eab308" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}

      {/* Red Safety Isolation Perimeter Laser Curtain */}
      <mesh ref={laserRef} position={[0, 0.7, 0]}>
        <boxGeometry args={[2.4, 1.3, 2.4]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.45} wireframe />
      </mesh>

      {/* Hazard Zone Ground Outline */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.25} />
      </mesh>

      {/* Overhead Safety Isolation Floating Warning */}
      <Text position={[0, 2.6, 0]} fontSize={0.22} color="#ef4444" anchorX="center" anchorY="middle">
        ⚠ SAFETY ISOLATION ACTIVE
      </Text>
      {reason && (
        <Text position={[0, 2.35, 0]} fontSize={0.14} color="#fca5a5" anchorX="center" anchorY="middle">
          {reason}
        </Text>
      )}
    </group>
  );
}

// ─── Autonomous Service Robot / Maintenance Drone ─────────────────────────────

interface MaintenanceRobotProps {
  repairStatus?: RepairStatus;
}

function MaintenanceRobot({ repairStatus }: MaintenanceRobotProps) {
  const robotGroup = useRef<THREE.Group>(null);
  const toolArmRef = useRef<THREE.Group>(null);
  const targetX = repairStatus?.active ? -4.0 : 0.0;
  const targetZ = repairStatus?.active ? 1.6 : 3.6;

  useFrame((_, delta) => {
    if (!robotGroup.current) return;

    // Smooth navigation towards target position
    robotGroup.current.position.x = THREE.MathUtils.lerp(robotGroup.current.position.x, targetX, delta * 2.0);
    robotGroup.current.position.z = THREE.MathUtils.lerp(robotGroup.current.position.z, targetZ, delta * 2.0);

    // If at repair station, perform repair animation
    if (repairStatus?.active && toolArmRef.current) {
      toolArmRef.current.rotation.z = Math.sin(Date.now() * 0.005) * 0.3;
      toolArmRef.current.rotation.y = Math.cos(Date.now() * 0.004) * 0.4;
    }
  });

  return (
    <group ref={robotGroup} position={[0, 0, 3.6]}>
      {/* Robot Base Chassis */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.9, 0.35, 0.7]} />
        <meshStandardMaterial color="#3b0764" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Heavy Track Rollers */}
      <mesh position={[0, 0.12, 0.38]}>
        <boxGeometry args={[1.0, 0.2, 0.14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, -0.38]}>
        <boxGeometry args={[1.0, 0.2, 0.14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* Articulated Maintenance Arm */}
      <group ref={toolArmRef} position={[0, 0.45, 0]}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 0.7, 8]} />
          <meshStandardMaterial color="#a855f7" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Diagnostic Laser Tool Head */}
        <mesh position={[0, 0.75, 0.1]}>
          <boxGeometry args={[0.2, 0.16, 0.25]} />
          <meshStandardMaterial color="#c084fc" metalness={0.9} />
        </mesh>
        {/* Active Tool Glow / Laser Beam when repairing */}
        {repairStatus?.active && (
          <mesh position={[0, 0.75, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.15, 1.2, 16]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.55} />
          </mesh>
        )}
      </group>

      {/* Status Beacon on Robot */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissive={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissiveIntensity={1.5}
        />
      </mesh>

      {repairStatus?.active && (
        <Text position={[0, 1.6, 0]} fontSize={0.2} color="#c084fc" anchorX="center" anchorY="middle">
          MAINTENANCE ROBOT {repairStatus.progress}%
        </Text>
      )}
    </group>
  );
}

// ─── Machine Visual Architectures ─────────────────────────────────────────────

interface MachineMeshProps {
  id: string;
  status: string;
  isolated?: boolean;
  selected: boolean;
  onClick: () => void;
}

// M1: Cutting Machine
function CuttingVisual({ status, isolated, selected, onClick }: MachineMeshProps) {
  const bladeRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame((_, delta) => {
    if (bladeRef.current && active) {
      bladeRef.current.rotation.y += delta * 6;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.5, 1.1, 1.1]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.4 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Top housing */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[1.7, 0.15, 1.25]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* High-speed circular carbide saw blade */}
      <mesh ref={bladeRef} position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.04, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.1} />
      </mesh>
      {/* Blade mounting column */}
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.25, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.9} />
      </mesh>
    </group>
  );
}

// M2: Drilling Machine
function DrillingVisual({ status, isolated, selected, onClick }: MachineMeshProps) {
  const spindleRef = useRef<THREE.Group>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame((_, delta) => {
    if (spindleRef.current && active) {
      spindleRef.current.rotation.y += delta * 12;
      spindleRef.current.position.y = 1.45 + Math.sin(Date.now() * 0.006) * 0.18;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.3, 1.1, 1.1]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.4 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Hydraulic Support Column */}
      <mesh position={[0.45, 1.1, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1.8, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Top motor box */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.8, 0.35, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Reciprocating High-Speed Spindle */}
      <group ref={spindleRef} position={[0, 1.45, 0]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.025, 0.6, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.05} />
        </mesh>
      </group>
    </group>
  );
}

// M3: Assembly Machine (6-Axis Robotic Arm)
function AssemblyVisual({ status, isolated, selected, onClick }: MachineMeshProps) {
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame(() => {
    if (shoulderRef.current && elbowRef.current && active) {
      shoulderRef.current.rotation.z = Math.sin(Date.now() * 0.002) * 0.35;
      elbowRef.current.rotation.z = -Math.cos(Date.now() * 0.0025) * 0.45;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.65, 0.75, 0.9, 16]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.4 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Articulated shoulder */}
      <group ref={shoulderRef} position={[0, 0.9, 0]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.18, 0.8, 0.18]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Elbow & Gripper */}
        <group ref={elbowRef} position={[0, 0.8, 0]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.14, 0.7, 0.14]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// M4: Quality Check (Optical Laser Inspection)
function QualityVisual({ status, isolated, selected, onClick }: MachineMeshProps) {
  const scanRingRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame((_, delta) => {
    if (scanRingRef.current && active) {
      scanRingRef.current.position.y = 1.0 + Math.sin(Date.now() * 0.004) * 0.4;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.3, 0.95, 1.1]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.4 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Inspection Arch frame */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[1.4, 0.15, 1.2]} />
        <meshStandardMaterial color="#334155" metalness={0.8} />
      </mesh>
      {/* Scanning laser beam ring */}
      <mesh ref={scanRingRef} position={[0, 1.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.55, 16]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={active ? 0.7 : 0.2} />
      </mesh>
    </group>
  );
}

// M5: Packaging Machine
function PackagingVisual({ status, isolated, selected, onClick }: MachineMeshProps) {
  const pressRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame(() => {
    if (pressRef.current && active) {
      pressRef.current.position.y = 1.3 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.3;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.4, 1.1, 1.1]} />
        <meshStandardMaterial color="#1e3a5f" emissive={color} emissiveIntensity={selected ? 0.4 : 0.08} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Hydraulic Press Ram */}
      <mesh ref={pressRef} position={[0, 1.3, 0]}>
        <boxGeometry args={[0.7, 0.3, 0.7]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.6, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.8} />
      </mesh>
    </group>
  );
}

// ─── Machine Node Assembly ────────────────────────────────────────────────────

interface MachineNodeProps {
  config: (typeof MACHINE_CONFIGS)[0];
  data?: MachineData;
  selected: boolean;
  showLabels: boolean;
  onSelect: () => void;
}

function MachineNode({ config, data, selected, showLabels, onSelect }: MachineNodeProps) {
  const status = data?.status ?? 'running';
  const isolated = data?.isolated ?? false;
  const statusColor = getStatusColor(status, isolated);

  return (
    <group position={[config.xPos, 0, 0]}>
      {/* Machine 3D Visual Mesh based on machine type */}
      {config.id === 'M1' && <CuttingVisual id="M1" status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M2' && <DrillingVisual id="M2" status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M3' && <AssemblyVisual id="M3" status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M4' && <QualityVisual id="M4" status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M5' && <PackagingVisual id="M5" status={status} isolated={isolated} selected={selected} onClick={onSelect} />}

      {/* Safety Isolation Barrier */}
      <SafetyIsolationBarrier xPos={0} active={isolated} reason={data?.isolation_reason} />

      {/* Floating Status Beacon */}
      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={1.2}
          roughness={0.2}
        />
      </mesh>

      {/* Digital HUD Label over Machine */}
      {showLabels && (
        <group position={[0, 2.5, 0]}>
          <Text fontSize={0.28} color="#f8fafc" anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#020617">
            {`${config.id} ${config.name}`}
          </Text>
          <Text position={[0, -0.22, 0]} fontSize={0.16} color={getStatusHex(status, isolated)} anchorX="center" anchorY="top">
            {isolated ? '● ISOLATED' : `● ${status.toUpperCase()}`}
          </Text>
          {data?.temperature !== undefined && (
            <Text position={[0, -0.42, 0]} fontSize={0.14} color="#94a3b8" anchorX="center" anchorY="top">
              {`${data.temperature.toFixed(1)}°C | ${data.vibration?.toFixed(2) ?? '1.8'} mm/s`}
            </Text>
          )}
        </group>
      )}

      {/* Selection Glow Circle */}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 1.35, 32]} />
          <meshBasicMaterial color="#06b6d4" />
        </mesh>
      )}
    </group>
  );
}

// ─── Camera Controller Preset Hook ────────────────────────────────────────────

function CameraPresetTrigger({ preset }: { preset: string }) {
  const { camera } = useThree();

  useFrame(() => {
    let targetPos: [number, number, number] = [0, 9, 14];
    if (preset === 'm2_focus') {
      targetPos = [-4, 4.5, 6.5];
    } else if (preset === 'top_down') {
      targetPos = [0, 16, 2];
    } else if (preset === 'maintenance') {
      targetPos = [-2, 5, 8];
    }
    camera.position.lerp(new THREE.Vector3(...targetPos), 0.05);
  });

  return null;
}

// ─── Main Factory3D Scene ─────────────────────────────────────────────────────

export default function Factory3D({
  machines = [],
  repairStatus,
  selectedMachineId,
  onSelectMachine,
  presentationMode = false,
}: Factory3DProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [animateConveyor, setAnimateConveyor] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<'overview' | 'm2_focus' | 'top_down' | 'maintenance'>('overview');

  const selectedId = selectedMachineId !== undefined ? selectedMachineId : internalSelectedId;

  const handleSelect = useCallback(
    (id: string) => {
      const nextId = selectedId === id ? null : id;
      if (onSelectMachine) {
        onSelectMachine(nextId);
      } else {
        setInternalSelectedId(nextId);
      }
    },
    [selectedId, onSelectMachine]
  );

  const machineMap = useMemo(() => {
    const map = new Map<string, MachineData>();
    for (const m of machines) map.set(m.id, m);
    return map;
  }, [machines]);

  const selectedMachine = selectedId ? machineMap.get(selectedId) : undefined;

  return (
    <section className={`panel f3d-section ${presentationMode ? 'f3d-presentation' : ''}`}>
      {/* Header bar */}
      <div className="panel-header f3d-header">
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#06b6d4' }}>❖</span> 3D Digital Twin Simulation
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Autonomous manufacturing cell with real-time telemetry, robotics, and safety isolation
          </p>
        </div>

        {/* View presets and toggles */}
        <div className="f3d-controls">
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'overview' ? 'active' : ''}`}
            onClick={() => setCameraPreset('overview')}
            title="Overview angle"
          >
            Overview
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'm2_focus' ? 'active' : ''}`}
            onClick={() => setCameraPreset('m2_focus')}
            title="Focus on M2 Drilling Station"
          >
            Focus M2
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'maintenance' ? 'active' : ''}`}
            onClick={() => setCameraPreset('maintenance')}
            title="Focus on Maintenance Bay"
          >
            Service Bay
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
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#22c55e' }} />RUNNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#eab308' }} />WARNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#f97316' }} />ANOMALY</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#ef4444' }} />MALFUNCTION / ISOLATED</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#06b6d4' }} />DIAGNOSING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#a855f7' }} />REPAIRING (ROBOT)</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#3b82f6' }} />SYSTEM TESTING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#10b981' }} />RECOVERED</span>
      </div>

      {/* 3D Canvas */}
      <div className="f3d-canvas-wrap">
        <Canvas
          shadows
          camera={{ position: [0, 9, 14], fov: 45 }}
          style={{ background: '#030712' }}
          gl={{ antialias: true, alpha: false }}
        >
          <ambientLight intensity={0.55} color="#e0f2fe" />
          <directionalLight position={[10, 15, 8]} intensity={1.2} castShadow color="#ffffff" shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-10, 12, -6]} intensity={0.6} color="#1e3a5f" />
          <pointLight position={[0, 4, 0]} intensity={0.8} color="#06b6d4" distance={20} />

          <CameraPresetTrigger preset={cameraPreset} />
          <FactoryEnvironment />
          <ConveyorWithFlow machines={machines} animate={animateConveyor} />
          <MaintenanceRobot repairStatus={repairStatus} />

          {MACHINE_CONFIGS.map((cfg) => (
            <MachineNode
              key={cfg.id}
              config={cfg}
              data={machineMap.get(cfg.id)}
              selected={selectedId === cfg.id}
              showLabels={showLabels}
              onSelect={() => handleSelect(cfg.id)}
            />
          ))}

          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={4}
            maxDistance={32}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        {/* Selected Machine Telemetry Floating Inspector */}
        {selectedMachine && (
          <div className="f3d-info-panel">
            <div className="f3d-info-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="f3d-status-dot"
                  style={{ background: getStatusHex(selectedMachine.status, selectedMachine.isolated) }}
                />
                <strong>{selectedMachine.id} — {selectedMachine.name}</strong>
              </div>
              <button
                className="f3d-close-btn"
                onClick={() => (onSelectMachine ? onSelectMachine(null) : setInternalSelectedId(null))}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="f3d-info-grid">
              <div className="f3d-info-row">
                <span className="f3d-info-label">Status</span>
                <span
                  className="f3d-info-value"
                  style={{ color: getStatusHex(selectedMachine.status, selectedMachine.isolated) }}
                >
                  {selectedMachine.isolated ? 'ISOLATED' : selectedMachine.status.toUpperCase()}
                </span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Health</span>
                <span className="f3d-info-value" style={{ color: selectedMachine.health && selectedMachine.health < 60 ? '#ef4444' : '#10b981' }}>
                  {selectedMachine.health ?? 95}%
                </span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Temperature</span>
                <span className="f3d-info-value">{selectedMachine.temperature?.toFixed(1) ?? '52.0'}°C</span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Vibration</span>
                <span className="f3d-info-value">{selectedMachine.vibration?.toFixed(2) ?? '1.80'} mm/s</span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Motor RPM</span>
                <span className="f3d-info-value">{selectedMachine.rpm ?? 1420} RPM</span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Power</span>
                <span className="f3d-info-value">{selectedMachine.power?.toFixed(1) ?? '6.5'} kW</span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Buffer Queue</span>
                <span className="f3d-info-value">{selectedMachine.queue} units</span>
              </div>
              <div className="f3d-info-row">
                <span className="f3d-info-label">Downtime</span>
                <span className="f3d-info-value">{selectedMachine.downtime}s</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
