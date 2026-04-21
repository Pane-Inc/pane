import * as _deessejs_fp from '@deessejs/fp';
import { Result, Maybe, Unit } from '@deessejs/fp';

type TableName = string;
type RowId = number;
type FieldValue = string | number | boolean | null | Date | Uint8Array;
type Row = Record<string, FieldValue>;

declare const FileLockedError: _deessejs_fp.ErrorBuilder<{
    holderId: string;
    holderName?: string | undefined;
}>;
type FileLockedError = ReturnType<typeof FileLockedError>;
declare const LockExpiredError: _deessejs_fp.ErrorBuilder<Record<string, never>>;
type LockExpiredError = ReturnType<typeof LockExpiredError>;
declare const SchemaMismatchError: _deessejs_fp.ErrorBuilder<{
    documentVersion: string;
    supportedVersion: string;
}>;
type SchemaMismatchError = ReturnType<typeof SchemaMismatchError>;
declare const ValidationError: _deessejs_fp.ErrorBuilder<{
    field: string;
    reason: string;
}>;
type ValidationError = ReturnType<typeof ValidationError>;
declare const WriteError: _deessejs_fp.ErrorBuilder<{
    reason: string;
}>;
type WriteError = ReturnType<typeof WriteError>;
declare const LockWriteError: _deessejs_fp.ErrorBuilder<{
    reason: string;
}>;
type LockWriteError = ReturnType<typeof LockWriteError>;
declare const LockNotFoundError: _deessejs_fp.ErrorBuilder<Record<string, never>>;
type LockNotFoundError = ReturnType<typeof LockNotFoundError>;
type PaneError = FileLockedError | LockExpiredError | SchemaMismatchError | ValidationError | WriteError | LockWriteError | LockNotFoundError;

type LockHandle = {
    readonly path: string;
    readonly holderId: string;
    readonly holderName?: string;
    readonly acquiredAt: Date;
    readonly expiresAt: Date;
};
type LockResult = Result<LockHandle, FileLockedError | LockExpiredError>;
type LockFileContent = {
    holderId: string;
    holderName?: string;
    acquiredAt: string;
    expiresAt: string;
};
type AcquireLockOptions = {
    readonly path: string;
    readonly holderName?: string;
};
type ReleaseLockOptions = {
    readonly lock: LockHandle;
};
type RefreshLockOptions = {
    readonly lock: LockHandle;
};

declare const acquireLock: (options: AcquireLockOptions) => Result<LockHandle, FileLockedError | LockWriteError>;
declare const releaseLock: (options: ReleaseLockOptions) => Result<Unit, LockWriteError>;
declare const refreshLock: (options: RefreshLockOptions) => Result<LockHandle, LockNotFoundError | LockWriteError>;
declare const isLockStale: (expiresAt: string) => Maybe<boolean>;
declare const checkLockStatus: (filePath: string) => Maybe<{
    isLocked: boolean;
    isStale: boolean;
    holder?: LockFileContent;
}>;

type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'multiselect' | 'foreign' | 'file' | 'formula';
type FieldDefinition = {
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
type TableDefinition = {
    readonly id: number;
    readonly name: string;
    readonly label: string;
    readonly labelPlural: string;
    readonly icon?: string;
    readonly fields: readonly FieldDefinition[];
};
type Schema = {
    readonly version: string;
    readonly tables: readonly TableDefinition[];
};

type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'between' | 'isNull' | 'isNotNull';
type FilterDefinition = {
    readonly field: string;
    readonly operator: FilterOperator;
    readonly value: unknown | readonly unknown[];
};

type WidgetType = 'list' | 'kanban' | 'calendar' | 'chart' | 'text' | 'image' | 'form' | 'metric' | 'divider';
type Position = {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
};
type TextWidgetConfig = {
    readonly content: string;
};
type ImageWidgetConfig = {
    readonly src: string;
    readonly alt?: string;
};
type FormWidgetConfig = {
    readonly fields: readonly string[];
    readonly mode: 'create' | 'edit';
};
type MetricWidgetConfig = {
    readonly label: string;
    readonly aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
    readonly format?: 'number' | 'currency' | 'percentage';
};
type DividerWidgetConfig = {
    readonly color?: string;
    readonly thickness?: number;
};
type WidgetConfig = ListViewConfig | KanbanViewConfig | CalendarViewConfig | ChartViewConfig | TextWidgetConfig | ImageWidgetConfig | FormWidgetConfig | MetricWidgetConfig | DividerWidgetConfig | Record<string, never>;
type Widget = {
    readonly id: number;
    readonly viewId: number;
    readonly type: WidgetType;
    readonly sourceTable?: string;
    readonly sourceFilter?: FilterDefinition;
    readonly config: WidgetConfig;
    readonly position: Position;
    readonly sortOrder: number;
};

type ViewType = 'list' | 'kanban' | 'calendar' | 'chart' | 'custom';
type ListViewConfig = {
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
type KanbanViewConfig = {
    readonly groupByField: string;
    readonly columns: readonly {
        readonly value: string;
        readonly label: string;
        readonly color?: string;
    }[];
    readonly cardFields: readonly string[];
};
type CalendarViewConfig = {
    readonly dateField: string;
    readonly endDateField?: string;
    readonly colorByField?: string;
    readonly defaultRange: 'month' | 'week' | 'day';
};
type ChartViewConfig = {
    readonly chartType: 'bar' | 'pie' | 'line' | 'area';
    readonly xField: string;
    readonly yField: string;
    readonly groupByField?: string;
    readonly aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
};
type ViewConfig = ListViewConfig | KanbanViewConfig | CalendarViewConfig | ChartViewConfig | Record<string, never>;
type View = {
    readonly id: number;
    readonly tableId: number | null;
    readonly name: string;
    readonly icon?: string;
    readonly type: ViewType;
    readonly config: ViewConfig;
    readonly widgets: readonly Widget[];
    readonly sortOrder: number;
};

type DocumentHandle = {
    readonly path: string;
    readonly schema: Schema;
    readonly lock: Maybe<LockHandle>;
};
type DocumentResult = Result<DocumentHandle, PaneError | LockExpiredError>;
type OpenOptions = {
    readonly path: string;
    readonly readOnly?: boolean;
};
type CreateOptions = {
    readonly path: string;
    readonly name?: string;
    readonly version?: string;
};

type Pane = {
    readonly path: string;
    readonly schema: Schema;
    readonly lock: Maybe<LockHandle>;
    readonly isReadOnly: boolean;
    read: (table: string, options?: ReadOptions) => _deessejs_fp.Result<readonly Row[], _deessejs_fp.Error>;
    create: (table: string, values: Row) => _deessejs_fp.Result<number, _deessejs_fp.Error>;
    update: (table: string, id: number, values: Row) => _deessejs_fp.Result<void, _deessejs_fp.Error>;
    delete: (table: string, id: number) => _deessejs_fp.Result<void, _deessejs_fp.Error>;
    upsert: (table: string, values: Row, matchFields: readonly string[]) => _deessejs_fp.Result<number, _deessejs_fp.Error>;
    addTable: (definition: TableDefinition) => _deessejs_fp.Result<number, _deessejs_fp.Error>;
    addField: (tableId: number, definition: FieldDefinition) => _deessejs_fp.Result<number, _deessejs_fp.Error>;
    addView: (tableId: number | null, definition: ViewDefinition) => _deessejs_fp.Result<number, _deessejs_fp.Error>;
    commit: () => _deessejs_fp.Result<void, _deessejs_fp.Error>;
    close: () => _deessejs_fp.Result<void, _deessejs_fp.Error>;
};
type ReadOptions = {
    readonly where?: FilterDefinition;
    readonly orderBy?: readonly OrderBy[];
    readonly limit?: number;
    readonly offset?: number;
};
type OrderBy = {
    readonly field: string;
    readonly direction: 'asc' | 'desc';
};
type ViewDefinition = {
    readonly name: string;
    readonly icon?: string;
    readonly type: 'list' | 'kanban' | 'calendar' | 'chart' | 'custom';
    readonly config: Record<string, unknown>;
};
type CreatePaneOptions = {
    readonly path: string;
    readonly name?: string;
    readonly version?: string;
    readonly overwrite?: boolean;
};
type OpenPaneOptions = {
    readonly path: string;
    readonly readOnly?: boolean;
};

declare const openPane: (options: OpenPaneOptions) => {
    ok: true;
    value: Pane;
} | {
    ok: false;
    error: unknown;
};
declare const createPane: (options: CreatePaneOptions) => {
    ok: true;
    value: Pane;
} | {
    ok: false;
    error: unknown;
};

export { type AcquireLockOptions, type CalendarViewConfig, type ChartViewConfig, type CreateOptions, type CreatePaneOptions, type DividerWidgetConfig, type DocumentHandle, type DocumentResult, type FieldDefinition, type FieldType, type FieldValue, FileLockedError, type FilterDefinition, type FilterOperator, type FormWidgetConfig, type ImageWidgetConfig, type KanbanViewConfig, type ListViewConfig, LockExpiredError, type LockFileContent, type LockHandle, LockNotFoundError, type LockResult, LockWriteError, type MetricWidgetConfig, type OpenOptions, type OpenPaneOptions, type OrderBy, type Pane, type PaneError, type Position, type ReadOptions, type RefreshLockOptions, type ReleaseLockOptions, type Row, type RowId, type Schema, SchemaMismatchError, type TableDefinition, type TableName, type TextWidgetConfig, ValidationError, type View, type ViewConfig, type ViewDefinition, type ViewType, type Widget, type WidgetConfig, type WidgetType, WriteError, acquireLock, checkLockStatus, createPane, isLockStale, openPane, refreshLock, releaseLock };
