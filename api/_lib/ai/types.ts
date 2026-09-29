/** 各プロバイダ呼び出しが上流エラーを正規化して投げる共通エラー型。message はエラーコード。 */
export class AiProviderError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface AiImage {
  mimeType: string;
  /** base64(data: URI の接頭辞なし) */
  data: string;
}

export interface AiJsonRequest {
  system?: string;
  prompt: string;
  images?: AiImage[];
  /** 出力の JSON Schema。 */
  jsonSchema: object;
}

/**
 * どの生成 AI でも呼べるようにするための最小インターフェース。
 * 返り値は JSON.parse 済みの生の値(検証は呼び出し側で zod で行う)。
 * パース不能な出力は AiProviderError(502, "invalid_ai_output")。
 */
export interface AiProvider {
  readonly name: string;
  generateJson(req: AiJsonRequest): Promise<unknown>;
}
