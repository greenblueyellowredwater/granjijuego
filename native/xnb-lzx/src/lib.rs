use lzxd::{Lzxd, WindowSize};

const DEFAULT_FRAME: usize = 0x8000;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub unsafe extern "C" fn decompress_xnb(src: *const u8, src_len: usize, dst: *mut u8, dst_len: usize) -> i32 {
    let input = std::slice::from_raw_parts(src, src_len);
    let output = std::slice::from_raw_parts_mut(dst, dst_len);
    match decompress(input, output) {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn decompress(input: &[u8], output: &mut [u8]) -> Result<(), i32> {
    let mut lzx = Lzxd::new(WindowSize::KB64);
    let mut pos = 0;
    let mut written = 0;
    while pos + 2 <= input.len() && written < output.len() {
        let mut frame = DEFAULT_FRAME;
        let block;
        if input[pos] == 0xFF {
            if pos + 5 > input.len() {
                return Err(-1);
            }
            frame = (input[pos + 1] as usize) << 8 | input[pos + 2] as usize;
            block = (input[pos + 3] as usize) << 8 | input[pos + 4] as usize;
            pos += 5;
        } else {
            block = (input[pos] as usize) << 8 | input[pos + 1] as usize;
            pos += 2;
        }
        if block == 0 || frame == 0 {
            break;
        }
        if pos + block > input.len() {
            return Err(-2);
        }
        let frame = frame.min(output.len() - written);
        let chunk = lzx.decompress_next(&input[pos..pos + block], frame).map_err(|_| -3)?;
        output[written..written + chunk.len()].copy_from_slice(chunk);
        written += chunk.len();
        pos += block;
    }
    if written == output.len() { Ok(()) } else { Err(-4) }
}
