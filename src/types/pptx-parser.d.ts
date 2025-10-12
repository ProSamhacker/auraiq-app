declare module 'pptx-parser' {
    export function parse(buffer: Buffer): Promise<any>;
    export function extractText(buffer: Buffer): Promise<string>;
    export function extractImages(buffer: Buffer): Promise<Buffer[]>;
}