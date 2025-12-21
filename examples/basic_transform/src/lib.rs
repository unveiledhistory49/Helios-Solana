use std::mem;
use std::slice;
use std::str;
use serde_json::Value;

// 1. Allocate memory for the host to write the string into
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    mem::forget(buf); // Prevent Rust from freeing this memory automatically
    ptr
}

// 2. The main transformation logic
#[no_mangle]
pub extern "C" fn transform(ptr: *mut u8, len: usize) -> u64 {
    // Reconstruct the string from memory
    let input_data = unsafe { slice::from_raw_parts(ptr, len) };
    let input_str = match str::from_utf8(input_data) {
        Ok(s) => s,
        Err(_) => return 0, // Should handle error better in prod
    };

    // Parse JSON
    let mut v: Value = match serde_json::from_str(input_str) {
        Ok(val) => val,
        Err(_) => return 0,
    };

    // --- TRANSFORM LOGIC START ---
    // Add a field to prove we were here
    if let Some(obj) = v.as_object_mut() {
        obj.insert("wasm_processed".to_string(), serde_json::Value::Bool(true));
        obj.insert("processed_at".to_string(), serde_json::Value::String("Helios WASM".to_string()));
    }
    // --- TRANSFORM LOGIC END ---

    let output_string = serde_json::to_string(&v).unwrap_or_default();
    let output_len = output_string.len();
    let output_ptr = output_string.as_ptr();

    // Prevent deallocation of the output string so Host can read it
    mem::forget(output_string);

    // Pack ptr and len into a single u64 (high 32 bits = ptr, low 32 bits = len)
    // This is a common pattern for WASM ABIs to return 2 values
    ((output_ptr as u64) << 32) | (output_len as u64)
}
