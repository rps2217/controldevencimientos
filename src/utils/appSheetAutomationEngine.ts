import { InventoryItem } from '../types';
import { evaluateBooleanCondition } from './appSheetFormulaEngine';

export type AutomationTrigger = 'ON_ITEM_CREATE' | 'ON_ITEM_UPDATE' | 'ON_EXPIRY_CRITICAL' | 'ON_INCIDENCE_LOGGED';
export type AutomationActionType = 'WHATSAPP_ALERT' | 'CREATE_TASK' | 'IN_APP_NOTIFICATION' | 'WEBHOOK_DISPATCH';

export interface AutomationBotRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditionExpression: string; // e.g. "FRC_EVEN = 'TRANSPORTE' OR CANTIDAD < 0"
  actionType: AutomationActionType;
  actionPayloadTemplate: string; // e.g. "Incidencia crítica detectada en SKU [SKU]: [DESCRIPCION]"
  enabled: boolean;
  executionCount: number;
  lastExecutedAt?: string;
}

export const DEFAULT_AUTOMATION_BOTS: AutomationBotRule[] = [
  {
    id: 'bot-transporte-urgent',
    name: 'Alerta Automática de Transporte Crítico',
    description: 'Dispara una notificación y prepara alerta cuando se registra una incidencia de transporte.',
    trigger: 'ON_INCIDENCE_LOGGED',
    conditionExpression: "FRC_EVEN = 'TRANSPORTE'",
    actionType: 'IN_APP_NOTIFICATION',
    actionPayloadTemplate: '¡Incidencia de Transporte registrada para SKU [SKU] - [DESCRIPCION]!',
    enabled: true,
    executionCount: 0
  },
  {
    id: 'bot-expiry-drain',
    name: 'Bot de Drenaje por Vencimiento Próximo',
    description: 'Detecta ítems en zona de retiro inminente y genera registro de tarea operativa.',
    trigger: 'ON_EXPIRY_CRITICAL',
    conditionExpression: "CANTIDAD > 0",
    actionType: 'CREATE_TASK',
    actionPayloadTemplate: 'Revisar liquidación para ítem próximo a vencer: [SKU]',
    enabled: true,
    executionCount: 0
  }
];

export interface BotExecutionLogEntry {
  id: string;
  botId: string;
  botName: string;
  triggeredAt: string;
  itemSku: string;
  actionType: AutomationActionType;
  resultMessage: string;
  success: boolean;
}

/**
 * Evaluate active automation bots against an inventory item mutation event
 */
export function evaluateAutomationBots(
  item: InventoryItem,
  trigger: AutomationTrigger,
  bots: AutomationBotRule[] = DEFAULT_AUTOMATION_BOTS
): BotExecutionLogEntry[] {
  const logs: BotExecutionLogEntry[] = [];
  
  bots.forEach(bot => {
    if (!bot.enabled) return;
    if (bot.trigger !== trigger) return;
    
    // Evaluate condition using formula engine boolean evaluator
    let matches = true;
    if (bot.conditionExpression && bot.conditionExpression.trim()) {
      try {
        matches = evaluateBooleanCondition(bot.conditionExpression, { row: item as Record<string, string> });
      } catch (err) {
        console.warn(`Error evaluating bot condition [${bot.name}]:`, err);
        matches = false;
      }
    }
    
    if (matches) {
      // Interpolate payload template
      let message = bot.actionPayloadTemplate;
      Object.entries(item).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          message = message.replace(new RegExp(`\\[${key}\\]`, 'gi'), String(val));
        }
      });
      
      logs.push({
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        botId: bot.id,
        botName: bot.name,
        triggeredAt: new Date().toISOString(),
        itemSku: item.SKU || item.sku || 'N/A',
        actionType: bot.actionType,
        resultMessage: message,
        success: true
      });
      
      bot.executionCount++;
      bot.lastExecutedAt = new Date().toISOString();
    }
  });
  
  return logs;
}
