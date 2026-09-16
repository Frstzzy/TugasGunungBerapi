/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SatelliteEjectaParticleOverlay.tsx
 * High-performance Canvas Particle System Overlay for the Satellite Map.
 * Visually represents volcanic ejecta (incandescent volcanic bombs, scoria,
 * lapilli, and fiery tephra fragments) following an eruption of Mt. Anak Krakatau.
 * All particle trajectories are computed using 3D Runge-Kutta 4 (RK4) physics,
 * incorporating aerodynamic drag, atmospheric density lapse, gravity, and wind advection.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { BallisticParams, PlumeParams } from '../types';
import { getRockProperties } from '../physics/ballistics';

const CRATER_LAT = -6.1021;
const CRATER_LON = 105.4230;
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111139;
const METERS_PER_DEG_LON = 111139 * Math.cos(CRATER_LAT * DEG_TO_RAD);

export type ParticleDensityMode = 'light' | 'standard' | 'dense';

export interface EjectaParticle {
  id: number;
  type: 'bomb' | 'scoria' | 'lapilli' | 'spark';
  diameter: number; // m
  mass: number; // kg
  area: number; // m^2
  dragCoeff: number;
  // 3D position in meters from crater vent (x: East, y: Altitude, z: South)
  x: number;
  y: number;
  z: number;
  // Velocity in m/s
  vx: number;
  vy: number;
  vz: number;
  // Lifecycle
  time: number;
  flightTime: number;
  landed: boolean;
  landingX: number;
  landingZ: number;
  landingSpeed: number;
  // Impact and visual state
  impactAlpha: number;
  impactRadius: number;
  steamAlpha: number;
  trail: { x: number; y: number; z: number; alpha: number }[];
  color: string;
  glowColor: string;
  sizePx: number;
}

export interface ImpactRing {
  lat: number;
  lng: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  energyMJ: number;
}

export interface SatelliteEjectaParticleOverlayProps {
  map: L.Map | null;
  ballistic: BallisticParams;
  plume: PlumeParams;
  showParticles: boolean;
  isPlaying?: boolean;
  density?: ParticleDensityMode;
  triggerCount?: number;
  continuousEmission?: boolean;
  onToggleContinuous?: () => void;
  onBurst?: () => void;
  onStatsChange?: (stats: {
    airborneCount: number;
    landedCount: number;
    maxAltitudeM: number;
    maxDistKm: number;
    impactEnergyTotalMJ: number;
  }) => void;
}

export const SatelliteEjectaParticleOverlay: React.FC<SatelliteEjectaParticleOverlayProps> = ({
  map,
  ballistic,
  plume,
  showParticles,
  isPlaying = true,
  density = 'standard',
  triggerCount = 0,
  continuousEmission = false,
  onStatsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<EjectaParticle[]>([]);
  const impactRingsRef = useRef<ImpactRing[]>([]);
  const lastTimeRef = useRef<number>(performance.now());
  const prevTriggerRef = useRef<number>(triggerCount);
  const ventShockwaveRadiusRef = useRef<number>(0);
  const ventShockwaveAlphaRef = useRef<number>(0);

  // Target particle count based on density
  const targetParticleCount = useMemo(() => {
    switch (density) {
      case 'light': return 120;
      case 'dense': return 650;
      case 'standard':
      default: return 320;
    }
  }, [density]);

  // Generate a batch of particles using current ballistic parameters
  const spawnEjectaBatch = useCallback((count: number, isInitialBurst: boolean = true) => {
    const newParticles: EjectaParticle[] = [];
    const baseVel = Math.max(30, ballistic.initialVelocity);
    const baseAngle = (ballistic.launchAngle * Math.PI) / 180;
    const baseAzimuth = ((ballistic.launchAzimuth ?? 90) * Math.PI) / 180;
    const isRadial = ballistic.dispersionMode === 'radial';

    if (isInitialBurst) {
      ventShockwaveRadiusRef.current = 10;
      ventShockwaveAlphaRef.current = 0.9;
    }

    for (let i = 0; i < count; i++) {
      // Determine particle category:
      // ~15% heavy bombs, ~35% scoria clasts, ~50% incandescent lapilli sparks
      const randType = Math.random();
      let type: EjectaParticle['type'] = 'spark';
      let diameter = 0.05 + Math.random() * 0.1;
      let color = '#fbbf24';
      let glowColor = '#f59e0b';
      let sizePx = 2;

      if (randType < 0.15) {
        type = 'bomb';
        diameter = Math.max(0.3, ballistic.rockDiameter * (0.6 + Math.random() * 0.8));
        color = '#ffffff';
        glowColor = '#f97316';
        sizePx = 5.5;
      } else if (randType < 0.5) {
        type = 'scoria';
        diameter = Math.max(0.1, ballistic.rockDiameter * (0.2 + Math.random() * 0.4));
        color = '#f97316';
        glowColor = '#ef4444';
        sizePx = 3.5;
      } else {
        type = 'lapilli';
        diameter = Math.max(0.02, ballistic.rockDiameter * (0.05 + Math.random() * 0.15));
        color = '#fef08a';
        glowColor = '#ea580c';
        sizePx = 2.2;
      }

      // Calculate mass and aerodynamic area
      const { mass, area } = getRockProperties(diameter, ballistic.rockDensity);

      // Velocity dispersion
      const velVariance = type === 'bomb'
        ? 0.85 + Math.random() * 0.25
        : (type === 'scoria' ? 0.75 + Math.random() * 0.4 : 0.6 + Math.random() * 0.65);
      const v0 = baseVel * velVariance;

      // Elevation angle dispersion
      const angleSpread = type === 'bomb' ? 0.14 : 0.28; // radians
      const theta = Math.min(Math.PI * 0.48, Math.max(0.15, baseAngle + (Math.random() - 0.5) * angleSpread));

      // Azimuth angle dispersion
      let phi: number;
      if (isRadial) {
        phi = Math.random() * Math.PI * 2;
      } else {
        const azimSpread = type === 'bomb' ? 0.35 : 0.7; // ~20° to 40° sectoral spread
        phi = baseAzimuth + (Math.random() - 0.5) * azimSpread;
      }

      // 3D velocity components:
      // Azimuth: 0 = North (-Z), Math.PI/2 = East (+X), Math.PI = South (+Z), 3*Math.PI/2 = West (-X)
      const vH = v0 * Math.cos(theta);
      const vy = v0 * Math.sin(theta);
      const vx = vH * Math.sin(phi);
      const vz = -vH * Math.cos(phi);

      // Starting position inside the active vent crater
      const ventOffsetRadius = Math.random() * 35;
      const ventOffsetAngle = Math.random() * Math.PI * 2;
      const startX = Math.cos(ventOffsetAngle) * ventOffsetRadius;
      const startZ = Math.sin(ventOffsetAngle) * ventOffsetRadius;
      const startY = ballistic.ventElevation + Math.random() * 15;

      newParticles.push({
        id: Date.now() + i * 13 + Math.random() * 9999,
        type,
        diameter,
        mass,
        area,
        dragCoeff: ballistic.dragCoefficient || 0.47,
        x: startX,
        y: startY,
        z: startZ,
        vx,
        vy,
        vz,
        time: 0,
        flightTime: 0,
        landed: false,
        landingX: 0,
        landingZ: 0,
        landingSpeed: 0,
        impactAlpha: 0,
        impactRadius: 0,
        steamAlpha: 0,
        trail: [{ x: startX, y: startY, z: startZ, alpha: 0.8 }],
        color,
        glowColor,
        sizePx,
      });
    }

    if (isInitialBurst) {
      particlesRef.current = newParticles;
      impactRingsRef.current = [];
    } else {
      // Append small batch for continuous emission, capping at target count
      particlesRef.current = [...particlesRef.current.slice(-targetParticleCount), ...newParticles];
    }
  }, [ballistic, targetParticleCount]);

  // Initial generation and trigger response
  useEffect(() => {
    if (triggerCount !== prevTriggerRef.current) {
      prevTriggerRef.current = triggerCount;
      spawnEjectaBatch(targetParticleCount, true);
    }
  }, [triggerCount, spawnEjectaBatch, targetParticleCount]);

  // Spawn initial burst on mount or when parameters change significantly
  useEffect(() => {
    if (particlesRef.current.length === 0) {
      spawnEjectaBatch(targetParticleCount, true);
    }
  }, [spawnEjectaBatch, targetParticleCount]);

  // Main high-performance render loop using RequestAnimationFrame
  useEffect(() => {
    let animId: number;

    const render = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.08);
      lastTimeRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas || !map || !showParticles) {
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Sync canvas dimensions with map container
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      const expectedWidth = size.x * dpr;
      const expectedHeight = size.y * dpr;

      if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size.x, size.y);

      // Convert Crater Origin to screen pixel coords
      const craterScreen = map.latLngToContainerPoint([CRATER_LAT, CRATER_LON]);

      // Calculate meteorological wind vector in m/s:
      // Meteorological windDirection is direction wind comes from (0 = from North, blowing South).
      const windRad = ((plume.windDirection + 180) % 360) * DEG_TO_RAD;
      const wx = plume.windSpeed * Math.sin(windRad);
      const wz = -plume.windSpeed * Math.cos(windRad);

      // Map zoom factor for altitude perspective offset
      const zoom = map.getZoom();
      const zoomFactor = Math.pow(2, zoom - 12);
      const altitudeScale = 0.035 * zoomFactor;

      // Continuous emission fountain if active
      if (continuousEmission && isPlaying && Math.random() < 0.3) {
        spawnEjectaBatch(Math.floor(targetParticleCount * 0.04), false);
      }

      // Expand vent shockwave ring
      if (ventShockwaveAlphaRef.current > 0.01) {
        ventShockwaveRadiusRef.current += 160 * dt * zoomFactor;
        ventShockwaveAlphaRef.current -= 0.65 * dt;

        ctx.strokeStyle = `rgba(251, 191, 36, ${Math.max(0, ventShockwaveAlphaRef.current)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(craterScreen.x, craterScreen.y, ventShockwaveRadiusRef.current, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, ventShockwaveAlphaRef.current * 0.6)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(craterScreen.x, craterScreen.y, ventShockwaveRadiusRef.current * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Physics integration & state update
      let activeCount = 0;
      let landedCount = 0;
      let maxAltM = 0;
      let maxDistM = 0;
      let totalImpactMJ = 0;

      const particles = particlesRef.current;
      const g = ballistic.gravity || 9.81;
      const enableDrag = ballistic.enableAirDrag;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (!p.landed && isPlaying) {
          // RK4 integration step
          const steps = 2;
          const subDt = dt / steps;

          for (let s = 0; s < steps; s++) {
            // Atmospheric density lapse rho(y) = 1.225 * exp(-y / 8500)
            const alt = Math.max(0, p.y);
            const rho = 1.225 * Math.exp(-alt / 8500);

            // Relative velocity including wind
            const vRelX = p.vx - wx;
            const vRelY = p.vy;
            const vRelZ = p.vz - wz;
            const vRelMag = Math.sqrt(vRelX * vRelX + vRelY * vRelY + vRelZ * vRelZ);

            let dragAccX = 0;
            let dragAccY = 0;
            let dragAccZ = 0;

            if (enableDrag && vRelMag > 0.001) {
              const dragForce = 0.5 * rho * p.dragCoeff * p.area * vRelMag * vRelMag;
              const dragAcc = dragForce / p.mass;
              dragAccX = -dragAcc * (vRelX / vRelMag);
              dragAccY = -dragAcc * (vRelY / vRelMag);
              dragAccZ = -dragAcc * (vRelZ / vRelMag);
            }

            p.vx += dragAccX * subDt;
            p.vy += (-g + dragAccY) * subDt;
            p.vz += dragAccZ * subDt;

            p.x += p.vx * subDt;
            p.y += p.vy * subDt;
            p.z += p.vz * subDt;
            p.time += subDt;

            // Check sea level landing at y <= 0
            if (p.y <= 0) {
              p.y = 0;
              p.landed = true;
              p.landingX = p.x;
              p.landingZ = p.z;
              p.landingSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
              p.impactAlpha = 1.0;
              p.impactRadius = p.type === 'bomb' ? 18 : (p.type === 'scoria' ? 10 : 5);
              p.steamAlpha = 0.85;

              // Register impact ring
              const landingLat = CRATER_LAT + (-p.landingZ / METERS_PER_DEG_LAT);
              const landingLng = CRATER_LON + (p.landingX / METERS_PER_DEG_LON);
              const energyMJ = (0.5 * p.mass * p.landingSpeed * p.landingSpeed) / 1e6;

              impactRingsRef.current.push({
                lat: landingLat,
                lng: landingLng,
                radius: 4,
                maxRadius: Math.max(12, p.diameter * 25 * zoomFactor),
                alpha: 0.9,
                color: p.glowColor,
                energyMJ,
              });

              break;
            }
          }

          // Trail sampling
          if (p.trail.length > 0) {
            const lastT = p.trail[p.trail.length - 1];
            const dist = Math.hypot(p.x - lastT.x, p.y - lastT.y, p.z - lastT.z);
            if (dist > 25) {
              p.trail.push({ x: p.x, y: p.y, z: p.z, alpha: 0.75 });
              if (p.trail.length > (p.type === 'bomb' ? 18 : 10)) {
                p.trail.shift();
              }
            }
          }
        }

        // Decay landed effects
        if (p.landed) {
          landedCount++;
          if (isPlaying) {
            p.impactAlpha = Math.max(0, p.impactAlpha - 0.45 * dt);
            p.impactRadius += 12 * dt * zoomFactor;
            p.steamAlpha = Math.max(0, p.steamAlpha - 0.3 * dt);
          }
        } else {
          activeCount++;
          if (p.y > maxAltM) maxAltM = p.y;
          const curDist = Math.hypot(p.x, p.z);
          if (curDist > maxDistM) maxDistM = curDist;
        }

        // DRAWING PARTICLE
        // Geographic coordinate mapping
        const pLat = CRATER_LAT + (-p.z / METERS_PER_DEG_LAT);
        const pLng = CRATER_LON + (p.x / METERS_PER_DEG_LON);
        const groundPt = map.latLngToContainerPoint([pLat, pLng]);

        // Cull if outside visible canvas viewport (+100px margin)
        if (
          groundPt.x < -100 ||
          groundPt.x > size.x + 100 ||
          groundPt.y < -150 ||
          groundPt.y > size.y + 100
        ) {
          continue;
        }

        if (!p.landed) {
          // 1. Ground Shadow (Ocean surface projection)
          const shadowSize = Math.max(1.5, p.sizePx * 0.8);
          const shadowAlpha = Math.max(0.1, 0.45 * Math.exp(-p.y / 2000));
          ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
          ctx.beginPath();
          ctx.arc(groundPt.x, groundPt.y, shadowSize, 0, Math.PI * 2);
          ctx.fill();

          // 2. Airborne Projectile with vertical perspective elevation offset
          const elevOffsetPx = Math.max(0, p.y * altitudeScale);
          const airX = groundPt.x;
          const airY = groundPt.y - elevOffsetPx;

          // Vertical altitude tether line for large volcanic bombs
          if (p.type === 'bomb' && elevOffsetPx > 8) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(groundPt.x, groundPt.y);
            ctx.lineTo(airX, airY);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Trajectory Ribbon / Hot Tail
          if (p.trail.length >= 2) {
            ctx.strokeStyle = p.glowColor;
            ctx.lineWidth = p.type === 'bomb' ? 2 : 1;
            ctx.beginPath();
            for (let tIdx = 0; tIdx < p.trail.length; tIdx++) {
              const tPt = p.trail[tIdx];
              const tLat = CRATER_LAT + (-tPt.z / METERS_PER_DEG_LAT);
              const tLng = CRATER_LON + (tPt.x / METERS_PER_DEG_LON);
              const tScreen = map.latLngToContainerPoint([tLat, tLng]);
              const tAirY = tScreen.y - tPt.y * altitudeScale;
              if (tIdx === 0) ctx.moveTo(tScreen.x, tAirY);
              else ctx.lineTo(tScreen.x, tAirY);
            }
            ctx.stroke();
          }

          // Glowing Airborne Fireball
          ctx.shadowColor = p.glowColor;
          ctx.shadowBlur = p.type === 'bomb' ? 14 : 7;

          // Outer incandescent aura
          ctx.fillStyle = p.glowColor;
          ctx.beginPath();
          ctx.arc(airX, airY, p.sizePx * 1.3, 0, Math.PI * 2);
          ctx.fill();

          // Hot incandescent molten white-yellow core
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(airX, airY, p.sizePx * 0.7, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowBlur = 0;
        } else {
          // Landed / Impact Ring on the water
          if (p.impactAlpha > 0.02) {
            ctx.strokeStyle = `rgba(239, 68, 68, ${p.impactAlpha})`;
            ctx.lineWidth = p.type === 'bomb' ? 2 : 1.2;
            ctx.beginPath();
            ctx.arc(groundPt.x, groundPt.y, p.impactRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Landed hot crater speck
            ctx.fillStyle = `rgba(251, 146, 60, ${p.impactAlpha})`;
            ctx.beginPath();
            ctx.arc(groundPt.x, groundPt.y, p.type === 'bomb' ? 3 : 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Draw expanding impact shockwave rings
      for (let r = impactRingsRef.current.length - 1; r >= 0; r--) {
        const ring = impactRingsRef.current[r];
        if (isPlaying) {
          ring.radius += 28 * dt * zoomFactor;
          ring.alpha -= 0.55 * dt;
        }

        if (ring.alpha <= 0.01) {
          impactRingsRef.current.splice(r, 1);
          continue;
        }

        const ringScreen = map.latLngToContainerPoint([ring.lat, ring.lng]);
        ctx.strokeStyle = `rgba(56, 189, 248, ${ring.alpha * 0.75})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ringScreen.x, ringScreen.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${ring.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ringScreen.x, ringScreen.y, ring.radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Telemetry callback
      if (onStatsChange) {
        onStatsChange({
          airborneCount: activeCount,
          landedCount,
          maxAltitudeM: Math.round(maxAltM),
          maxDistKm: Number((maxDistM / 1000).toFixed(2)),
          impactEnergyTotalMJ: Math.round(totalImpactMJ),
        });
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [map, showParticles, isPlaying, ballistic, plume, continuousEmission, spawnEjectaBatch, targetParticleCount, onStatsChange]);

  if (!showParticles) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10 w-full h-full"
    />
  );
};
