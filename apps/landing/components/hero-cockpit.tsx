"use client";

import { Avatar, Box, Button, Callout, DraftCard, Icon, NavItem, ProductFrame, PropRow, SourceList, Text, ThreadMessage, TicketRow, type IconName } from "@kairo/ui";

// The product, as it is: the same pieces the app is built from, with invented data.

const noop = () => {};

const SIDEBAR: { label: string; count?: number; icon: IconName; active?: boolean }[] = [
  { label: "Triage", count: 23, active: true, icon: "triage" },
  { label: "En Progreso", count: 7, icon: "activity" },
  { label: "Pendiente", count: 12, icon: "awaiting" },
  { label: "Resueltos", count: 184, icon: "resolved" },
  { label: "Clientes", icon: "clients" },
  { label: "KB", icon: "knowledge" },
  { label: "Insights", icon: "activity" },
];

const QUEUE = [
  { code: "KAI-T-1247", priority: "P1", sentiment: "frustrated", subject: "Cobro duplicado en factura", sender: "Marta Pérez", age: "2m", selected: true },
  { code: "KAI-T-1246", priority: "P1", sentiment: "frustrated", subject: "API devuelve 503 desde hace 20m", sender: "Diego Tovar", age: "4m" },
  { code: "KAI-T-1245", priority: "P2", sentiment: "neutral", subject: "¿Cómo cambio dominio de envío?", sender: "Luisa Romero", age: "11m" },
  { code: "KAI-T-1244", priority: "P2", sentiment: "positive", subject: "Interesados en Scale para 50 agentes", sender: "Andrés Núñez", age: "23m" },
  { code: "KAI-T-1243", priority: "P3", sentiment: "positive", subject: "Sugerencia: filtros guardados", sender: "Camila Ortega", age: "1h" },
] as const;

const SIMILAR = [
  { id: "a", kind: "similar", code: "KAI-T-0892", title: "Cargo duplicado · reembolso", meta: "0.94" },
  { id: "b", kind: "similar", code: "KAI-T-0814", title: "Doble cobro tras upgrade", meta: "0.91" },
  { id: "c", kind: "similar", code: "KAI-T-0701", title: "Factura monto erróneo", meta: "0.87" },
] as const;

export function HeroCockpit() {
  return (
    <ProductFrame label="Vista de triage de Kairo con la bandeja, un ticket y el contexto del cliente" route="holakairo.com/triage">
      <Box grid gridTemplateColumns="180px 300px 1fr 260px" height={460} position="relative">
        {/* Sidebar */}
        <Box borderRightWidth={1} borderStyle="solid" borderRightColor="var(--kairo-color-line)" padding={10} backgroundColor="var(--kairo-color-sunk)">
          {SIDEBAR.map((item) => (
            <NavItem key={item.label} icon={item.icon} label={item.label} count={item.count} active={item.active} onPress={noop} />
          ))}
        </Box>

        {/* Queue */}
        <Box borderRightWidth={1} borderStyle="solid" borderRightColor="var(--kairo-color-line)" overflow="hidden">
          <Box paddingVertical={10} paddingHorizontal={12} borderBottomWidth={1} borderStyle="solid" borderBottomColor="var(--kairo-color-line)" display="flex" justifyContent="space-between" alignItems="center">
            <Text font="mono" fontSize={11} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.55}>
              BANDEJA · 23
            </Text>
            <Icon name="sidebar" size={12} color="var(--kairo-color-faint)" />
          </Box>
          {QUEUE.map((item) => (
            <TicketRow
              key={item.code}
              code={item.code}
              subject={item.subject}
              priority={item.priority}
              age={item.age}
              sentiment={item.sentiment}
              sentimentLabel={item.sentiment}
              sender={item.sender}
              selected={"selected" in item ? item.selected : false}
              onPress={noop}
              ariaLabel={`${item.code} ${item.subject}`}
            />
          ))}
        </Box>

        {/* Center */}
        <Box display="flex" flexDirection="column" minWidth={0} backgroundColor="var(--kairo-color-sunk)">
          <Box paddingVertical={8} paddingHorizontal={14} borderBottomWidth={1} borderStyle="solid" borderBottomColor="var(--kairo-color-line)" display="flex" gap={8} alignItems="center" backgroundColor="var(--kairo-color-surface)">
            <Text font="mono" fontSize={11} fontWeight={500}>KAI-T-1247</Text>
            <Text font="mono" fontSize={11} color="var(--kairo-color-bad-ink)">P1</Text>
            <Text font="mono" fontSize={11} color="var(--kairo-color-muted)">Facturación</Text>
          </Box>
          <Box padding={16} flexGrow={1} flexShrink={1} flexBasis="0%" overflow="hidden" display="flex" flexDirection="column" gap={12}>
            <Text tag="div" display="block" fontSize={16} fontWeight={600} letterSpacing={-0.16} lineHeightRatio={1.25}>
              Cobro duplicado en factura de noviembre
            </Text>
            <Callout tone="ai" icon={<Icon name="spark" size={11} color="var(--kairo-color-accent)" />}>
              Triage clasificó como Facturación · Urgente · hace 2s
            </Callout>
            <ThreadMessage variant="initial" avatar={<Avatar name="Marta Pérez" seed="marta" size={28} />} name="Marta Pérez" meta="09:42">
              Vi en el panel que mi última factura tiene dos cargos por $199 con la misma fecha. Necesito esto resuelto hoy, tenemos cierre contable…
            </ThreadMessage>
            <DraftCard
              variant="web"
              badge="BORRADOR IA"
              heading="Re: Cobro duplicado en factura de noviembre"
              meta="5 casos similares · 0.94"
              body="Hola Marta, confirmamos el cargo duplicado en la orden 4729 y ya iniciamos el reembolso al método original…"
              actions={
                <>
                  <Button size="sm" onPress={noop}>Editar</Button>
                  <Button size="sm" variant="primary" onPress={noop}>Enviar y resolver</Button>
                </>
              }
            />
          </Box>
        </Box>

        {/* Right panel */}
        <Box borderLeftWidth={1} borderStyle="solid" borderLeftColor="var(--kairo-color-line)" padding={12}>
          <Text font="mono" fontSize={10} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.5}>
            CLIENTE
          </Text>
          <Box display="flex" gap={8} marginTop={8} marginBottom={10} alignItems="center">
            <Avatar name="Marta Pérez" seed="marta" size={32} />
            <Box>
              <Text tag="div" display="block" fontSize={12} fontWeight={500}>Marta Pérez</Text>
              <Text tag="div" display="block" color="var(--kairo-color-faint)" fontSize={10}>Acme · CFO</Text>
            </Box>
          </Box>
          <PropRow label="Plan" size="sm">Pro</PropRow>
          <PropRow label="MRR" size="sm" mono>$199</PropRow>
          <PropRow label="Tickets" size="sm" mono>34</PropRow>
          <PropRow label="CSAT" size="sm" mono last>4.8</PropRow>
          <Box marginTop={14}>
            <SourceList title="3 casos similares" items={SIMILAR} />
          </Box>
        </Box>
      </Box>
    </ProductFrame>
  );
}
