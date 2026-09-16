/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fisika Komputasi Aerosol Vulkanik & Dispersi Gas SO2
 * Studi Kasus: Gunung Anak Krakatau & Selat Sunda
 *
 * Model:
 * 1. Kinetika Oksidasi Fotokimia SO2 -> H2SO4 (katalis OH-radical, radiasi UV surya, kelembaban RH)
 * 2. Hamburan Mie & Aerosol Optical Depth (AOD 550nm)
 * 3. Radiative Forcing Atmosfer & Efek Pendinginan Permukaan (Albedo Sulfat)
 * 4. Dispersi Partikulat Sekunder PM2.5 / PM10 ke Stasiun Pesisir Banten & Lampung (ISPU)
 */

export interface AerosolSimulationParams {
  so2EmissionRateTonsPerDay: number; // Ton SO2/hari
  relativeHumidityPct: number; // Kelembaban relatif % (40 - 98)
  uvRadiationIndex: number; // Indeks UV surya (1 - 12)
  plumeHeightM: number; // Tinggi kolom erupsi (m)
  windSpeedMs: number; // Kecepatan angin adveksi (m/s)
  windDirectionDeg: number; // Arah angin datang (0 - 360)
  elapsedHours: number; // Horizon waktu pasca-letusan (jam)
}

export interface AerosolMetrics {
  oxidationRatePctPerHour: number; // %/jam laju oksidasi SO2 ke H2SO4
  sulfateProductionKgPerHour: number; // kg/jam laju produksi H2SO4
  cumulativeSulfateMassTons: number; // ton akumulasi aerosol sulfat
  peakAod550: number; // Aerosol Optical Depth puncak pada panjang gelombang 550 nm
  peakPm25UgM3: number; // Estimasi puncak konsentrasi PM2.5 di permukaan (ug/m3)
  aodCategory: 'Ekstrem' | 'Pekat' | 'Sedang' | 'Ringan' | 'Bersih';
  solarRadiationAttenuationPct: number; // Reduksi radiasi matahari (%)
  radiativeForcingWm2: number; // W/m2 Radiative forcing pendinginan negatif
  surfaceCoolingDeltaC: number; // °C potensi penurunan suhu permukaan lokal
  stratosphericInjection: boolean; // Apakah menembus tropopause (>11 km)
  atmosphericResidenceDays: number; // Waktu tinggal aerosol di atmosfer (hari)
  meanRadiusMicrons: number; // Radius efektif droplet aerosol sulfat (μm)
  stokesSettlingVelocityMps: number; // Kecepatan pengendapan gravitasi Stokes (m/s)
}

export interface StationInfo {
  id: string;
  name: string;
  province: string;
  distKm: number;
  bearingDeg: number;
  bearingCardinal: string;
  population: string;
}

export interface StationAerosolEvaluation {
  station: StationInfo;
  inPlumePath: boolean;
  etaHours: number;
  pm25UgM3: number;
  aod550: number;
  visibilityKm: number;
  ispuCategory: 'BAIK' | 'SEDANG' | 'TIDAK SEHAT' | 'SANGAT TIDAK SEHAT' | 'BERBAHAYA';
  angularDevDeg: number;
  healthAdvisory: string;
}

/**
 * Daftar Stasiun Pemantauan Kualitas Udara & Titik Pesisir Selat Sunda
 */
export const COASTAL_AEROSOL_STATIONS: StationInfo[] = [
  {
    id: 'sta-sebesi',
    name: 'Pulau Sebesi',
    province: 'Lampung',
    distKm: 18.5,
    bearingDeg: 26,
    bearingCardinal: 'Utara-Timur Laut',
    population: '2.814 jiwa',
  },
  {
    id: 'sta-anyer',
    name: 'Anyer',
    province: 'Banten',
    distKm: 55.3,
    bearingDeg: 84,
    bearingCardinal: 'Timur',
    population: '58.000 jiwa',
  },
  {
    id: 'sta-carita',
    name: 'Carita & Labuan',
    province: 'Banten',
    distKm: 49.5,
    bearingDeg: 116,
    bearingCardinal: 'Tenggara',
    population: '84.000 jiwa',
  },
  {
    id: 'sta-bakauheni',
    name: 'Pelabuhan Bakauheni',
    province: 'Lampung',
    distKm: 44.8,
    bearingDeg: 54,
    bearingCardinal: 'Timur Laut',
    population: '22.000 jiwa',
  },
  {
    id: 'sta-kalianda',
    name: 'Kalianda',
    province: 'Lampung',
    distKm: 45.9,
    bearingDeg: 28,
    bearingCardinal: 'Utara-Timur Laut',
    population: '92.000 jiwa',
  },
  {
    id: 'sta-cilegon',
    name: 'Cilegon & Merak',
    province: 'Banten',
    distKm: 68.2,
    bearingDeg: 62,
    bearingCardinal: 'Timur Laut',
    population: '434.000 jiwa',
  },
  {
    id: 'sta-panimbang',
    name: 'Panimbang & Tj. Lesung',
    province: 'Banten',
    distKm: 58.0,
    bearingDeg: 135,
    bearingCardinal: 'Tenggara',
    population: '52.000 jiwa',
  },
  {
    id: 'sta-rajabasa',
    name: 'Kecamatan Rajabasa',
    province: 'Lampung',
    distKm: 41.2,
    bearingDeg: 18,
    bearingCardinal: 'Utara',
    population: '48.000 jiwa',
  },
];

/**
 * Hitung Parameter Fisika Aerosol Sekunder Vulkanik
 */
export function calculateVolcanicAerosols(params: AerosolSimulationParams): AerosolMetrics {
  const {
    so2EmissionRateTonsPerDay,
    relativeHumidityPct,
    uvRadiationIndex,
    plumeHeightM,
    elapsedHours,
  } = params;

  // 1. Kinetika Oksidasi Fotokimia SO2 -> H2SO4
  // Dipengaruhi oleh konsentrasi radikal hidroksil [OH] (berkorelasi linier dengan indeks UV)
  // Serta kelembaban relatif atmosfer yang mempercepat reaksi fasa cair (aqueous-phase oxidation)
  const uvFactor = Math.pow(Math.max(1, uvRadiationIndex) / 8, 0.75);
  const rhFactor = 0.8 + (Math.max(40, Math.min(100, relativeHumidityPct)) / 100) * 0.4;
  const baseKinetikaPct = 1.35; // % per jam dalam kondisi standar tropis
  const oxidationRatePctPerHour = parseFloat(
    Math.min(5.5, Math.max(0.15, baseKinetikaPct * uvFactor * rhFactor)).toFixed(2)
  );

  // Rasio konversi massa molar: SO2 (64 g/mol) -> H2SO4 (98 g/mol) = rasio 1.53x
  // Ditambah hidrasi molekul air (H2SO4 · nH2O) menghasilkan massa aerosol cair ~1.85x
  const massConversionFactor = 1.65;
  const so2KgPerHour = (so2EmissionRateTonsPerDay * 1000) / 24;
  const sulfateProductionKgPerHour = Math.round(
    so2KgPerHour * (oxidationRatePctPerHour / 100) * massConversionFactor
  );

  // Akumulasi massa sulfat setelah T jam
  const cumulativeSulfateMassTons = parseFloat(
    (((sulfateProductionKgPerHour * Math.max(0.1, elapsedHours)) / 1000)).toFixed(1)
  );

  // 2. Aerosol Optical Depth (AOD pada 550 nm)
  // Cross-section koefisien massa kepunahan (mass extinction efficiency) beta_ext ~ 4.5 m2/g untuk sulfat sub-mikron
  // Kolom vertikal aerosol diencerkan oleh difusi turbulen dan adveksi angin
  const effectiveDispersionAreaKm2 = Math.max(
    15,
    Math.PI * Math.pow(Math.max(2, (params.windSpeedMs * 3.6 * elapsedHours * 0.25)), 2)
  );
  const columnDensityGM2 = (cumulativeSulfateMassTons * 1e6) / (effectiveDispersionAreaKm2 * 1e6);
  const massExtinction = 4.2; // m2/g
  const calcAod = Math.max(0.08, columnDensityGM2 * massExtinction * 0.35 + (plumeHeightM / 4000) * 0.3);
  const peakAod550 = parseFloat(calcAod.toFixed(3));

  let aodCategory: AerosolMetrics['aodCategory'] = 'Ringan';
  if (peakAod550 > 2.0) aodCategory = 'Ekstrem';
  else if (peakAod550 > 1.0) aodCategory = 'Pekat';
  else if (peakAod550 > 0.4) aodCategory = 'Sedang';
  else if (peakAod550 > 0.15) aodCategory = 'Ringan';
  else aodCategory = 'Bersih';

  // Reduksi radiasi matahari (Hukum Beer-Lambert: I/I0 = exp(-tau))
  const solarRadiationAttenuationPct = parseFloat(
    (Math.min(94, (1 - Math.exp(-peakAod550 * 0.85)) * 100)).toFixed(1)
  );

  // 3. Radiative Forcing Pendinginan Global/Regional (W/m2)
  // Model Charlson et al.: Delta F_R ≈ -28.5 * AOD (W/m2)
  const radiativeForcingWm2 = parseFloat((-28.5 * Math.min(3.5, peakAod550)).toFixed(1));

  // Estimasi penurunan suhu permukaan lokal (Klimatologi mikro: sensitivitas iklim regional ~0.02 - 0.05 °C per W/m2)
  const surfaceCoolingDeltaC = parseFloat(
    (Math.min(2.5, Math.abs(radiativeForcingWm2) * 0.022)).toFixed(2)
  );

  // 4. Stratospheric Injection & Waktu Tinggal
  // Ketinggian tropopause di Selat Sunda (lintang khatulistiwa ~6°S) adalah sekitar 16.000 meter (16 km)
  const stratosphericInjection = plumeHeightM >= 15500;
  const atmosphericResidenceDays = stratosphericInjection
    ? Math.round(120 + (plumeHeightM / 1000) * 15)
    : Math.max(2, Math.round(4 + (plumeHeightM / 1000) * 2.5));

  // Radius rata-rata droplet sulfat (sub-mikron 0.2 - 0.6 um)
  const meanRadiusMicrons = stratosphericInjection ? 0.32 : 0.45;

  // Kecepatan pengendapan Stokes: v = (2/9) * rho * g * r^2 / eta
  // rho_sulfate ~ 1700 kg/m3, g = 9.81 m/s2, eta_air ~ 1.8e-5 Pa.s
  const rMeters = meanRadiusMicrons * 1e-6;
  const stokesSettlingVelocityMps = (2 / 9) * 1700 * 9.81 * Math.pow(rMeters, 2) / 1.8e-5;

  // Estimasi Puncak Konsentrasi PM2.5 di permukaan (ug/m3)
  const peakPm25UgM3 = Math.round(Math.min(500, Math.max(25, cumulativeSulfateMassTons * 12 + (plumeHeightM / 15))));

  return {
    oxidationRatePctPerHour,
    sulfateProductionKgPerHour,
    cumulativeSulfateMassTons,
    peakAod550,
    peakPm25UgM3,
    aodCategory,
    solarRadiationAttenuationPct,
    radiativeForcingWm2,
    surfaceCoolingDeltaC,
    stratosphericInjection,
    atmosphericResidenceDays,
    meanRadiusMicrons,
    stokesSettlingVelocityMps,
  };
}

/**
 * Evaluasi Dampak Dispersi Aerosol ke Jaringan Stasiun Pemantau Pesisir Selat Sunda
 */
export function evaluateRegionalAerosolStations(
  params: AerosolSimulationParams,
  metrics: AerosolMetrics
): StationAerosolEvaluation[] {
  const { windDirectionDeg, windSpeedMs, elapsedHours } = params;

  // Arah pergerakan abu / awan aerosol (drift angle = arah angin datang + 180°)
  const driftDeg = (windDirectionDeg + 180) % 360;
  const windSpeedKmh = Math.max(1, windSpeedMs * 3.6);
  const plumeFrontReachKm = windSpeedKmh * Math.max(0.5, elapsedHours);
  const coneHalfAngleDeg = 32; // Sudut sebaran kerucut dispersi Gaussian

  return COASTAL_AEROSOL_STATIONS.map((station) => {
    // Selisih sudut antara vektor hanyutan plume dan bearing stasiun
    const angularDiff = Math.abs(((station.bearingDeg - driftDeg + 180) % 360) - 180);
    const inPlumePath = angularDiff <= coneHalfAngleDeg && station.distKm <= plumeFrontReachKm * 1.35;

    // Estimasi waktu tempuh kedatangan (ETA jam)
    const etaHours = parseFloat((station.distKm / windSpeedKmh).toFixed(1));

    // Konsentrasi partikulat halus PM2.5 di permukaan (ug/m3)
    let pm25UgM3 = 18; // Baseline udara maritim bersih
    let stationAod = 0.12;

    if (inPlumePath) {
      // Gaussian attenuation seiring bertambahnya deviasi sudut dan jarak
      const angleWeight = Math.cos((angularDiff / coneHalfAngleDeg) * (Math.PI / 2));
      const distWeight = Math.max(0.08, 1 - (station.distKm / 120));
      const sourceIntensity = Math.min(450, metrics.cumulativeSulfateMassTons * 8 + (params.plumeHeightM / 10));

      const addedPm25 = sourceIntensity * angleWeight * distWeight;
      pm25UgM3 = Math.round(18 + addedPm25);
      stationAod = parseFloat(Math.min(3.5, 0.12 + (metrics.peakAod550 * angleWeight * distWeight)).toFixed(2));
    } else {
      // Pengaruh difusi latar belakang tipis jika berdekatan
      if (angularDiff <= 60 && station.distKm <= plumeFrontReachKm) {
        pm25UgM3 = Math.round(18 + 12 * Math.max(0, 1 - angularDiff / 60));
        stationAod = parseFloat((0.12 + 0.08 * Math.max(0, 1 - angularDiff / 60)).toFixed(2));
      }
    }

    // Visibilitas horizontal Koschmieder: V (km) ≈ 3.912 / beta_ext
    const betaExtStation = Math.max(0.08, (pm25UgM3 / 25) * 0.45);
    const visibilityKm = parseFloat(Math.min(35, Math.max(0.8, 3.912 / betaExtStation)).toFixed(1));

    // Klasifikasi Indeks Standar Pencemar Udara (ISPU) sesuai Permen LHK No. 14 Tahun 2020
    let ispuCategory: StationAerosolEvaluation['ispuCategory'] = 'BAIK';
    let healthAdvisory = 'Kualitas udara aman. Aktivitas luar ruangan dapat berjalan normal.';

    if (pm25UgM3 > 250) {
      ispuCategory = 'BERBAHAYA';
      healthAdvisory = 'Tingkat polusi berbahaya! Wajib mengenakan masker respirator N95, hindari semua aktivitas luar ruangan, tutup ventilasi rumah.';
    } else if (pm25UgM3 > 150) {
      ispuCategory = 'SANGAT TIDAK SEHAT';
      healthAdvisory = 'Kualitas udara sangat tidak sehat. Kelompok rentan (anak-anak, lansia, penderita asma) harus tetap berada di dalam ruangan tertutup.';
    } else if (pm25UgM3 > 55) {
      ispuCategory = 'TIDAK SEHAT';
      healthAdvisory = 'Konsentrasi aerosol sulfat dan abu halus meningkat. Gunakan masker saat beraktivitas di luar dan batasi durasi paparan.';
    } else if (pm25UgM3 > 35) {
      ispuCategory = 'SEDANG';
      healthAdvisory = 'Kualitas udara dalam batas moderat. Masyarakat sensitif disarankan mengurangi aktivitas fisik berat di ruang terbuka.';
    }

    return {
      station,
      inPlumePath,
      etaHours,
      pm25UgM3,
      aod550: stationAod,
      visibilityKm,
      ispuCategory,
      angularDevDeg: Math.round(angularDiff),
      healthAdvisory,
    };
  });
}
