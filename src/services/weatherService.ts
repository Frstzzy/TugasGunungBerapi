/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Layanan Pengambilan Data Meteorologi & Angin Atmosfer Real-Time
 * Lokasi: Stasiun AWS Kaldera Gunung Anak Krakatau, Selat Sunda
 * Koordinat: 6.102° S, 105.423° E (Elevasi 157 mdpl)
 */

import { KrakatauWeather, AtmosphericWindLevel, WeatherForecastPoint } from '../types';

export function getCardinalDirection(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    'Utara (U)',
    'Utara-Timur Laut (UTL)',
    'Timur Laut (TL)',
    'Timur-Timur Laut (TTL)',
    'Timur (T)',
    'Timur-Menenggara (TM)',
    'Tenggara (TG)',
    'Selatan-Menenggara (SM)',
    'Selatan (S)',
    'Selatan-Barat Daya (SBD)',
    'Barat Daya (BD)',
    'Barat-Barat Daya (BBD)',
    'Barat (B)',
    'Barat-Barat Laut (BBL)',
    'Barat Laut (BL)',
    'Utara-Barat Laut (UBL)',
  ];
  const idx = Math.round(normalized / 22.5) % 16;
  return directions[idx];
}

export function getWeatherConditionDescription(code: number): string {
  if (code === 0) return 'Cerah Berawan Tropis';
  if (code === 1 || code === 2) return 'Sebagian Berawan';
  if (code === 3) return 'Mendung Tertutup Awan Rendah';
  if (code === 45 || code === 48) return 'Kabut Asap Maritim';
  if (code >= 51 && code <= 55) return 'Gerimis Ringan Selat Sunda';
  if (code >= 61 && code <= 65) return 'Hujan Sedang / Monsun Tropis';
  if (code >= 80 && code <= 82) return 'Hujan Deras / Badai Lokal';
  if (code >= 95) return 'Badai Petir Konvektif Selat Sunda';
  return 'Berawan Dinamis Tropis';
}

/**
 * Data Cuaca Fallback / Baseline jika koneksi ke remote API mengalami kendala
 */
function createBaselineKrakatauWeather(): KrakatauWeather {
  const now = new Date();
  const dirSurface = 85; // Angin pasat timur khas Selat Sunda
  const speedSurface = 6.2; // m/s
  const driftSurface = (dirSurface + 180) % 360;

  const atmosphericLevels: AtmosphericWindLevel[] = [
    {
      levelId: 'surface',
      name: 'Angin Permukaan (10 m / Laut)',
      altitudeM: 10,
      pressureHpa: 1010,
      speedMs: speedSurface,
      speedKmh: Math.round(speedSurface * 3.6),
      directionDeg: dirSurface,
      directionCardinal: getCardinalDirection(dirSurface),
      recommendedFor: 'Dispersi abu dekat kawah & gelombang permukaan laut',
    },
    {
      levelId: '850hpa',
      name: 'Lapisan 850 hPa (~1.500 m)',
      altitudeM: 1500,
      pressureHpa: 850,
      speedMs: 8.5,
      speedKmh: Math.round(8.5 * 3.6),
      directionDeg: 90,
      directionCardinal: getCardinalDirection(90),
      recommendedFor: 'Tinggi kolom letusan Strombolian & abu level rendah',
    },
    {
      levelId: '700hpa',
      name: 'Lapisan 700 hPa (~3.000 m)',
      altitudeM: 3000,
      pressureHpa: 700,
      speedMs: 11.2,
      speedKmh: Math.round(11.2 * 3.6),
      directionDeg: 95,
      directionCardinal: getCardinalDirection(95),
      recommendedFor: 'Letusan Vulkanian & adveksi abu ke pesisir Banten/Lampung',
    },
    {
      levelId: '500hpa',
      name: 'Lapisan 500 hPa (~5.500 m)',
      altitudeM: 5500,
      pressureHpa: 500,
      speedMs: 14.8,
      speedKmh: Math.round(14.8 * 3.6),
      directionDeg: 105,
      directionCardinal: getCardinalDirection(105),
      recommendedFor: 'Plume Subplinian & koridor jelajah pesawat udara (FL180)',
    },
  ];

  const forecast: WeatherForecastPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const fcTime = new Date(now.getTime() + i * 3 * 3600 * 1000);
    const speed = Math.round((5.5 + Math.sin(i * 0.8) * 2.2) * 10) / 10;
    const dir = Math.round((dirSurface + Math.sin(i) * 15) % 360);
    forecast.push({
      timeIso: fcTime.toISOString(),
      timeLabel: `${fcTime.getHours().toString().padStart(2, '0')}:00 WIB`,
      tempC: Math.round((28.5 - (i > 3 ? 2 : 0)) * 10) / 10,
      speedMs: speed,
      speedKmh: Math.round(speed * 3.6),
      directionDeg: dir,
      directionCardinal: getCardinalDirection(dir),
    });
  }

  return {
    timestamp: now.toISOString(),
    lastUpdated: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    source: 'Sensor Baseline (Simulasi)',
    stationName: 'AWS Kaldera Anak Krakatau (BMKG/PVMBG Baseline)',
    coordinates: {
      lat: -6.102,
      lon: 105.423,
      elevationM: 157,
    },
    temperatureC: 28.4,
    apparentTempC: 32.1,
    relativeHumidity: 78,
    humidity: 78,
    uvIndex: 8,
    pressureHpa: 1010.5,
    weatherCondition: 'Cerah Berawan Tropis',
    weatherCode: 1,
    surface: {
      tempC: 28.4,
      humidityPct: 78,
    },
    wind: {
      speedMs: speedSurface,
      speedKmh: Math.round(speedSurface * 3.6),
      directionDeg: dirSurface,
      driftDirectionDeg: driftSurface,
      directionCardinal: getCardinalDirection(dirSurface),
      gustMs: 9.4,
    },
    atmosphericLevels,
    forecast,
  };
}

/**
 * Mengambil data meteorologi real-time untuk koordinat Gunung Anak Krakatau
 * dari Open-Meteo API dengan fallback otomatis ke baseline sensor kaldera.
 */
export async function fetchKrakatauWeather(): Promise<KrakatauWeather> {
  const lat = -6.102;
  const lon = 105.423;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa,wind_speed_500hPa,wind_direction_500hPa,uv_index&wind_speed_unit=ms&timezone=Asia%2FJakarta&forecast_days=2`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn('Weather API returned error status, using baseline data:', res.status);
      return createBaselineKrakatauWeather();
    }

    const data = await res.json();
    const current = data.current;
    if (!current) {
      return createBaselineKrakatauWeather();
    }

    const now = new Date();
    const surfaceSpeed = Math.round(Number(current.wind_speed_10m || 6.0) * 10) / 10;
    const surfaceDir = Math.round(Number(current.wind_direction_10m || 90));
    const surfaceDrift = (surfaceDir + 180) % 360;
    const relHum = Math.round(Number(current.relative_humidity_2m || 78));
    const tempC = Math.round(Number(current.temperature_2m || 28.5) * 10) / 10;
    const appTemp = Math.round(Number(current.apparent_temperature || 32.0) * 10) / 10;
    const pressureHpa = Math.round(Number(current.surface_pressure || 1011) * 10) / 10;
    const code = Number(current.weather_code || 1);

    // Dapatkan data level atmosfer dari hourly index pertama
    const hourly = data.hourly || {};
    const spd850 = hourly.wind_speed_850hPa?.[0] ? Math.round(Number(hourly.wind_speed_850hPa[0]) * 10) / 10 : surfaceSpeed * 1.3;
    const dir850 = hourly.wind_direction_850hPa?.[0] ? Math.round(Number(hourly.wind_direction_850hPa[0])) : (surfaceDir + 5) % 360;

    const spd700 = hourly.wind_speed_700hPa?.[0] ? Math.round(Number(hourly.wind_speed_700hPa[0]) * 10) / 10 : surfaceSpeed * 1.7;
    const dir700 = hourly.wind_direction_700hPa?.[0] ? Math.round(Number(hourly.wind_direction_700hPa[0])) : (surfaceDir + 12) % 360;

    const spd500 = hourly.wind_speed_500hPa?.[0] ? Math.round(Number(hourly.wind_speed_500hPa[0]) * 10) / 10 : surfaceSpeed * 2.2;
    const dir500 = hourly.wind_direction_500hPa?.[0] ? Math.round(Number(hourly.wind_direction_500hPa[0])) : (surfaceDir + 20) % 360;

    const uvIdx = hourly.uv_index?.[0] ? Math.round(Number(hourly.uv_index[0])) : 8;

    const atmosphericLevels: AtmosphericWindLevel[] = [
      {
        levelId: 'surface',
        name: 'Angin Permukaan (10 m / Laut)',
        altitudeM: 10,
        pressureHpa: pressureHpa,
        speedMs: surfaceSpeed,
        speedKmh: Math.round(surfaceSpeed * 3.6),
        directionDeg: surfaceDir,
        directionCardinal: getCardinalDirection(surfaceDir),
        recommendedFor: 'Dispersi abu dekat kawah & gelombang permukaan laut',
      },
      {
        levelId: '850hpa',
        name: 'Lapisan 850 hPa (~1.500 m)',
        altitudeM: 1500,
        pressureHpa: 850,
        speedMs: spd850,
        speedKmh: Math.round(spd850 * 3.6),
        directionDeg: dir850,
        directionCardinal: getCardinalDirection(dir850),
        recommendedFor: 'Tinggi kolom letusan Strombolian & abu level rendah',
      },
      {
        levelId: '700hpa',
        name: 'Lapisan 700 hPa (~3.000 m)',
        altitudeM: 3000,
        pressureHpa: 700,
        speedMs: spd700,
        speedKmh: Math.round(spd700 * 3.6),
        directionDeg: dir700,
        directionCardinal: getCardinalDirection(dir700),
        recommendedFor: 'Letusan Vulkanian & adveksi abu ke pesisir Banten/Lampung',
      },
      {
        levelId: '500hpa',
        name: 'Lapisan 500 hPa (~5.500 m)',
        altitudeM: 5500,
        pressureHpa: 500,
        speedMs: spd500,
        speedKmh: Math.round(spd500 * 3.6),
        directionDeg: dir500,
        directionCardinal: getCardinalDirection(dir500),
        recommendedFor: 'Plume Subplinian & koridor jelajah pesawat udara (FL180)',
      },
    ];

    // Buat forecast 8 jam
    const forecast: WeatherForecastPoint[] = [];
    const times = hourly.time || [];
    for (let i = 0; i < Math.min(8, times.length); i++) {
      const fTime = new Date(times[i]);
      const fSpeed = Math.round(Number(hourly.wind_speed_10m?.[i] || surfaceSpeed) * 10) / 10;
      const fDir = Math.round(Number(hourly.wind_direction_10m?.[i] || surfaceDir));
      const fTemp = Math.round(Number(hourly.temperature_2m?.[i] || tempC) * 10) / 10;

      forecast.push({
        timeIso: times[i],
        timeLabel: `${fTime.getHours().toString().padStart(2, '0')}:00 WIB`,
        tempC: fTemp,
        speedMs: fSpeed,
        speedKmh: Math.round(fSpeed * 3.6),
        directionDeg: fDir,
        directionCardinal: getCardinalDirection(fDir),
      });
    }

    return {
      timestamp: now.toISOString(),
      lastUpdated: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      source: 'Open-Meteo',
      stationName: 'AWS Selat Sunda (G. Anak Krakatau Stasiun Riil)',
      coordinates: {
        lat,
        lon,
        elevationM: 157,
      },
      temperatureC: tempC,
      apparentTempC: appTemp,
      relativeHumidity: relHum,
      humidity: relHum,
      uvIndex: uvIdx,
      pressureHpa,
      weatherCondition: getWeatherConditionDescription(code),
      weatherCode: code,
      surface: {
        tempC,
        humidityPct: relHum,
      },
      wind: {
        speedMs: surfaceSpeed,
        speedKmh: Math.round(surfaceSpeed * 3.6),
        directionDeg: surfaceDir,
        driftDirectionDeg: surfaceDrift,
        directionCardinal: getCardinalDirection(surfaceDir),
        gustMs: Math.round(Number(current.wind_gusts_10m || surfaceSpeed * 1.5) * 10) / 10,
      },
      atmosphericLevels,
      forecast: forecast.length > 0 ? forecast : createBaselineKrakatauWeather().forecast,
    };
  } catch (err) {
    console.warn('Network issue fetching live weather from Open-Meteo, using robust baseline:', err);
    return createBaselineKrakatauWeather();
  }
}
