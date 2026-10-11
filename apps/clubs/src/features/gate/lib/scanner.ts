/**
 * Camera QR scanning. Prefers the platform BarcodeDetector; falls back to
 * qr-scanner (a worker-based decoder), loaded only when first needed so the
 * gate's initial JS stays small.
 */
export interface Scanner {
  stop: () => void;
}

export type Facing = "environment" | "user";

const SAME_CODE_COOLDOWN_MS = 2500;

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void, facing: Facing = "environment"): Promise<Scanner> {
  let last = { code: "", at: 0 };
  const emit = (code: string) => {
    const now = Date.now();
    if (code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS) return;
    last = { code, at: now };
    onCode(code);
  };

  const Detector = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Detector) {
    const wants = { width: { ideal: 1280 }, height: { ideal: 720 } };
    // Ask for the camera we want, and take whatever there is rather than fail.
    const stream = await navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { exact: facing }, ...wants }, audio: false })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, ...wants }, audio: false }));
    video.srcObject = stream;
    await video.play();
    const detector = new Detector({ formats: ["qr_code"] });
    let running = true;
    const loop = async () => {
      while (running) {
        try {
          const found = await detector.detect(video);
          const hit = found.find((f) => f.rawValue);
          if (hit) emit(hit.rawValue);
        } catch {
          /* frame not ready */
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    };
    void loop();
    return {
      stop: () => {
        running = false;
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      },
    };
  }

  const { default: QrScanner } = await import("qr-scanner");
  const scanner = new QrScanner(video, (result) => emit(result.data), {
    preferredCamera: facing,
    highlightScanRegion: false,
    highlightCodeOutline: false,
    maxScansPerSecond: 8,
    returnDetailedScanResult: true,
  });
  await scanner.start();
  return {
    stop: () => {
      scanner.stop();
      scanner.destroy();
    },
  };
}

/** Why the camera did not start, in words that lead somewhere. */
export const cameraProblem = (err: unknown): string => {
  const name = err instanceof Error || (typeof DOMException !== "undefined" && err instanceof DOMException) ? (err as Error).name : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (typeof window !== "undefined" && !window.isSecureContext) return "The camera only works on the https:// address. Open the gate from there, or type the code instead.";
  if (name === "NotAllowedError" || name === "SecurityError" || /denied|permission|not allowed/i.test(message))
    return "Camera access is blocked for this site. Tap the lock beside the address → Permissions → Camera → Allow, then Start camera again. On an iPhone: Settings → Safari → Camera → Allow. You can always type the code instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError" || /not found/i.test(message)) return "No camera was found on this device. Type the code under the QR instead.";
  if (name === "NotReadableError" || name === "AbortError") return "Another app is using the camera. Close it (or the other tab), then Start camera again.";
  return "The camera could not start. You can always type the code instead.";
};
