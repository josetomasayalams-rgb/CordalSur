# Guía territorial y descubrimiento de destinos

Estado: aceptado para implementación incremental  
Fecha: 2026-07-17

## Decisión

CordalSur seguirá teniendo dos despliegues independientes:

1. el landing estático publica una instantánea normalizada y trazable del catálogo;
2. el Worker conserva autenticación, secretos y mutaciones administrativas.

La recolección se ejecuta fuera del navegador mediante herramientas Node del
repositorio. Las herramientas pueden consultar OpenStreetMap/Overpass y, cuando
existan credenciales, Google Places (New) y Tripadvisor Content API. Ninguna
clave o respuesta privada se incorpora al landing.

```text
Overpass ─────────┐
Google Places ────┼─> descubrimiento por mosaicos ─> normalización ─> deduplicación
Tripadvisor ──────┤                                            │
overrides manuales┘                                            v
                                                    data/destination-guide.json
                                                               │
                                                               v
                                                    landing estático (mapa/lista)

Administrador ─> Worker autenticado ─> D1 overrides ─> exportación/sincronización
```

## Modos geográficos

### Apartamento

El centro es la coordenada editorial de Condominio Andes Chillán. El radio no es
una constante: se calcula con Haversine WGS84 hasta Restaurant Los Pincheira. Con
las coordenadas actualmente auditadas (`-36.9082176,-71.4205745` y
`-36.8402926,-71.660382`) resulta aproximadamente `22 628,8 m`. La inclusión usa
`distancia <= radio`, por lo que el restaurante queda dentro del límite.

La coordenada del condominio sigue marcada como `approximate` hasta que el
administrador confirme una entrada o estacionamiento. Esa incertidumbre debe ser
visible en metadatos y en el informe de cobertura.

### En mi ruta (ubicación opcional)

El área es un corredor, no un círculo. Su eje usa los segmentos de Ruta N-55
publicados por OpenStreetMap entre el inicio rural al este de Pinto y el punto de
la ruta más cercano al condominio, más un conector final al condominio. El
snapshot consultado el 2026-07-17 contenía 64 vías con `ref=N-55`; la geometría
canónica debe guardar IDs OSM, fecha base, consulta, huella y atribución ODbL.

El corredor se materializa como:

- `LineString` simplificada para cálculo de progreso;
- polígono buffer configurable (valor inicial: 3 000 m a cada lado);
- mosaicos que intersectan ese buffer;
- distancia a lo largo del eje y proyección de cada lugar sobre el eje.

Antes de solicitar geolocalización, la interfaz explica tres alternativas:
`Solo esta vez` obtiene una posición; `Durante esta sesión` observa cambios y
elimina el seguimiento al salir o terminar el acceso; `Ahora no` usa la salida
rural de Pinto. En todos los casos la guía permanece operativa. Con ubicación,
la posición permanece sólo en memoria, se proyecta al eje y se priorizan los
lugares que siguen por delante.

### Ruta completa

Activa todo el corredor Pinto–Condominio, sin recorte por el radio del
apartamento. Es un estado explícito de interfaz y no una consulta circular más
grande.

## Descubrimiento por mosaicos

El motor genera celdas cuadradas geodésicas para cada área:

- círculo: se conservan celdas que intersectan el radio;
- corredor: se conservan celdas que intersectan el buffer vial.

Cada proveedor se consulta por celda. Una celda se subdivide en cuatro cuando
alcanza el límite de resultados del proveedor o declara saturación. Se detiene al
alcanzar el tamaño mínimo o cuando una subdivisión no agrega lugares nuevos. El
algoritmo registra llamadas, reintentos, duración, resultados nuevos y razón de
parada.

Google Nearby Search (New) admite hasta 20 resultados por solicitud y una
restricción circular; por eso cada mosaico se convierte en un círculo que cubre
la celda. Text Search complementa categorías o nombres con cobertura deficiente.
Los campos se solicitan mediante `X-Goog-FieldMask`. Las claves sólo se leen de
variables de entorno del proceso servidor.

Overpass consulta una lista versionada de tags y conserva `(type,id)`, tags
originales, versión, changeset y timestamp. Los centros de vías/relaciones son
candidatos, no coordenadas de navegación, hasta verificar una entrada.

Tripadvisor se usa únicamente mediante su API oficial y sólo si existen
credenciales. Nunca se raspa Google Maps ni Tripadvisor.

## Modelo público

La instantánea pública contiene:

- `meta`: versión, fechas, licencias, estadísticas y limitaciones;
- `geometry`: apartamento, radio, eje N-55, buffer y mosaicos;
- `places`: destino físico y coordenada de llegada;
- `offerings`: servicios o experiencias ofrecidos en un lugar;
- `routes`: inicio y variantes de senderos o accesos;
- `categories`: taxonomía canónica y colores accesibles;
- `providers`: estado de la última sincronización sin secretos.

Cada dato enriquecido incluye `value`, `provider`, `sourceUrl`, `checkedAt` y,
cuando corresponda, `expiresAt`. `null` significa desconocido; nunca se inventa
un reemplazo.

Las categorías canónicas son: restaurante, café, comida rápida, panadería,
supermercado, conveniencia, ferretería, mejoramiento del hogar, farmacia,
salud, veterinaria, combustible, hotel, cabaña, ski, termas, sendero, turismo,
aventura, banco, cajero, lavandería, compras, servicio vehicular, emergencia y
otros. Una categoría desconocida se conserva como `other` y permanece visible.
El snapshot del 2026-07-17 publica además 53 `offerings` y 26 `routes`; las
rutas sin inicio público, estacionamiento o derecho de paso verificado conservan
`navigationAvailable=false` para no convertir un centroide o atractivo final en
una llegada vehicular.

El inventario canónico conserva hoteles y cabañas para administración,
deduplicación e informes, pero esas categorías se excluyen de navegación,
filtros, mapa, recomendaciones y catálogos para huéspedes. Los lugares visibles
del radio del departamento se particionan una sola vez entre `Actividades`
(turismo, termas, ski, senderos y aventura) y `Comida y provisiones` (todas las
demás categorías públicas).

## Deduplicación

La deduplicación produce candidatos por identificadores y similitud, pero sólo
fusiona con evidencia suficiente. La precedencia es:

1. mismo Google Place ID;
2. mismo identificador OSM `(type,id)`;
3. mismo teléfono E.164 o dominio oficial y coordenadas compatibles;
4. nombre normalizado + dirección compatible + proximidad;
5. override manual de fusión.

Los recintos con varias ofertas se modelan como un `place` con varias
`offerings`; las rutas alternativas comparten destino sin convertirse en
duplicados. Toda fusión conserva `mergedFrom` y las fuentes originales.

## Rendimiento y fallos

- caché por proveedor con TTL y metadatos de licencia;
- sincronización incremental por huella de mosaico;
- timeout por solicitud;
- reintento exponencial con jitter para 429/5xx;
- límite de concurrencia por proveedor;
- fallback a OSM + overrides cuando faltan credenciales;
- instantánea anterior intacta si una sincronización no supera validación.

El landing no hace descubrimiento en vivo. Descarga una sola instantánea
versionada, muestra una vista reducida si el mapa no carga y funciona sin permiso
de ubicación.

## Mapa y privacidad

La interfaz sincroniza filtros, lista y mapa; agrupa marcadores según zoom;
muestra apartamento, límite circular, corredor, usuario y selección. Los enlaces
de navegación contienen sólo el destino. La ubicación del huésped no se guarda,
no se registra y no se incorpora a URLs de búsqueda construidas por CordalSur.

El mapa usa Leaflet y agrupación local de marcadores con teselas OpenStreetMap,
muestra su atribución y respeta su política de uso. Si el motor o las teselas no
cargan, la lista, búsqueda, filtros y navegación siguen disponibles con un aviso
explícito; la aplicación no simula cartografía ni oculta la degradación.

## Administración

El Worker ampliará el dominio administrativo con overrides auditables:

- corregir categoría, coordenada, sitio web o Instagram;
- marcar cerrado;
- fusionar duplicados;
- agregar un lugar faltante;
- revisar historial y revertir una corrección.

Los endpoints requieren sesión `admin`; D1 guarda autor, fecha, motivo y revisión.
La exportación valida el esquema antes de producir la instantánea estática.
`npm run export:destination-overrides` obtiene la lista autenticada con un token
efímero de entorno y escribe sólo bajo `.research/`; la sincronización acepta
ese archivo con `--overrides`.

## Fuentes técnicas

- [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [Google Places Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchNearby)
- [Google Places resource fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)

## Consecuencias

- Se preserva el landing sin build ni claves públicas.
- La instantánea permite rendimiento predecible y degradación offline parcial.
- Los datos de terceros no se declaran completos cuando faltan credenciales.
- La publicación queda separada de la recolección: una sincronización fallida no
  rompe la guía vigente.
- Confirmar la coordenada de llegada del condominio sigue siendo una tarea
  editorial obligatoria antes de llamar exacta a la distancia del apartamento.
