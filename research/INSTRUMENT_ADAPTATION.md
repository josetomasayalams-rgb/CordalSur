# Adaptación del instrumento estético

## Estado actual

`study-config.json` contiene una traducción de trabajo al español de Chile de los cuatro ítems breves del VisAWI-S. La versión original fue desarrollada para medir estética web global con cuatro facetas y no cuenta aquí con evidencia de equivalencia lingüística para población chilena.

Por esa razón `confirmatoryReady` permanece en `false`. El analizador devuelve `instrument-not-ready` aunque el resultado numérico sea favorable. No reclutes la muestra principal ni cambies ese indicador solo porque los textos parezcan comprensibles.

## Procedimiento previo

1. Confirma las condiciones de uso y citación del instrumento con sus materiales oficiales.
2. Obtén dos traducciones independientes al español de Chile realizadas por personas bilingües familiarizadas con experiencia de usuario.
3. Reconcilia ambas versiones sin mostrar datos de resultados ni las paletas experimentales.
4. Encarga una retrotraducción al inglés a otra persona bilingüe que no haya visto los ítems originales.
5. Compara significado, dificultad y tono con el original; documenta cada cambio.
6. Haz entrevistas cognitivas con usuarios objetivo que no integrarán la muestra principal. Pídeles explicar cada ítem con sus propias palabras y señalar términos ambiguos.
7. Corrige una sola vez, repite la comprobación de comprensión y congela la redacción final.
8. Registra versión, fecha, responsables, decisiones y evidencia de comprensión en este documento.
9. Incrementa la versión de `study-config.json`, establece `confirmatoryReady: true`, regenera su hash y preregistra todos los archivos antes de aceptar el primer dato observado.

## Registro de cierre

Completa esta tabla antes del preregistro principal:

| Evidencia | Estado | Referencia no identificable |
| --- | --- | --- |
| Condiciones de uso comprobadas | Pendiente | |
| Dos traducciones independientes | Pendiente | |
| Reconciliación documentada | Pendiente | |
| Retrotraducción revisada | Pendiente | |
| Entrevistas cognitivas terminadas | Pendiente | |
| Redacción final congelada | Pendiente | |
| Configuración v3 con hash público | Pendiente | |

No escribas nombres, correos ni datos de contacto en este archivo. Conserva consentimientos y documentación institucional en el sistema autorizado por tu institución, separados del código anónimo del estudio.
