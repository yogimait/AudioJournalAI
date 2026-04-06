/**
 * Centralized RunAnywhere SDK initialization layer.
 * Singleton pattern — prevents duplicate model loads.
 * Must only be called client-side (inside useEffect).
 */

type InitStatus = "idle" | "loading" | "ready" | "error";

interface RunAnywhereState {
  sdk: InitStatus;
  stt: InitStatus;
  vad: InitStatus;
  tts: InitStatus;
  error: string | null;
}

const state: RunAnywhereState = {
  sdk: "idle",
  stt: "idle",
  vad: "idle",
  tts: "idle",
  error: null,
};

let initPromise: Promise<void> | null = null;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = err as Record<string, unknown>;
    const message = data.message;
    if (typeof message === "string" && message.trim().length > 0) return message;
    const reason = data.reason;
    if (typeof reason === "string" && reason.trim().length > 0) return reason;
    const error = data.error;
    if (typeof error === "string" && error.trim().length > 0) return error;
    try {
      return JSON.stringify(data);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function getRunAnywhereState(): RunAnywhereState {
  return { ...state };
}

/**
 * Native browser dynamic import that bypasses webpack/turbopack module shims.
 * Uses new Function() to create an import call outside the bundler's scope.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nativeImport = new Function("url", "return import(url)") as (url: string) => Promise<any>;

/**
 * Patch SherpaONNXBridge to use native browser import() instead of
 * bundler-intercepted import(). Webpack/Turbopack rewrite import() calls 
 * at compile time, causing "Cannot find module" for runtime URLs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchBridge(bridge: any): void {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const glueUrl = `${origin}/wasm/sherpa/sherpa-onnx-glue.js`;
  const baseUrl = `${origin}/wasm/sherpa/`;

  // Override wasmUrl and helperBaseUrl
  bridge.wasmUrl = glueUrl;
  bridge.helperBaseUrl = baseUrl;

  // Monkey-patch _doLoad to use native browser import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bridge._doLoad = async function (this: any, wasmUrl?: string) {
    console.info("[RunAnywhere:SherpaONNX] Loading Sherpa-ONNX WASM module (patched)...");
    try {
      const moduleUrl = wasmUrl ?? this.wasmUrl ?? glueUrl;
      
      // Native browser import — bypasses webpack shim
      const glueModule = await nativeImport(moduleUrl);
      const createModule = glueModule.default;

      // Derive base URL for .wasm binary
      const resolvedBaseUrl = moduleUrl.substring(0, moduleUrl.lastIndexOf("/") + 1);
      const wasmBinaryUrl = resolvedBaseUrl + "sherpa-onnx.wasm";

      // Pre-fetch WASM binary
      console.info(`[RunAnywhere:SherpaONNX] Fetching WASM binary from ${wasmBinaryUrl}`);
      const wasmResponse = await fetch(wasmBinaryUrl);
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch sherpa-onnx.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`);
      }
      const wasmBinary = await wasmResponse.arrayBuffer();
      console.info(`[RunAnywhere:SherpaONNX] WASM binary fetched: ${(wasmBinary.byteLength / 1_000_000).toFixed(1)} MB`);

      // Instantiate WASM module
      let resolveWasm: () => void;
      let rejectWasm: (err: Error) => void;
      const wasmReady = new Promise<void>((resolve, reject) => {
        resolveWasm = resolve;
        rejectWasm = reject;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modOrPromise = createModule({
        noFSInit: true,
        print: (text: string) => console.debug(`[SherpaONNX] ${text}`),
        printErr: (text: string) => console.warn(`[SherpaONNX] ${text}`),
        wasmBinary,
        locateFile: (path: string) => resolvedBaseUrl + path,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        instantiateWasm: (imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => {
          WebAssembly.instantiate(wasmBinary, imports)
            .then((result) => {
              try {
                receiveInstance(result.instance, result.module);
                resolveWasm!();
              } catch (err) {
                console.warn(`[SherpaONNX] receiveInstance completed with error: ${err}`);
                resolveWasm!();
              }
            })
            .catch((err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err));
              console.error(`[SherpaONNX] WASM instantiation failed: ${error.message}`);
              rejectWasm!(error);
            });
          return {};
        },
      });

      // Wait for WASM to be ready
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Sherpa-ONNX WASM module timed out after 30s")), 30_000);
      });
      await Promise.race([wasmReady, timeoutPromise]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await Promise.resolve(modOrPromise);
      this._module = mod;

      // Verify exports
      if (typeof mod._malloc !== "function") {
        const available = ["_malloc", "_free", "_SherpaOnnxCreateOfflineRecognizer"]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((fn: string) => `${fn}: ${typeof (mod as any)[fn]}`)
          .join(", ");
        throw new Error(`WASM exports not available after initialization. Available: ${available}`);
      }

      if (!this.helperBaseUrl) {
        this.helperBaseUrl = resolvedBaseUrl;
      }

      this._loaded = true;
      console.info("[RunAnywhere:SherpaONNX] Sherpa-ONNX WASM module loaded successfully (patched)");
    } catch (error) {
      this._module = null;
      this._loaded = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[RunAnywhere:SherpaONNX] Failed to load Sherpa-ONNX WASM: ${message}`);
      throw error;
    }
  };
}

/**
 * Initialize the core RunAnywhere SDK + ONNX backend.
 * Safe to call multiple times — only runs once.
 */
export async function initRunAnywhere(): Promise<void> {
  if (state.sdk === "ready") return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      state.sdk = "loading";
      const { RunAnywhere, SDKEnvironment } = await import("@runanywhere/web");
      const { ONNX, SherpaONNXBridge } = await import("@runanywhere/web-onnx");

      await RunAnywhere.initialize({ environment: SDKEnvironment.Production, debug: false });

      // Patch the bridge BEFORE ONNX.register() so that the WASM
      // glue is loaded via native browser import() — not webpack's shim.
      patchBridge(SherpaONNXBridge.shared);

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await ONNX.register({
        wasmUrl: `${origin}/wasm/sherpa/sherpa-onnx-glue.js`,
        helperBaseUrl: `${origin}/wasm/sherpa/`,
      });

      state.sdk = "ready";
    } catch (err) {
      state.sdk = "error";
      state.error = `SDK init failed: ${getErrorMessage(err)}`;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Initialize STT (Whisper Base only). Requires SDK to be ready.
 */
export async function initSTTModel(): Promise<void> {
  if (state.stt === "ready" || state.stt === "loading") return;
  await initRunAnywhere();

  try {
    state.stt = "loading";
    const { STT, STTModelType, SherpaONNXBridge } = await import("@runanywhere/web-onnx");
    const bridge = SherpaONNXBridge.shared;
    await bridge.ensureLoaded();

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const isFileAvailable = async (path: string): Promise<boolean> => {
      if (!origin) return true;
      try {
        const res = await fetch(`${origin}${path}`, { method: "HEAD" });
        return res.ok;
      } catch {
        return false;
      }
    };

    const model = {
      id: "whisper-tiny-encoder-decoder-txt",
      encoder: "/models/whisper-tiny-encoder.onnx",
      decoder: "/models/whisper-tiny-decoder.onnx",
      tokens: "/models/whisper-tiny-tokens.txt",
    };

    const [hasEncoder, hasDecoder, hasTokens] = await Promise.all([
      isFileAvailable(model.encoder),
      isFileAvailable(model.decoder),
      isFileAvailable(model.tokens),
    ]);

    if (!hasEncoder || !hasDecoder || !hasTokens) {
      const missing: string[] = [];
      if (!hasEncoder) missing.push(model.encoder);
      if (!hasDecoder) missing.push(model.decoder);
      if (!hasTokens) missing.push(model.tokens);
      throw new Error(`Whisper Base model files are missing/inaccessible: ${missing.join(", ")}`);
    }

    try {
      await bridge.downloadAndWrite(model.encoder, model.encoder);
      await bridge.downloadAndWrite(model.decoder, model.decoder);
      await bridge.downloadAndWrite(model.tokens, model.tokens);
    } catch (err) {
      throw new Error(`Failed to stage Whisper Base files in WASM FS: ${getErrorMessage(err)}`);
    }

    try {
      await STT.loadModel({
        modelId: model.id,
        type: STTModelType.Whisper,
        modelFiles: {
          encoder: model.encoder,
          decoder: model.decoder,
          tokens: model.tokens,
        },
        sampleRate: 16000,
      });
    } catch (err) {
      throw new Error(`Whisper Base STT.loadModel failed: ${getErrorMessage(err)}`);
    }

    state.stt = "ready";
    return;

  } catch (err) {
    state.stt = "error";
    state.error = `STT init failed: ${getErrorMessage(err)}`;
    throw err;
  }
}

/**
 * Initialize VAD (Silero). Requires SDK to be ready.
 */
export async function initVADModel(): Promise<void> {
  if (state.vad === "ready" || state.vad === "loading") return;
  await initRunAnywhere();

  try {
    state.vad = "loading";
    const { VAD, SherpaONNXBridge } = await import("@runanywhere/web-onnx");

    // Download files into Sherpa-ONNX WASM virtual filesystem
    const bridge = SherpaONNXBridge.shared;
    await bridge.ensureLoaded();
    try {
      await bridge.downloadAndWrite("/models/silero_vad.onnx", "/models/silero_vad.onnx");
    } catch (err) {
      throw new Error(`Failed to stage Silero VAD model in WASM FS: ${getErrorMessage(err)}`);
    }

    try {
      await VAD.loadModel({
        modelPath: "/models/silero_vad.onnx",
        threshold: 0.62,
        minSpeechDuration: 0.22,
        minSilenceDuration: 0.35,
      });
    } catch (err) {
      throw new Error(`VAD.loadModel failed: ${getErrorMessage(err)}`);
    }

    state.vad = "ready";
  } catch (err) {
    state.vad = "error";
    state.error = `VAD init failed: ${getErrorMessage(err)}`;
    throw err;
  }
}

/**
 * Initialize TTS (Piper). Optional — Phase 7.
 */
export async function initTTSModel(): Promise<void> {
  if (state.tts === "ready" || state.tts === "loading") return;
  await initRunAnywhere();

  try {
    state.tts = "loading";
    const { TTS } = await import("@runanywhere/web-onnx");

    await TTS.loadVoice({
      voiceId: "piper-en",
      modelPath: "/models/piper-en.onnx",
      tokensPath: "/models/piper-tokens.txt",
      dataDir: "/models/espeak-ng-data",
    });

    state.tts = "ready";
  } catch (err) {
    state.tts = "error";
    state.error = `TTS init failed: ${getErrorMessage(err)}`;
    throw err;
  }
}
