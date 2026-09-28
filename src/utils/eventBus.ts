type EventCallback<T = any> = (data: T) => void;

export interface ToastPayload {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  duration?: number;
}

export interface AppEvents {
  'barcode:scanned': string;
  'toast:show': ToastPayload;
  'offline:status_change': boolean;
  'sync:completed': { count: number; errors: string[] };
  'sheet:data_loaded': void;
}

class AppEventBus {
  private listeners: Record<string, EventCallback[]> = {};

  /**
   * Suscribe to an event. Returns an unsubscribe function.
   */
  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event.
   */
  off<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Broadcast an event to all subscribers.
   */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Error in event listener for event "${event}":`, err);
      }
    });
  }
}

export const eventBus = new AppEventBus();
