# Qué es Kairo hoy

*Una descripción en lenguaje sencillo de qué hace Kairo y cómo lo hace. Está escrita para personas que no leen código. Al final dice qué parte funciona en toda cuenta, qué parte se enciende por configuración y qué sigue en construcción.*

🇬🇧 [English version](what-is-kairo.md)

---

## En pocas palabras

Kairo ordena el correo de soporte de una empresa, aprende de su negocio y ayuda a su equipo a responder bien.

La empresa conecta su buzón de Gmail. Kairo lee cada correo que llega, aparta lo que no es un asunto por atender y convierte el resto en **tickets**. De cada ticket dice qué tipo de asunto es, qué tan grave es, cuánto tiempo hay para atenderlo y con qué ánimo escribe el cliente. Con eso ordena la bandeja, para que quien la abra sepa por dónde empezar.

El equipo responde desde Kairo, y la respuesta sale desde el Gmail de la empresa, en el mismo hilo del cliente. Mientras tanto Kairo va guardando lo que la empresa sabe: cómo resuelve cada tipo de caso, qué políticas aplica, qué le ha pasado a cada cliente. Ese conocimiento vuelve a aparecer cuando llega un caso parecido.

Dos reglas sostienen todo lo demás:

- **La IA propone y una persona decide.** Kairo solo actúa por su cuenta en lo que ha demostrado hacer bien, y una corrección le quita ese permiso.
- **Una respuesta correcta vale más que una rápida y equivocada.** Kairo no inventa soluciones, y ninguna respuesta que redacte sale sin que alguien la revise.

---

## El problema que resuelve

En muchas empresas el soporte vive en un correo compartido. La clave del buzón pasa de mano en mano, la lista de clientes está en un Excel que alguien reenvía y cada persona responde como puede, a veces con un texto modelo que le mandó un compañero. Funciona hasta que un correo se queda sin responsable o dos personas le contestan cosas distintas al mismo cliente.

Lo que más se pierde no se ve. Cada caso resuelto enseña algo sobre el negocio y sobre el cliente, y ese aprendizaje no queda en ninguna parte. El caso siguiente empieza de cero.

Kairo pone ese trabajo en un solo lugar, le da orden y conserva lo aprendido.

---

## Para quién es

Para empresas pequeñas y medianas que atienden a sus clientes por correo, empezando por Colombia. Sirve igual en tres momentos de una misma empresa:

- **El dueño que responde solo.** Todos los tickets le llegan a él, ya ordenados.
- **El equipo pequeño.** Cada persona entra con su usuario y los tickets se reparten por turnos.
- **El equipo con líder de soporte.** Quien responde por el servicio ve qué va al día y qué se está quedando.

---

## Cómo funciona

Atender un correo son cuatro trabajos: leerlo, entender qué pide el cliente, decidir qué tan urgente es y responder. Kairo hace los tres primeros y ayuda con el cuarto.

| Paso | Quién lo hace | Qué pasa |
|---|---|---|
| **1. Leer** | Kairo | Revisa el buzón, deja fuera lo que no es un asunto por atender y crea un ticket por cada conversación |
| **2. Entender** | Kairo | Dice qué tipo de asunto es, su prioridad, su urgencia y el ánimo del cliente, con una explicación corta |
| **3. Ordenar** | Kairo | Pone primero lo que no da espera y le asigna un responsable a cada ticket |
| **4. Responder** | El equipo | Responde con el caso ya entendido, y con casos parecidos y conocimiento a la mano |

Las cuatro secciones siguientes explican cada paso.

---

## 1. Kairo lee el correo

### Conectar el buzón

Una persona crea su cuenta con Google o con correo y contraseña. La primera que se registra queda como **propietaria** del espacio de trabajo de su empresa. Kairo resuelve solo los casos habituales: alguien que vuelve a entrar, alguien que ya tiene cuenta con el mismo correo y alguien a quien invitaron a un equipo que ya existe.

Después la propietaria autoriza a Kairo en la pantalla de permisos de Google. Kairo pide dos permisos: leer el buzón y enviar correo desde él. No puede borrar ni modificar los correos.

Hoy Gmail es el único canal.

### La primera revisión del buzón

Apenas se conecta el buzón, Kairo lo revisa en tres etapas. La revisión se hace una sola vez por empresa.

| Etapa | Qué correo revisa | Cómo | ¿Hay alguien mirando? |
|---|---|---|---|
| **Primera** | Los 30 correos más recientes | Uno tras otro, del más nuevo al más antiguo, para que la bandeja no aparezca vacía | Sí. La persona está en la configuración inicial |
| **Segunda** | Los últimos 15 días | En segundo plano | No |
| **Tercera** | El correo más antiguo, hasta unos tres meses atrás | Después, por lotes | No |

Esa diferencia importa más adelante: Kairo se permite menos cuando nadie está mirando.

### El día a día

- Kairo revisa cada buzón conectado cada cinco minutos.
- Quien atiende puede pulsar **Sincronizar Gmail** para revisar de inmediato.
- La bandeja se actualiza sola. Los tickets nuevos y los cambios de estado aparecen sin recargar la página.

### Qué correo queda fuera de la bandeja

Antes de usar la IA, unas reglas fijas deciden si un correo entra. Se aplican en este orden:

1. **Spam.** Si el servidor de correo ya lo marcó como spam, Kairo le cree. En las pruebas internas esa señal acertó tanto como los modelos de IA, al instante y sin costo.
2. **Las respuestas y los asuntos urgentes siempre entran.** Una respuesta dentro de una conversación que ya existe, o un correo con asunto urgente, nunca se descarta por las reglas que siguen.
3. **Remitentes automáticos.** Direcciones "no-reply" y envíos masivos que llegan de fuera.
4. **Invitaciones de calendario y comprobantes de sistemas.**
5. **Las pestañas Promociones y Social de Gmail.**
6. **Correo generado automáticamente.**

Cada correo que queda fuera se guarda con su motivo, para poder revisarlo después. Nada se descarta en silencio.

El correo entre direcciones de la propia empresa sí entra a la clasificación. Antes se descartaba, y eso le ocultaba a Kairo casi todo el correo interno.

### Cuando el servicio de IA falla

- Cada correo tiene varios intentos, con pausas cada vez más largas.
- Si fallan muchos seguidos, Kairo entiende que el servicio está caído y deja de mandarle trabajo en esa ronda.
- Cada 30 minutos reintenta los correos que fallaron por un problema pasajero.
- Ningún correo se pierde por un fallo.

---

## 2. Kairo entiende cada correo

### Qué tipo de asunto es

Kairo no le pide a la IA que escoja una etiqueta. Le hace dos preguntas sencillas, que responde bien:

1. **¿Si nadie contesta este correo, queda algo sin hacer?**
2. **¿De qué trata?** Hay cuatro respuestas posibles:
   - el servicio que la empresa les presta a sus clientes;
   - alguien que quiere **comprarle** a la empresa;
   - alguien que quiere **venderle** a la empresa;
   - la administración de la propia empresa (contratación, trámites, alertas de sus sistemas).

Después combina las dos respuestas con **el origen del correo** (de fuera, de otra dirección de la empresa o del propio buzón conectado) usando una tabla fija. El resultado es el **tipo de ticket**:

| Tipo | Qué significa |
|---|---|
| **Soporte** | Un asunto de un cliente sobre el servicio. Para esto existe la bandeja |
| **Prospecto** | Alguien que quiere ser cliente: una cotización, una invitación a licitar |
| **Interno** | Asuntos de la propia empresa |
| **Otro** | Ofertas de proveedores, publicidad, invitaciones a eventos |

Kairo lo hace así por una razón medida. Cuando se le pedía la etiqueta directamente, la IA mezclaba las dos preguntas y confundía sobre todo a quien quiere comprar con quien quiere vender. Una tabla fija responde siempre igual y cualquiera puede revisarla.

### A qué se dedica la empresa

Para responder la segunda pregunta, la IA necesita saber qué hace la empresa. El mismo correo puede ser el problema de un cliente para un negocio y la oferta de un proveedor para otro.

Esa descripción se escribe en el último paso de la configuración inicial o en **Configuración › Espacio de trabajo**. Kairo también puede proponerla a partir de los primeros correos, para que una persona la apruebe.

Kairo clasifica por lo que pide el remitente y no por el sector. Tiene que servirle igual a una empresa de logística, a una clínica o a una de software.

### Qué tan grave, qué tan urgente y con qué ánimo

De cada correo la IA también devuelve:

- **Prioridad (P1, P2 o P3):** qué tan grave es. P1 significa que ya hubo una pérdida, un incumplimiento o un bloqueo, o que el cliente ha pedido lo mismo varias veces sin respuesta.
- **Urgencia (alta, media o baja):** cuánto tiempo queda para actuar. Se mide aparte de la prioridad, porque un caso grave cuyo desenlace ya ocurrió es importante sin ser urgente.
- **Categoría:** la prestación del servicio, dinero (facturación, reembolsos), acceso y cuentas, información general o no aplica.
- **Tono:** agresivo, frustrado, neutral o positivo. La frustración se mide por la insistencia y no por la cortesía. Un correo amable de alguien que reclama lo mismo por tercera vez cuenta como frustrado.
- **Una explicación** de una o dos frases, en el idioma del correo.
- **Un nivel de confianza** de 0 a 1. Kairo lo guarda, pero no lo usa para decidir: las mediciones mostraron que ese número no distingue los aciertos de los errores.

Las instrucciones de la IA existen en español y en inglés. El idioma se define por empresa y el español es el valor por defecto.

### Cuándo una clasificación queda en firme

Cada clasificación se guarda como una **propuesta**, en uno de dos estados: *aprobada por la IA* o *por revisar*.

- **En la primera etapa de la revisión inicial**, solo los correos de **Soporte** quedan aprobados sin revisión. En las pruebas internas Kairo acertó en ese tipo entre el 92 % y el 97 % de las veces. Los demás tipos esperan a una persona, porque ahí el error grave es esconder la solicitud real de un cliente.
- **En la segunda y la tercera etapa**, que corren sin nadie mirando, un tipo solo queda aprobado si la empresa ya se lo **ganó**: 90 % de aciertos sobre al menos 30 revisiones, medidos en las 50 revisiones más recientes de ese tipo. Además Kairo tiene que saber a qué se dedica la empresa.
- **Kairo puede pedir una segunda opinión** a otro modelo de IA. Si los dos no coinciden en el tipo, el ticket siempre espera a una persona.

La vista **Clasificación IA** muestra las propuestas en dos pestañas, *Por revisar* y *Aprobadas por la IA*. Confirmar o rechazar una propuesta es lo que le enseña a Kairo cuándo puede dejar de preguntar.

---

## 3. Kairo ordena la bandeja

### El orden

Cada ticket recibe una puntuación entre 0 y 1 que combina cuatro factores:

| Factor | Peso por defecto | Idea |
|---|---|---|
| Tipo de ticket | 30 % | Soporte puntúa alto; interno y otro, bajo |
| Plan del cliente | 35 % | Enterprise por encima de Pro y de Starter; un cliente sin plan tiene un tope |
| Ánimo del remitente | 20 % | Agresivo y frustrado por encima de neutral y positivo |
| Tiempo de espera | 15 % | Sube durante las primeras 48 horas |

Un cliente que ha escrito cinco veces o más en los últimos 30 días recibe un impulso adicional. La bandeja se ordena por esa puntuación, después por P1, P2 y P3 y, al final, del más antiguo al más reciente.

### Los plazos de respuesta

Cada empresa define, para P1, P2 y P3, cuatro tiempos: el máximo para la primera respuesta, un mínimo, un punto de alerta y un punto de escalamiento. Cada ticket muestra cuánto le queda o cuánto lleva vencido. La ficha del cliente muestra cuántos de sus tickets anteriores se pasaron del plazo.

Hay un segundo nivel de plazo, distinto, que viene del **contrato del cliente** y se define en el directorio de clientes. Se mantienen separados a propósito: uno depende de qué tan urgente es el ticket y el otro de lo que el cliente contrató.

### Quién responde cada ticket

Cada ticket nuevo llega con responsable. Kairo lo asigna por turnos entre los miembros activos del equipo, empezando por quien lleva más tiempo sin recibir uno. Si la empresa tiene un solo miembro, todos los tickets van a esa persona.

### Las vistas

| Vista | Qué muestra |
|---|---|
| **Triage** | La bandeja activa: tickets nuevos, en curso y reabiertos |
| **En espera del cliente** | Tickets que el equipo ya respondió y el cliente no ha contestado |
| **Escalado** | Casos escalados, aparte de la bandeja |
| **Resuelto** | Tickets cerrados, solo para consulta |
| **Clasificación IA** | Las propuestas de Kairo, por revisar y aprobadas |
| **Conocimiento** | Lo que Kairo propone guardar y lo que la empresa ya publicó |
| **Clientes** | El directorio de clientes |
| **Configuración** | El espacio de trabajo, el equipo, los plazos y la conexión con Gmail |

La barra lateral lleva un contador junto a cada vista de tickets, y un buscador que también ejecuta acciones.

---

## 4. El equipo responde

### Dentro de un ticket

- **La conversación completa**, con los mensajes del cliente, las respuestas del equipo y las notas internas en un solo hilo.
- **Responder.** La respuesta sale desde el Gmail de la empresa, dentro de la conversación original, con un diseño de correo de marca. Kairo muestra si se está enviando, si se envió o si falló. Si la conexión con Gmail caducó, pide reconectarla y el texto no se pierde.
- **Enviar y resolver.** Responde y cierra el ticket en un solo paso.
- **Acciones rápidas:** atender el ticket, resolverlo o escalarlo, con un motivo opcional.
- **"¿Clasificación incorrecta?"** Quien atiende corrige el tipo, la prioridad, la categoría o el tono. La corrección se guarda junto a lo que dijo la IA y el ticket queda marcado como *Corregido*. Con esas correcciones Kairo mide su precisión en cada empresa.

### Ayuda para responder

- **Plantillas.** Textos guardados para las respuestas frecuentes, con campos variables como el nombre del cliente.
- **Casos similares.** Tickets resueltos parecidos a este, con la forma en que se resolvieron. Un clic lleva esa resolución a la respuesta.
- **Artículos.** El conocimiento publicado que tiene que ver con el ticket, que también se puede llevar a la respuesta.
- **Cliente.** Quién es, su plan, cuántos tickets ha enviado, sus casos recientes y su historial frente a los plazos.
- **Asistente.** Una conversación sobre el ticket. Puede revisar el caso y preparar una propuesta de respuesta. Al insertarla, el texto llega al cuadro de respuesta marcado como *Borrador IA*, y se puede editar antes de enviar.

Los borradores de Kairo siguen cinco reglas:

1. No inventa información que no esté en el caso o en el conocimiento aprobado.
2. Cada dato, política, plazo o compromiso necesita respaldo. Un caso parecido es un ejemplo, no una prueba.
3. No dice que algo se revisó, se envió o se resolvió si la conversación no lo registra.
4. Si no hay una solución con respaldo, reconoce la solicitud y pregunta solo por lo que falta.
5. El borrador siempre necesita la aprobación de una persona.

### Trabajo en equipo

- **Notas internas.** Comentarios dentro del ticket que el cliente nunca ve.
- **Menciones.** Al escribir **@** se avisa a un compañero dentro de la aplicación, nunca por correo. Una campana muestra la actividad, lo no leído y las menciones.
- **Escalar.** Kairo sugiere motivos para escalar y un nivel: plazo en riesgo, un cliente Enterprise esperando demasiado, frustración repetida, un error que se repite o un caso parecido que antes necesitó un nivel superior.
- **Agrupar.** Varios tickets sobre el mismo problema se pueden agrupar, y Kairo sugiere grupos cuando los detecta.

### El recorrido de un ticket

Un ticket llega **abierto**. Desde ahí puede pasar a **en curso**, quedar **esperando al cliente** después de una respuesta, **escalarse** o **resolverse**. Cuando el cliente vuelve a escribir:

- un ticket que esperaba su respuesta vuelve a **en curso**;
- un ticket resuelto se **reabre**;
- una respuesta a un ticket **cerrado** definitivamente no lo reabre, pero queda registrada.

Existe un estado reservado para "resuelto por la IA", pero hoy nada lo asigna. Kairo no resuelve tickets por su cuenta.

Cada cambio de estado, cada clasificación y cada corrección quedan en un historial permanente que no se puede editar, con quién o qué lo hizo. De cualquier decisión se puede saber qué la produjo y con qué versión de las reglas y de las instrucciones de la IA.

---

## Kairo aprende del negocio

Esta es la parte que hace distinto a Kairo. Lo que el equipo aprende atendiendo deja de perderse.

### Qué guarda

Kairo propone cuatro clases de conocimiento:

| Clase | Ejemplo |
|---|---|
| **Hecho del negocio** | Qué vende la empresa, en qué ciudades entrega |
| **Política** | Cómo se tramita una devolución |
| **Excepción** | Un acuerdo distinto con un cliente en particular |
| **Artículo** | La forma en que se resolvió un caso, escrita para volver a usarla |

Las propuestas salen de tres lugares: los correos de la primera revisión, con los que Kairo redacta el **perfil del negocio**; el correo que sigue llegando; y los tickets que el equipo resuelve.

### Quién lo aprueba

Toda propuesta es un borrador hasta que una persona la publica. Cada una llega con su **fuente**, la cita del correo del que salió, y con una validación. Kairo marca la propuesta cuando la cita no coincide con la fuente, cuando la fuente no respalda todo lo que se afirma o cuando contradice algo que la empresa ya aprobó.

La vista **Conocimiento** tiene dos pestañas, *Borradores* y *Publicados*. El equipo edita, publica o descarta. Lo que Kairo todavía no sabe, la empresa lo puede escribir.

### Cómo vuelve a usarse

Solo el conocimiento publicado se usa de nuevo. Aparece en los artículos relacionados de cada ticket, en las respuestas del asistente y en los borradores, siempre con la referencia de dónde salió.

Dentro del ticket, el panel **Decisiones y evidencia** enumera cada decisión que la IA tomó sobre ese caso, las fuentes que usó y qué evidencia le faltó.

### Cómo se gana la autonomía

Kairo también aprende de las correcciones. Cada vez que alguien confirma o rechaza una clasificación, queda una medida de qué tan bien acierta Kairo en ese tipo de ticket para esa empresa. Cuando esa medida supera el umbral, Kairo deja de preguntar en ese tipo. Si empieza a fallar, vuelve a preguntar. Nadie le asigna ese permiso a mano.

---

## La empresa, su equipo y sus clientes

- **Cada empresa por separado.** Los datos de una empresa están separados de los de las demás en la base de datos.
- **Cada quien con su usuario.** Nadie comparte la clave del correo. Hay cuatro roles: propietario, administrador, supervisor y agente. Hoy los cuatro pueden hacer todas las acciones del día a día sobre un ticket. Solo el propietario y el administrador cambian la descripción de la empresa.
- **Invitaciones.** Se invita a una persona con un enlace. La lista del equipo se ve en Configuración.
- **Directorio de clientes.** Empresas con su identificación, teléfono, plan, nivel de plazo por contrato, los correos autorizados a escribir en su nombre y sus personas de contacto.
- **Contactos detectados.** Kairo puede proponer contactos nuevos que encuentra en el correo entrante. Deja fuera las direcciones de la propia empresa y a quien solo aparece en copia de envíos masivos. Los correos y teléfonos se llevan a un formato estándar para no contar dos veces a la misma persona.
- **Planes.** El producto registra Starter, Pro y Enterprise, cada uno con un límite de puestos.

---

## Lo que Kairo les envía a los clientes

La IA nunca envía nada por sí misma. Todo mensaje a un cliente lo escribe y lo envía una persona, o es uno de estos correos fijos:

| Correo | Cuándo sale |
|---|---|
| **Respuesta del equipo** | Cuando alguien pulsa Enviar |
| **Caso resuelto** | Cuando alguien pulsa Enviar y resolver |
| **Aviso fuera de horario** | Cuando llega un ticket nuevo fuera del horario de atención. Solo para correo recién llegado y una sola vez por conversación. Si la empresa no ha definido su horario, se usa lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 12:00, hora de Bogotá |
| **Acuse de recibo** | "Recibimos tu solicitud", con el número del ticket. Cuando está encendido reemplaza al aviso fuera de horario, para que el cliente nunca reciba dos correos automáticos |

Cada correo saliente lleva la referencia del ticket en el asunto, para que las respuestas queden en el mismo hilo.

---

## Los principios detrás de Kairo

1. **La IA propone, una persona decide.** La autonomía se gana por empresa y por tipo de ticket, con precisión medida, y se puede perder.
2. **La IA no envía correos ni resuelve tickets por su cuenta.**
3. **No inventa.** Lo que Kairo redacta o propone guardar necesita respaldo en el caso o en el conocimiento aprobado.
4. **El conocimiento lo publica una persona.** Lo que Kairo deduce es un borrador hasta que alguien lo aprueba.
5. **Primero la señal más barata que sea confiable.** Si una regla fija o el servidor de correo ya saben la respuesta, no se usa la IA.
6. **A la IA se le pregunta solo lo que responde bien.** Dos preguntas sencillas y una tabla fija son más consistentes que una etiqueta compleja.
7. **La confianza que la IA declara no decide nada.** Cuenta la precisión medida frente a las decisiones de las personas.
8. **Nada se descarta en silencio.** El correo filtrado conserva su motivo, el que falla se reintenta y el cliente que escribe a un caso cerrado queda registrado.
9. **Todo se puede rastrear.** Cada decisión se guarda con sus datos de entrada y la versión de las reglas que la produjo.
10. **La gravedad y la urgencia son cosas distintas**, y se miden por separado.
11. **Las respuestas se quedan en el correo del cliente**, enviadas desde la dirección de la empresa.
12. **Lo interno no le llega al cliente.** Las notas y las menciones solo existen dentro de la aplicación.

---

## Qué funciona, qué se enciende y qué sigue en construcción

Kairo publica cada función nueva detrás de un interruptor y la enciende en cada entorno cuando está lista. Por eso una cuenta puede no ver todo lo que describe este documento.

### Funciona en toda cuenta

Registro y conexión con Gmail · primera revisión y revisión cada cinco minutos · reglas de filtrado · clasificación · bandeja ordenada · plazos por prioridad · responder y Enviar y resolver · plantillas · reparto por turnos · corrección de la clasificación · vista Clasificación IA · escalamiento · aviso fuera de horario · directorio de clientes · historial permanente.

### Tiene interruptor propio

| Función | Qué hace falta para verla |
|---|---|
| Conocimiento a partir del correo y perfil del negocio | Un interruptor en el servidor |
| Artículos a partir de tickets resueltos | Otro interruptor en el servidor |
| Asistente del ticket | Un interruptor en el servidor y otro en el panel |
| Pestañas del panel lateral: cliente, similares, artículos, escalar, notas y asistente | Un interruptor por pestaña |
| Notas internas, agrupación de tickets, "Asignarme" e historial relacionado | Un interruptor cada una |
| Acuse de recibo | Un interruptor en el servidor |
| Contactos detectados | Un interruptor en el servidor |
| Alertas cuando un ticket pasa su punto de escalamiento | Un interruptor en el servidor |
| La medición que concede la aprobación automática por tipo | Un interruptor en el servidor |
| El segundo modelo de IA | Un interruptor para la segunda opinión y otro para dejarlo confirmar clasificaciones en un buzón elegido |
| El paso de detección en vivo de la configuración inicial | Un interruptor en el servidor. Sin él, la configuración pasa directo al final |

### Sigue en construcción

- **Otros canales.** Solo existe Gmail.
- **Facturación y pagos.** No hay cobros ni límites de uso.
- **Resolución automática de tickets.**
- **Enviar invitaciones desde el panel.** Hoy se invita por enlace.
- **Confirmar, rechazar o editar un contacto detectado** desde el panel.
- **Una pantalla para ajustar los pesos del orden.** Hoy se cambian por empresa directamente en el sistema.
- **En Configuración:** la sección *Triage* (niveles, umbral de confianza, categorías) es una maqueta y cambiarla no tiene efecto. *Facturación* y *API* aparecen en construcción. La verificación en dos pasos aparece como próximamente.
- **Las reglas iniciales de la configuración inicial** no se guardan. Sí se guardan el nombre de la organización, la industria y la descripción de la empresa.
- **Los botones de inicio del asistente** devuelven respuestas de ejemplo.
- **La encuesta de satisfacción y el aviso de escalamiento al cliente** están diseñados, pero nada los envía todavía.
- **La aplicación móvil** es una pantalla provisional.

---

## Dónde el sitio web publicado dice más que el producto

El sitio describe hacia dónde va Kairo. Para quien tenga que explicar el producto, estas son las diferencias de hoy:

- **Canales.** El sitio menciona Slack, WhatsApp, Telegram e Instagram. Solo existe Gmail.
- **Privacidad.** La política de privacidad y la pantalla de conexión dicen que Kairo solo lee y nunca envía. El producto envía las respuestas del equipo y el aviso fuera de horario.
- **Resolución automática.** El sitio habla de resolver tickets sobre un umbral de confianza. Kairo deja el spam fuera de la bandeja, pero no resuelve tickets.
- **Planes y precios.** El sitio muestra Free, Pro, Scale y Enterprise con precios y límites. El producto registra Starter, Pro y Enterprise y no cobra.
- **Funciones para empresas grandes.** Inicio de sesión único, instalación en servidores propios, API, webhooks y alertas por Slack no están construidos.
- **Velocidad e idioma.** "Primer ticket priorizado en menos de 60 segundos" es un objetivo de diseño. Las instrucciones de la IA existen en español e inglés, sin variantes regionales.

---

## Cómo se vigila a Kairo

Cada llamada a la IA queda registrada: qué se preguntó, qué respondió, cuánto tardó, cuánto costó y a qué ticket y empresa correspondía. También queda cada decisión automática: el filtrado, el tipo de ticket y la aprobación. Hoy esas herramientas corren en los equipos del propio equipo de Kairo.

Además hay un **banco de evaluación**. Conjuntos de correos reales, etiquetados a mano, pasan por los mismos pasos que usa producción, y se mide cuántas veces Kairo acierta en cada campo. Varias decisiones de este documento salieron de esas mediciones: creerle al filtro de spam, separar a quien compra de quien vende y aprobar sin revisión solo Soporte al principio.

---

## Otras aplicaciones

- **Sitio web público:** página principal, precios, privacidad, términos, inicio de sesión y configuración inicial, en español e inglés.
- **Panel:** en español e inglés, con un selector en la barra lateral.
- **Aplicación de escritorio:** el mismo panel, empaquetado como aplicación.
- **Kelan:** una herramienta interna para el equipo de Kairo, con acceso restringido. No es para los clientes.

---

## Glosario

- **Espacio de trabajo o cuenta:** una empresa que usa Kairo, con sus usuarios, sus buzones y sus datos.
- **Ticket:** un asunto de un cliente, creado a partir de uno o varios correos de la misma conversación.
- **Tipo de ticket:** soporte, prospecto, interno u otro. El spam se filtra antes de que exista un ticket.
- **Prioridad (P1 a P3):** qué tan grave es un caso.
- **Urgencia:** cuánto tiempo queda para actuar.
- **Puntuación:** el número de 0 a 1 con el que se ordena la bandeja.
- **Propuesta:** lo que la IA sugiere, sea una clasificación o un conocimiento. Queda aprobada o por revisar.
- **Conocimiento:** un hecho del negocio, una política, una excepción o un artículo que Kairo propone y una persona publica.
- **Perfil del negocio:** la descripción corta de a qué se dedica la empresa. La IA la necesita para clasificar.
- **Plazo de respuesta:** el tiempo máximo para la primera respuesta, definido por prioridad.
- **Escalamiento:** pasar un caso a un nivel superior para darle atención prioritaria.
- **Nota interna:** un comentario que solo ve el equipo.
