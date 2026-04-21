# @pane/react

The React presentation layer for the Pane ecosystem. `@pane/react` implements the **ViewRenderer contract** defined by `@pane/core`, providing React components for rendering views and widgets.

> **Note:** This package is intended for **internal use** within the Pane ecosystem. It is not yet published to npm, though that may change in the future.

---

## What It Is

`@pane/core` defines the **data structures** for views and widgets — types, schemas, and storage tables. `@pane/react` takes those structures and renders them as interactive React components.

```
@pane/core                    @pane/react
├── View, Widget types            ├── <ListWidget />
├── _views, _widgets tables       ├── <KanbanWidget />
├── Query functions               ├── <CalendarWidget />
└── ViewRenderer interface         ├── <ChartWidget />
                                   ├── <MetricWidget />
                                   ├── ... and more
```

---

## Architecture

### ViewRenderer Contract

`@pane/core` defines a `ViewRenderer` interface that `@pane/react` implements:

```typescript
// @pane/core: defines the contract
interface ViewRenderer {
  renderList(config: ListViewConfig, rows: Row[]): JSX.Element;
  renderKanban(config: KanbanViewConfig, rows: Row[]): JSX.Element;
  renderCalendar(config: CalendarViewConfig, rows: Row[]): JSX.Element;
  renderChart(config: ChartViewConfig, rows: Row[]): JSX.Element;
  renderText(config: TextWidgetConfig): JSX.Element;
  renderImage(config: ImageWidgetConfig): JSX.Element;
  renderForm(config: FormWidgetConfig, table: string): JSX.Element;
  renderMetric(config: MetricWidgetConfig, value: number): JSX.Element;
  renderDivider(): JSX.Element;
}
```

### Component Hierarchy

```
<PaneProvider>
└── <DocumentRenderer document={document}>
    └── <ViewSwitcher views={views} activeView={activeView}>
        ├── <ListView />
        ├── <KanbanView />
        ├── <CalendarView />
        ├── <ChartView />
        └── <CustomView>          // Widget canvas for 'custom' type
            ├── <WidgetContainer position={pos}>
            │   ├── <ListWidget />
            │   ├── <KanbanWidget />
            │   ├── <CalendarWidget />
            │   ├── <ChartWidget />
            │   ├── <MetricWidget />
            │   ├── <TextWidget />
            │   ├── <ImageWidget />
            │   ├── <FormWidget />
            │   └── <DividerWidget />
            └── </WidgetContainer>
    └── </ViewSwitcher>
```

---

## Widget Components

### ListWidget

Tabular display with sortable columns, search, and pagination.

```tsx
<ListWidget
  config={{
    columns: [
      { field: 'name', label: 'Name', width: 200 },
      { field: 'email', label: 'Email' },
      { field: 'department', label: 'Department' },
    ],
    sortable: true,
    searchable: true,
    pageSize: 25,
  }}
  rows={employees}
/>
```

Features:
- Column sorting (click header)
- Global search filter
- Pagination controls
- Row click handling
- Configurable column visibility

### KanbanWidget

Board with columns grouped by a field value (e.g., status).

```tsx
<KanbanWidget
  config={{
    groupByField: 'status',
    columns: [
      { value: 'todo', label: 'To Do', color: '#f59e0b' },
      { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
      { value: 'done', label: 'Done', color: '#22c55e' },
    ],
    cardFields: ['name', 'assigned_to', 'due_date'],
  }}
  rows={tasks}
/>
```

Features:
- Drag-and-drop cards between columns
- Card click handling
- Color-coded columns
- Configurable card fields

### CalendarWidget

Month/week/day display based on date fields.

```tsx
<CalendarWidget
  config={{
    dateField: 'start_date',
    endDateField: 'end_date',
    colorByField: 'type',
    defaultRange: 'month',
  }}
  rows={events}
/>
```

Features:
- Month/week/day navigation
- Event display on calendar cells
- Color-coding by field
- Click event to open detail

### ChartWidget

Bar, pie, line, or area charts for analytics.

```tsx
<ChartWidget
  config={{
    chartType: 'bar',
    xField: 'department',
    yField: 'count',
    aggregation: 'count',
    groupByField: 'status',
  }}
  rows={analyticsData}
/>
```

Features:
- Multiple chart types (bar, pie, line, area)
- Configurable axes and aggregation
- Click handling for data points

### MetricWidget

Single KPI display with optional trend indicator.

```tsx
<MetricWidget
  config={{
    label: 'Total Employees',
    aggregation: 'count',
    trendField: 'hire_date',
    format: 'number',
  }}
  value={24}
/>
```

Features:
- Large metric display
- Optional trend comparison
- Number/currency/percentage formatting

### TextWidget

Static text/markdown content block.

```tsx
<TextWidget config={{ content: '# Team Overview\n\nThis dashboard shows...' }} />
```

### ImageWidget

Image display from URL or file field.

```tsx
<ImageWidget config={{ src: 'logo.png', alt: 'Company Logo' }} />
```

### FormWidget

Data entry form for creating/editing records.

```tsx
<FormWidget
  config={{
    fields: ['name', 'email', 'department'],
    mode: 'create',
  }}
  table="employees"
/>
```

Features:
- Field validation (from schema)
- Submit/cancel actions
- Loading states

### DividerWidget

Visual separator for organizing widgets.

```tsx
<DividerWidget config={{ color: '#e5e7eb', thickness: 1 }} />
```

---

## Custom Views (Widget Canvas)

Custom views use a **12-column responsive grid** where users arrange widgets to build dashboards:

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                              │
│                                                         │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │  Employee Count  │  │  Recent Time Off Requests  │  │
│  │  ███████ 24      │  │  • Alice - Vacation (Jun)   │  │
│  └──────────────────┘  │  • Bob - Sick (May)         │  │
│                        └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Kanban: Equipment Status                       │    │
│  │  [Available] [In Use] [Broken] [Retired]        │    │
│  └──────────────────────────────────────────────────┘    │
│                                                         │
│  [+ Add Widget]                    [Edit Layout]         │
└─────────────────────────────────────────────────────────┘
```

### Grid System

```typescript
const GRID_COLUMNS = 12;
const ROW_HEIGHT = 80;  // pixels per grid row

// Position to CSS
const positionToStyle = (pos: Position): CSSProperties => ({
  gridColumn: `${pos.x + 1} / span ${pos.w}`,
  gridRow: `${pos.y + 1} / span ${pos.h}`,
  minHeight: pos.h * ROW_HEIGHT,
});
```

### Widget Interactions

| Interaction | Behavior |
|-------------|----------|
| Drag widget | Snap to nearest grid column on release |
| Resize handle | Adjust `w` and `h` in grid units |
| Click widget | Open widget settings panel |
| Delete widget | Remove from canvas with confirmation |

---

## Hooks

### useView

```tsx
const { activeView, setActiveView, views } = useView(document);
```

### useWidgetData

```tsx
const { rows, loading, error } = useWidgetData({
  db: document.db,
  widget: widget,
  schema: document.schema,
});
```

### useFilter

```tsx
const { filteredRows, setFilter, clearFilter } = useFilter({
  rows,
  filters: widget.config.filters,
});
```

---

## Dependencies

### Peer Dependencies

- `react` — ^18.0.0
- `@pane/core` — The core package

### Dependencies

- `jsep` — Expression parser for formula evaluation
- `date-fns` — Date manipulation for calendar
- `recharts` — Chart rendering (or similar)
- `react-dnd` — Drag and drop for kanban/canvas
- `styled-components` or `emotion` — Styling

---

## Roadmap

- [ ] Widget drag-and-drop with grid snapping
- [ ] Resize handles for widgets
- [ ] Widget settings panel (edit config inline)
- [ ] Cross-table data aggregation in metrics
- [ ] Export view as PDF/image
- [ ] Shareable view templates (save view as template)
- [ ] Undo/redo for canvas edits

---

## See Also

- [@pane/core](../core/README.md) — Core data structures and storage
- [ViewRenderer Contract](./view-renderer.md) — Detailed interface specification
