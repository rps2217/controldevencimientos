export type OperationalTaskCategory = 'ROTATIVO' | 'AUDITORIA' | 'PROVEEDOR' | 'REVISION' | 'OTRO';

export type RecurrenceRule = 'NONE' | 'MONTHLY_DATE' | 'WEEKLY';

export interface OperationalTask {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  category: OperationalTaskCategory;
  isRecurring: boolean;
  recurrenceRule: RecurrenceRule;
  recurrenceDay?: number; // 1-31 for MONTHLY_DATE, or 0-6 for WEEKLY
  completed: boolean;
  completedAt?: string;
  assignedTo?: string;
  createdAt: string;
}

export interface DayCalendarSummary {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  expiringItemsCount: number;
  criticalItemsCount: number;
  operationalTasks: OperationalTask[];
}
