declare module "mammoth/mammoth.browser" {
  export type MammothResult = {
    value: string;
    messages?: unknown[];
  };

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
