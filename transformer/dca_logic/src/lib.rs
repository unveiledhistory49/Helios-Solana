use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

// Persistent state across WASM calls (within the same engine instance)
static ACCUMULATED_AMOUNT: AtomicU64 = AtomicU64::new(0);
static DEPOSIT_COUNT: AtomicU64 = AtomicU64::new(0);

const BATCH_THRESHOLD_AMOUNT: u64 = 500_000_000; // 0.5 SOL
const BATCH_THRESHOLD_COUNT: u64 = 5;           // Or 5 deposits

#[derive(Deserialize, Serialize)]
struct HeliosEvent {
    #[serde(rename = "type")]
    event_type: String,
    parsed: Option<ParsedData>,
}

#[derive(Deserialize, Serialize)]
struct ParsedData {
    name: String,
    args: Option<serde_json::Value>,
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

    if let Ok(event) = serde_json::from_str::<HeliosEvent>(&input_str) {
        if let Some(parsed) = event.parsed {
            if parsed.name == "deposit" {
                let amount = parsed.args
                    .and_then(|a| a.get("amount").and_then(|v| v.as_u64()))
                    .unwrap_or(0);

                let current_amount = ACCUMULATED_AMOUNT.fetch_add(amount, Ordering::SeqCst) + amount;
                let current_count = DEPOSIT_COUNT.fetch_add(1, Ordering::SeqCst) + 1;

                // Trigger batch if either threshold is hit
                if current_amount >= BATCH_THRESHOLD_AMOUNT || current_count >= BATCH_THRESHOLD_COUNT {
                    // Reset accumulators for next batch
                    ACCUMULATED_AMOUNT.store(0, Ordering::SeqCst);
                    DEPOSIT_COUNT.store(0, Ordering::SeqCst);

                    // Return the event to trigger the webhook/executor
                    let result_ptr = input_data.as_ptr() as u64;
                    let result_len = input_data.len() as u64;
                    std::mem::forget(input_data);
                    return (result_ptr << 32) | result_len;
                }
            }
        }
    }

    std::mem::forget(input_data);
    0
}