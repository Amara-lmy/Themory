declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseOptions {
    pagerender?: (pageData: any) => Promise<string>
    max?: number
  }
  interface PdfParseResult {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: unknown
    text: string
    version: string
  }
  function pdfParse(dataBuffer: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>
  export default pdfParse
}
