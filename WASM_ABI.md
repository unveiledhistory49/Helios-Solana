# Helios WASM Transformer ABI

Helios v3.0 introduces custom WebAssembly (WASM) transformers. To be compatible with Helios, your WASM module must export two specific functions.

## Required Exports

### 1. `alloc(size: i32) -> i32`
Allocates a memory block of the given size and returns its pointer. Helios uses this to pass JSON data into the WASM instance.

- **Input:** `size` (integer) - The number of bytes to allocate.
- **Output:** `pointer` (integer) - The start address of the allocated block in WASM memory.

### 2. `transform(ptr: i32, len: i32) -> i64`
Transforms the provided JSON data.

- **Input:** 
    - `ptr` (integer) - Pointer to the start of the JSON string in memory.
    - `len` (integer) - Length of the JSON string.
- **Output:** `result` (64-bit integer) - A combined value encoding both the pointer and length of the *new* JSON string.
    - **High 32 bits:** The length of the resulting JSON string.
    - **Low 32 bits:** The pointer to the resulting JSON string in WASM memory.

## Example (Rust)

```rust
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn transform(ptr: *mut u8, len: usize) -> u64 {
    // 1. Read input JSON from memory
    let input_data = unsafe { Vec::from_raw_parts(ptr, len, len) };
    let input_str = String::from_utf8_lossy(&input_data);
    
    // 2. Perform transformation logic
    // ... logic here ...
    let result_json = serde_json::to_string(&transformed_obj).unwrap();

    // 3. Return encoded pointer and length
    let result_ptr = result_json.as_ptr() as u64;
    let result_len = result_json.len() as u64;
    
    std::mem::forget(result_json); // Keep memory alive for Helios to read
    
    (result_len << 32) | result_ptr
}
```

## How it works

1. Helios loads your `.wasm` file.
2. For each event, Helios calls `alloc` to reserve space for the event JSON.
3. Helios writes the event JSON into that space.
4. Helios calls `transform`.
5. Helios reads the result from the pointer/length returned by `transform`.
6. The event continues through the pipeline with the new transformed data.
