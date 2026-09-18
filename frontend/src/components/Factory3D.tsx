import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

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

// ─── Status Color Helpers (Industrial CAD Palette) ────────────────────────────

function getStatusColor(status: string, isolated?: boolean): THREE.Color {
  if (isolated) return new THREE.Color('#ef4444');
  switch (status.toLowerCase()) {
    case 'running':     return new THREE.Color('#10b981');
    case 'warning':     return new THREE.Color('#f59e0b');
    case 'anomaly':     return new THREE.Color('#f97316');
    case 'malfunction':
    case 'offline':
    case 'failed':      return new THREE.Color('#ef4444');
    case 'diagnosing':  return new THREE.Color('#06b6d4');
    case 'repairing':   return new THREE.Color('#a855f7');
    case 'testing':     return new THREE.Color('#3b82f6');
    case 'recovered':   return new THREE.Color('#059669');
    case 'maintenance': return new THREE.Color('#8b5cf6');
    default:            return new THREE.Color('#64748b');
  }
}

function getStatusHex(status: string, isolated?: boolean): string {
  if (isolated) return '#ef4444';
  switch (status.toLowerCase()) {
    case 'running':     return '#10b981';
    case 'warning':     return '#f59e0b';
    case 'anomaly':     return '#f97316';
    case 'malfunction':
    case 'offline':
    case 'failed':      return '#ef4444';
    case 'diagnosing':  return '#06b6d4';
    case 'repairing':   return '#a855f7';
    case 'testing':     return '#3b82f6';
    case 'recovered':   return '#059669';
    case 'maintenance': return '#8b5cf6';
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

// ─── Factory Building & Structural Architecture (Bright Industrial CAD) ───────

function FactoryArchitecture() {
  return (
    <group>
      {/* ── Main Concrete Epoxy Factory Floor (Bright CAD Sheen) ── */}
      <mesh position={[0, -0.05, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[52, 34]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.42} metalness={0.12} />
      </mesh>

      {/* Engineering CAD Grid Overlay (1m Subtle Lines) */}
      <gridHelper args={[52, 52, '#94a3b8', '#cbd5e1']} position={[0, 0.001, 0]} />

      {/* ── Floor Markings: Production Flow & Safety Zones ── */}
      {/* Central Production Corridor Flow Path (Light Green Demarcation) */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 4.4]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.06} />
      </mesh>

      {/* Yellow Safety Boundary Stripes along Conveyor Line */}
      <mesh position={[0, 0.003, 2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 0.12]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>
      <mesh position={[0, 0.003, -2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 0.12]} />
        <meshBasicMaterial color="#eab308" />
      </mesh>

      {/* Pedestrian Crosswalks (Yellow Striped Hatches) */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <group key={`crosswalk-${x}`} position={[x, 0.004, 3.2]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.4, 1.8]} />
            <meshBasicMaterial color="#eab308" transparent opacity={0.35} />
          </mesh>
        </group>
      ))}

      {/* Stenciled Floor Bay Designations */}
      <Text position={[-8, 0.005, 2.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#475569" anchorX="center" anchorY="middle">
        BAY 01 — CUTTING
      </Text>
      <Text position={[-4, 0.005, 2.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#1d4ed8" anchorX="center" anchorY="middle">
        BAY 02 — DRILLING [HERO]
      </Text>
      <Text position={[0, 0.005, 2.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#475569" anchorX="center" anchorY="middle">
        BAY 03 — ASSEMBLY
      </Text>
      <Text position={[4, 0.005, 2.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#475569" anchorX="center" anchorY="middle">
        BAY 04 — QUALITY CHECK
      </Text>
      <Text position={[8, 0.005, 2.7]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#475569" anchorX="center" anchorY="middle">
        BAY 05 — PACKAGING
      </Text>

      {/* ── Industrial Factory Perimeter Walls (Bright Light-Grey Panels) ── */}
      {/* Rear Wall */}
      <mesh position={[0, 5, -16.5]} receiveShadow>
        <boxGeometry args={[52, 10, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.7} metalness={0.1} />
      </mesh>
      {/* Rear Wall Baseboard */}
      <mesh position={[0, 0.3, -16.2]}>
        <boxGeometry args={[52, 0.6, 0.15]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} />
      </mesh>
      {/* Left Wall */}
      <mesh position={[-25.8, 5, 0]} receiveShadow>
        <boxGeometry args={[0.5, 10, 33]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.7} metalness={0.1} />
      </mesh>
      {/* Right Wall */}
      <mesh position={[25.8, 5, 0]} receiveShadow>
        <boxGeometry args={[0.5, 10, 33]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Upper Transom / Clerestory Daylight Windows (Diffuse Natural Sunlight) */}
      {[-16, -8, 0, 8, 16].map((x) => (
        <group key={`win-${x}`} position={[x, 7.8, -16.2]}>
          <mesh>
            <boxGeometry args={[5.5, 1.8, 0.05]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.65} roughness={0.1} />
          </mesh>
          {/* Window Mullions / Frame */}
          <mesh>
            <boxGeometry args={[5.6, 1.9, 0.08]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
        </group>
      ))}

      {/* ── Structural Steel I-Beam Columns along Perimeter ── */}
      {[-24, -16, -8, 0, 8, 16, 24].map((x) => (
        <group key={`col-${x}`} position={[x, 5, -16.0]}>
          {/* Steel Column */}
          <mesh castShadow>
            <boxGeometry args={[0.55, 10, 0.55]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Yellow Crash Protection Base */}
          <mesh position={[0, -4.2, 0.05]}>
            <boxGeometry args={[0.85, 1.5, 0.85]} />
            <meshStandardMaterial color="#eab308" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Yellow/Black Collision Warning Stripes */}
          <mesh position={[0, -3.5, 0.5]}>
            <planeGeometry args={[0.8, 0.35]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
        </group>
      ))}

      {/* ── High-Bay Overhead Steel Trusses & Industrial Crane Gantry ── */}
      <group position={[0, 9.2, 0]}>
        {/* Longitudinal Crane Runway Rails */}
        <mesh position={[0, 0, -8]}>
          <boxGeometry args={[51, 0.45, 0.45]} />
          <meshStandardMaterial color="#eab308" metalness={0.75} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 8]}>
          <boxGeometry args={[51, 0.45, 0.45]} />
          <meshStandardMaterial color="#eab308" metalness={0.75} roughness={0.25} />
        </mesh>

        {/* Overhead Bridge Crane Gantry spanning across the bay */}
        <group position={[-1, 0.25, 0]}>
          {/* Double Yellow Steel Box Girders */}
          <mesh position={[0, 0, -1.2]}>
            <boxGeometry args={[1.2, 0.5, 16.4]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0, 1.2]}>
            <boxGeometry args={[1.2, 0.5, 16.4]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Crane Hoist Trolley */}
          <mesh position={[0, -0.25, -2.0]} castShadow>
            <boxGeometry args={[1.0, 0.7, 1.0]} />
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
          </mesh>
          {/* Crane Hook Cable & Block */}
          <mesh position={[0, -1.4, -2.0]}>
            <cylinderGeometry args={[0.02, 0.02, 1.6, 6]} />
            <meshStandardMaterial color="#334155" metalness={0.95} />
          </mesh>
          <mesh position={[0, -2.2, -2.0]}>
            <boxGeometry args={[0.3, 0.35, 0.25]} />
            <meshStandardMaterial color="#ea580c" metalness={0.8} />
          </mesh>
        </group>

        {/* Overhead Warren Steel Roof Trusses */}
        {[-20, -12, -4, 4, 12, 20].map((x) => (
          <group key={`truss-${x}`} position={[x, 0.5, 0]}>
            <mesh>
              <boxGeometry args={[0.25, 0.35, 32]} />
              <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        ))}

        {/* Overhead Industrial HVAC Ductwork */}
        <mesh position={[0, 0.4, -11]}>
          <cylinderGeometry args={[0.65, 0.65, 50, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* Color-Coded Process Piping Runs (Industry 4.0 Standard) */}
        {/* Blue: Industrial Coolant / Process Water */}
        <mesh position={[0, -0.4, -13.5]}>
          <cylinderGeometry args={[0.12, 0.12, 51, 12]} />
          <meshStandardMaterial color="#2563eb" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Yellow: Compressed Air Line */}
        <mesh position={[0, -0.65, -13.5]}>
          <cylinderGeometry args={[0.09, 0.09, 51, 12]} />
          <meshStandardMaterial color="#eab308" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Red: Fire Sprinkler Main */}
        <mesh position={[0, -0.9, -13.5]}>
          <cylinderGeometry args={[0.08, 0.08, 51, 12]} />
          <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* ── High-Bay Industrial LED Light Fixtures (Crisp Daylight Illumination) ── */}
      {[-16, -8, 0, 8, 16].map((x) => (
        <group key={`highbay-${x}`} position={[x, 8.8, 0]}>
          {/* Reflector Bell */}
          <mesh>
            <cylinderGeometry args={[0.5, 0.7, 0.3, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
          {/* LED Diffuser Disc */}
          <mesh position={[0, -0.16, 0]}>
            <circleGeometry args={[0.65, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Bright Localized Downlight */}
          <pointLight position={[0, -0.6, 0]} intensity={1.2} color="#ffffff" distance={22} decay={2} />
        </group>
      ))}

      {/* ── Wall Features: Loading Dock Bay & Emergency Exits ── */}
      {/* Industrial Roll-up Bay Door (Loading Area on Rear Wall) */}
      <group position={[-18, 2.5, -16.2]}>
        <mesh>
          <boxGeometry args={[4.8, 5.0, 0.15]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
        </mesh>
        {/* Yellow/Black Safety Crash Bollards */}
        {[-2.6, 2.6].map((bx) => (
          <mesh key={bx} position={[bx, -1.5, 0.5]}>
            <cylinderGeometry args={[0.15, 0.15, 1.2, 12]} />
            <meshStandardMaterial color="#eab308" metalness={0.6} />
          </mesh>
        ))}
        <Text position={[0, 2.9, 0.15]} fontSize={0.26} color="#eab308" anchorX="center" anchorY="middle">
          DOCK 01 — MATERIAL RECEIVING
        </Text>
      </group>

      {/* Emergency Exit Door with Illuminated Green Sign */}
      <group position={[18, 1.5, -16.2]}>
        <mesh>
          <boxGeometry args={[1.8, 3.0, 0.12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.5} />
        </mesh>
        <mesh position={[0, 1.8, 0.15]}>
          <boxGeometry args={[0.7, 0.3, 0.08]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.8} />
        </mesh>
        <Text position={[0, 1.8, 0.22]} fontSize={0.14} color="#ffffff" anchorX="center" anchorY="middle">
          EXIT
        </Text>
      </group>

      {/* Wall-Mounted Industrial Electrical Switchgear Panels (Rittal Style) */}
      {[-8, 6].map((wx) => (
        <group key={`switchgear-${wx}`} position={[wx, 2.2, -16.15]}>
          <mesh>
            <boxGeometry args={[1.8, 2.2, 0.4]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Black Door Handles & Vent Grilles */}
          <mesh position={[0.7, 0, 0.22]}>
            <boxGeometry args={[0.08, 0.3, 0.04]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[-0.4, 0.7, 0.22]}>
            <boxGeometry args={[0.8, 0.3, 0.02]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {/* High Voltage Danger Decal */}
          <Text position={[0, -0.4, 0.22]} fontSize={0.12} color="#dc2626" anchorX="center" anchorY="middle">
            ⚠ 400V 3-PHASE BUS
          </Text>
        </group>
      ))}

      {/* ── Raised Mezzanine: AI Operations & Supervisory Deck ── */}
      <group position={[0, 3.2, -14.2]}>
        {/* Steel Deck Floor */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[16, 0.3, 3.2]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Support Steel Posts */}
        {[-7, -2.5, 2.5, 7].map((x) => (
          <mesh key={`post-${x}`} position={[x, -1.6, 1.5]}>
            <cylinderGeometry args={[0.1, 0.1, 3.2, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} />
          </mesh>
        ))}
        {/* Architectural Glass Safety Balustrade */}
        <mesh position={[0, 0.65, 1.55]}>
          <boxGeometry args={[15.8, 1.0, 0.06]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.3} roughness={0.1} />
        </mesh>
        {/* Stainless Steel Handrail */}
        <mesh position={[0, 1.18, 1.55]}>
          <boxGeometry args={[16, 0.08, 0.1]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.95} />
        </mesh>
        {/* Control Console Terminals */}
        <mesh position={[0, 0.5, 0.5]}>
          <boxGeometry args={[4.2, 0.7, 0.9]} />
          <meshStandardMaterial color="#0f172a" metalness={0.7} />
        </mesh>
        {/* Large Digital Twin Operations Signboard */}
        <Text position={[0, 2.2, 0.5]} fontSize={0.34} color="#0284c7" anchorX="center" anchorY="middle">
          FACTORYMIND AI — COMMAND & CONTROL CENTER
        </Text>
      </group>
    </group>
  );
}

// ─── Warehouse & Storage Infrastructure (Instanced Industrial Racks) ──────────

function WarehouseStorageZones() {
  return (
    <group>
      {/* ── RAW MATERIAL INVENTORY (LEFT ZONE: X = -17) ── */}
      <group position={[-17, 0, 0]}>
        {/* Floor Storage Bay Zone Demarcation */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.2, 16]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.08} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.0, 15.8]} />
          <meshBasicMaterial color="#3b82f6" wireframe />
        </mesh>

        {/* 2 Heavy-Duty Industrial Pallet Racks (3 Tiers High) */}
        {[-4.2, 4.2].map((z, rackIdx) => (
          <group key={`raw-rack-${rackIdx}`} position={[0, 0, z]}>
            {/* Blue Steel Upright Frames */}
            {[-2.6, 0, 2.6].map((x) => (
              <group key={`upright-${x}`} position={[x, 2.7, 0]}>
                <mesh castShadow>
                  <boxGeometry args={[0.14, 5.4, 1.5]} />
                  <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            ))}

            {/* Orange Load Beams (3 Storage Tiers) */}
            {[0.9, 2.7, 4.5].map((y, tier) => (
              <group key={`tier-${tier}`} position={[0, y, 0]}>
                {/* Front and Rear Beams */}
                <mesh position={[0, 0, 0.7]}>
                  <boxGeometry args={[5.3, 0.14, 0.09]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.65} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, -0.7]}>
                  <boxGeometry args={[5.3, 0.14, 0.09]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.65} roughness={0.3} />
                </mesh>

                {/* Stored Pallets & Industrial Material Boxes */}
                {[-1.6, 0, 1.6].map((bx) => (
                  <group key={`box-${bx}`} position={[bx, 0.24, 0]}>
                    {/* Wooden Euro-Pallet */}
                    <mesh castShadow>
                      <boxGeometry args={[1.3, 0.12, 1.1]} />
                      <meshStandardMaterial color="#b45309" roughness={0.85} />
                    </mesh>
                    {/* Stored Cargo Crate */}
                    <mesh position={[0, 0.32, 0]} castShadow>
                      <boxGeometry args={[1.0, 0.52, 0.9]} />
                      <meshStandardMaterial
                        color={tier === 0 ? '#38bdf8' : tier === 1 ? '#60a5fa' : '#34d399'}
                        roughness={0.5}
                        metalness={0.2}
                      />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>
        ))}

        {/* Floor Staging Square with Stacked Wooden Pallets */}
        <group position={[0, 0, 0]}>
          {[0.06, 0.18, 0.30, 0.42].map((py, pi) => (
            <mesh key={pi} position={[0, py, 0]} castShadow>
              <boxGeometry args={[1.4, 0.11, 1.2]} />
              <meshStandardMaterial color="#92400e" roughness={0.9} />
            </mesh>
          ))}
        </group>

        {/* Overhead Warehouse Signboard */}
        <Text position={[0, 6.0, 0]} fontSize={0.38} color="#1e40af" anchorX="center" anchorY="middle">
          RAW MATERIAL STORAGE
        </Text>
        <Text position={[0, 5.5, 0]} fontSize={0.22} color="#64748b" anchorX="center" anchorY="middle">
          BAYS 1–4 • AUTOMATED BUFFER
        </Text>
      </group>

      {/* ── FINISHED GOODS WAREHOUSE & DISPATCH (RIGHT ZONE: X = 17) ── */}
      <group position={[17, 0, 0]}>
        {/* Floor Storage Bay Zone Demarcation */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.2, 16]} />
          <meshBasicMaterial color="#059669" transparent opacity={0.08} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7.0, 15.8]} />
          <meshBasicMaterial color="#10b981" wireframe />
        </mesh>

        {/* 2 Heavy-Duty Racks for Finished Palletized Goods */}
        {[-4.2, 4.2].map((z, rackIdx) => (
          <group key={`fin-rack-${rackIdx}`} position={[0, 0, z]}>
            {[-2.6, 0, 2.6].map((x) => (
              <mesh key={`upright-${x}`} position={[x, 2.7, 0]} castShadow>
                <boxGeometry args={[0.14, 5.4, 1.5]} />
                <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.3} />
              </mesh>
            ))}

            {[0.9, 2.7, 4.5].map((y, tier) => (
              <group key={`fin-tier-${tier}`} position={[0, y, 0]}>
                <mesh position={[0, 0, 0.7]}>
                  <boxGeometry args={[5.3, 0.14, 0.09]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.65} />
                </mesh>
                <mesh position={[0, 0, -0.7]}>
                  <boxGeometry args={[5.3, 0.14, 0.09]} />
                  <meshStandardMaterial color="#ea580c" metalness={0.65} />
                </mesh>

                {[-1.6, 0, 1.6].map((bx) => (
                  <group key={`fin-box-${bx}`} position={[bx, 0.28, 0]}>
                    <mesh castShadow>
                      <boxGeometry args={[1.3, 0.12, 1.1]} />
                      <meshStandardMaterial color="#b45309" roughness={0.85} />
                    </mesh>
                    {/* Shrink-Wrapped Export Carton */}
                    <mesh position={[0, 0.35, 0]} castShadow>
                      <boxGeometry args={[1.05, 0.6, 0.95]} />
                      <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.25} />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>
        ))}

        {/* Outbound Dispatch Staged Pallet */}
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <boxGeometry args={[1.3, 0.12, 1.1]} />
            <meshStandardMaterial color="#b45309" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[1.05, 0.65, 0.95]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>
        </group>

        {/* Overhead Warehouse Signboard */}
        <Text position={[0, 6.0, 0]} fontSize={0.38} color="#059669" anchorX="center" anchorY="middle">
          FINISHED GOODS DISPATCH
        </Text>
        <Text position={[0, 5.5, 0]} fontSize={0.22} color="#64748b" anchorX="center" anchorY="middle">
          OUTBOUND PALLETIZING ZONE
        </Text>
      </group>

      {/* ── AUTONOMOUS MAINTENANCE & SERVICE BAY (REAR: X = 0, Z = 6.5) ── */}
      <group position={[0, 0, 6.5]}>
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8.5, 4.2]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.12} />
        </mesh>
        {/* Service Bay Heavy Base Plate */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[8.0, 0.15, 3.8]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Tool Chests and Diagnostic Stations */}
        <mesh position={[-2.8, 0.75, -1.2]} castShadow>
          <boxGeometry args={[1.4, 1.3, 0.7]} />
          <meshStandardMaterial color="#dc2626" metalness={0.8} />
        </mesh>
        <mesh position={[2.8, 0.6, -1.2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 1.0, 16]} />
          <meshStandardMaterial color="#1e40af" metalness={0.8} />
        </mesh>
        <Text position={[0, 2.4, -1.2]} fontSize={0.32} color="#a855f7" anchorX="center" anchorY="middle">
          AUTONOMOUS ROBOTICS MAINTENANCE DOCK
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

  // Check if any machine is isolated or malfunctioning (e.g. M2)
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

  const rollerXList = useMemo(() => {
    const list: number[] = [];
    for (let x = -13; x <= 13; x += 0.8) list.push(x);
    return list;
  }, []);

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
      {/* Heavy Steel Conveyor Bed Structure */}
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[26, 0.28, 1.6]} />
        <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.4} />
      </mesh>

      {/* Extruded Aluminum Side Rails with Safety Yellow End Caps */}
      <mesh position={[0, 0.38, 0.82]}>
        <boxGeometry args={[26, 0.18, 0.08]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.38, -0.82]}>
        <boxGeometry args={[26, 0.18, 0.08]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Rotating Industrial Steel Rollers */}
      <group ref={rollersRef}>
        {rollerXList.map((x) => (
          <mesh key={`roller-${x}`} position={[x, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 1.55, 12]} />
            <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* Structural Support Legs & Geared Drive Motors */}
      {[-11, -6, 0, 6, 11].map((x) => (
        <group key={`leg-${x}`} position={[x, 0, 0]}>
          <mesh position={[0, 0.09, 0.74]}>
            <cylinderGeometry args={[0.07, 0.09, 0.36, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.09, -0.74]}>
            <cylinderGeometry args={[0.07, 0.09, 0.36, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} />
          </mesh>
          {/* Geared Electric Motor Housing */}
          <mesh position={[0, 0.2, 1.05]}>
            <boxGeometry args={[0.55, 0.28, 0.38]} />
            <meshStandardMaterial color="#1e3a5f" metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Moving Industrial Payload Products with Smart Buffering */}
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

    // Buffer and accumulate products before blocked machine (e.g. M2 at -4)
    if (blockedX !== null) {
      const dist = blockedX - currentX.current;
      if (dist > 0 && dist < 2.5) {
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
    <group ref={ref} position={[startX, 0.48, 0]}>
      {/* Machined Component Carrier Pallet */}
      <mesh position={[0, -0.04, 0]} castShadow>
        <boxGeometry args={[0.6, 0.06, 0.6]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Component Part */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.28, 16]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.25} />
      </mesh>
    </group>
  );
}

// ─── High-Detail Industrial Machine Stations ──────────────────────────────────

interface MachineViewProps {
  status: string;
  isolated?: boolean;
  selected: boolean;
  onClick: () => void;
  machineData?: MachineData;
}

// ── M1: INDUSTRIAL CNC CUTTING CELL ──────────────────────────────────────────
function CuttingStation({ status, isolated, selected, onClick }: MachineViewProps) {
  const bladeRef = useRef<THREE.Mesh>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  useFrame((_, delta) => {
    if (bladeRef.current && active) {
      bladeRef.current.rotation.y += delta * 16;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Heavy Base Casting in Machine-Tool Grey */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.8, 1.1, 1.5]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Machine Upper Enclosure (White Powder-Coat Panels) */}
      <mesh position={[0, 1.45, 0]}>
        <boxGeometry args={[1.9, 0.85, 1.6]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.2} />
      </mesh>
      {/* Tinted Polycarbonate Viewing Window */}
      <mesh position={[0, 1.45, 0.82]}>
        <planeGeometry args={[1.7, 0.75]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} />
      </mesh>
      {/* Overhead Cutting Bridge & Motor */}
      <mesh position={[0, 2.0, 0]}>
        <boxGeometry args={[1.3, 0.38, 0.9]} />
        <meshStandardMaterial color="#1e40af" metalness={0.8} />
      </mesh>
      {/* High-Speed Diamond Saw Blade */}
      <mesh ref={bladeRef} position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.04, 24]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.1} />
      </mesh>
      {/* Active Laser Cutting Guide Line */}
      {active && (
        <mesh position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, 1.3]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.85} />
        </mesh>
      )}
      {/* Operator Touchscreen CNC Console */}
      <mesh position={[0.75, 1.3, 0.92]} rotation={[-0.2, 0.3, 0]}>
        <boxGeometry args={[0.38, 0.28, 0.06]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.6} />
      </mesh>
      {/* Yellow Safety Fence Cell */}
      {[-1.2, 1.2].map((fx) => (
        <mesh key={fx} position={[fx, 0.75, 0.9]}>
          <boxGeometry args={[0.06, 1.5, 0.06]} />
          <meshStandardMaterial color="#eab308" metalness={0.6} />
        </mesh>
      ))}
      {/* Status Light Tower */}
      <mesh position={[0.75, 2.2, -0.65]}>
        <cylinderGeometry args={[0.03, 0.03, 0.35, 8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0.75, 2.42, -0.65]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ── M2: INDUSTRIAL CNC DRILLING STATION (HERO MALFUNCTION MACHINE) ───────────
function DrillingStation({ status, isolated, selected, onClick, machineData }: MachineViewProps) {
  const spindleRef = useRef<THREE.Group>(null);
  const jitterRef = useRef<THREE.Group>(null);
  const active = isMachineActive(status, isolated);
  const color = getStatusColor(status, isolated);

  const isAnomaly = status.toLowerCase() === 'anomaly' || status.toLowerCase() === 'warning';
  const isMalfunction = isolated || status.toLowerCase() === 'malfunction' || status.toLowerCase() === 'offline';

  useFrame((_, delta) => {
    // Spindle rotation & vertical reciprocating drilling plunge
    if (spindleRef.current && active) {
      const speed = isAnomaly ? 7 : 16;
      spindleRef.current.rotation.y += delta * speed;
      spindleRef.current.position.y = 1.5 + Math.sin(Date.now() * (isAnomaly ? 0.003 : 0.006)) * 0.22;
    }

    // Mechanical vibration jitter during anomaly/warning
    if (jitterRef.current) {
      if (isAnomaly) {
        jitterRef.current.position.x = (Math.random() - 0.5) * 0.035;
        jitterRef.current.position.z = (Math.random() - 0.5) * 0.035;
      } else {
        jitterRef.current.position.set(0, 0, 0);
      }
    }
  });

  return (
    <group onClick={onClick}>
      <group ref={jitterRef}>
        {/* Main Heavy Cast Iron Bed in Dark Tool Steel */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[1.65, 1.1, 1.45]} />
          <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.3} />
        </mesh>
        {/* Heavy Vertical Hydraulic Support Column */}
        <mesh position={[0.55, 1.4, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 2.3, 16]} />
          <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Upper Motor Housing & Control Enclosure (Blue Accents) */}
        <mesh position={[0, 2.15, 0]}>
          <boxGeometry args={[1.1, 0.5, 1.0]} />
          <meshStandardMaterial color="#1e40af" metalness={0.7} />
        </mesh>
        {/* Reciprocating High-Speed Spindle & Drill Bit */}
        <group ref={spindleRef} position={[0, 1.5, 0]}>
          <mesh position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.11, 0.09, 0.38, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.045, 0.018, 0.55, 12]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.98} roughness={0.05} />
          </mesh>
        </group>
        {/* IoT Temperature & Vibration Sensor Pod with Telemetry Halo */}
        <mesh position={[-0.5, 1.65, 0.5]}>
          <boxGeometry args={[0.16, 0.2, 0.16]} />
          <meshStandardMaterial color="#0284c7" metalness={0.8} />
        </mesh>
        <mesh position={[-0.5, 1.78, 0.5]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial
            color={isAnomaly ? '#f97316' : isMalfunction ? '#ef4444' : '#10b981'}
            emissive={isAnomaly ? '#f97316' : isMalfunction ? '#ef4444' : '#10b981'}
            emissiveIntensity={isMalfunction ? 2.2 : 1.4}
          />
        </mesh>
        {/* 3-Tier Multi-Stack Industrial Signal Tower */}
        <group position={[0.7, 2.45, -0.5]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.55, 8]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {/* Red tier */}
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.09, 12]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={isMalfunction ? 2.5 : 0.2} />
          </mesh>
          {/* Yellow tier */}
          <mesh position={[0, 0.19, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.09, 12]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={isAnomaly ? 2.5 : 0.2} />
          </mesh>
          {/* Green tier */}
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.09, 12]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={active && !isAnomaly ? 1.8 : 0.2} />
          </mesh>
        </group>
        {/* Yellow Perimeter Safety Fence Posts */}
        {[-1.1, 1.1].map((fx) => (
          <mesh key={fx} position={[fx, 0.8, 0.85]}>
            <boxGeometry args={[0.06, 1.6, 0.06]} />
            <meshStandardMaterial color="#eab308" metalness={0.6} />
          </mesh>
        ))}
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
      baseRef.current.rotation.y = Math.sin(Date.now() * 0.0012) * 0.5;
      shoulderRef.current.rotation.z = 0.25 + Math.sin(Date.now() * 0.002) * 0.32;
      elbowRef.current.rotation.z = -0.45 - Math.cos(Date.now() * 0.0025) * 0.38;
    }
  });

  return (
    <group onClick={onClick}>
      {/* Heavy Cylindrical Steel Base Pedestal */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.9, 0.96, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Robot Base Rotating Turntable in Industrial Safety Orange */}
      <group ref={baseRef} position={[0, 0.96, 0]}>
        <mesh>
          <cylinderGeometry args={[0.65, 0.65, 0.22, 16]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.65} roughness={0.35} />
        </mesh>
        {/* Articulated Shoulder Joint */}
        <group ref={shoulderRef} position={[0, 0.22, 0]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.24, 1.1, 0.24]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.65} />
          </mesh>
          {/* Elbow Joint & Forearm */}
          <group ref={elbowRef} position={[0, 1.1, 0]}>
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[0.18, 0.9, 0.18]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.8} />
            </mesh>
            {/* 2-Finger Pneumatic Gripper End-Effector */}
            <mesh position={[0, 0.9, 0]}>
              <sphereGeometry args={[0.13, 12, 12]} />
              <meshStandardMaterial color="#334155" metalness={0.9} />
            </mesh>
            <mesh position={[0.09, 1.05, 0]}>
              <boxGeometry args={[0.04, 0.22, 0.06]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} />
            </mesh>
            <mesh position={[-0.09, 1.05, 0]}>
              <boxGeometry args={[0.04, 0.22, 0.06]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} />
            </mesh>
          </group>
        </group>
      </group>
      {/* Optical Safety Light Curtains around Cell */}
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.95, 0.85]}>
          <cylinderGeometry args={[0.035, 0.035, 1.9, 8]} />
          <meshStandardMaterial color="#eab308" metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.85, 1.9, -0.65]}>
        <sphereGeometry args={[0.09, 8, 8]} />
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
      scanPlaneRef.current.position.x = Math.sin(Date.now() * 0.0035) * 0.55;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.6, 1.1, 1.4]} />
        <meshStandardMaterial color="#334155" metalness={0.7} />
      </mesh>
      {/* Inspection Arch Tunnel spanning conveyor */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.6, 0.18, 1.5]} />
        <meshStandardMaterial color="#1e40af" metalness={0.8} />
      </mesh>
      {/* Side Arch Pillars */}
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.95, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1.5, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} />
        </mesh>
      ))}
      {/* Sweeping Blue Optical Laser Scan Sheet */}
      <mesh ref={scanPlaneRef} position={[0, 0.95, 0]}>
        <planeGeometry args={[0.04, 0.9]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={active ? 0.85 : 0.2} />
      </mesh>
      {/* High-Resolution Machine Vision Camera Array */}
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.18, 12]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.8} />
      </mesh>
      {/* Integrated QC Telemetry Screen */}
      <mesh position={[0.75, 1.4, 0.82]} rotation={[0, 0.25, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.05]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <Text position={[0.75, 1.4, 0.86]} rotation={[0, 0.25, 0]} fontSize={0.07} color="#10b981" anchorX="center" anchorY="middle">
        PASS: 98.4%
      </Text>
      <mesh position={[0.75, 1.9, -0.65]}>
        <sphereGeometry args={[0.09, 8, 8]} />
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
      ramRef.current.position.y = 1.4 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.28;
    }
  });

  return (
    <group onClick={onClick}>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[1.7, 1.15, 1.45]} />
        <meshStandardMaterial color="#334155" metalness={0.7} />
      </mesh>
      {/* Heavy Pneumatic Press Frame in Industrial Blue */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[1.3, 0.38, 1.1]} />
        <meshStandardMaterial color="#1e40af" metalness={0.9} />
      </mesh>
      {/* Hydraulic Compression Ram */}
      <mesh ref={ramRef} position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[0.85, 0.32, 0.85]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.75, 2.15, -0.65]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

// ─── 3D Safety Isolation Laser Grid & Holographic Anomaly Banner ───────────────

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
    pulseRef.current += delta * 4.5;
    const op = 0.35 + Math.abs(Math.sin(pulseRef.current)) * 0.4;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = op;
  });

  if (!active) return null;

  return (
    <group position={[xPos, 0, 0]}>
      {/* 4 Corner Warning Hazard Pylons */}
      {[
        [-1.4,  1.4],
        [ 1.4,  1.4],
        [-1.4, -1.4],
        [ 1.4, -1.4],
      ].map(([x, z], i) => (
        <group key={`pylon-${i}`} position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 1.5, 8]} />
            <meshStandardMaterial color="#eab308" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.55, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.2} />
          </mesh>
        </group>
      ))}

      {/* Red Safety Isolation Perimeter Laser Grid */}
      <mesh ref={meshRef} position={[0, 0.75, 0]}>
        <boxGeometry args={[2.8, 1.5, 2.8]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.45} wireframe />
      </mesh>

      {/* Floor Red Hazard Glow Plane */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.9, 2.9]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.35} />
      </mesh>

      {/* 3D Holographic AI Anomaly Diagnostic Banner */}
      <group position={[0, 3.2, 0]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[3.6, 1.0]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.9} />
        </mesh>
        <Text position={[0, 0.28, 0.01]} fontSize={0.22} color="#ef4444" anchorX="center" anchorY="middle">
          CRITICAL MALFUNCTION • M2 ISOLATED
        </Text>
        <Text position={[0, -0.02, 0.01]} fontSize={0.16} color="#fca5a5" anchorX="center" anchorY="middle">
          ROOT CAUSE: SPINDLE OVERHEATING
        </Text>
        <Text position={[0, -0.28, 0.01]} fontSize={0.13} color="#94a3b8" anchorX="center" anchorY="middle">
          TEMP: 87.4°C • VIB: 8.7 mm/s • RPM: ABNORMAL
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
  const targetZ = repairStatus?.active ? 1.8 : 6.5;

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, targetX, delta * 2.2);
    ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, targetZ, delta * 2.2);

    if (repairStatus?.active && armRef.current) {
      armRef.current.rotation.z = Math.sin(Date.now() * 0.005) * 0.4;
      armRef.current.rotation.y = Math.cos(Date.now() * 0.004) * 0.45;
    }
  });

  return (
    <group ref={ref} position={[0, 0, 6.5]}>
      {/* Heavy Mobile Base Chassis in Royal Purple */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.1, 0.44, 0.85]} />
        <meshStandardMaterial color="#2e1065" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Heavy Track Rollers */}
      <mesh position={[0, 0.14, 0.46]}>
        <boxGeometry args={[1.2, 0.24, 0.18]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, -0.46]}>
        <boxGeometry args={[1.2, 0.24, 0.18]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      {/* Articulated Multi-Tool Maintenance Arm */}
      <group ref={armRef} position={[0, 0.52, 0]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.9, 8]} />
          <meshStandardMaterial color="#a855f7" metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.95, 0.14]}>
          <boxGeometry args={[0.24, 0.2, 0.3]} />
          <meshStandardMaterial color="#c084fc" metalness={0.9} />
        </mesh>
        {/* Active Laser Repair Cone when repairing */}
        {repairStatus?.active && (
          <mesh position={[0, 0.95, -0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.2, 1.6, 16]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.65} />
          </mesh>
        )}
      </group>
      {/* Status Beacon */}
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial
          color={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissive={repairStatus?.active ? '#a855f7' : '#06b6d4'}
          emissiveIntensity={1.8}
        />
      </mesh>
      {/* Autonomous Repair Checklist HUD */}
      {repairStatus?.active && (
        <group position={[0, 2.2, 0]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[3.2, 1.1]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.9} />
          </mesh>
          <Text position={[0, 0.35, 0.01]} fontSize={0.18} color="#c084fc" anchorX="center" anchorY="middle">
            AUTONOMOUS MAINTENANCE • {repairStatus.progress}%
          </Text>
          <Text position={[0, 0.1, 0.01]} fontSize={0.14} color="#10b981" anchorX="center" anchorY="middle">
            ✓ MACHINE ISOLATED • ✓ COMPONENT INSPECTION
          </Text>
          <Text position={[0, -0.15, 0.01]} fontSize={0.13} color="#38bdf8" anchorX="center" anchorY="middle">
            SPINDLE CALIBRATION: {repairStatus.progress}%
          </Text>
          <Text position={[0, -0.38, 0.01]} fontSize={0.12} color="#94a3b8" anchorX="center" anchorY="middle">
            SYSTEM TEST: WAITING
          </Text>
        </group>
      )}
    </group>
  );
}

// ─── Simplified Factory Personnel (Industrial Workers) ────────────────────────

function FactoryPersonnel() {
  return (
    <group>
      {/* Worker 1: Quality Inspector near M4 */}
      <WorkerFigure position={[4.2, 0, 2.2]} rotationY={-Math.PI / 2} vestColor="#f59e0b" label="INSPECTOR" />
      {/* Worker 2: Packaging Technician near M5 */}
      <WorkerFigure position={[8.5, 0, 2.0]} rotationY={Math.PI / 2} vestColor="#ea580c" label="LOGISTICS" />
      {/* Worker 3: Maintenance Technician at Service Bay */}
      <WorkerFigure position={[-1.8, 0, 5.8]} rotationY={0} vestColor="#f59e0b" label="MAINTENANCE" />
      {/* Worker 4: Control Desk Operator on Mezzanine */}
      <WorkerFigure position={[1.8, 3.2, -13.5]} rotationY={Math.PI} vestColor="#f59e0b" label="OPERATOR" />
    </group>
  );
}

function WorkerFigure({
  position,
  rotationY = 0,
  vestColor = '#f59e0b',
  label,
}: {
  position: [number, number, number];
  rotationY?: number;
  vestColor?: string;
  label?: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Boots */}
      <mesh position={[-0.1, 0.1, 0]}>
        <boxGeometry args={[0.12, 0.2, 0.2]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.1, 0.1, 0]}>
        <boxGeometry args={[0.12, 0.2, 0.2]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* Blue Work Trousers */}
      <mesh position={[-0.1, 0.45, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 8]} />
        <meshStandardMaterial color="#1e3a8a" />
      </mesh>
      <mesh position={[0.1, 0.45, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 8]} />
        <meshStandardMaterial color="#1e3a8a" />
      </mesh>
      {/* Torso & High-Visibility Vest */}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.38, 0.55, 0.22]} />
        <meshStandardMaterial color={vestColor} roughness={0.4} />
      </mesh>
      {/* Reflective Silver Stripes on Vest */}
      <mesh position={[0, 0.95, 0.115]}>
        <planeGeometry args={[0.34, 0.06]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.6} />
      </mesh>
      {/* White Safety Hard Hat */}
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.1, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.23, 0.95, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.48, 8]} />
        <meshStandardMaterial color="#1e3a8a" />
      </mesh>
      <mesh position={[0.23, 0.95, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.48, 8]} />
        <meshStandardMaterial color="#1e3a8a" />
      </mesh>
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
      {/* Specific Machine Geometry */}
      {config.id === 'M1' && <CuttingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} machineData={data} />}
      {config.id === 'M2' && <DrillingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} machineData={data} />}
      {config.id === 'M3' && <AssemblyStation status={status} isolated={isolated} selected={selected} onClick={onSelect} machineData={data} />}
      {config.id === 'M4' && <QualityStation status={status} isolated={isolated} selected={selected} onClick={onSelect} machineData={data} />}
      {config.id === 'M5' && <PackagingStation status={status} isolated={isolated} selected={selected} onClick={onSelect} machineData={data} />}

      {/* Safety Isolation Barrier for M2 or any isolated machine */}
      <SafetyIsolationZone active={isolated} xPos={0} reason={data?.isolation_reason} />

      {/* Status Beacon Globe */}
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.4} />
      </mesh>

      {/* 3D Digital Hologram Info Panel over Machine */}
      {showLabels && (
        <group position={[0, 2.9, 0]}>
          <Text fontSize={0.28} color="#0f172a" anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#ffffff">
            {`${config.id} — ${config.name.toUpperCase()}`}
          </Text>
          <Text position={[0, -0.22, 0]} fontSize={0.18} color={getStatusHex(status, isolated)} anchorX="center" anchorY="top">
            {isolated ? '● ISOLATED' : `● ${status.toUpperCase()}`}
          </Text>
          {data?.temperature !== undefined && (
            <Text position={[0, -0.44, 0]} fontSize={0.14} color="#475569" anchorX="center" anchorY="top">
              {`${data.temperature.toFixed(1)}°C | ${data.vibration?.toFixed(2) ?? '1.8'} mm/s | ${data.rpm ?? 1420} RPM`}
            </Text>
          )}
        </group>
      )}

      {/* Selection Ring */}
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.55, 32]} />
          <meshBasicMaterial color="#0284c7" />
        </mesh>
      )}
    </group>
  );
}

// ─── Camera Controller & Presets Hook ─────────────────────────────────────────

function CameraPresetController({ preset, hasFailure }: { preset: string; hasFailure: boolean }) {
  const { camera } = useThree();

  useFrame(() => {
    let target: [number, number, number] = [0, 13, 20];
    if (preset === 'production') {
      target = [0, 6, 11];
    } else if (preset === 'm2_focus' || (hasFailure && preset === 'overview')) {
      target = [-4, 4.2, 6.8];
    } else if (preset === 'assembly') {
      target = [0, 4.5, 6.8];
    } else if (preset === 'maintenance') {
      target = [0, 6.5, 12];
    } else if (preset === 'warehouse') {
      target = [-16, 9, 13];
    } else if (preset === 'full_factory') {
      target = [0, 16, 25];
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
    'overview' | 'production' | 'm2_focus' | 'assembly' | 'maintenance' | 'warehouse' | 'full_factory'
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

  // Compute live factory metrics for the top bar
  const avgHealth = useMemo(() => {
    if (!machines.length) return 94;
    const sum = machines.reduce((acc, m) => acc + (m.health ?? 95), 0);
    return Math.round(sum / machines.length);
  }, [machines]);

  const activeAlerts = useMemo(() => {
    return machines.filter(
      (m) => m.isolated || m.status === 'malfunction' || m.status === 'anomaly' || m.status === 'warning'
    ).length;
  }, [machines]);

  const currentBottleneck = useMemo(() => {
    const b = machines.find((m) => m.status === 'malfunction' || m.isolated || m.queue > 4);
    return b ? `${b.id} — ${b.name.toUpperCase()}` : 'NONE (BALANCED)';
  }, [machines]);

  // Auto-focus on M2 when failure occurs
  useEffect(() => {
    if (hasFailure) {
      setCameraPreset('m2_focus');
    }
  }, [hasFailure]);

  return (
    <section className={`panel f3d-section ${presentationMode ? 'f3d-presentation' : ''}`}>
      {/* ── Control Header & Camera Presets ── */}
      <div className="panel-header f3d-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="f3d-live-badge">
              <span className="f3d-live-pulse" />
              DIGITAL TWIN — LIVE
            </span>
            <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc' }}>
              Industrial CAD Factory Simulation
            </h2>
          </div>
          <div className="f3d-kpi-bar" style={{ marginTop: 8 }}>
            <span className="f3d-kpi-chip">
              FACTORY HEALTH: <strong style={{ color: avgHealth < 70 ? '#ef4444' : '#10b981' }}>{avgHealth}%</strong>
            </span>
            <span className="f3d-kpi-chip">
              ACTIVE ALERTS: <strong style={{ color: activeAlerts > 0 ? '#f59e0b' : '#10b981' }}>{activeAlerts}</strong>
            </span>
            <span className="f3d-kpi-chip">
              CURRENT BOTTLENECK: <strong style={{ color: activeAlerts > 0 ? '#ef4444' : '#38bdf8' }}>{currentBottleneck}</strong>
            </span>
          </div>
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
            className={`f3d-ctrl-btn ${cameraPreset === 'assembly' ? 'active' : ''}`}
            onClick={() => setCameraPreset('assembly')}
          >
            Assembly
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'warehouse' ? 'active' : ''}`}
            onClick={() => setCameraPreset('warehouse')}
          >
            Warehouse
          </button>
          <button
            className={`f3d-ctrl-btn ${cameraPreset === 'maintenance' ? 'active' : ''}`}
            onClick={() => setCameraPreset('maintenance')}
          >
            Maintenance
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

      {/* ── Status Legend ── */}
      <div className="f3d-legend">
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#10b981' }} />RUNNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#f59e0b' }} />WARNING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#f97316' }} />ANOMALY</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#ef4444' }} />MALFUNCTION</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#06b6d4' }} />DIAGNOSING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#a855f7' }} />REPAIRING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#3b82f6' }} />TESTING</span>
        <span className="f3d-legend-item"><span className="f3d-legend-dot" style={{ background: '#059669' }} />RECOVERED</span>
      </div>

      {/* ── 3D Industrial Canvas ── */}
      <div className="f3d-canvas-wrap">
        <Canvas
          shadows
          camera={{ position: [0, 13, 20], fov: 42 }}
          style={{ background: '#e2e8f0' }}
          gl={{ antialias: true, alpha: false }}
        >
          {/* Soft Industrial Atmospheric Fog */}
          <fog attach="fog" args={['#e2e8f0', 42, 90]} />

          {/* Bright Industrial CAD Illumination */}
          <ambientLight intensity={1.35} color="#ffffff" />
          <directionalLight
            position={[18, 28, 14]}
            intensity={1.8}
            castShadow
            color="#ffffff"
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-18, 22, -14]} intensity={0.85} color="#cbd5e1" />
          <pointLight position={[0, 8, 0]} intensity={1.1} color="#ffffff" distance={32} />

          <CameraPresetController preset={cameraPreset} hasFailure={hasFailure} />
          <FactoryArchitecture />
          <WarehouseStorageZones />
          <ConveyorLine machines={machines} animate={animateConveyor} />
          <AutonomousMaintenanceRobot repairStatus={repairStatus} />
          <FactoryPersonnel />

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
            maxDistance={42}
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
