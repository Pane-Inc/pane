// Primitive types
export type TableName = string;
export type RowId = number;

export type FieldValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Uint8Array;

export type Row = Record<string, FieldValue>;