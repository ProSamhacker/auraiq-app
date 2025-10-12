declare module 'pptx-parser' {
    export function parse(buffer: Buffer): Promise<{
        slides: Array<{
            text: string[];
            images: Buffer[];
            notes?: string[];
        }>;
    }>;
    export function extractText(buffer: Buffer): Promise<string>;
    export function extractImages(buffer: Buffer): Promise<Buffer[]>;
}