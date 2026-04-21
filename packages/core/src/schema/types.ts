// Schema types
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'foreign'
  | 'file'
  | 'formula';

export type FieldDefinition = {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly options?: readonly string[];
  readonly foreignTable?: string;
  readonly formula?: string;
};

export type TableDefinition = {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly labelPlural: string;
  readonly icon?: string;
  readonly fields: readonly FieldDefinition[];
};

export type Schema = {
  readonly version: string;
  readonly tables: readonly TableDefinition[];
};