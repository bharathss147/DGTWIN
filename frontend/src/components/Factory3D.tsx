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

// ─── Status Color Helpers ─────────────────────────────────────────────────────

function getStatusColor(status: string, isolated?: boolean): THREE.Color {
  if (isolated) return new THREE.Color('#ef4444');
  switch (status.toLowerCase()) {
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
  switch (status.toLowerCase()) {
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

// ─── Machine Layout Configuration ─────────────────────────────────────────────

const MACHINE_CONFIGS = [
  { id: 'M1', name: 'Cutting',       xPos: -8, defaultColor: '#1e3a5f' },
  { id: 'M2', name: 'Drilling',      xPos: -4, defaultColor: '#1e3a5f' },
  { id: 'M3', name: 'Assembly',      xPos:  0, defaultColor: '#1e3a5f' },
  { id: 'M4', name: 'Quality Check', xPos:  4, defaultColor: '#1e3a5f' },
  { id: 'M5', name: 'Packaging',     xPos:  8, defaultColor: '#1e3a5f' },
];

// ─── High-Detail Factory Building & Architecture ──────────────────────────────

function FactoryArchitecture() {
  return (
    <group>
      {/* ── Main Concrete Epoxy Factory Floor ── */}
      <mesh position={[0, -0.05, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[44, 26]} />
        <meshStandardMaterial color="#0b1120" roughness={0.65} metalness={0.3} />
      </mesh>

      {/* Industrial Sub-Grid Floor overlay */}
      <gridHelper args={[44, 44, '#1e293b', '#0f172a']} position={[0, 0.001, 0]} />

      {/* Safety Yellow Hazard Walkway Striping */}
      {/* Main conveyor corridor safety boundary lines */}
      <mesh position={[0, 0.002, 2.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 0.1]} />
        <meshBasicMaterial color="#eab308" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.002, -2.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 0.1]} />
        <meshBasicMaterial color="#eab308" transparent opacity={0.8} />
      </mesh>

      {/* Crosswalk hatch lines for personnel */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <group key={x} position={[x, 0.002, 2.8]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.4]} />
            <meshBasicMaterial color="#eab308" transparent opacity={0.25} />
          </mesh>
        </group>
      ))}

      {/* ── Perimeter Industrial Walls & Columns ── */}
      {/* Rear Wall */}
      <mesh position={[0, 4.5, -12.5]} receiveShadow>
        <boxGeometry args={[44, 9, 0.4]} />
        <meshStandardMaterial color="#090f1d" roughness={0.85} metalness={0.2} />
      </mesh>
      {/* Left Wall */}
      <mesh position={[-21.8, 4.5, 0]} receiveShadow>
        <boxGeometry args={[0.4, 9, 25]} />
        <meshStandardMaterial color="#090f1d" roughness={0.85} metalness={0.2} />
      </mesh>
      {/* Right Wall */}
      <mesh position={[21.8, 4.5, 0]} receiveShadow>
        <boxGeometry args={[0.4, 9, 25]} />
        <meshStandardMaterial color="#090f1d" roughness={0.85} metalness={0.2} />
      </mesh>

      {/* Heavy Structural Steel I-Beam Columns along Perimeter */}
      {[-20, -12, -4, 4, 12, 20].map((x) => (
        <group key={`col-rear-${x}`} position={[x, 4.5, -12.2]}>
          {/* Main vertical column */}
          <mesh castShadow>
            <boxGeometry args={[0.5, 9, 0.5]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Concrete footing */}
          <mesh position={[0, -4.2, 0]}>
            <boxGeometry args={[0.9, 0.6, 0.9]} />
            <meshStandardMaterial color="#334155" roughness={0.9} />
          </mesh>
          {/* Hazard stripes on column base */}
          <mesh position={[0, -3.2, 0.26]}>
            <planeGeometry args={[0.5, 1.2]} />
            <meshBasicMaterial color="#eab308" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}

      {/* ── High-Ceiling Overhead Steel Trusses & Industrial Crane Gantry ── */}
      <group position={[0, 8.2, 0]}>
        {/* Longitudinal Crane Runway Beams */}
        <mesh position={[0, 0, -6]}>
          <boxGeometry args={[43, 0.35, 0.35]} />
          <meshStandardMaterial color="#eab308" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 6]}>
          <boxGeometry args={[43, 0.35, 0.35]} />
          <meshStandardMaterial color="#eab308" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Overhead Bridge Crane Gantry spanning across factory */}
        <group position={[-2, 0, 0]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[1.2, 0.4, 12.2]} />
            <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Crane Hoist Trolley */}
          <mesh position={[0, -0.2, -1.5]} castShadow>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>

        {/* Overhead Steel Cross Trusses */}
        {[-16, -8, 0, 8, 16].map((x) => (
          <group key={`truss-${x}`} position={[x, 0.4, 0]}>
            <mesh>
              <boxGeometry args={[0.2, 0.25, 24]} />
              <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Overhead Industrial Ventilation Ductwork */}
        <mesh position={[0, 0.2, -8.5]}>
          <cylinderGeometry args={[0.5, 0.5, 42, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.25} />
        </mesh>
      </group>

      {/* ── High-Bay Factory LED Overhead Floodlights ── */}
      {[-12, -4, 4, 12].map((x) => (
        <group key={`light-${x}`} position={[x, 7.8, 0]}>
          <mesh>
            <cylinderGeometry args={[0.4, 0.5, 0.2, 12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <circleGeometry args={[0.38, 12]} />
            <meshBasicMaterial color="#e0f2fe" />
          </mesh>
          <pointLight position={[0, -0.5, 0]} intensity={0.6} color="#e0f2fe" distance={16} decay={2} />
        </group>
      ))}

      {/* ── Raised Mezzanine: AI Operations & Control Room ── */}
      <group position={[0, 2.6, -11.0]}>
        {/* Mezzanine Deck Floor */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[14, 0.25, 2.6]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Support Steel Posts */}
        {[-6, -2, 2, 6].map((x) => (
          <mesh key={x} position={[x, -1.3, 1.2]}>
            <cylinderGeometry args={[0.08, 0.08, 2.6, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
        ))}
        {/* Observation Glass Balcony Railing */}
        <mesh position={[0, 0.6, 1.25]}>
          <boxGeometry args={[13.8, 0.9, 0.06]} />
          <meshStandardMaterial color="#06b6d4" transparent opacity={0.35} roughness={0.1} />
        </mesh>
        {/* Top Railing Handrail */}
        <mesh position={[0, 1.05, 1.25]}>
          <boxGeometry args={[14, 0.08, 0.1]} />
          <meshStandardMaterial color="#64748b" metalness={0.9} />
        </mesh>
        {/* Control Room Console Terminals */}
        <mesh position={[0, 0.45, 0.3]}>
          <boxGeometry args={[3.2, 0.6, 0.8]} />
          <meshStandardMaterial color="#0f172a" metalness={0.7} />
        </mesh>
        {/* Large Holographic Operations Banner */}
        <Text position={[0, 1.8, 0.3]} fontSize={0.32} color="#38bdf8" anchorX="center" anchorY="middle">
          AI OPERATIONS CENTER — JARVIS SI-02
        </Text>
      </group>
    </group>
  );
}

// ─── Warehouse & Material Storage Area ────────────────────────────────────────

function WarehouseStorageZones() {
  return (
    <group>
      {/* ── RAW MATERIAL INVENTORY (LEFT ZONE: X = -16) ── */}
      <group position={[-16, 0, 0]}>
        {/* Storage Bay Floor Zone */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.5, 14]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.1} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.3, 13.8]} />
          <meshBasicMaterial color="#059669" wireframe />
        </mesh>

        {/* Industrial High-Bay Pallet Racks (2 Racks) */}
        {[-3.5, 3.5].map((z, rackIdx) => (
          <group key={rackIdx} position={[0, 0, z]}>
            {/* Orange/Blue Structural Upright Frames */}
            {[-2.2, 0, 2.2].map((x) => (
              <group key={x} position={[x, 2.4, 0]}>
                <mesh>
                  <boxGeometry args={[0.12, 4.8, 1.4]} />
                  <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            ))}
            {/* Horizontal Heavy Load Beams (3 Tiers) */}
            {[0.8, 2.4, 4.0].map((y, tier) => (
              <group key={tier} position={[0, y, 0]}>
                <mesh position={[0, 0, 0.65]}>
                  <boxGeometry args={[4.6, 0.12, 0.08]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.6} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, -0.65]}>
                  <boxGeometry args={[4.6, 0.12, 0.08]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.6} roughness={0.3} />
                </mesh>

                {/* Pallets and Material Boxes on Shelf */}
                {[-1.2, 1.2].map((bx) => (
                  <group key={bx} position={[bx, 0.22, 0]}>
                    {/* Wooden Pallet */}
                    <mesh>
                      <boxGeometry args={[1.2, 0.1, 1.0]} />
                      <meshStandardMaterial color="#78350f" roughness={0.9} />
                    </mesh>
                    {/* Stored Cargo Crates */}
                    <mesh position={[0, 0.28, 0]}>
                      <boxGeometry args={[0.9, 0.45, 0.8]} />
                      <meshStandardMaterial
                        color={tier === 0 ? '#38bdf8' : tier === 1 ? '#34d399' : '#818cf8'}
                        roughness={0.6}
                      />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>
        ))}

        {/* Digital Signboard */}
        <Text position={[0, 5.4, 0]} fontSize={0.35} color="#10b981" anchorX="center" anchorY="middle">
          RAW MATERIAL INVENTORY
        </Text>
        <Text position={[0, 5.0, 0]} fontSize={0.2} color="#94a3b8" anchorX="center" anchorY="middle">
          AUTOMATED STAGING BAYS 1–4
        </Text>
      </group>

      {/* ── FINISHED GOODS WAREHOUSE & DISPATCH (RIGHT ZONE: X = 16) ── */}
      <group position={[16, 0, 0]}>
        {/* Floor Demarcation */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.5, 14]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.1} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.3, 13.8]} />
          <meshBasicMaterial color="#0891b2" wireframe />
        </mesh>

        {/* 2 Pallet Racks with Finished Goods Packaging */}
        {[-3.5, 3.5].map((z, rackIdx) => (
          <group key={rackIdx} position={[0, 0, z]}>
            {[-2.2, 0, 2.2].map((x) => (
              <mesh key={x} position={[x, 2.4, 0]}>
                <boxGeometry args={[0.12, 4.8, 1.4]} />
                <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.3} />
              </mesh>
            ))}
            {[0.8, 2.4, 4.0].map((y, tier) => (
              <group key={tier} position={[0, y, 0]}>
                <mesh position={[0, 0, 0.65]}>
                  <boxGeometry args={[4.6, 0.12, 0.08]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.6} />
                </mesh>
                <mesh position={[0, 0, -0.65]}>
                  <boxGeometry args={[4.6, 0.12, 0.08]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.6} />
                </mesh>
                {[-1.2, 1.2].map((bx) => (
                  <group key={bx} position={[bx, 0.25, 0]}>
                    <mesh>
                      <boxGeometry args={[1.2, 0.1, 1.0]} />
                      <meshStandardMaterial color="#78350f" roughness={0.9} />
                    </mesh>
                    <mesh position={[0, 0.32, 0]}>
                      <boxGeometry args={[0.95, 0.55, 0.85]} />
                      <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.4} />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>
        ))}

        <Text position={[0, 5.4, 0]} fontSize={0.35} color="#06b6d4" anchorX="center" anchorY="middle">
          FINISHED GOODS WAREHOUSE
        </Text>
        <Text position={[0, 5.0, 0]} fontSize={0.2} color="#94a3b8" anchorX="center" anchorY="middle">
          PALLETIZED DISPATCH ZONE
        </Text>
      </group>

      {/* ── AUTONOMOUS MAINTENANCE & SERVICE BAY (REAR: X = 0, Z = 6.0) ── */}
      <group position={[0, 0, 6.0]}>
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.5, 3.8]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.15} />
        </mesh>
        {/* Dock Frame Platform */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[6.8, 0.18, 3.2]} />
          <meshStandardMaterial color="#1e1b4b" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Tool Cabinets and Oil Barrels */}
        <mesh position={[-2.4, 0.7, -1.0]}>
          <boxGeometry args={[1.2, 1.2, 0.6]} />
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </mesh>
        <mesh position={[2.4, 0.5, -1.0]}>
          <cylinderGeometry args={[0.35, 0.35, 0.9, 12]} />
          <meshStandardMaterial color="#1e3a5f" metalness={0.8} />
        </mesh>
        <Text position={[0, 2.2, -1.0]} fontSize={0.3} color="#c084fc" anchorX="center" anchorY="middle">
          AUTONOMOUS ROBOTICS MAINTENANCE STATION
        </Text>
      </group>
    </group>
  );
}

// ─── Autonomous Guided Vehicles (AGVs) ────────────────────────────────────────

function AGVFleet({ hasFailure }: { hasFailure: boolean }) {
  const agv1Ref = useRef<THREE.Group>(null);
  const agv2Ref = useRef<THREE.Group>(null);
  const pathT1 = useRef(0);
  const pathT2 = useRef(Math.PI);

  useFrame((_, delta) => {
    // Normal speed unless factory failure forces cautionary patrol
    const speed = hasFailure ? 0.35 : 0.7;

    pathT1.current += delta * speed;
    pathT2.current += delta * speed;

    if (agv1Ref.current) {
      // Loop between Raw Material Inventory and Input conveyor
      const x = -13 + Math.sin(pathT1.current) * 3.5;
      const z = 4.5 + Math.cos(pathT1.current) * 2.0;
      agv1Ref.current.position.set(x, 0, z);
      agv1Ref.current.rotation.y = Math.atan2(Math.cos(pathT1.current), -Math.sin(pathT1.current));
    }

    if (agv2Ref.current) {
      // Loop between Output conveyor and Finished Goods
      const x = 13 + Math.sin(pathT2.current) * 3.5;
      const z = 4.5 + Math.cos(pathT2.current) * 2.0;
      agv2Ref.current.position.set(x, 0, z);
      agv2Ref.current.rotation.y = Math.atan2(Math.cos(pathT2.current), -Math.sin(pathT2.current));
    }
  });

  return (
    <group>
      {/* ── Glowing AGV Floor Guide Paths ── */}
      <mesh position={[-13, 0.003, 4.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.08, 32]} />
        <meshBasicMaterial color={hasFailure ? '#f97316' : '#10b981'} transparent opacity={0.6} />
      </mesh>
      <mesh position={[13, 0.003, 4.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.08, 32]} />
        <meshBasicMaterial color={hasFailure ? '#f97316' : '#06b6d4'} transparent opacity={0.6} />
      </mesh>

      {/* ── AGV Unit 1 (Raw Material Transfer) ── */}
      <group ref={agv1Ref} position={[-13, 0, 4.5]}>
        {/* Chassis */}
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[1.2, 0.35, 0.8]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Wheels */}
        {[-0.45, 0.45].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.12, 0.42]}>
              <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>
            <mesh position={[x, 0.12, -0.42]}>
              <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>
          </group>
        ))}
        {/* LiDAR Dome */}
        <mesh position={[0.45, 0.42, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1} />
        </mesh>
        {/* Cargo Container */}
        <mesh position={[-0.1, 0.5, 0]}>
          <boxGeometry args={[0.7, 0.35, 0.6]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.5} />
        </mesh>
        <Text position={[0, 0.8, 0]} fontSize={0.14} color="#f8fafc" anchorX="center" anchorY="middle">
          AGV-01
        </Text>
      </group>

      {/* ── AGV Unit 2 (Finished Product Transfer) ── */}
      <group ref={agv2Ref} position={[13, 0, 4.5]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[1.2, 0.35, 0.8]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.6} roughness={0.4} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.12, 0.42]}>
              <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>
            <mesh position={[x, 0.12, -0.42]}>
              <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>
          </group>
        ))}
        <mesh position={[0.45, 0.42, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1} />
        </mesh>
        <mesh position={[-0.1, 0.5, 0]}>
          <boxGeometry args={[0.7, 0.35, 0.6]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
        <Text position={[0, 0.8, 0]} fontSize={0.14} color="#f8fafc" anchorX="center" anchorY="middle">
          AGV-02
        </Text>
      </group>
    </group>
  );
}

// ─── Heavy Modular Production Conveyor & Parts Flow ───────────────────────────

interface ConveyorLineProps {
  machines: MachineData[];
  animate: boolean;
}

function ConveyorLine({ machines, animate }: ConveyorLineProps) {
  const rollerOffset = useRef(0);
  const rollersRef = useRef<THREE.Group>(null);

  // Check if any machine is isolated or malfunctioning
  const blockedMachine = machines.find((m) => m.isolated || m.status === 'malfunction' || m.status === 'offline');
  const blockedX = blockedMachine
    ? (MACHINE_CONFIGS.find((c) => c.id === blockedMachine.id)?.xPos ?? null)
    : null;

  useFrame((_, delta) => {
    if (!animate) return;
    rollerOffset.current = (rollerOffset.current + delta * 1.8) % 0.8;
    if (rollersRef.current) {
      rollersRef.current.position.x = rollerOffset.current;
    }
  });

  // Rollers across the conveyor
  const rollerXList = useMemo(() => {
    const list: number[] = [];
    for (let x = -13; x <= 13; x += 0.8) list.push(x);
    return list;
  }, []);

  // Moving payload parts with trays
  const partItems = useMemo(
    () => [
      { id: 0, startX: -11.5, type: 'raw',       color: '#38bdf8' },
      { id: 1, startX:  -9.0, type: 'cut',       color: '#818cf8' },
      { id: 2, startX:  -6.2, type: 'pre_drill', color: '#c084fc' },
      { id: 3, startX:  -2.2, type: 'drilled',   color: '#34d399' },
      { id: 4, startX:   1.8, type: 'assembled', color: '#fbbf24' },
      { id: 5, startX:   5.8, type: 'inspected', color: '#38bdf8' },
      { id: 6, startX:   9.8, type: 'packaged',  color: '#cbd5e1' },
    ],
    []
  );

  return (
    <group>
      {/* Conveyor Bed Structure */}
      <mesh position={[0, 0.16, 0]} receiveShadow>
        <boxGeometry args={[26, 0.24, 1.5]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} metalness={0.5} />
      </mesh>

      {/* Industrial Side Guide Rails */}
      <mesh position={[0, 0.35, 0.78]}>
        <boxGeometry args={[26, 0.16, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.35, -0.78]}>
        <boxGeometry args={[26, 0.16, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Rotating Rollers */}
      <group ref={rollersRef}>
        {rollerXList.map((x) => (
          <mesh key={x} position={[x, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 1.45, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* Conveyor Drive Motors & Support Legs */}
      {[-11, -6, 0, 6, 11].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.08, 0.7]}>
            <cylinderGeometry args={[0.06, 0.08, 0.32, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, -0.7]}>
            <cylinderGeometry args={[0.06, 0.08, 0.32, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.7} />
          </mesh>
          {/* Geared Electric Motor */}
          <mesh position={[0, 0.18, 0.95]}>
            <boxGeometry args={[0.5, 0.25, 0.35]} />
            <meshStandardMaterial color="#1e3a5f" metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Moving Industrial Payload Products with Smart Queueing */}
      {partItems.map((part) => (
        <ConveyorPayload
          key={part.id}
          startX={part.startX}
          color={part.color}
          blockedX={blockedX}
          animate={animate}
        />
      ))}
    </group>
  );
}

function ConveyorPayload({
  startX,
  color,
  blockedX,
  animate,
}: {
  startX: number;
  color: string;
  blockedX: number | null;
  animate: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const currentX = useRef(startX);

  useFrame((_, delta) => {
    if (!ref.current || !animate) return;

    let speed = 1.6;

    // If an upstream machine is isolated/blocked, queue parts just before it
    if (blockedX !== null) {
      const dist = blockedX - currentX.current;
      if (dist > 0 && dist < 2.4) {
        speed = Math.max(0, dist * 0.45 - 0.25);
      }
    }

    currentX.current += delta * speed;
    if (currentX.current > 12.5) {
      currentX.current = -12.5;
    }

    ref.current.position.x = currentX.current;
  });

  return (
    <group ref={ref} position={[startX, 0.44, 0]}>
      {/* Component Machining Carrier Tray */}
      <mesh position={[0, -0.04, 0]} castShadow>
        <boxGeometry args={[0.55, 0.05, 0.55]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Machined Metallic Component Part */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.25, 12]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}

// ─── High-Detail Industrial Machines ──────────────────────────────────────────

interface MachineViewProps {
  status: string;
  isolated?: boolean;
  selected: boolean;
  onClick: () => void;
}

// ── M1: INDUSTRIAL CUTTING CELL ──────────────────────────────────────────────
function CuttingStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const bladeRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame((_, delta) => {
    if (bladeRef.current && active) {
      bladeRef.current.rotation.y += delta * 14;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Heavy Base Casting */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.7, 1.0, 1.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Upper Safety Glass Enclosure Frame */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[1.8, 0.8, 1.5]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} />
      </mesh>
      {/* Tinted Safety Glass Window */}
      <mesh position={[0, 1.35, 0.76]}>
        <planeGeometry args={[1.6, 0.7]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} />
      </mesh>
      {/* Overhead Cutting Gantry and Motor */}
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[1.2, 0.35, 0.8]} />
        <meshStandardMaterial color="#334155" metalness={0.9} />
      </mesh>
      {/* High-Speed Diamond Carbide Saw Blade */}
      <mesh ref={bladeRef} position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 24]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.1} />
      </mesh>
      {/* Laser Cut Guide Beam */}
      {active && (
        <mesh position={[0, 1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, 1.2]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
        </mesh>
      )}
      {/* Operator Touchscreen Panel */}
      <mesh position={[0.7, 1.2, 0.85]} rotation={[-0.2, 0.3, 0]}>
        <boxGeometry args={[0.35, 0.25, 0.06]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.5} />
      </mesh>
      {/* Status Light Tower */}
      <mesh position={[0.7, 2.05, -0.6]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0.7, 2.25, -0.6]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ── M2: INDUSTRIAL CNC DRILLING STATION (HERO MALFUNCTION MACHINE) ───────────
function DrillingStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const spindleRef = useRef<THREE.Group>(null);
  const jitterRef = useRef<THREE.Group>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  const isAnomaly = status.toLowerCase() === 'anomaly' || status.toLowerCase() === 'warning';
  const isMalfunction = isolated || status.toLowerCase() === 'malfunction' || status.toLowerCase() === 'offline';

  useFrame((_, delta) => {
    // Spindle rotation & reciprocating drilling plunge
    if (spindleRef.current && active) {
      const speed = isAnomaly ? 6 : 14;
      spindleRef.current.rotation.y += delta * speed;
      spindleRef.current.position.y = 1.45 + Math.sin(Date.now() * (isAnomaly ? 0.003 : 0.006)) * 0.2;
    }

    // Mechanical vibration jitter during anomaly/malfunction
    if (jitterRef.current) {
      if (isAnomaly) {
        jitterRef.current.position.x = (Math.random() - 0.5) * 0.03;
        jitterRef.current.position.z = (Math.random() - 0.5) * 0.03;
      } else {
        jitterRef.current.position.set(0, 0, 0);
      }
    }
  });

  return (
    <group onClick={onClick}>
      <group ref={jitterRef}>
        {/* Main Machine Bed */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.5, 1.0, 1.3]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Heavy Vertical Hydraulic Support Column */}
        <mesh position={[0.5, 1.3, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 2.2, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Top Motor Housing */}
        <mesh position={[0, 2.0, 0]}>
          <boxGeometry args={[1.0, 0.45, 0.9]} />
          <meshStandardMaterial color="#0f172a" metalness={0.7} />
        </mesh>
        {/* Reciprocating Drill Spindle & Chuck */}
        <group ref={spindleRef} position={[0, 1.45, 0]}>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.1, 0.08, 0.35, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} />
          </mesh>
          <mesh position={[0, -0.15, 0]}>
            <cylinderGeometry args={[0.04, 0.015, 0.5, 8]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.05} />
          </mesh>
        </group>
        {/* IoT Temperature & Vibration Sensor Pod with Pulsing Halo */}
        <mesh position={[-0.45, 1.6, 0.45]}>
          <boxGeometry args={[0.14, 0.18, 0.14]} />
          <meshStandardMaterial color="#0284c7" metalness={0.8} />
        </mesh>
        <mesh position={[-0.45, 1.72, 0.45]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={isAnomaly ? '#f97316' : isMalfunction ? '#ef4444' : '#10b981'}
            emissive={isAnomaly ? '#f97316' : isMalfunction ? '#ef4444' : '#10b981'}
            emissiveIntensity={1.5}
          />
        </mesh>
        {/* Multi-Tier Tower Stack Light */}
        <group position={[0.65, 2.3, -0.45]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          {/* Red tier */}
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 12]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={isMalfunction ? 2.0 : 0.2} />
          </mesh>
          {/* Yellow tier */}
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 12]} />
            <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={isAnomaly ? 2.0 : 0.2} />
          </mesh>
          {/* Green tier */}
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 12]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={active && !isAnomaly ? 1.5 : 0.2} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ── M3: AUTOMATED ROBOTIC ASSEMBLY CELL ───────────────────────────────────────
function AssemblyStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const baseRef = useRef<THREE.Group>(null);
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame(() => {
    if (active && baseRef.current && shoulderRef.current && elbowRef.current) {
      baseRef.current.rotation.y = Math.sin(Date.now() * 0.0012) * 0.45;
      shoulderRef.current.rotation.z = 0.2 + Math.sin(Date.now() * 0.002) * 0.3;
      elbowRef.current.rotation.z = -0.4 - Math.cos(Date.now() * 0.0025) * 0.35;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Heavy Steel Pedestal */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.75, 0.85, 0.9, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Robot Base Rotating Turntable */}
      <group ref={baseRef} position={[0, 0.9, 0]}>
        <mesh>
          <cylinderGeometry args={[0.6, 0.6, 0.2, 16]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Articulated Shoulder */}
        <group ref={shoulderRef} position={[0, 0.2, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.22, 1.0, 0.22]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.6} />
          </mesh>
          {/* Elbow Joint & Forearm */}
          <group ref={elbowRef} position={[0, 1.0, 0]}>
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[0.16, 0.85, 0.16]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.8} />
            </mesh>
            {/* 2-Finger Pneumatic Gripper End-Effector */}
            <mesh position={[0, 0.85, 0]}>
              <sphereGeometry args={[0.12, 12, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.9} />
            </mesh>
            <mesh position={[0.08, 1.0, 0]}>
              <boxGeometry args={[0.04, 0.2, 0.06]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} />
            </mesh>
            <mesh position={[-0.08, 1.0, 0]}>
              <boxGeometry args={[0.04, 0.2, 0.06]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} />
            </mesh>
          </group>
        </group>
      </group>
      {/* Safety Light Curtains around Robot cell */}
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.9, 0.8]}>
          <cylinderGeometry args={[0.03, 0.03, 1.8, 8]} />
          <meshStandardMaterial color="#eab308" metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.8, 1.8, -0.6]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ── M4: OPTICAL LASER QUALITY INSPECTION TUNNEL ──────────────────────────────
function QualityStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const scanPlaneRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame(() => {
    if (scanPlaneRef.current && active) {
      scanPlaneRef.current.position.x = Math.sin(Date.now() * 0.003) * 0.5;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 1.0, 1.3]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>
      {/* Inspection Arch Tunnel */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[1.5, 0.16, 1.4]} />
        <meshStandardMaterial color="#334155" metalness={0.8} />
      </mesh>
      {/* Side Arch Pillars */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 1.4, 8]} />
          <meshStandardMaterial color="#475569" metalness={0.8} />
        </mesh>
      ))}
      {/* Sweeping Blue Optical Laser Scan Sheet */}
      <mesh ref={scanPlaneRef} position={[0, 0.9, 0]}>
        <planeGeometry args={[0.04, 0.8]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={active ? 0.85 : 0.2} />
      </mesh>
      {/* High-Resolution Camera Pod */}
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.7, 1.8, -0.6]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ── M5: AUTOMATED PACKAGING & PALLETIZING CELL ────────────────────────────────
function PackagingStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const ramRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame(() => {
    if (ramRef.current && active) {
      ramRef.current.position.y = 1.35 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.25;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.6, 1.1, 1.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>
      {/* Heavy Pneumatic Press Frame */}
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[1.2, 0.35, 1.0]} />
        <meshStandardMaterial color="#334155" metalness={0.9} />
      </mesh>
      {/* Hydraulic Compression Ram */}
      <mesh ref={ramRef} position={[0, 1.35, 0]}>
        <boxGeometry args={[0.8, 0.3, 0.8]} />
        <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.7, 2.05, -0.6]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ─── 3D Safety Isolation Laser Curtain & Warning Hologram ─────────────────────

function SafetyIsolationZone({
  active,
  xPos,
  reason,
}: {
  active: boolean;
  xPos: number;
  reason?: string | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current || !active) return;
    pulseRef.current += delta * 4;
    const op = 0.35 + Math.abs(Math.sin(pulseRef.current)) * 0.35;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = op;
  });

  if (!active) return null;

  return (
    <group position={[xPos, 0, 0]}>
      {/* 4 Corner Warning Hazard Pylons */}
      {[
        [-1.3,  1.3],
        [ 1.3,  1.3],
        [-1.3, -1.3],
        [ 1.3, -1.3],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 1.4, 8]} />
            <meshStandardMaterial color="#eab308" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}

      {/* Red Safety Isolation Perimeter Laser Grid */}
      <mesh ref={meshRef} position={[0, 0.7, 0]}>
        <boxGeometry args={[2.6, 1.4, 2.6]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.45} wireframe />
      </mesh>

      {/* Floor Red Hazard Glow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.7, 2.7]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.3} />
      </mesh>

      {/* 3D Holographic AI Anomaly Diagnostic Banner */}
      <group position={[0, 2.8, 0]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[3.2, 0.8]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.85} />
        </mesh>
        <Text position={[0, 0.22, 0.01]} fontSize={0.2} color="#ef4444" anchorX="center" anchorY="middle">
          ⚠ FACTORYMIND AI: ANOMALY DETECTED
        </Text>
        <Text position={[0, -0.02, 0.01]} fontSize={0.15} color="#fca5a5" anchorX="center" anchorY="middle">
          ROOT CAUSE: SPINDLE OVERHEATING
        </Text>
        <Text position={[0, -0.22, 0.01]} fontSize={0.12} color="#cbd5e1" anchorX="center" anchorY="middle">
          VIBRATION: 8.7 mm/s | TEMP: 87.4°C | RPM: ABNORMAL
        </Text>
      </group>
    </group>
  );
}

// ─── Autonomous Maintenance Robot Drone ───────────────────────────────────────

function AutonomousMaintenanceRobot({ repairStatus }: { repairStatus?: RepairStatus }) {
  const ref = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const targetX = repairStatus?.active ? -4.0 : 0.0;
  const targetZ = repairStatus?.active ? 1.7 : 5.8;

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, targetX, delta * 2.2);
    ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, targetZ, delta * 2.2);

    if (repairStatus?.active && armRef.current) {
      armRef.current.rotation.z = Math.sin(Date.now() * 0.005) * 0.35;
      armRef.current.rotation.y = Math.cos(Date.now() * 0.004) * 0.45;
    }
  });

  return (
    <group ref={ref} position={[0, 0, 5.8]}>
      {/* Heavy Mobile Base Chassis */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[1.0, 0.4, 0.8]} />
        <meshStandardMaterial color="#2e1065" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Heavy Track Rollers */}
      <mesh position={[0, 0.12, 0.44]}>
        <boxGeometry args={[1.1, 0.22, 0.16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, -0.44]}>
        <boxGeometry args={[1.1, 0.22, 0.16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      {/* Articulated Multi-Tool Maintenance Arm */}
      <group ref={armRef} position={[0, 0.48, 0]}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.8, 8]} />
          <meshStandardMaterial color="#a855f7" metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.85, 0.12]}>
          <boxGeometry args={[0.22, 0.18, 0.28]} />
          <meshStandardMaterial color="#c084fc" metalness={0.9} />
        </mesh>
        {/* Active Laser Repair Beam when repairing */}
        {repairStatus?.active && (
          <mesh position={[0, 0.85, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.18, 1.4, 16]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.65} />
          </mesh>
        )}
      </group>
      {/* Status Beacon */}
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissive={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissiveIntensity={1.8}
        />
      </mesh>
      {repairStatus?.active && (
        <Text position={[0, 1.7, 0]} fontSize={0.22} color="#c084fc" anchorX="center" anchorY="middle">
          AUTONOMOUS REPAIR {repairStatus.progress}%
        </Text>
      )}
    </group>
  );
}

// ─── Machine Node Assembly with Digital HUD Labels ────────────────────────────

function MachineStationAssembly({
  config,
  data,
  selected,
  showLabels,
  onSelect,
}: {
  config: (typeof MACHINE_CONFIGS)[0];
  data?: MachineData;
  selected: boolean;
  showLabels: boolean;
  onSelect: () => void;
}) {
  const status = data?.status ?? 'running';
  const isolated = data?.isolated ?? false;
  const statusColor = getStatusColor(status, isolated);

  return (
    <group position={[config.xPos, 0, 0]}>
      {/* Specific Machine Visual */}
      {config.id === 'M1' && <CuttingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M2' && <DrillingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M3' && <AssemblyStation status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M4' && <QualityStation status={status} isolated={isolated} selected={selected} onClick={onSelect} />}
      {config.id === 'M5' && <PackagingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} />}

      {/* Safety Isolation Barrier for M2 or any isolated machine */}
      <SafetyIsolationZone active={isolated} xPos={0} reason={data?.isolation_reason} />

      {/* Status Beacon Globe */}
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.4} />
      </mesh>

      {/* 3D Digital Hologram Info Panel over Machine */}
      {showLabels && (
        <group position={[0, 2.75, 0]}>
          <Text fontSize={0.28} color="#f8fafc" anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#020617">
            {`${config.id} ${config.name}`}
          </Text>
          <Text position={[0, -0.22, 0]} fontSize={0.17} color={getStatusHex(status, isolated)} anchorX="center" anchorY="top">
            {isolated ? '● ISOLATED' : `● ${status.toUpperCase()}`}
          </Text>
          {data?.temperature !== undefined && (
            <Text position={[0, -0.42, 0]} fontSize={0.14} color="#94a3b8" anchorX="center" anchorY="top">
              {`${data.temperature.toFixed(1)}°C | ${data.vibration?.toFixed(2) ?? '1.8'} mm/s | ${data.rpm ?? 1420} RPM`}
            </Text>
          )}
        </group>
      )}

      {/* Selection Ring */}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.3, 1.45, 32]} />
          <meshBasicMaterial color="#06b6d4" />
        </mesh>
      )}
    </group>
  );
}

// ─── Camera Controller & Presets Hook ─────────────────────────────────────────

function CameraPresetController({ preset }: { preset: string }) {
  const { camera } = useThree();

  useFrame(() => {
    let target: [number, number, number] = [0, 11, 17];
    if (preset === 'production') {
      target = [0, 6, 10];
    } else if (preset === 'm2_focus') {
      target = [-4, 4, 6.5];
    } else if (preset === 'maintenance') {
      target = [0, 6, 11];
    } else if (preset === 'warehouse') {
      target = [-14, 8, 12];
    } else if (preset === 'full_factory') {
      target = [0, 15, 22];
    }
    camera.position.lerp(new THREE.Vector3(...target), 0.05);
  });

  return null;
}

// ─── Main Exported Factory3D Component ────────────────────────────────────────

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
  const [cameraPreset, setCameraPreset] = useState<
    'overview' | 'production' | 'm2_focus' | 'maintenance' | 'warehouse' | 'full_factory'
  >('overview');

  const selectedId = selectedMachineId !== undefined ? selectedMachineId : internalSelectedId;

  const handleSelect = useCallback(
    (id: string) => {
      const next = selectedId === id ? null : id;
      if (onSelectMachine) onSelectMachine(next);
      else setInternalSelectedId(next);
    },
    [selectedId, onSelectMachine]
  );

  const machineMap = useMemo(() => {
    const map = new Map<string, MachineData>();
    for (const m of machines) map.set(m.id, m);
    return map;
  }, [machines]);

  const selectedMachine = selectedId ? machineMap.get(selectedId) : undefined;
  const hasFailure = machines.some((m) => m.isolated || m.status === 'malfunction' || m.status === 'offline');

  return (
    <section className={`panel f3d-section ${presentationMode ? 'f3d-presentation' : ''}`}>
      {/* ── Control Header & Camera Presets ── */}
      <div className="panel-header f3d-header">
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#06b6d4' }}>❖</span> Industrial Digital Twin 3D Environment
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            High-detail smart factory floor with warehouse racks, AGVs, robotic assembly, and live IoT telemetry
          </p>
        </div>

        <div className="f3d-controls">
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'full_factory' ? 'active' : ''}`}
            onClick={() => setCameraPreset('full_factory')}
          >
            Full Factory
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'production' ? 'active' : ''}`}
            onClick={() => setCameraPreset('production')}
          >
            Production Line
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'm2_focus' ? 'active' : ''}`}
            onClick={() => setCameraPreset('m2_focus')}
          >
            M2 Diagnostic
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'maintenance' ? 'active' : ''}`}
            onClick={() => setCameraPreset('maintenance')}
          >
            Service Bay
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'warehouse' ? 'active' : ''}`}
            onClick={() => setCameraPreset('warehouse')}
          >
            Warehouse
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

      {/* ── Legend ── */}
      <div className="f3d-legend">
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#22c55e' }} />RUNNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#eab308' }} />WARNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#f97316' }} />ANOMALY</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#ef4444' }} />MALFUNCTION / ISOLATED</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#06b6d4' }} />DIAGNOSING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#a855f7' }} />REPAIRING (AGV/ROBOT)</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#3b82f6' }} />SYSTEM TESTING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#10b981' }} />RECOVERED</span>
      </div>

      {/* ── 3D Canvas ── */}
      <div className="f3d-canvas-wrap">
        <Canvas
          shadows
          camera={{ position: [0, 11, 17], fov: 45 }}
          style={{ background: '#020617' }}
          gl={{ antialias: true, alpha: false }}
        >
          <ambientLight intensity={0.55} color="#e0f2fe" />
          <directionalLight
            position={[12, 18, 10]}
            intensity={1.3}
            castShadow
            color="#ffffff"
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-12, 14, -8]} intensity={0.65} color="#1e3a5f" />
          <pointLight position={[0, 5, 0]} intensity={0.9} color="#06b6d4" distance={24} />

          <CameraPresetController preset={cameraPreset} />
          <FactoryArchitecture />
          <WarehouseStorageZones />
          <AGVFleet hasFailure={hasFailure} />
          <ConveyorLine machines={machines} animate={animateConveyor} />
          <AutonomousMaintenanceRobot repairStatus={repairStatus} />

          {MACHINE_CONFIGS.map((cfg) => (
            <MachineStationAssembly
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
            maxDistance={38}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        {/* Selected Machine Telemetry HUD Inspector */}
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
                <span
                  className="f3d-info-value"
                  style={{ color: (selectedMachine.health ?? 95) < 60 ? '#ef4444' : '#10b981' }}
                >
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
