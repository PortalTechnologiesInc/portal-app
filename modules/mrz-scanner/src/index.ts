import { requireNativeModule } from "expo-modules-core";

const MRZScannerModule = requireNativeModule("MRZScanner");

export { parseMRZ } from "./parseMRZ";
export type { MRZResult } from "./parseMRZ";

export interface ScanMRZOptions {
  /** Custom instruction text displayed on the scanner overlay. */
  instructionText?: string;
  /** Whether to show the chip icon on the overlay. Defaults to `true`. */
  isChipShow?: boolean;
  /** Timeout in milliseconds. Rejects with `ERR_TIMEOUT` if no MRZ is detected within this duration. */
  timeoutMs?: number;
}

/**
 * Opens a full-screen camera scanner to read the MRZ (Machine Readable Zone)
 * from a passport (TD-3) or ID card (TD-1).
 *
 * The scanner displays a card-shaped overlay with a chip icon and corner
 * brackets so the user knows to present the **back** of the document.
 *
 * @param options - Optional configuration for the scanner.
 * @returns A promise that resolves with the raw MRZ string (lines separated by `\n`).
 * @throws `ERR_CANCELLED` if the user dismisses the scanner.
 * @throws `ERR_TIMEOUT` if `timeoutMs` is set and the timeout expires.
 * @throws `ERR_NO_ACTIVITY` (Android) or `ERR_UI` (iOS) if the scanner cannot be presented.
 *
 * @example
 * ```ts
 * import { scanMRZ, parseMRZ } from "@getportal/mrz-scanner";
 *
 * const mrz = await scanMRZ({ timeoutMs: 30000 });
 * const result = parseMRZ(mrz);
 * console.log(result.lastName, result.firstName);
 * ```
 */
export async function scanMRZ(options?: ScanMRZOptions): Promise<string> {
  return MRZScannerModule.scanMRZ(options ?? {});
}

export default { scanMRZ };
