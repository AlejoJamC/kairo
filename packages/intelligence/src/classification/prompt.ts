import type { EmailMessage } from './types';

export function buildPrompt(message: EmailMessage): string {
  return `Eres un asistente de clasificación de emails para un sistema de soporte técnico.

Analiza el siguiente email y clasifícalo según las instrucciones.

**Email:**
De: ${message.from}
Asunto: ${message.subject}
Cuerpo: ${message.body}

**Instrucciones:**

1. **tipo**:
   - "support" si el usuario necesita ayuda técnica o tiene un problema
   - "lead" si es una consulta de ventas o interés en comprar
   - "spam" si es irrelevante o publicidad no solicitada

2. **prioridad**:
   - "P1" si es urgente (sistema caído, error en producción, cliente bloqueado)
   - "P2" si es importante pero no urgente
   - "P3" si es normal

3. **categoria**:
   - "technical" para problemas técnicos
   - "billing" para facturación
   - "sales" para consultas de ventas
   - "other" para cualquier otra cosa

4. **sentimiento**:
   - "urgente" si el tono es apremiante o frustrado
   - "neutral" si el tono es profesional
   - "casual" si el tono es relajado

5. **razonamiento**: Explica brevemente por qué clasificaste así

6. **confianza**: Número 0-1 indicando qué tan seguro estás

Responde SOLO con JSON (sin markdown):
{
  "tipo": "support" | "lead" | "spam",
  "prioridad": "P1" | "P2" | "P3",
  "categoria": "technical" | "billing" | "sales" | "other",
  "sentimiento": "urgente" | "neutral" | "casual",
  "razonamiento": "string",
  "confianza": 0.95
}`;
}
