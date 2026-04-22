# Views & Widgets

A **view** is how data is presented to the user. A **widget** is a visual block within a view. Together, they form the presentation layer of a `.pane` document.

> **Rendering:** `@pane/core` defines the data structures and storage for views/widgets. Actual rendering (React components, canvas interactions) is implemented in `@pane/react`.

## Overview

Users can:
- Use **built-in view types** (list, kanban, calendar, chart)
- **Compose custom views** by arranging widgets on a canvas (dashboard-like)
- Mix data from **multiple tables** in a single view (cross-table views)

## Architecture

```
View
├── type: 'list' | 'kanban' | 'calendar' | 'chart' | 'custom'
├── tableId: number | null       -- null = cross-table view
├── name: string
├── icon?: string
├── widgets: Widget[]             -- for 'custom' type views
└── config: ViewConfig          -- view-level settings

Widget
├── type: 'list' | 'kanban' | 'calendar' | 'chart' | 'text' | 'image' | 'form' | 'metric' | 'divider'
├── sourceTable?: string          -- which table to query
├── sourceFilter?: FilterDefinition
├── config: WidgetConfig          -- type-specific settings
└── position: { x, y, w, h }    -- canvas placement (for custom views)
```

## View Types

### List View

Tabular display with columns, sorting, search, and pagination.

```typescript
type ListViewConfig = {
  columns: readonly {
    field: string;
    label: string;
    width?: number;
    visible?: boolean;
  }[];
  sortable: boolean;
  searchable: boolean;
  pageSize: number;
  filters?: FilterDefinition[];
};
```

### Kanban View

Board with columns grouped by a field value (e.g., status: To Do → In Progress → Done).

```typescript
type KanbanViewConfig = {
  groupByField: string;           -- field to group by
  columns: readonly {
    value: string;
    label: string;
    color?: string;
  }[];
  cardFields: readonly string[];  -- fields shown on card
};
```

### Calendar View

Month/week/day display based on date fields.

```typescript
type CalendarViewConfig = {
  dateField: string;              -- start date
  endDateField?: string;          -- optional end date for events
  colorByField?: string;          -- field to color-code by
  defaultRange: 'month' | 'week' | 'day';
};
```

### Chart View

Bar, pie, line, or area charts for analytics.

```typescript
type ChartViewConfig = {
  chartType: 'bar' | 'pie' | 'line' | 'area';
  xField: string;                -- axis or label field
  yField: string;                -- value field
  groupByField?: string;         -- for multi-series charts
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
};
```

### Custom Views (Widget Composer)

Users arrange widgets on a grid canvas to build dashboards. The canvas uses a **12-column grid** with position values:

```typescript
type Position = {
  readonly x: number;  // column start (0-11)
  readonly y: number;   // row start
  readonly w: number;   // column width (1-12)
  readonly h: number;   // row height (in grid units)
};
```

## Widget Types

| Widget | Description | Data Source |
|--------|-------------|-------------|
| `list` | Tabular display | Table |
| `kanban` | Board by status | Table |
| `calendar` | Date-based events | Table |
| `chart` | Bar/pie/line charts | Table (aggregated) |
| `text` | Static text/markdown | None (static) |
| `image` | Image display | URL or file field |
| `form` | Data entry form | Table |
| `metric` | Single KPI display (`sum`, `avg`, `count`, `min`, `max`) | Table (aggregated) |
| `divider` | Visual separator | None (static) |

### Widget Config Types

```typescript
type TextWidgetConfig = {
  content: string;  // markdown supported
};

type ImageWidgetConfig = {
  src: string;
  alt?: string;
};

type MetricWidgetConfig = {
  label: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  format?: 'number' | 'currency' | 'percentage';
};

type DividerWidgetConfig = {
  color?: string;
  thickness?: number;
};
```

## Cross-Table Views

Views with `tableId: null` aggregate data from multiple tables:

```typescript
type CrossTableViewConfig = {
  widgets: readonly {
    widget: Widget;
    dataSource: {
      table: string;
      filter?: FilterDefinition;
      aggregation?: AggregationType;
    };
  }[];
};
```

Example: A dashboard showing:
- `metric` widget → `COUNT(*)` from `employees`
- `list` widget → `employees WHERE status = 'active' ORDER BY hire_date DESC LIMIT 5`
- `calendar` widget → `time_off WHERE year = current_year`

## Storage

Views and widgets are stored **inside the `.pane` file** in system tables:

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const views = sqliteTable('_views', {
  id: integer('_id').primaryKey().autoincrement(),
  tableId: integer('_table_id').references(() => tables.id),  // NULL for cross-table
  name: text('_name').notNull(),
  icon: text('_icon'),
  type: text('_type').notNull(),         // 'list', 'kanban', 'calendar', 'chart', 'custom'
  config: text('_config'),               // JSON: ViewConfig
  sortOrder: integer('_sort_order').default(0),
  createdAt: text('_created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
  index('_views_table_idx').on(table.tableId),
]);

export const widgets = sqliteTable('_widgets', {
  id: integer('_id').primaryKey().autoincrement(),
  viewId: integer('_view_id').references(() => views.id),
  type: text('_type').notNull(),          // widget type
  sourceTable: text('_source_table'),     // for data widgets
  sourceFilter: text('_source_filter'),  // JSON: FilterDefinition
  config: text('_config'),               // JSON: WidgetConfig
  position: text('_position'),          // JSON: Position
  sortOrder: integer('_sort_order').default(0),
}, (table) => [
  index('_widgets_view_idx').on(table.viewId),
]);
```

## Query Functions

```typescript
// Get all views for a table (or all cross-table views)
const getViews = (db: Database, tableId?: number): readonly View[];

// Get a single view with its widgets
const getViewById = (db: Database, viewId: number): View | null;

// Create or update a view
const saveView = (db: Database, view: View): number;

// Delete a view and its widgets
const deleteView = (db: Database, viewId: number): void;

// Get widgets for a view
const getWidgetsForView = (db: Database, viewId: number): readonly Widget[];
```

## Default Views

When a user creates a new table, `@pane/core` auto-generates a default list view:

```typescript
const createDefaultViewsForTable = (
  db: Database,
  table: TableDefinition
): number => {
  const viewId = saveView(db, {
    id: 0,
    tableId: table.id,
    name: table.labelPlural,
    icon: table.icon,
    type: 'list',
    widgets: [{
      id: 0,
      type: 'list',
      sourceTable: table.name,
      config: {
        columns: table.fields
          .filter(f => f.type !== 'file' && f.type !== 'formula')
          .map(f => ({ field: f.name, label: f.label })),
        sortable: true,
        searchable: true,
        pageSize: 25,
      },
      position: { x: 0, y: 0, w: 12, h: 8 },
    }],
    config: {},
  });

  return viewId;
};
```

## ViewRenderer Contract

`@pane/core` defines a `ViewRenderer` interface that presentation layers (like `@pane/react`) must implement:

```typescript
interface ViewRenderer {
  renderList(config: ListViewConfig, rows: Row[]): RendererElement;
  renderKanban(config: KanbanViewConfig, rows: Row[]): RendererElement;
  renderCalendar(config: CalendarViewConfig, rows: Row[]): RendererElement;
  renderChart(config: ChartViewConfig, rows: Row[]): RendererElement;
  renderText(config: TextWidgetConfig): RendererElement;
  renderImage(config: ImageWidgetConfig): RendererElement;
  renderForm(config: FormWidgetConfig, table: string): RendererElement;
  renderMetric(config: MetricWidgetConfig, value: number): RendererElement;
  renderDivider(config: DividerWidgetConfig): RendererElement;
}
```

## Filter Definition

Widgets can have optional filters:

```typescript
type FilterDefinition = {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown | readonly unknown[];
};

type FilterOperator =
  | 'eq'          // equals
  | 'neq'         // not equals
  | 'gt'          // greater than
  | 'lt'          // less than
  | 'gte'         // greater than or equal
  | 'lte'         // less than or equal
  | 'contains'    // string contains
  | 'startsWith'  // string starts with
  | 'endsWith'    // string ends with
  | 'in'          // value in array (value must be unknown[])
  | 'notIn'       // value not in array (value must be unknown[])
  | 'between'     // value between two values (value must be [min, max])
  | 'isNull'      // field is null (value ignored)
  | 'isNotNull';  // field is not null (value ignored)
```

**Operator-specific value requirements:**

| Operator | Value Type | Example |
|----------|------------|---------|
| `in`, `notIn` | `unknown[]` | `['Engineering', 'Sales']` |
| `between` | `[min, max]` | `['2023-01-01', '2023-12-31']` |
| `isNull`, `isNotNull` | (ignored) | — |
| All others | single value | `'Engineering'` |

**Examples:**

```typescript
// Single value
const filter1: FilterDefinition = {
  field: 'department',
  operator: 'eq',
  value: 'Engineering',
};

// IN clause
const filter2: FilterDefinition = {
  field: 'status',
  operator: 'in',
  value: ['active', 'pending'],
};

// BETWEEN for dates
const filter3: FilterDefinition = {
  field: 'hire_date',
  operator: 'between',
  value: ['2023-01-01', '2023-12-31'],
};
```

## See Also

- [@pane/react](../react/README.md) — React implementation of the ViewRenderer contract
