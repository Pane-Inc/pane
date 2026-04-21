// View types
import type { FilterDefinition } from '../filters';
import type { Widget } from '../widgets';

export type ViewType = 'list' | 'kanban' | 'calendar' | 'chart' | 'custom';

export type ListViewConfig = {
  readonly columns: readonly {
    readonly field: string;
    readonly label: string;
    readonly width?: number;
    readonly visible?: boolean;
  }[];
  readonly sortable: boolean;
  readonly searchable: boolean;
  readonly pageSize: number;
  readonly filters?: readonly FilterDefinition[];
};

export type KanbanViewConfig = {
  readonly groupByField: string;
  readonly columns: readonly {
    readonly value: string;
    readonly label: string;
    readonly color?: string;
  }[];
  readonly cardFields: readonly string[];
};

export type CalendarViewConfig = {
  readonly dateField: string;
  readonly endDateField?: string;
  readonly colorByField?: string;
  readonly defaultRange: 'month' | 'week' | 'day';
};

export type ChartViewConfig = {
  readonly chartType: 'bar' | 'pie' | 'line' | 'area';
  readonly xField: string;
  readonly yField: string;
  readonly groupByField?: string;
  readonly aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
};

export type ViewConfig =
  | ListViewConfig
  | KanbanViewConfig
  | CalendarViewConfig
  | ChartViewConfig
  | Record<string, never>;

export type View = {
  readonly id: number;
  readonly tableId: number | null;
  readonly name: string;
  readonly icon?: string;
  readonly type: ViewType;
  readonly config: ViewConfig;
  readonly widgets: readonly Widget[];
  readonly sortOrder: number;
};