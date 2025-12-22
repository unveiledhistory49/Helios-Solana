import fs from 'fs/promises';
import path from 'path';

export class WasmEngine {
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;

  /**
   * Loads and compiles a WASM module from disk.
   */
  async loadModule(filePath: string): Promise<void> {
    try {
      const buffer = await fs.readFile(filePath);
      const module = await WebAssembly.compile(buffer);
      
      // We can provide imports here if the WASM needs them (e.g. logging)
      const importObject = {
        env: {
          log: (ptr: number, len: number) => {
            const mem = this.instance!.exports.memory as WebAssembly.Memory;
            const bytes = new Uint8Array(mem.buffer, ptr, len);
            console.log(`[WASM LOG] ${new TextDecoder().decode(bytes)}`);
          },
          abort: () => console.error("WASM aborted"),
        }
      };

      this.instance = await WebAssembly.instantiate(module, importObject);
      this.memory = this.instance.exports.memory as WebAssembly.Memory;
    } catch (error) {
      throw new Error(`Failed to load WASM module at ${filePath}: ${error}`);
    }
  }

  /**
   * Runs the transformation logic on a JSON string.
   */
  runTransform(payload: string): string | null {
    if (!this.instance || !this.memory) {
      throw new Error("WasmEngine not initialized. Call loadModule() first.");
    }

    const exports = this.instance.exports as any;
    
    // 1. Encode string to bytes
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);
    const size = encoded.length;

    // 2. Allocate memory in WASM
    // fn alloc(size: i32) -> i32
    const inputPtr = exports.alloc(size);

    // 3. Write data to WASM memory
    const memoryBytes = new Uint8Array(this.memory.buffer);
    memoryBytes.set(encoded, inputPtr);

    // 4. Call transform function
    // fn transform(ptr: i32, len: i32) -> i64 (packed u64)
    // Note: JS represents i64 as BigInt
    const resultPacked = exports.transform(inputPtr, size);
    
    // 5. Unpack result (ptr = high 32, len = low 32)
    const resultBigInt = BigInt(resultPacked);
    if (resultBigInt === 0n) {
      return null; // Transformation failed or returned null
    }

    const outputLen = Number(resultBigInt & 0xFFFFFFFFn);
    const outputPtr = Number(resultBigInt >> 32n);

    // 6. Read result from WASM memory
    // Need to refresh view of buffer in case memory grew
    const resultBuffer = new Uint8Array(this.memory.buffer, outputPtr, outputLen);
    const decoder = new TextDecoder();
    return decoder.decode(resultBuffer);
  }
}
