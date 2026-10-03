// Shrinks a chosen photo in the browser before it's uploaded to a Space post, so the server only
// ever receives an already-reasonable JPEG (unlike the avatar crop, this keeps the original
// aspect ratio — a Wall photo shouldn't be forced into a square).
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export async function preparePostImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('เลือกไฟล์รูปภาพเท่านั้น (JPEG, PNG หรือ WebP)');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('ไฟล์รูปใหญ่เกินไป');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองไฟล์อื่น');
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแต่งรูป');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
  return blob;
}
