# Ejecución del estudio cromático de CordalSur

## Qué puede demostrar

Las pruebas automáticas demuestran cobertura de las veinte combinaciones sección-tema, contraste mínimo 6:1, ausencia de desborde a 320 px y generación determinista. No demuestran que una persona prefiera o reutilice la aplicación.

El estudio humano puede sostener una afirmación causal limitada: que la paleta adaptativa mejora la estética visual percibida frente a la paleta uniforme, sin perjudicar éxito ni errores, bajo las tareas, muestra y condiciones aquí definidas.

## Antes de reclutar

1. Registra públicamente `study-config.json`, `SECTION_THEME_STUDY.md`, este documento y el hash SHA-256 de la configuración en un servicio de preregistro con fecha verificable.
2. No cambies resultados, márgenes, exclusiones ni tamaño muestral después de abrir los datos observados.
3. Obtén la revisión ética o consentimiento que exija tu institución. No recolectes nombres, correo, teléfono, PIN, dirección IP ni contenido libre identificable.
4. Recluta 80 participantes para buscar al menos 72 sesiones completas. La cifra incorpora margen operativo sobre un objetivo de potencia 0,80 para un efecto pareado estandarizado pequeño-moderado de 0,35.
5. Usa `randomization.csv`: asigna en bloques de cuatro las secuencias `uniform-section-adaptive` y `section-adaptive-uniform`, con 40 participantes por secuencia. No reemplaces manualmente el orden.

## Aplicación

- Cada participante completa las mismas ocho tareas en ambas condiciones: Wi-Fi, check-in, restaurante, actividad, clima, tickets, check-out y emergencia.
- Contrabalancea el orden de las tareas dentro de cada condición con una lista preparada antes de comenzar.
- Aplica exactamente `period_1_task_order` y `period_2_task_order` de la fila anónima asignada. La lista se genera de forma determinista desde la semilla preregistrada.
- Mantén el mismo dispositivo y tema claro/oscuro para las dos condiciones de una persona.
- Registra éxito binario por tarea, duración desde la presentación hasta la respuesta y errores observables definidos antes de comenzar.
- Después de cada condición registra el promedio de estética visual, la intención de reutilización y las escalas autorizadas. No reproduzcas ítems protegidos sin comprobar sus permisos.
- Separa al moderador del análisis siempre que sea posible y conserva un registro de todas las exclusiones.

## Archivo de datos

Usa CSV UTF-8 con una fila por participante y condición. Las columnas exactas son:

```text
dataset_kind,participant_id,sequence,period,condition,device,theme,visual_aesthetics,task_success_rate,error_count,reuse_intention,included,exclusion_reason
```

- `dataset_kind`: `observed` para datos reales o `synthetic` para ensayos del proceso.
- `participant_id`: código anónimo estable.
- `sequence`: una de las dos secuencias declaradas en la configuración.
- `period`: `1` o `2`.
- `condition`: `uniform` o `section-adaptive`.
- `included`: `yes` o `no`; toda exclusión necesita motivo.

El fixture en `fixtures/section-theme-study.sample.csv` es sintético. Sirve solamente para comprobar el proceso y el analizador se niega a convertirlo en evidencia.

## Análisis bloqueado

Ejecuta:

```sh
node scripts/analyze-section-theme-study.mjs research/datos-observados.csv
node scripts/analyze-section-theme-study.mjs research/datos-observados.csv --json > research/resultados.json
```

El analizador:

1. valida esquema, rangos, secuencias, pares y exclusiones;
2. calcula la diferencia tratamiento menos control por persona;
3. ajusta el efecto de período mediante la secuencia contrabalanceada;
4. entrega intervalo de confianza 95 %, valor p y efecto pareado `dz`;
5. aplica Holm a los resultados secundarios;
6. impide una conclusión positiva con datos sintéticos o con menos de 72 participantes completos.

La conclusión `improves-attraction` aparece únicamente si el intervalo primario queda completamente sobre 0,35, el éxito no cae más de 5 puntos porcentuales y el aumento de errores queda bajo 0,25 por sesión. Cualquier otro resultado se informa como insuficiente, inconcluso o negativo.

## Informe

Publica el archivo de configuración preregistrado, diagrama de flujo de participantes, exclusiones, descriptivos por condición, estimaciones con intervalos, tamaño de efecto, análisis completo y datos anonimizados cuando el consentimiento lo permita. Informa resultados nulos y negativos con el mismo detalle que los positivos.
