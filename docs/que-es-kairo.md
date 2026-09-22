# Qué es Kairo hoy

*Una descripción en lenguaje sencillo del producto tal como está construido en este momento. Está escrita para personas que no leen código. Explica qué funciona hoy, qué está construido pero apagado y qué aparece en pantalla sin ser real todavía.*

🇬🇧 [English version](what-is-kairo.md)

---

## En un párrafo

Kairo es un espacio de trabajo para equipos de soporte al cliente que reciben las solicitudes por correo electrónico. Se conecta el buzón de Gmail de la empresa y Kairo lee cada correo que entra, aparta lo que no sirve y convierte el resto en **tickets**. Para cada ticket decide qué es el correo (una solicitud de un cliente, un posible cliente, correo interno u otra cosa), qué tan importante y qué tan urgente es, y en qué estado de ánimo escribe el remitente. Después ordena toda la cola para que quien la abra vea de un vistazo qué atender primero. Los agentes responden a los clientes desde Kairo (la respuesta sale desde el Gmail de la propia empresa, dentro del mismo hilo de correo), dejan notas privadas para sus compañeros, escalan los casos difíciles y corrigen a Kairo cuando se equivoca. La idea central es una **confianza que se gana paso a paso**: la IA propone, una persona decide, y la IA solo actúa sola donde ha demostrado ser fiable. Hoy esa autonomía es pequeña a propósito.

---

## Para quién es

- **Equipos de soporte** de empresas pequeñas y medianas que reciben más correo del que pueden leer, empezando por equipos de habla hispana.
- **El agente**, que trabaja la cola todos los días.
- **El supervisor o el dueño**, que necesita saber que no se está quedando nada urgente sin atender y que se cumplen los tiempos de respuesta.

---

## El recorrido, desde el registro hasta el uso diario

### 1. Registro

Un usuario nuevo crea su cuenta con Google o con correo y contraseña. La primera persona que se registra queda como **propietaria** de un espacio de trabajo nuevo para su empresa (Kairo lo llama *cuenta*). Kairo resuelve solo los casos habituales: alguien que vuelve a entrar, alguien que ya tiene cuenta con el mismo correo, alguien a quien invitaron a un equipo existente y un usuario completamente nuevo.

Después, un asistente de configuración breve pide el nombre de la organización.

### 2. Conexión del buzón

Hoy Gmail es el único canal. La persona propietaria autoriza a Kairo en la pantalla de permisos estándar de Google. Desde ese momento Kairo puede leer el buzón y, cuando un agente decide responder, enviar correo desde él.

### 3. La primera revisión del buzón

Justo después de conectar, Kairo hace una primera revisión por etapas para que el equipo vea resultados rápido:

1. **Primer ticket inmediato.** El correo más reciente se clasifica al instante, para que el panel no aparezca vacío.
2. **Las últimas dos semanas** se clasifican en segundo plano.
3. **El correo más antiguo, hasta unos tres meses atrás**, se procesa después, por lotes.

Esta primera revisión se hace una sola vez por empresa y no se repite en los inicios de sesión posteriores.

### 4. El día a día

- Kairo revisa cada buzón conectado **aproximadamente cada cinco minutos** y procesa el correo nuevo de la misma forma.
- Los agentes pueden pulsar **Sincronizar** para forzar una revisión inmediata.
- La cola se actualiza **en vivo**: los tickets nuevos y los cambios de estado aparecen sin recargar la página.

---

## Cómo lee Kairo un correo

Esta es la parte central del producto. Cada correo que entra pasa por los pasos siguientes.

### Paso 1 — ¿Debe ser un ticket?

Antes de usar la IA, un conjunto de reglas fijas decide si el correo pertenece a la cola. Las reglas se aplican en un orden establecido:

- **Spam.** Si el servidor de correo que lo recibió ya lo marcó como spam, Kairo le cree. Es instantáneo y no cuesta nada; en las pruebas internas de Kairo acertó tanto como los modelos de IA y fue muchísimo más rápido.
- **Las respuestas y los asuntos urgentes siempre pasan.** Una respuesta dentro de una conversación existente nunca se descarta por las reglas que siguen.
- **Remitentes automáticos, notificaciones de sistemas, correo generado automáticamente y las pestañas promocionales de Gmail** quedan fuera de la cola.

Cada correo que queda fuera se guarda con el motivo, para poder revisarlo después. No se pierde nada en silencio.

Los correos entre direcciones de la propia empresa **ya no** se descartan. Antes sí se descartaban, y resultó que eso ocultaba al sistema la mayor parte del correo interno de la empresa. Ahora pasan por la clasificación como cualquier otro.

### Paso 2 — ¿Qué es este correo?

La IA lee el correo (asunto, remitente, destinatarios, en qué punto de la conversación está, los nombres de los archivos adjuntos y el cuerpo sin el historial citado) junto con dos datos de la empresa: **qué buzón se está leyendo** y **a qué se dedica la empresa**, en una descripción breve. Ese segundo dato importa, porque el mismo correo puede ser un problema de un cliente para un negocio y la oferta de un proveedor para otro.

En lugar de pedirle a la IA que elija una etiqueta de entrada, Kairo le hace dos preguntas sencillas que responde bien:

1. **¿Requiere que alguien haga algo?** ¿O es solo informativo?
2. **¿De qué trata?** Una de cuatro respuestas:
   - el servicio que la empresa presta a sus clientes;
   - alguien que quiere **comprarle** a la empresa;
   - alguien que quiere **venderle** a la empresa;
   - la administración propia de la empresa (contratación, trámites, cumplimiento normativo, alertas de sus propios sistemas).

Después Kairo combina esas dos respuestas con **el origen del correo** (de fuera de la empresa, de otra dirección de la empresa o del propio buzón conectado) mediante una tabla fija. El resultado es el **tipo de ticket**:

| Tipo de ticket | Qué significa |
|---|---|
| **Soporte** | Un asunto de un cliente sobre el servicio. Es la razón de ser de la cola |
| **Prospecto** | Alguien que quiere ser cliente (una solicitud de cotización, una invitación a licitar) |
| **Interno** | Asuntos internos de la propia empresa |
| **Otro** | Ofertas de proveedores, publicidad, invitaciones a eventos |
| **Spam** | Solo lo asigna la regla de spam del paso 1, nunca la IA |

Kairo decide el tipo de esta manera, y no pidiéndole a la IA que lo adivine, por una razón. Cuando se le preguntaba directamente, la IA mezclaba dos preguntas distintas y respondía de forma inconsistente; sobre todo confundía a quien quiere comprar con quien quiere vender. Una tabla fija da la misma respuesta siempre y cualquiera puede revisarla.

### Paso 3 — Importancia, urgencia y estado de ánimo

La IA también devuelve:

- **Prioridad (P1 / P2 / P3):** qué tan grave es el caso. P1 significa que ya hubo una pérdida, un incumplimiento o un bloqueo, o que el cliente ha pedido lo mismo varias veces sin respuesta.
- **Urgencia (alta / media / baja):** cuánto tiempo queda para actuar. Se mide aparte de la prioridad a propósito: un caso muy grave cuyo desenlace ya ocurrió puede ser importante sin ser urgente.
- **Categoría:** la prestación del servicio, dinero (facturación, reembolsos), acceso y cuentas, información general o no aplica. "Técnico" significa *que el servicio no se prestó bien*, sea lo que sea lo que venda la empresa; no se limita a problemas informáticos.
- **Tono:** agresivo, frustrado, neutral o positivo. La frustración se juzga por la **insistencia**, no por la cortesía: un correo amable de alguien que reclama lo mismo por tercera vez cuenta como frustrado.
- **Una explicación de una o dos frases** sobre la decisión, en el idioma del correo.
- **Un nivel de confianza** de 0 a 1.

### Paso 4 — Una segunda opinión (opcional)

Kairo puede configurarse para hacerle las mismas preguntas a un **segundo modelo de IA distinto**. Si los dos no coinciden en el tipo de ticket, Kairo no da por buena ninguna de las dos respuestas y el ticket pasa a una persona.

### Paso 5 — ¿La decisión se aplica sola o espera a una persona?

Cada clasificación se guarda como una **propuesta** con uno de dos resultados: *aprobada automáticamente* o *pendiente de una persona*. Hoy las reglas son prudentes a propósito:

- En la primera revisión del buzón, solo los correos de **Soporte** se aprueban automáticamente, porque las pruebas internas de Kairo mostraron que acierta en ese caso bastante más del 90 % de las veces. Todos los demás tipos esperan a una persona. Aquí el error peligroso es esconder una solicitud real de un cliente, y Kairo no corre ese riesgo.
- Para el resto del correo, un tipo solo se aprueba automáticamente cuando la empresa se lo ha **ganado**: el tipo debe alcanzar una precisión medida (90 % por defecto) sobre un número mínimo de casos (30 por defecto), y Kairo debe saber a qué se dedica la empresa. Las reglas para esto ya existen, pero la medición automática que lo activaría todavía no está en marcha. **En la práctica, hoy esas clasificaciones esperan a una persona.**
- Si los dos modelos de IA no coincidieron, el ticket siempre espera a una persona.

### Idiomas

Las instrucciones que usa la IA de Kairo existen en **español e inglés**. El idioma se configura para cada empresa. Por defecto es español.

### Cuando el servicio de IA falla

- Cada correo tiene varios intentos, con pausas cada vez más largas entre ellos.
- Si fallan muchos correos seguidos, Kairo entiende que el servicio de IA está caído y deja de mandarle trabajo en esa ronda, en lugar de acumular errores y costos.
- Cada 30 minutos se reintentan automáticamente los correos que fallaron por un problema pasajero. Los que no pueden salir bien nunca quedan marcados como tales, con su contenido guardado.
- Ningún correo se pierde por un fallo.

---

## Cómo se ordena la cola

Cada ticket recibe una **puntuación de prioridad** entre 0 y 1 que combina cuatro factores:

| Factor | Peso por defecto | Idea |
|---|---|---|
| Tipo de ticket | 30 % | Soporte puntúa alto; interno y otro, bajo |
| Plan del cliente | 35 % | Enterprise por encima de Pro y de Starter; los clientes sin plan tienen un tope |
| Estado de ánimo del remitente | 20 % | Agresivo y frustrado por encima de neutral y positivo |
| Tiempo de espera | 15 % | Aumenta a lo largo de 48 horas |

Los clientes que han escrito cinco veces o más en los últimos 30 días reciben un impulso adicional. Cada empresa puede ajustar estos pesos.

La cola se ordena por esa puntuación, después por P1/P2/P3 y, por último, de más antiguo a más reciente.

### Tiempos de respuesta por prioridad

Cada empresa define, para P1, P2 y P3, un tiempo máximo para la primera respuesta, un tiempo mínimo, un punto de alerta y un punto de escalamiento. El tiempo corre las 24 horas, los 7 días de la semana. Cada ticket muestra cuánto tiempo le queda o cuánto va de retraso, y la ficha del cliente muestra cuántos de sus tickets anteriores se pasaron del tiempo.

Existe además un nivel de tiempo de respuesta distinto, más antiguo, que viene del **contrato del cliente** y se define en el directorio de clientes. Se mantienen separados a propósito: uno depende de lo urgente que es el ticket y el otro de lo que el cliente contrató.

---

## Trabajar un ticket: el panel

### Las vistas principales

- **Triage:** la cola activa (tickets nuevos, en curso y reabiertos).
- **Esperando respuesta:** tickets en los que un agente respondió y el cliente aún no contesta.
- **Escalados:** casos escalados que necesitan atención prioritaria.
- **Resueltos:** tickets cerrados, en modo de solo lectura.
- **Clientes:** el directorio de clientes.
- **Configuración.**

La barra lateral muestra un contador en vivo para cada vista.

### Qué muestra cada tarjeta de ticket

La prioridad, el tiempo que queda frente al objetivo de respuesta (o el retraso), el estado de ánimo del remitente, la confianza de la IA, hace cuánto llegó y si está agrupado con tickets similares.

### Dentro de un ticket

- **La conversación completa**, con los mensajes del cliente, las respuestas de los agentes y las notas internas en un solo hilo.
- **Responder.** El agente escribe y envía. La respuesta sale desde el Gmail de la empresa **dentro de la conversación de correo original**, con un diseño de correo de marca. Kairo muestra si se está enviando, si se envió o si falló. Si la conexión con Gmail caducó, pide al agente que la reconecte, y el texto nunca se pierde.
- **Enviar y resolver.** Responde y cierra el ticket en un solo paso, con un diseño de correo de "caso resuelto".
- **Acciones rápidas:** atender (tomar el ticket), resolver y escalar (con un motivo opcional).
- **Plantillas de respuesta.** Textos predefinidos para respuestas frecuentes, con campos variables como el nombre del cliente.
- **"¿Clasificación incorrecta?"** El agente puede corregir el tipo, la prioridad, la categoría o el estado de ánimo, con una nota opcional. La corrección se guarda junto a lo que dijo la IA y el ticket muestra la etiqueta "Corregido". Con estas correcciones Kairo mide su propia precisión en cada empresa.
- **Panel lateral** (pestañas que se pueden activar o desactivar):
  - **Cliente:** quién es, su plan, cuántos tickets ha enviado en total y en el mes, si es un cliente recurrente, sus tickets recientes y su historial frente a los tiempos de respuesta.
  - **Similares:** casos resueltos anteriores parecidos a este y cómo se resolvieron. Con un clic se lleva una resolución anterior a la respuesta.
  - **Artículos:** artículos relacionados de la base de conocimiento, que también se pueden llevar a la respuesta.
  - **Escalar:** motivos que Kairo sugiere para escalar (tiempo de respuesta en riesgo, un cliente enterprise esperando demasiado, frustración repetida, un error técnico repetido, un caso similar que antes necesitó un nivel superior), con un nivel sugerido.
  - **Notas:** las notas internas del ticket.

### Notas internas y @menciones

Los agentes pueden escribir **notas internas** en un ticket que el cliente nunca ve. Al escribir **@** se menciona a un compañero, que recibe una notificación dentro de la aplicación (nunca por correo). Una campana en la barra superior muestra la actividad, lo no leído y las menciones.

### Agrupación e historial relacionado

Los agentes pueden seleccionar varios tickets y **agruparlos** cuando tratan del mismo problema, y Kairo también sugiere grupos. Un panel de **historial relacionado** muestra casos anteriores similares.

### El ciclo de vida de un ticket

Un ticket llega **abierto**. Desde ahí puede tomarse (**en curso**), responderse y quedar **esperando al cliente**, **escalarse** o **resolverse**. Cuando el cliente vuelve a escribir:

- un ticket que esperaba su respuesta vuelve a **en curso**;
- un ticket resuelto se **reabre**;
- una respuesta a un ticket **cerrado** definitivamente no lo reabre, pero queda registrada para que no desaparezca.

También existe un estado reservado para "resuelto por la IA", pero **hoy nada lo asigna**. Kairo no resuelve tickets por su cuenta.

Cada cambio de estado, cada clasificación y cada corrección se guardan en un **historial permanente que no se puede editar**, con quién o qué lo hizo, y la propia base de datos rechaza los cambios de estado que no cumplan estas reglas. De cualquier decisión se puede saber qué la produjo y con qué versión de las reglas y de las instrucciones de la IA.

---

## Correos automáticos a los clientes

| Correo | Estado hoy |
|---|---|
| **Respuesta automática fuera de horario:** se envía cuando llega un ticket nuevo fuera del horario de soporte de la empresa | **Siempre activa.** Cada empresa puede definir su horario; si no lo define, se aplica un horario diurno de lunes a sábado por defecto. Solo se envía para correo reciente (no para correo antiguo traído por una sincronización) y una sola vez por conversación |
| **Respuesta del agente** (diseño de marca) | Activa |
| **Caso resuelto** (diseño de marca, usado por "Enviar y resolver") | Activa |
| **Acuse de recibo** "recibimos tu solicitud", con el número de ticket | Construido, **apagado** por defecto. Si se activa, reemplaza a la respuesta fuera de horario para que el cliente nunca reciba dos correos automáticos |
| **Encuesta de satisfacción** | Diseñada, **nunca se envía** (todavía nada la dispara) |
| **Aviso de escalamiento** | Diseñado, **nunca se envía** |

Cada correo saliente lleva una referencia del ticket en el asunto para que las respuestas queden en el mismo hilo. **La IA nunca envía nada por sí misma.** Todo mensaje al cliente lo escribe y lo envía una persona, o es uno de los correos automáticos fijos de la tabla.

---

## Clientes y contactos

- **Directorio de clientes:** empresas con identificador interno, identificación legal, teléfono, plan, nivel contractual de tiempo de respuesta, los correos autorizados para escribir en su nombre y las personas de contacto. Se pueden crear, editar y eliminar.
- **Contactos detectados automáticamente:** Kairo puede proponer contactos nuevos que encuentra en el correo entrante, como *borradores* para que una persona los confirme o los rechace. Deja fuera las direcciones de la propia empresa y a quienes solo aparecen en copia de correos masivos. Esta detección está construida pero **apagada por defecto**, y las acciones de confirmar, rechazar y editar borradores aún no están terminadas.
- Los correos y los teléfonos se normalizan a un formato estándar para no contar dos veces a la misma persona.

---

## Equipos, empresas y permisos

- **Muchas empresas en una misma plataforma.** Los datos de cada empresa están completamente separados de los de las demás a nivel de base de datos.
- **Roles:** propietario, administrador, supervisor y agente. Hoy los cuatro pueden hacer todas las acciones del día a día sobre un ticket; solo el cierre definitivo queda reservado al sistema. Las reglas de permisos están preparadas para poder restringirse más adelante con un cambio pequeño.
- **Invitaciones:** propietarios y administradores pueden invitar personas mediante un enlace. La página de invitación funciona, pero todavía no hay un botón para invitar desde el panel.
- **Planes** en los registros internos del producto: Starter (por defecto), Pro y Enterprise, cada uno con un límite de puestos. Todavía **no hay facturación ni pagos** en el producto.

---

## Supervisión del sistema

El equipo detrás de Kairo puede seguir su funcionamiento con detalle. Cada llamada a la IA (qué se preguntó, la respuesta, cuánto tardó, el costo, a qué ticket y a qué empresa correspondía) y cada decisión automática (filtrado, tipo de ticket, aprobación automática) se registran en dos herramientas de monitoreo con tableros ya preparados. Hoy esas herramientas funcionan en los equipos del propio equipo, no como un servicio de producción alojado.

El equipo también mantiene un **banco de evaluación interno**: pasa un conjunto de correos reales etiquetados a mano por los mismos pasos que usa producción y mide con qué frecuencia Kairo acierta cada campo. Muchas de las decisiones de diseño de este documento, como creerle al filtro de spam, separar a quien compra de quien vende y aprobar automáticamente solo Soporte al principio, salieron directamente de esas mediciones.

---

## Otras partes del producto

- **Sitio web público:** página principal, precios, política de privacidad, términos del servicio, inicio de sesión, registro y el asistente de configuración, en inglés y español.
- **Consola interna de administración (Kelan):** una herramienta aparte para el equipo de Kairo, no para los clientes. Hoy tiene un acceso seguro restringido al personal autorizado; su panel es provisional.
- **Aplicación móvil:** por ahora solo una pantalla provisional.
- **Idiomas del panel:** inglés y español, según el idioma del navegador.

---

## Decisiones clave detrás del producto

1. **La IA propone, una persona decide.** La autonomía se concede por empresa y por tipo de ticket según la precisión medida. Nadie la asigna a mano y se puede retirar.
2. **La IA nunca envía correos ni resuelve tickets por su cuenta.**
3. **Primero, la señal fiable más barata.** Si una regla fija o el servidor de correo ya conocen la respuesta (spam, remitentes automáticos), no se usa la IA.
4. **Preguntarle a la IA solo lo que responde bien.** Dos preguntas sencillas y una tabla fija son más consistentes que una sola etiqueta compleja.
5. **No se confía en la confianza que la IA declara sobre sí misma para decidir.** Las mediciones mostraron que no distingue las respuestas correctas de las incorrectas. Lo que cuenta es la precisión medida frente a las decisiones de las personas.
6. **Clasificar por lo que pide el remitente, no por el sector.** Kairo tiene que servir igual a una empresa de logística, a una clínica o a una de software, por eso se le indica a qué se dedica cada empresa.
7. **Todo se puede rastrear.** Cada decisión se guarda con sus datos de entrada y la versión de las reglas que la produjo, y el historial de un ticket nunca se puede reescribir.
8. **Nada se descarta en silencio.** El correo filtrado conserva su motivo, el correo que falla se reintenta y el cliente que escribe a un caso cerrado queda registrado.
9. **La importancia y la urgencia son cosas distintas**, y cada una se mide por separado.
10. **Las respuestas se mantienen en la conversación de correo del cliente**, enviadas desde la dirección de la propia empresa.
11. **Las notas internas nunca llegan al cliente**, y las menciones solo notifican dentro de la aplicación.
12. **Las funciones con riesgo salen apagadas** y se activan en cada entorno cuando están listas.

---

## Construido, pero apagado por defecto

- El correo de **acuse de recibo** "recibimos tu solicitud".
- Los **contactos detectados automáticamente** en el correo entrante.
- Las **alertas automáticas dentro de la aplicación** cuando un ticket supera su punto de escalamiento por tiempo de respuesta.
- El paso de **"detección" en vivo** del asistente de configuración.
- En el panel, cada una de estas cosas se puede activar o desactivar: las pestañas del panel lateral (cliente, similares, artículos, escalar, asistente), la **agrupación de tickets**, **"Asignarme"** y toda la función de **notas internas**.
- El **segundo modelo de IA** para la segunda opinión.

---

## En pantalla, pero todavía no es real

Estas partes del producto son diseños o simulaciones, no funciones que operen:

- **El chat del asistente de IA** del panel lateral. Sus respuestas son ejemplos preescritos; todavía no consulta a ninguna IA.
- **Respuestas redactadas por la IA.** El sistema puede generar una respuesta sugerida a partir de casos similares y de la base de conocimiento, pero el panel todavía no la solicita ni la muestra. Hoy el agente solo puede insertar una resolución anterior o un artículo.
- En **Configuración**, la lista del equipo, la lista de herramientas conectadas y la sección *Motor de triage* (niveles, umbral de resolución automática, categorías personalizadas) son ilustrativas: cambiarlas no tiene efecto. *Base de conocimiento*, *Facturación* y *API y Webhooks* aparecen como "en construcción". La verificación en dos pasos aparece como "próximamente". Lo que sí funciona en Configuración: el nombre del espacio de trabajo, los tiempos de respuesta por prioridad, la conexión con Gmail y la gestión de la contraseña.
- La vista **"En curso"** es provisional.
- Las **opciones de triage del asistente de configuración** (clasificar automáticamente, redactar respuestas, resolver el spam automáticamente, priorizar planes de pago) no se guardan; solo se guarda el nombre de la organización.
- La **descripción de la empresa** en la que se apoya la IA todavía no tiene pantalla; se configura directamente en el sistema.
- **No hay una pantalla para revisar** las clasificaciones "pendientes de una persona". Hoy se revisan corrigiendo los tickets.
- El **panel de Kelan** y la **aplicación móvil**.

---

## Dónde el sitio web promete más de lo que hace el producto

El sitio web describe hacia dónde va Kairo, no solo lo que hace hoy. Para quien tenga que explicar el producto, estas son las diferencias:

- **Canales:** el sitio menciona Slack, WhatsApp, Telegram e Instagram. Solo existe Gmail.
- **Resolución automática:** el sitio y la configuración describen el archivado automático del spam y la resolución de tickets por encima de un umbral de confianza. Kairo deja el spam fuera de la cola, pero **no resuelve tickets** por su cuenta.
- **Textos de privacidad:** la política de privacidad y la pantalla de conexión con Gmail dicen que Kairo nunca envía correos y que solo lee. En el producto, los agentes envían respuestas desde Kairo y la respuesta automática fuera de horario está siempre activa.
- **Planes y precios:** el sitio muestra Free, Pro, Scale y Enterprise, con límites de tickets y precios. El producto registra Starter, Pro y Enterprise, y no tiene facturación, límites de uso ni pagos.
- **Funciones enterprise** como el inicio de sesión único (SAML, SCIM), la instalación en servidores propios, la API y los webhooks, las alertas por Slack, o los datos de ingresos y satisfacción en la ficha del cliente, no están construidas.
- **Promesas de velocidad e idioma** (primer ticket priorizado en menos de 60 segundos, modelos ajustados a variantes regionales del español) son objetivos. Las instrucciones de la IA de Kairo existen en español e inglés, sin variantes regionales.

---

## Glosario

- **Cuenta / espacio de trabajo:** una empresa que usa Kairo, con sus propios usuarios, buzones y datos.
- **Ticket:** un asunto de un cliente creado a partir de uno o varios correos de la misma conversación.
- **Tipo de ticket:** soporte, prospecto, interno, otro o spam.
- **Prioridad (P1–P3):** qué tan grave es un caso.
- **Urgencia:** cuánto tiempo queda para actuar.
- **Puntuación de prioridad:** el número de 0 a 1 con el que se ordena la cola.
- **Propuesta:** la clasificación de la IA, aprobada automáticamente o pendiente de una persona.
- **Escalamiento:** pasar un caso a un nivel superior para darle atención prioritaria.
- **Nota interna:** un comentario que solo ve el equipo.
- **Tiempo de respuesta objetivo (SLA):** el tiempo máximo permitido para la primera respuesta, definido por prioridad.
