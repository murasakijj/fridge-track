import { ApiError, authHeader, readError } from "./apiClient";
import { fitWithin } from "../../shared/receipt.js";
import type { AiReceiptItem } from "../../shared/receipt.js";

/** 送信前に画像の長辺をこの値に縮小する(JPEG)。 */
export const MAX_IMAGE_SIDE = 1600;
/** base64 の上限。サーバー上限(4MB)と Vercel のボディ上限(約 4.5MB)に余裕を持たせる。 */
const MAX_BASE64_CHARS = 3_500_000;

export interface ResizedImage {
  mimeType: "image/jpeg";
  data: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // 下のフォールバックへ
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** 画像を長辺 1600px 以下の JPEG に縮小して base64 にする。 */
export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await loadBitmap(file);
  const srcW = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const srcH = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const { width, height } = fitWithin(srcW, srcH, MAX_IMAGE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", quality),
    );
    if (!blob) throw new Error("encode_failed");
    const data = await blobToBase64(blob);
    if (data.length <= MAX_BASE64_CHARS)
      return { mimeType: "image/jpeg", data };
  }
  throw new Error("image_too_large");
}

export interface ReceiptParseResponse {
  purchased_at?: string;
  items: AiReceiptItem[];
}

/** /api/receipt-parse を呼ぶ。解析結果を返すだけで、何も保存されない。 */
export async function parseReceiptImage(
  image: ResizedImage,
  foodItems: { id: string; name: string; base_unit: string }[],
): Promise<ReceiptParseResponse> {
  const headers = await authHeader();
  const res = await fetch("/api/receipt-parse", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ image, foodItems }),
    signal: AbortSignal.timeout(65_000),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as ReceiptParseResponse;
}

/** エラーコードを利用者向けの日本語メッセージにする。 */
export function receiptErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Vercel のボディ上限超過は JSON でない 413 が返る。
    if (err.status === 413 || err.message === "payload_too_large") {
      return "画像が大きすぎます。別の画像でお試しください。";
    }
    switch (err.message) {
      case "rate_limited":
        return "AI の利用上限に達しました。しばらく待ってからやり直してください。";
      case "overloaded":
        return "AI が混み合っています。少し待ってからやり直してください。";
      case "upstream_error":
        return "AI との通信に失敗しました。時間をおいてやり直してください。";
      case "invalid_ai_output":
        return "レシートをうまく読み取れませんでした。明るい場所で撮り直してください。";
      case "invalid_body":
        return "画像の形式またはサイズに問題があります。別の画像でお試しください。";
      case "unauthorized":
      case "invalid_token":
      case "missing_token":
        return "認証が切れました。再度ログインしてください。";
      case "forbidden":
        return "アクセス権がありません。";
      default:
        return "レシートの解析に失敗しました。もう一度お試しください。";
    }
  }
  if (err instanceof Error) {
    if (err.message === "image_too_large") {
      return "画像が大きすぎます。別の画像でお試しください。";
    }
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "解析に時間がかかりすぎました。もう一度お試しください。";
    }
  }
  return "レシートの解析に失敗しました。通信状態を確認してください。";
}
