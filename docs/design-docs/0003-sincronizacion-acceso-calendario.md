# Sincronización del acceso con el calendario operacional

## Decisión

CordalSur Control continúa siendo el agregador privado y Supabase la fuente de
verdad operacional. El Worker de acceso lee esa misma fuente directamente en
servidor, sin depender del navegador ni exponer una API privada de Control.

Cada arriendo no cancelado genera una ventana desde las 15:00 del día anterior
al check-in hasta las 12:00 del check-out en `America/Santiago`. Las ventanas
superpuestas se fusionan para que los recambios del mismo día mantengan acceso
continuo. Las estadías manuales existentes se conservan en una tabla separada
como mecanismo de excepción.

## Fiabilidad y privacidad

La sustitución de ventanas en D1 es atómica. Una descarga, validación o escritura
fallida conserva el último conjunto válido y actualiza únicamente un código de
salud acotado. El origen se consulta solo con `id`, fechas y estado; no se
solicitan ni persisten datos personales, referencias, notas o importes.

El PIN de huésped sigue configurado únicamente como digest secreto del Worker.
Las sesiones automáticas incluyen la revisión derivada del calendario y se
revocan cuando cambia la ventana sincronizada.
