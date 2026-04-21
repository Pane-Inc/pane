// Filter types
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn'
  | 'between'
  | 'isNull'
  | 'isNotNull';

export type FilterDefinition = {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown | readonly unknown[];
};