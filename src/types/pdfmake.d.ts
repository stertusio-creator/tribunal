declare module "pdfmake/build/pdfmake" {
  interface PdfFile {
    getBlob(): Promise<Blob>;
    getBuffer(): Promise<Uint8Array>;
    download(filename?: string): Promise<void>;
  }

  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(docDefinition: unknown): PdfFile;
  }

  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const vfs: Record<string, string>;
  export default vfs;
}
