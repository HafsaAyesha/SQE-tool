import type { RawTable, ParseOptions } from '../schema';
export interface ImportAdapter {
  id: string;
  label: string;
  /** Lucide icon name. Descriptors cross the server/client boundary without functions. */
  icon: string;
  accepts: { extensions: string[]; mimeTypes: string[] };
  kind: 'structured' | 'ai' | 'media' | 'online';
  parse(input: File | Buffer | string, options?: ParseOptions): Promise<RawTable>;
}
export type AdapterDescriptor = Omit<ImportAdapter, 'parse'>;
