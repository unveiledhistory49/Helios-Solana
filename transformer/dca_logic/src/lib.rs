use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

// Persistent state
static ACCUMULATED_AMOUNT: AtomicU64 = AtomicU64::new(0);
const THRESHOLD: u64 = 1_000_000_000; // 1.0 SOL

#[derive(Deserialize, Serialize)]
struct HeliosEvent {
    #[serde(rename = "type")]
    event_type: String,
    data: String,
}

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn transform(ptr: *mut u8, len: usize) -> u64 {
    let input_data = unsafe { Vec::from_raw_parts(ptr, len, len) };
    let input_str = String::from_utf8_lossy(&input_data);

    // 1. Parse Event
    if let Ok(event) = serde_json::from_str::<HeliosEvent>(&input_str) {
        if event.event_type == "account_change" {
             // Mock increment: 0.1 SOL
            let amount = 100_000_000;
            let current = ACCUMULATED_AMOUNT.fetch_add(amount, Ordering::SeqCst) + amount;

            if current >= THRESHOLD {
                ACCUMULATED_AMOUNT.store(0, Ordering::SeqCst);
                let result_ptr = input_data.as_ptr() as u64;
                let result_len = input_data.len() as u64;
                std::mem::forget(input_data);
                return (result_ptr << 32) | result_len;
            }
        }
    }

    std::mem::forget(input_data);
    0
}