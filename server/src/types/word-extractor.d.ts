declare module 'word-extractor' {
  export class WordDocument {
    getBody(): string
    getFootnotes(): string
    getEndnotes(): string
    getHeaders(): string
    getFooters(): string
  }
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<WordDocument>
  }
}
