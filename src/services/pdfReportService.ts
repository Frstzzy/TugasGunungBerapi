/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Layanan Ekspor Laporan Resmi Dokumen PDF (Format Standar PVMBG / BMKG / ESDM)
 * Menggunakan jsPDF dan jspdf-autotable untuk menghasilkan laporan teknis komprehensif
 * simulasi balistik, plume abu, cuaca Selat Sunda, dan matriks daerah terdampak.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BallisticParams, PlumeParams, EruptionPresetId, KrakatauWeather } from '../types';
import { BMKG_AFFECTED_AREAS, BmkgAffectedArea } from '../data/bmkgData';
import { ERUPTION_PRESETS } from '../data/presets';
import { computeTrajectory } from '../physics/ballistics';

export interface DynamicAreaImpact {
  area: BmkgAffectedArea;
  currentRiskLevel: 'KRITIS' | 'TINGGI' | 'SEDANG' | 'RENDAH' | 'MINIMAL';
  etaMinutes: number | string;
  inPlume: boolean;
  angularDevDeg: number;
  estimatedAshThickness: string;
}

export interface PdfReportOptions {
  ballistic: BallisticParams;
  plume: PlumeParams;
  weather: KrakatauWeather | null;
  selectedPreset: EruptionPresetId;
  investigatorName?: string;
  institution?: string;
  customNotes?: string;
  fileName?: string;
}

/**
 * Kalkulasi dampak dinamis terhadap 10 wilayah pantau Selat Sunda
 * berdasarkan arah drift angin adveksi dan kecepatan angin saat ini.
 */
export function calculateDynamicAreaImpacts(plume: PlumeParams): DynamicAreaImpact[] {
  const driftDeg = (plume.windDirection + 180) % 360;
  const windSpeedKmh = Math.max(1, plume.windSpeed * 3.6);
  const plumeMaxReachKm = Math.min(180, (plume.columnHeight / 1000) * 22 + windSpeedKmh * 3);
  const halfSpreadDeg = 32;

  return BMKG_AFFECTED_AREAS.map((area) => {
    // Selisih sudut antara pergerakan abu dan bearing lokasi dari kawah
    const angularDiff = Math.abs(((area.bearingDeg - driftDeg + 180) % 360) - 180);
    const inPlume = angularDiff <= halfSpreadDeg && area.distKm <= plumeMaxReachKm;
    const etaMinutes = inPlume ? Math.round((area.distKm / windSpeedKmh) * 60) : '> 360';

    let currentRiskLevel: DynamicAreaImpact['currentRiskLevel'] = 'MINIMAL';
    let estimatedAshThickness = '< 0.1 mm (Jejak)';

    if (area.distKm <= 5.0) {
      currentRiskLevel = 'KRITIS';
      estimatedAshThickness = '> 100 mm (Balistik & Piroklastik)';
    } else if (inPlume) {
      if (area.distKm <= 20) {
        currentRiskLevel = 'KRITIS';
        estimatedAshThickness = '25 – 60 mm (Abu Sangat Lebat)';
      } else if (area.distKm <= 45) {
        currentRiskLevel = angularDiff <= 15 ? 'TINGGI' : 'SEDANG';
        estimatedAshThickness = '10 – 30 mm (Abu Lebat)';
      } else if (area.distKm <= 75) {
        currentRiskLevel = angularDiff <= 15 ? 'SEDANG' : 'RENDAH';
        estimatedAshThickness = '2 – 10 mm (Abu Sedang)';
      } else {
        currentRiskLevel = 'RENDAH';
        estimatedAshThickness = '0.5 – 2 mm (Abu Tipis)';
      }
    } else {
      if (angularDiff <= 60 && area.distKm <= 35) {
        currentRiskLevel = 'RENDAH';
        estimatedAshThickness = '0.1 – 1 mm (Abu Ringan)';
      }
    }

    return {
      area,
      currentRiskLevel,
      etaMinutes,
      inPlume,
      angularDevDeg: Math.round(angularDiff),
      estimatedAshThickness,
    };
  });
}

/**
 * Membuat dokumen jsPDF formal berstandar A4 untuk analisis teknis erupsi.
 */
export function generateSimulationPdfDoc(options: PdfReportOptions): jsPDF {
  const {
    ballistic,
    plume,
    weather,
    selectedPreset,
    investigatorName = 'Analis Vulkanologi Selat Sunda',
    institution = 'Pusat Riset Komputasi Geologi & Kebencanaan Maritim',
    customNotes = 'Laporan evaluasi otomatis parameter erupsi dan prakiraan sebaran abu vulkanik.',
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const currentPreset = ERUPTION_PRESETS.find((p) => p.id === selectedPreset) || ERUPTION_PRESETS[0];
  const impacts = calculateDynamicAreaImpacts(plume);
  const traj = computeTrajectory(ballistic, ballistic.enableAirDrag);
  const driftDeg = (plume.windDirection + 180) % 360;

  // Header Formal
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SimKratoa — LAPORAN TEKNIS ERUPSI VULKANIK', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('SIMULASI DINAMIKA BALISTIK RK4, DISPERSI PLUME ABU, DAN KESIAPSIAGAAN SELAT SUNDA', 14, 19);
  doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')} WIB  |  Status G. Anak Krakatau: SIAGA (LEVEL III)`, 14, 25);

  let currentY = 38;

  // Metadata Skenario & Peneliti
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, 182, 22, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`Skenario Model: ${currentPreset.name} (${currentPreset.subtitle})`, 18, currentY + 6);
  doc.text(`Penyusun / Pengesah: ${investigatorName}`, 18, currentY + 12);
  doc.text(`Instansi / Afiliasi: ${institution}`, 18, currentY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Elevasi Kawah: 157 mdpl`, 130, currentY + 6);
  doc.text(`Radius KRB III: 5.0 km (Steril)`, 130, currentY + 12);
  doc.text(`Koordinat: 6.102° S, 105.423° E`, 130, currentY + 18);

  currentY += 28;

  // Bagian 1: Ringkasan Parameter Fisika (Tabel Dua Kolom)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. PARAMETER DINAMIKA ERUPSI & METEOROLOGI', 14, currentY);
  currentY += 4;

  const physicsData = [
    [
      'Kecepatan Lontaran (v₀)',
      `${ballistic.initialVelocity} m/s`,
      'Tinggi Kolom Plume (H)',
      `${plume.columnHeight} meter (${plume.columnHeight + 157} mdpl)`,
    ],
    [
      'Sudut Elevasi / Azimut',
      `${ballistic.launchAngle}° / ${ballistic.launchAzimuth ?? 90}°`,
      'Intensitas Emisi Plume',
      `Laju ${plume.emissionRate}/10 (Stabilitas ${plume.stabilityClass})`,
    ],
    [
      'Diameter & Densitas Batuan',
      `${ballistic.rockDiameter} m (${(ballistic.rockDiameter * 100).toFixed(0)} cm) | ${ballistic.rockDensity} kg/m³`,
      'Kecepatan & Arah Angin',
      `${plume.windSpeed} m/s (${plume.windDirection}°) | Drift ke ${driftDeg}°`,
    ],
    [
      'Hambatan Udara (Drag)',
      `Aktif (Cd = ${ballistic.dragCoefficient}) - Integrasi Runge-Kutta 4`,
      'Radius Payung Vulkanik',
      `± ${(2.5 + (plume.columnHeight / 1000) * 0.8).toFixed(1)} km dari kawah`,
    ],
    [
      'Jarak Capai Bom Maksimum',
      `${(traj.maxRange / 1000).toFixed(2)} km (${traj.maxRange.toFixed(0)} m)`,
      'Kondisi Cuaca Real-Time',
      weather ? `${weather.temperatureC}°C, RH ${weather.relativeHumidity}%, ${weather.weatherCondition}` : 'Sensor Baseline 28.5°C, RH 78%',
    ],
    [
      'Waktu Terbang & Energi Impak',
      `${traj.flightTime.toFixed(1)} detik | ${(traj.impactEnergy / 1e6).toFixed(2)} MegaJoule`,
      'Sumber Data Cuaca',
      weather ? `${weather.source} (${weather.stationName})` : 'Simulasi Baseline Standar',
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Parameter Balistik Piroklastik', 'Nilai / Satuan', 'Parameter Plume & Cuaca', 'Nilai / Satuan']],
    body: physicsData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Bagian 2: Evaluasi Bahaya Terhadap 10 Daerah Selat Sunda
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. MATRIKS DAMPAK SEBARAN ABU DI WILAYAH SELAT SUNDA', 14, currentY);
  currentY += 4;

  const areaTableData = impacts.map((imp) => {
    return [
      imp.area.name,
      imp.area.province,
      `${imp.area.distKm} km (${imp.area.bearingCardinal})`,
      imp.currentRiskLevel,
      typeof imp.etaMinutes === 'number' ? `T+${imp.etaMinutes} menit` : imp.etaMinutes,
      imp.estimatedAshThickness,
      imp.area.population,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Nama Daerah / Objek', 'Provinsi', 'Jarak & Arah', 'Status Risiko', 'ETA Kedatangan', 'Estimasi Tebal Abu', 'Populasi']],
    body: areaTableData,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
    didParseCell: function (data: any) {
      if (data.column.index === 3) {
        const val = data.cell.raw;
        if (val === 'KRITIS') {
          data.cell.styles.textColor = [185, 28, 28]; // red-700
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'TINGGI') {
          data.cell.styles.textColor = [217, 119, 6]; // amber-600
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'SEDANG') {
          data.cell.styles.textColor = [202, 138, 4];
        } else {
          data.cell.styles.textColor = [22, 101, 52]; // green-800
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Catatan Khusus & Rekomendasi Mitigasi
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('3. CATATAN TEKNIS & PROTOKOL KESIAPSIAGAAN RESMI', 14, currentY);
  currentY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const notesText = [
    `Catatan Analis: ${customNotes}`,
    '• Rekomendasi PVMBG: Masyarakat dan nelayan dilarang mendekati kawah Anak Krakatau dalam radius 5.0 km (Zona KRB III steril).',
    '• Peringatan Penerbangan (VONA): Waspadai jalur jelajah udara koridor WIIF (Jakarta FIR) pada elevasi FL050 - FL250 jika plume > 3.000 m.',
    '• Pelayaran Selat Sunda (ALKI I): Kapal rute Bakauheni-Merak diwajibkan menyalakan radar navigasi dan masker bagi awak kapal.',
    '• Tindakan Pesisir: Wilayah dalam koridor drift angin harus menyiagakan masker pelindung debu partikulat (N95) dan menutup tandon air bersih.',
  ];

  notesText.forEach((line) => {
    doc.text(line, 14, currentY, { maxWidth: 182 });
    currentY += 5;
  });

  // Tanda Tangan & Pengesahan
  currentY += 6;
  if (currentY > 255) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFontSize(8);
  doc.text('Mengetahui dan Mengesahkan,', 140, currentY);
  currentY += 16;
  doc.setFont('helvetica', 'bold');
  doc.text(investigatorName, 140, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(institution, 140, currentY + 4);

  // Footer di bagian bawah halaman
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `SimKratoa (Simulasi Fisika Anak Krakatau) — Halaman ${i} dari ${totalPages}  |  Dokumen Resmi Komputasi Geologi Selat Sunda`,
      14,
      290
    );
  }

  return doc;
}

/**
 * Menghasilkan dan langsung mengunduh file PDF ke komputer pengguna.
 */
export function downloadSimulationPdf(options: PdfReportOptions): void {
  const doc = generateSimulationPdfDoc(options);
  const currentPreset = ERUPTION_PRESETS.find((p) => p.id === options.selectedPreset) || ERUPTION_PRESETS[0];
  const defaultName = `SimKratoa_Laporan_${currentPreset.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(options.fileName || defaultName);
}
