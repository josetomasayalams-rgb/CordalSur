# Ejecución del estudio cromático de CordalSur

## Qué puede demostrar

Las pruebas automáticas demuestran cobertura de las veintidós combinaciones sección-tema, contraste mínimo 6:1, ausencia de desborde a 320 px y generación determinista. No demuestran que una persona prefiera o reutilice la aplicación.

El estudio humano puede sostener una afirmación causal limitada: que la paleta adaptativa mejora la estética visual percibida frente a la paleta uniforme, sin perjudicar éxito ni errores, bajo las tareas, muestra y condiciones aquí definidas.

## Antes de reclutar

1. Completa `INSTRUMENT_ADAPTATION.md` con personas que no integrarán la muestra principal. Solo entonces cambia `confirmatoryReady` a `true`, incrementa la versión y congela la redacción final.
2. Registra públicamente `study-config.json`, `SECTION_THEME_STUDY.md`, este documento y el hash SHA-256 de la configuración en un servicio de preregistro con fecha verificable.
3. No cambies ítems, resultados, márgenes, exclusiones ni tamaño muestral después de abrir los datos observados.
4. Obtén la revisión ética o consentimiento que exija tu institución. No recolectes nombres, correo, teléfono, PIN, dirección IP ni contenido libre identificable.
5. Recluta 80 participantes para buscar al menos 72 sesiones completas. La cifra incorpora margen operativo sobre un objetivo de potencia 0,80 para detectar frente a cero un efecto pareado estandarizado pequeño-moderado de 0,35.
6. Usa `randomization.csv`: asigna en bloques de cuatro las secuencias `uniform-section-adaptive` y `section-adaptive-uniform`, con 40 participantes por secuencia. No reemplaces manualmente el orden.

## Abrir las condiciones

Las dos condiciones usan el mismo sitio, acceso y versión de contenido. La tabla entrega `period_1_code` y `period_2_code`; abre el código asignado sin explicar su significado al participante:

```text
https://josetomasayalams-rgb.github.io/CordalSur/?condition=a
https://josetomasayalams-rgb.github.io/CordalSur/?condition=b
```

La aplicación conserva el código al navegar entre páginas, pero no lo guarda en `localStorage` ni `sessionStorage`. Abre cada período desde su enlace asignado y comprueba que la URL siga mostrando el mismo código. No mezcles pestañas de condiciones distintas durante una sesión.

Registra la sesión desde:

<https://josetomasayalams-rgb.github.io/CordalSur/research/session-recorder.html>

El registrador carga la asignación, abre la condición correcta, cronometra las nueve tareas y conserva borradores solo en el navegador del investigador. Exporta un respaldo JSON después de cada jornada y el CSV observado al cerrar la muestra. No ingreses nombres, correos, teléfonos ni texto identificable en el motivo de exclusión.

### Sesiones autocontenidas

Para una aplicación remota o sin moderador:

1. En el registrador selecciona participante, período, dispositivo y tema.
2. Pulsa **Copiar enlace para participante** y entrega solamente ese enlace a la persona asignada.
3. La persona confirma el consentimiento, completa las nueve tareas en el orden preregistrado y descarga `cordalsur-P000-periodo-0.json`.
4. Recibe el archivo por el canal autorizado por tu institución y usa **Importar resultado individual**. El registrador valida asignación, período, tareas, rangos y coincidencia de dispositivo/tema antes de incorporarlo.
5. Elimina del canal de transferencia cualquier mensaje o adjunto que permita identificar a la persona, según tu protocolo de retención.

La sesión participante no usa analítica, cookies, formularios externos ni backend. El borrador permanece en `sessionStorage`; el único cambio compartido con la guía es el tema asignado. El archivo individual no contiene nombre, contacto, PIN, IP, respuestas libres ni el significado de los códigos A/B.

## Aplicación

- Cada participante completa las mismas nueve tareas en ambas condiciones: Wi-Fi, check-in, restaurante, actividad, servicio cercano, clima, tickets, check-out y emergencia.
- Contrabalancea el orden de las tareas dentro de cada condición con una lista preparada antes de comenzar.
- Aplica exactamente `period_1_task_order` y `period_2_task_order` de la fila anónima asignada. La lista se genera de forma determinista desde la semilla preregistrada.
- Mantén el mismo dispositivo y tema claro/oscuro para las dos condiciones de una persona.
- Registra éxito binario por tarea, duración desde la presentación hasta la respuesta y errores observables definidos antes de comenzar.
- Después de cada condición registra los cuatro ítems estéticos y la intención de reutilización. El promedio estético se calcula automáticamente; no lo reemplaces manualmente.
- Separa al moderador del análisis siempre que sea posible y conserva un registro de todas las exclusiones.

## Archivo de datos

Usa CSV UTF-8 con una fila por participante y condición. Las columnas exactas son:

```text
dataset_kind,participant_id,sequence,period,condition,device,theme,aesthetics_coherence,aesthetics_variety,aesthetics_color,aesthetics_craftsmanship,visual_aesthetics,task_success_rate,error_count,duration_seconds,reuse_intention,included,exclusion_reason
```

- `dataset_kind`: `observed` para datos reales o `synthetic` para ensayos del proceso.
- `participant_id`: código anónimo estable.
- `sequence`: una de las dos secuencias declaradas en la configuración.
- `period`: `1` o `2`.
- `condition`: `uniform` o `section-adaptive`.
- Los cuatro campos `aesthetics_*` conservan las respuestas 1–7 y `visual_aesthetics` es su promedio exacto.
- `duration_seconds`: suma de los nueve cronómetros de tarea para ese período.
- `included`: `yes` o `no`; toda exclusión necesita motivo.

El fixture en `fixtures/section-theme-study.sample.csv` es sintético. Sirve solamente para comprobar el proceso y el analizador se niega a convertirlo en evidencia.

## Análisis bloqueado

Ejecuta:

```sh
node scripts/analyze-section-theme-study.mjs research/datos-observados.csv
node scripts/analyze-section-theme-study.mjs research/datos-observados.csv --json > research/resultados.json
```

El analizador:

1. valida esquema, promedio de los cuatro ítems, rangos, secuencias, pares y exclusiones;
2. calcula alfa de Cronbach por condición y bloquea el veredicto si alguna queda bajo .70;
3. calcula la diferencia tratamiento menos control por persona;
4. ajusta el efecto de período mediante la secuencia contrabalanceada;
5. entrega intervalo de confianza 95 %, valor p y efecto pareado `dz`;
6. aplica Holm a los resultados secundarios;
7. impide una conclusión positiva con instrumento pendiente, datos sintéticos o menos de 72 participantes completos.

La conclusión `improves-attraction` aparece si el intervalo primario queda sobre cero, el instrumento y la confiabilidad pasan, el éxito no cae más de 5 puntos porcentuales y el aumento de errores queda bajo 0,25 por sesión. `meaningful-improvement` exige además que todo el intervalo supere 0,35 puntos brutos. Cualquier otro resultado se informa como pendiente, insuficiente, inconcluso o negativo.

## Informe

Publica el archivo de configuración preregistrado, diagrama de flujo de participantes, exclusiones, descriptivos por condición, estimaciones con intervalos, tamaño de efecto, análisis completo y datos anonimizados cuando el consentimiento lo permita. Informa resultados nulos y negativos con el mismo detalle que los positivos.
