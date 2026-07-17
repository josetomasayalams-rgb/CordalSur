# Verificación local

Ejecuta todas las puertas con:

```sh
bash tests/verify-gates.sh
```

Las pruebas son de solo lectura respecto del árbol de trabajo. La regeneración de
datos se ejecuta dos veces dentro de una copia temporal para comprobar que
`scripts/apply-host-data.mjs` sea idempotente; la misma copia también valida el
archivo ficticio `data/host-data.sample.json`.

Las puertas validan:

- sintaxis de JavaScript y módulos Node;
- integridad del instrumento A/B, preregistración, análisis cruzado e impedimento de usar datos sintéticos como evidencia;
- registrador local y autocontenido, consentimiento, transferencia de resultados individuales, cronometraje, respaldo y exportación CSV compatible con el analizador;
- paridad exacta de claves y placeholders en ES, PT-BR y EN;
- existencia de todas las claves usadas por texto, `aria-label`, `title` y
  `placeholder`;
- ausencia de atributos accesibles congelados en un solo idioma;
- contrato público de CordalSur: diez títulos, WhatsApp, Instagram, Wi-Fi,
  assets de marca locales y cinco teléfonos de emergencia;
- comportamiento de sesión administrador: entrada a la guía, validación de rol,
  fallback a huésped, expiración en segundo plano y conservación ante cortes de red;
- fuente canónica estricta `{ es, pt, en }`, sin fallback silencioso;
- idempotencia del generador sin modificar archivos versionados.
- paridad byte a byte de los snapshots canónicos y sus aliases de compatibilidad.

Si cambias `data/host-data.json`, regenera primero los archivos derivados:

```sh
node scripts/apply-host-data.mjs . data/host-data.json
```

Luego vuelve a ejecutar las puertas. Los nombres propios y topónimos que deban
compartir exactamente la misma grafía se declaran de forma explícita en la
allowlist del generador; no agregues texto traducible a esa lista.

Para ensayar el análisis científico sin usar datos reales:

```sh
node scripts/analyze-section-theme-study.mjs research/fixtures/section-theme-study.sample.csv
```

El resultado debe quedar marcado como `simulation-only`; consulta
`research/STUDY_RUNBOOK.md` antes de recolectar participantes.
