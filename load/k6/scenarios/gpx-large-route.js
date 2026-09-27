// CR-139. Large GPX files / long routes (ADR-015: 10 MB cap, streaming SAX
// parse so a big upload never blocks the event loop). Three concurrent
// scenarios:
//
//   - gpx_upload:   a real, valid, near-limit GPX (many trkpt) uploads
//                   successfully within a generous bound;
//   - gpx_oversized: a >10 MB file is rejected fast with 400
//                   gpx_file_too_large, never silently accepted or hung;
//   - health_probe: hits GET /health throughout, to catch the SAX parser
//                   blocking Node's event loop and stalling unrelated
//                   requests — ADR-015's actual resilience claim, not just
//                   "does the upload itself finish."
//
//   k6 run -e BASE_URL=http://localhost:4000 -e GPX_POINTS=50000 \
//     load/k6/scenarios/gpx-large-route.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../lib/config.js';
import {
  registerAndVerify,
  login,
  createOrganizerProfile,
  createDraftRide,
} from '../lib/api.js';

const GPX_POINTS = Number(__ENV.GPX_POINTS || 50000);
const OVERSIZED_BYTES = Number(__ENV.OVERSIZED_BYTES || 11 * 1024 * 1024);

export const options = {
  setupTimeout: '2m',
  scenarios: {
    gpx_upload: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'uploadLargeGpx',
      maxDuration: '60s',
    },
    gpx_oversized: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'uploadOversizedGpx',
      maxDuration: '30s',
    },
    health_probe: {
      executor: 'constant-vus',
      vus: 2,
      duration: '20s',
      exec: 'probeHealth',
    },
  },
  thresholds: {
    'http_req_duration{name:gpx_upload_large}': ['p(95)<8000'],
    'http_req_duration{name:health_during_gpx}': ['p(95)<300', 'p(99)<800'],
    checks: ['rate==1'],
  },
};

function buildGpx(points) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="k6-load-test"><trk><trkseg>',
  ];
  let lat = 55.75;
  let lng = 37.6;
  for (let i = 0; i < points; i++) {
    lat += 0.0001;
    lng += 0.0001;
    parts.push(
      `<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">` +
        `<ele>${100 + (i % 50)}</ele></trkpt>`,
    );
  }
  parts.push('</trkseg></trk></gpx>');
  return parts.join('');
}

export function setup() {
  const organizer = registerAndVerify();
  login(organizer.email, organizer.password);
  createOrganizerProfile(`Load Test Organizer ${Date.now()}`);
  return {
    organizer,
    largeRideId: createDraftRide(`GPX large ${Date.now()}`),
    oversizedRideId: createDraftRide(`GPX oversized ${Date.now()}`),
  };
}

export function uploadLargeGpx(data) {
  login(data.organizer.email, data.organizer.password);
  const gpx = buildGpx(GPX_POINTS);
  const res = http.post(
    `${BASE_URL}/v1/rides/${data.largeRideId}/route`,
    { file: http.file(gpx, 'long-route.gpx', 'application/gpx+xml') },
    { tags: { name: 'gpx_upload_large' } },
  );
  check(res, { 'large gpx upload accepted': (r) => r.status === 201 });
}

export function uploadOversizedGpx(data) {
  login(data.organizer.email, data.organizer.password);
  const garbage = 'A'.repeat(OVERSIZED_BYTES);
  const res = http.post(
    `${BASE_URL}/v1/rides/${data.oversizedRideId}/route`,
    { file: http.file(garbage, 'huge.gpx', 'application/gpx+xml') },
    { tags: { name: 'gpx_upload_oversized' } },
  );
  check(res, {
    'oversized gpx rejected fast, not accepted or hung': (r) =>
      r.status === 400 && r.json().code === 'gpx_file_too_large',
  });
}

export function probeHealth() {
  const res = http.get(`${BASE_URL}/health`, {
    tags: { name: 'health_during_gpx' },
  });
  check(res, { 'health during gpx upload: 200': (r) => r.status === 200 });
  sleep(0.2);
}
