// Widget types
import type { FilterDefinition } from '../filters';
import type { ListViewConfig, KanbanViewConfig, CalendarViewConfig, ChartViewConfig } from '../views';

export type WidgetType =
  | 'list'
  | 'kanban'
  | 'calendar'
  | 'chart'
  | 'text'
  | 'image'
  | 'form'
  | 'metric'
  | 'divider';

export type Position = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type TextWidgetConfig = {
  readonly content: string;
};

export type ImageWidgetConfig = {
  readonly src: string;
  readonly alt?: string;
};

export type FormWidgetConfig = {
  readonly fields: readonly string[];
  readonly mode: 'create' | 'edit';
};

export type MetricWidgetConfig = {
  readonly label: string;
  readonly aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  readonly format?: 'number' | 'currency' | 'percentage';
};

export type DividerWidgetConfig = {
  readonly color?: string;
  readonly thickness?: number;
};

export type WidgetConfig =
  | ListViewConfig
  | KanbanViewConfig
  | CalendarViewConfig
  | ChartViewConfig
  | TextWidgetConfig
  | ImageWidgetConfig
  | FormWidgetConfig
  | MetricWidgetConfig
  | DividerWidgetConfig
  | Record<string, never>;

export type Widget = {
  readonly id: number;
  readonly viewId: number;
  readonly type: WidgetType;
  readonly sourceTable?: string;
  readonly sourceFilter?: FilterDefinition;
  readonly config: WidgetConfig;
  readonly position: Position;
  readonly sortOrder: number;
};