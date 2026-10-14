"use client";
export interface CompressedReceipt { blob: Blob; width: number; height: number; exceptional: boolean }
/** The proof is compressed before persistence/upload; originals never reach R2. */
export async function compressReceipt(file: File, readable = false): Promise<CompressedReceipt> {
  if (!file.type.startsWith("image/")) throw new Error("Elige una foto del comprobante.");
  if (file.size > 25 * 1024 * 1024) throw new Error("La foto es demasiado grande. Recórtala o tómala nuevamente.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxSide = readable ? 1600 : 1000;
    let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no puede preparar esta foto. Usa un navegador actualizado.");
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.75));
      if (!blob || blob.type !== "image/webp") throw new Error("Tu navegador no admite WebP. Usa un navegador actualizado.");
      if (readable || blob.size < 100 * 1024 || Math.max(canvas.width, canvas.height) <= 700) break;
      scale *= 0.85;
    }
    if (!blob) throw new Error("No pudimos preparar la foto. Inténtalo nuevamente.");
    if (blob.size > 500 * 1024) throw new Error("El comprobante supera 500 KB. Recorta la foto dejando los datos bancarios visibles.");
    return { blob, width: canvas.width, height: canvas.height, exceptional: readable || blob.size >= 100 * 1024 };
  } finally { bitmap.close(); }
}
