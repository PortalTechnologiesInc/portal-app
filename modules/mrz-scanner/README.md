# @getportal/mrz-scanner

A React Native Expo module for scanning and parsing MRZ (Machine Readable Zone) from passports and ID cards using the device camera.

Supports **TD-1** (ID cards, 3×30) and **TD-3** (passports, 2×44) formats with [ICAO 9303](https://www.icao.int/publications/pages/publication.aspx?docnum=9303) checksum validation.

## Origin

This project is based on [`rn-mrz-scanner`](https://www.npmjs.com/package/rn-mrz-scanner) (v2.0.3) by [@berkayaslan](https://github.com/berkayaslan), which is MIT licensed. The original repository is no longer actively maintained. This fork fixes several critical bugs, adds MRZ parsing/validation, and modernises the codebase.

## Features

- 📷 Full-screen camera scanner with card overlay UI
- 🔍 Real-time MRZ detection using Apple Vision (iOS) and Google ML Kit (Android)
- 📝 Pure TypeScript MRZ parser — no native code needed for parsing
- ✅ ICAO 9303 checksum validation
- ⏱️ Configurable scan timeout
- 🔌 Expo module with config plugin for automatic permission setup

## Installation

```bash
npm install @getportal/mrz-scanner
# or
yarn add @getportal/mrz-scanner
```

### Expo Config Plugin

Add to your `app.json` / `app.config.js`:

```json
{
  "plugins": [
    [
      "@getportal/mrz-scanner",
      {
        "cameraPermissionText": "This app needs camera access to scan identity documents."
      }
    ]
  ]
}
```

This automatically adds `NSCameraUsageDescription` (iOS) and `CAMERA` permission (Android).

## Usage

### Scanning MRZ

```typescript
import { scanMRZ, parseMRZ } from "@getportal/mrz-scanner";

// Open the scanner
const rawMRZ = await scanMRZ({
  timeoutMs: 30000, // optional: 30s timeout
  instructionText: "Place the back of your document in the frame",
  isChipShow: true,
});

// Parse the raw MRZ string into structured data
const result = parseMRZ(rawMRZ);

console.log(result.lastName);       // "ERIKSSON"
console.log(result.firstName);      // "ANNA MARIA"
console.log(result.documentNumber); // "L898902C3"
console.log(result.dateOfBirth);    // "1974-08-12"
console.log(result.expiryDate);     // "2012-04-15"
console.log(result.nationality);    // "UTO"
console.log(result.sex);            // "F"
console.log(result.checksumValid);  // true
```

### Parsing Only (no camera)

The parser is a pure TypeScript function — no native module required:

```typescript
import { parseMRZ } from "@getportal/mrz-scanner";

const result = parseMRZ(
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n" +
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10"
);
```

## API

### `scanMRZ(options?)`

Opens the camera scanner. Returns a `Promise<string>` with the raw MRZ text.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `instructionText` | `string` | `"Place the back of your document in the frame"` | Text shown on the overlay |
| `isChipShow` | `boolean` | `true` | Show the chip icon on the overlay |
| `timeoutMs` | `number` | – | Auto-reject after this many milliseconds |

**Error codes:**
- `ERR_CANCELLED` — user dismissed the scanner
- `ERR_TIMEOUT` — timeout expired
- `ERR_UI` (iOS) / `ERR_NO_ACTIVITY` (Android) — scanner could not be presented

### `parseMRZ(mrzString)`

Parses a raw MRZ string (lines separated by `\n`). Returns an `MRZResult`:

```typescript
interface MRZResult {
  format: "TD1" | "TD3";
  documentType: string;
  issuingCountry: string;
  lastName: string;
  firstName: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: string;   // YYYY-MM-DD
  sex: string;           // "M", "F", or "<"
  expiryDate: string;    // YYYY-MM-DD
  optionalData: string;
  checksumValid: boolean;
}
```

## Bug Fixes over `rn-mrz-scanner`

This fork addresses the following issues found in the original:

### Critical
1. **iOS `stripped` charset typo** — duplicate `K` in character set caused `L` and `0` to be mishandled
2. **iOS global mutable state not thread-safe** — replaced file-level globals with a thread-safe `MRZCaptureState` class
3. **iOS dead-code validation** — both branches of MRZ regex validation did the same thing; now actually rejects invalid MRZ
4. **iOS state not reset between scans** — dirty state from failed scans bled into subsequent scans
5. **Android `pendingPromise` race condition** — calling `scanMRZ` twice orphaned the first promise forever
6. **Android `textRecognizer` not closed** — resource leak; now properly closed in `onDestroy`

### Moderate
7. **Hardcoded Turkish strings** — all UI text and error messages translated to English
8. **No MRZ checksum validation** — added ICAO 9303 check digit validation via `checksumValid` field
9. **Android fragile view traversal** — `PreviewView` is now stored as a direct reference
10. **No timeout option** — added `timeoutMs` to reject with `ERR_TIMEOUT`

### Minor
11. **Package/module renamed** — from `com.documentaccept.rn.mrzscanner` to `cc.getportal.mrz`
12. **`build/` not in `.gitignore`** — added proper `.gitignore`
13. **iOS Turkish error string** — translated to English

## Requirements

- Expo SDK ≥ 49
- React Native ≥ 0.72
- iOS 15+
- Android API 21+

## License

MIT — see [LICENSE](./LICENSE).
