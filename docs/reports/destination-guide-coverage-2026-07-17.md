# Informe de cobertura de la guía territorial CordalSur

**Corte de datos:** 2026-07-18T20:32:43.442Z<br>
**Estadía de referencia:** Condominio Andes Chillán<br>
**Cobertura:** Condominio Andes Chillán apartment radius and buffered Ruta N-55 corridor from Pinto

## Resumen ejecutivo

- **445 registros brutos** consolidados en **209 lugares publicables**.
- **198 duplicados fusionados** mediante identificadores de proveedor, teléfono/sitio, nombre, categoría y proximidad.
- **177 lugares** dentro del radio automático del departamento y **178 lugares** dentro del corredor N-55; **146** pertenecen a ambas geometrías.
- De los **177 lugares** del radio, **62 alojamientos** (hotel/cabaña) se excluyen de todas las vistas de huéspedes y quedan sólo en esta auditoría. El catálogo visible final contiene **115 lugares**.
- Los **115 lugares visibles** se publican exactamente una vez: **57 en Actividades** y **58 en Comida y provisiones**.
- **53 ofertas** editoriales y **59 rutas** se mantienen separadas de los lugares físicos.
- **33 elementos de pista de ski** se trasladaron de la lista de establecimientos al modelo de rutas sin navegación vehicular.
- **32 coordenadas candidatas** permanecen visibles con advertencia; no se presentan como entradas exactas.
- El radio del departamento es **22.63 km**, calculado por Haversine WGS84 hasta Restaurant Los Pincheira. La línea central N-55 mide **52.52 km** y usa un buffer de **3.0 km**.

## Estrategia de descubrimiento

1. Se obtuvo la geometría real de Ruta N-55 desde OpenStreetMap/Overpass y se conectó al departamento.
2. El círculo del departamento se dividió en **83 teselas** y el corredor en **28 teselas**.
3. Cada tesela se consulta por separado. Una respuesta saturada se subdivide hasta 1.250 m o hasta dejar de aportar lugares nuevos.
4. OpenStreetMap entrega la cobertura base. Google Places New (Nearby Search, Text Search y Place Details) y Tripadvisor Content API están implementados y sólo se activan con credenciales de servidor y condiciones de licencia compatibles.
5. El catálogo editorial agrega negocios conocidos que OSM omite. Cuando no existe una entrada verificable, se conserva un centro de localidad explícitamente marcado como candidato.
6. La sincronización usa caché de 30 días, reintentos, timeout, backoff exponencial, pausa entre llamadas a Overpass y salida atómica.

## Rendimiento de la sincronización

| Métrica | Resultado |
|---|---:|
| Llamadas de proveedor | 111 |
| Llamadas fallidas | 0 |
| Respuestas desde caché | 111 |
| Duración mediana informada | 0 ms |
| Duración p95 informada | 0 ms |
| Teselas del departamento | 83 |
| Teselas del corredor | 28 |

## Cobertura por proveedor

“Registros descubiertos” cuenta respuestas antes de deduplicar. “Lugares publicados con fuente” cuenta entidades canónicas que conservan esa procedencia.

| Proveedor | Activo | Registros descubiertos | Lugares publicados con fuente | Nota |
|---|---:|---:|---:|---|
| manual | Sí | 30 | 48 | Legacy curated catalog; field verification dates remain null when unknown. |
| editorial | Sí | 36 | 36 | Host-curated catalog; unresolved coordinates remain explicit candidates. |
| osm | Sí | 379 | 170 |  |
| google | No | 0 | 0 | missing_credentials |
| tripadvisor | No | 0 | 0 | missing_credentials |

## Cobertura por categoría

| ID canónico | Categoría | Lugares |
|---|---|---:|
| restaurant | Restaurantes | 31 |
| coffee | Cafés | 9 |
| fast_food | Comida rápida | 3 |
| bakery | Panaderías | 8 |
| supermarket | Supermercados | 11 |
| convenience | Tiendas de conveniencia | 4 |
| hardware | Ferreterías | 1 |
| home_improvement | Mejoramiento del hogar | 1 |
| pharmacy | Farmacias | 1 |
| medical | Salud | 4 |
| veterinary | Veterinaria | 0 |
| gas_station | Bencina | 2 |
| hotel | Hoteles | 21 |
| cabin | Cabañas | 42 |
| ski | Ski | 1 |
| thermal_baths | Termas | 1 |
| trail | Senderos | 1 |
| tourism | Turismo | 56 |
| adventure | Aventura | 0 |
| bank | Bancos | 0 |
| atm | Cajeros | 2 |
| laundry | Lavandería | 0 |
| shopping | Compras | 1 |
| vehicle_service | Servicios vehiculares | 0 |
| emergency | Emergencias | 6 |
| other | Otros | 3 |

Categorías sin un lugar verificable en el corte actual: **Veterinaria, Aventura, Bancos, Lavandería, Servicios vehiculares**. La ausencia de resultados no demuestra que el servicio no exista; indica un vacío de evidencia pública trazable.

## Partición de catálogos para huéspedes

| Etapa | Lugares |
|---|---:|
| Inventario geográfico dentro del radio del departamento | 177 |
| Hoteles y cabañas excluidos de vistas públicas | −62 |
| Catálogo visible único | 115 |
| Actividades | 57 |
| Comida y provisiones | 58 |

La suma de Actividades y Comida/provisiones coincide con el catálogo visible y no contiene IDs repetidos. Hoteles y cabañas continúan en el inventario completo inferior únicamente para trazabilidad administrativa y para futuras auditorías de deduplicación.

## Calidad, seguridad y decisiones editoriales

- Cada lugar tiene navegación y apertura en Google Maps sin incluir la ubicación del huésped en el enlace externo.
- Instagram sólo se publica desde etiquetas de contacto OSM o una fuente oficial/manual verificada. En este corte hay **3 cuentas verificadas**.
- Las valoraciones, cuando existan, muestran proveedor, cantidad de reseñas, URL de origen y fecha de consulta. No se trasladan valoraciones editoriales a campos de Google o Tripadvisor.
- Bike Park Nevados está marcado cerrado según su [página oficial](https://www.nevadosdechillan.com/bike-park), cuyo último día de temporada fue el 5 de abril de 2026.
- La Reserva Nacional Ñuble está cerrada preventivamente desde el 1 de junio de 2026 y hasta nuevo aviso, según [CONAF](https://www.conaf.cl/reserva-nuble-inicia-cierre-preventivo-de-invierno/).
- SERNAGEOMIN mantiene alerta técnica amarilla para Nevados de Chillán y una zona de potencial peligro de 1 km alrededor del cráter Nicanor; se debe revisar el [estado oficial](https://www.sernageomin.cl/alertas-volcanicas/) antes de actividades de montaña.
- Las rutas naturales sin inicio público, estacionamiento o derecho de paso verificado no ofrecen navegación vehicular. Se conservan como fichas informativas con advertencia.
- La Posta de Salud Rural Recinto está confirmada por MINSAL, pero no hay horario ni teléfono directo publicable. No se presenta como urgencia 24/7.
- 132 y 133 se identifican como números nacionales de emergencia, no como líneas directas de cuarteles locales.

## Limitaciones

- Apartment coordinate is approximate until an entrance or parking point is manually verified.
- The corridor buffer is a discovery boundary, not a driving route or legal road boundary.
- OpenStreetMap coverage is incomplete and does not prove that an establishment does not exist.
- Google Places was queried only when a server-side credential was available.
- Tripadvisor content was queried only with credentials and explicit confirmation that combined display is licensed.
- Opening hours, ratings and review counts may change after the recorded provider check.
- Google Places no se ejecutó en este corte porque no había credencial de servidor disponible; por ello no se publican ratings Google.
- Tripadvisor no se ejecutó porque no había credencial ni aprobación explícita para combinar su contenido; no se realizó scraping.
- Los negocios rurales sin presencia digital reciente siguen dependiendo de verificación telefónica o visita local.
- El mapa interactivo usa teselas OpenStreetMap, geometría N-55 y agrupación local de marcadores. No reemplaza una aplicación de navegación vial ni confirma servidumbres de acceso.

## Inventario completo publicado

| ID | Nombre | Categoría | Comuna/localidad | Estado de evidencia | Proveedores |
|---|---|---|---|---|---|
| osm-node-308161534-bancoestado | BancoEstado | atm | — | publicado | osm |
| osm-node-4494177192-caja-vecina-banco-estado | Caja Vecina Banco Estado | atm | — | publicado | osm |
| editorial-che-cami | Che Cami | bakery | Pinto | publicado | editorial, manual |
| editorial-dulce-monta-a | Dulce Montaña | bakery | Pinto | publicado | editorial, manual |
| editorial-las-cacha-as | Las Cachañas | bakery | Pinto | coordenada candidata | editorial |
| osm-node-4494191494-panaderia | Panadería | bakery | Pinto | publicado | osm |
| osm-way-353004595-panaderia-fenix | Panadería Fenix | bakery | Pinto | coordenada candidata | osm |
| editorial-val-panaderia-bravas | Panadería masa madre Las Bravas | bakery | Pinto | coordenada candidata | editorial |
| editorial-malcontenta-panader-a | Panadería Valle Las Trancas | bakery | Pinto | coordenada candidata | editorial |
| editorial-valdo | Valdo | bakery | Pinto | coordenada candidata | editorial |
| osm-node-311431151-balcacura | Balcacura | cabin | — | publicado | osm |
| osm-node-311431047-bordenieve | Bordenieve | cabin | — | publicado | osm |
| osm-node-1289135959-cabana-la-invernada | Cabaña La Invernada | cabin | — | publicado | osm |
| osm-node-1289135954-cabanas-acantilado | Cabañas Acantilado | cabin | — | publicado | osm |
| osm-node-1289135965-cabanas-aguanieve | Cabañas Aguanieve | cabin | — | publicado | osm |
| osm-node-988305625-cabanas-ananukas | Cabañas Añañukas | cabin | — | publicado | osm |
| osm-node-1271311316-cabanas-antue | Cabañas Antué | cabin | — | publicado | osm |
| osm-node-2750524518-cabanas-astromelia | Cabañas Astromelia | cabin | — | publicado | osm |
| osm-node-307557294-cabanas-ayun-koyam | Cabañas Ayun Koyam | cabin | — | publicado | osm |
| osm-node-1289135956-cabanas-bafemadi | Cabañas Bafemadi | cabin | — | publicado | osm |
| osm-node-988305704-cabanas-chil-in | Cabañas Chil'ín | cabin | — | publicado | osm |
| osm-node-1289135967-cabanas-del-valle | Cabañas del Valle | cabin | — | publicado | osm |
| osm-node-1271274061-cabanas-ecobox-andino | Cabañas Ecobox Andino | cabin | — | publicado | osm |
| osm-node-1289135955-cabanas-el-esquiador | Cabañas El Esquiador | cabin | — | publicado | osm |
| osm-node-988305603-cabanas-entre-rocas | Cabañas Entre Rocas | cabin | — | publicado | osm |
| osm-node-1271311327-cabanas-la-baita | Cabañas La Baita | cabin | — | publicado | osm |
| osm-node-307557295-cabanas-la-piedra | Cabañas La Piedra | cabin | — | publicado | osm |
| osm-node-988305724-cabanas-lenador | Cabañas Leñador | cabin | — | publicado | osm |
| osm-node-311431218-cabanas-los-andes | Cabañas Los Andes | cabin | — | publicado | osm |
| osm-node-1271311320-cabanas-los-nirres | Cabañas Los Ñirres | cabin | — | publicado | osm |
| osm-node-1271285819-cabanas-mamalu | Cabañas Mamalu | cabin | — | publicado | osm |
| osm-node-4528793299-cabanas-nido-de-condor | Cabañas Nido de Cóndor | cabin | — | publicado | osm |
| osm-node-988305720-cabanas-pacha-pulay | Cabañas Pacha Pulay | cabin | — | publicado | osm |
| osm-node-988305671-cabanas-piremapu | Cabañas Piremapu | cabin | — | publicado | osm |
| osm-node-988305622-cabanas-quitrahue | Cabañas Quitrahue | cabin | — | publicado | osm |
| osm-node-1289135957-cabanas-roble-huacho | Cabañas Roble Huacho | cabin | — | publicado | osm |
| osm-node-4362126390-cabanas-roble-quemado | Cabañas Roble Quemado | cabin | — | publicado | osm |
| osm-node-1271285821-cabanas-rucahue | Cabañas Rucahue | cabin | — | publicado | osm |
| osm-node-1271311321-cabanas-rukapukem | Cabañas Rukapukem | cabin | — | publicado | osm |
| osm-node-1271285829-cabanas-valle-las-trancas | Cabañas Valle Las Trancas | cabin | — | publicado | osm |
| osm-node-1289135958-cabanas-yancatu | Cabañas Yancatu | cabin | — | publicado | osm |
| osm-node-1289135960-cabannas-las-comadres | Cabanñas Las Comadres | cabin | — | publicado | osm |
| osm-node-2020891243-casa-del-sol | Casa del Sol | cabin | — | publicado | osm |
| osm-node-988305655-complejo-turistico-los-trineos | Complejo Turistico Los Trineos | cabin | — | publicado | osm |
| osm-node-311431214-cumbres-blancas | Cumbres Blancas | cabin | — | publicado | osm |
| osm-node-3041392733-entre-curvas | Entre Curvas | cabin | Las Trancas | publicado | osm |
| osm-node-311431242-las-cabras | Las Cabras | cabin | — | publicado | osm |
| osm-node-311431147-los-nevados | Los Nevados | cabin | — | publicado | osm |
| osm-node-4082994727-noric-lodge | Noric Lodge | cabin | — | publicado | osm |
| osm-node-1289135966-rio-renegado | Río Renegado | cabin | — | publicado | osm |
| osm-node-988305693-santa-rosa-lodge | Santa Rosa Lodge | cabin | — | publicado | osm |
| osm-node-4116261796-villa-parma | Villa Parma | cabin | — | publicado | osm |
| editorial-bagual | Bagual | coffee | Pinto | publicado | editorial, manual |
| editorial-caramba-helados | Caramba Helados | coffee | Pinto | publicado | editorial, manual |
| osm-node-1289135961-casita-de-te | Casita de Te | coffee | — | publicado | osm |
| osm-node-1189531669-el-chacay | El Chacay | coffee | — | publicado | osm |
| editorial-koiwe-cafe-boutique | Koiwe Cafe & Boutique | coffee | Pinto | publicado | editorial, manual |
| editorial-las-bravas-cafe | Las Bravas Cafe | coffee | Pinto | coordenada candidata | editorial |
| editorial-lux-petit-club-cafe-bar | Lux / Petit Club Cafe Bar | coffee | Pinto | publicado | editorial, manual |
| osm-node-3588420773-mahuida-cafe | Mahuida Café | coffee | Pinto | publicado | osm |
| osm-node-308161487-organicos-brita | Organicos Brita | coffee | — | publicado | osm |
| osm-node-268892414-almacen | Almacen | convenience | — | publicado | osm |
| editorial-charcuter-a-las-cabras | Charcutería Las Cabras | convenience | Pinto | publicado | editorial, manual |
| editorial-gastronom-a-nevados-de-chill-n | Gastronomía Nevados de Chillán | convenience | Pinto | coordenada candidata | editorial |
| editorial-la-cava-de-la-monta-a | La Cava de la Montaña | convenience | Pinto | publicado | editorial, manual |
| manual-bomberos-las-trancas | 3ª Compañía Bomberos Las Trancas | emergency | — | publicado | manual, osm |
| manual-bomberos-los-lleuques | Bomberos Los Lleuques | emergency | — | publicado | manual, osm |
| manual-reten-recinto | Retén Recinto | emergency | — | publicado | manual, osm |
| osm-node-539944872-reten-tanilvoro | Retén Tanilvoro | emergency | Coihueco | publicado | osm |
| manual-tenencia-las-trancas | Tenencia Las Trancas | emergency | — | publicado | manual, osm |
| osm-node-268892416-tenencia-pinto | Tenencia Pinto | emergency | Pinto | publicado | osm |
| editorial-pizzas-and-beers-del-valle | Pizzas and Beers del Valle | fast_food | Pinto | publicado | editorial, manual |
| osm-node-13502766797-sabores-mexicanos | Sabores Mexicanos | fast_food | Pinto | publicado | osm |
| osm-way-353042657-the-burguer-company | The Burguer Company | fast_food | Pinto | coordenada candidata | osm |
| manual-copec-recinto | Copec Recinto | gas_station | — | publicado | manual, osm |
| osm-node-268892418-shell | Shell | gas_station | — | publicado | osm |
| manual-ferreteria-don-lalo | Ferretería Don Lalo | hardware | — | coordenada candidata | manual |
| osm-node-632091719-ferreteria-san-sebastian | Ferretería San Sebastián | home_improvement | — | publicado | osm |
| osm-node-2258420956-bosque-los-lleuques | Bosque Los Lleuques | hotel | — | publicado | osm |
| osm-node-5659855021-cabana-del-huem | Cabaña del huem | hotel | — | publicado | osm |
| osm-node-5569759224-cabana-fuentes-moya | Cabaña Fuentes Moya | hotel | — | publicado | osm |
| osm-node-4573807262-cabanas-copihual | Cabañas Copihual | hotel | Chilán | publicado | osm |
| osm-node-1271285825-cabanas-mittenwald | Cabañas Mittenwald | hotel | — | publicado | osm |
| osm-node-6484823533-cabanas-recinto | Cabañas Recinto | hotel | — | publicado | osm |
| osm-node-5683454521-chil-in-hostel | Chil'in Hostel | hotel | — | publicado | osm |
| osm-node-7633684619-domos-treepod | Domos TreePod | hotel | — | publicado | osm |
| osm-node-12503354027-duub-hostel-cabanas | duub Hostel & Cabañas | hotel | Las Trancas | publicado | osm |
| osm-node-1289135963-hostal-junta-los-rios | Hostal Junta Los Ríos | hotel | — | publicado | osm |
| osm-way-111626322-hostelling-valle-las-trancas | Hostelling Valle las Trancas | hotel | — | coordenada candidata | osm |
| osm-way-97509060-hotel-alto-nevados | Hotel Alto Nevados | hotel | Pinto | coordenada candidata | osm |
| osm-way-97509069-hotel-termas-chillan | Hotel Termas Chillán | hotel | Las Termas de Chillán | coordenada candidata | osm |
| osm-node-1289135953-hotel-terra-nevada | Hotel Terra Nevada | hotel | — | publicado | osm |
| osm-node-1271285823-hotel-vegmont | Hotel Vegmont | hotel | — | publicado | osm |
| osm-way-593911599-hotel-vivo-montana | Hotel Vivo Montaña | hotel | — | coordenada candidata | osm |
| osm-node-7416155147-lodge-roca-negra | Lodge Roca Negra | hotel | Chillan | publicado | osm |
| osm-way-101886327-mi-lodge | Mi Lodge | hotel | — | coordenada candidata | osm |
| osm-way-97509064-nevados-de-chillan | Nevados de Chillán | hotel | — | coordenada candidata | osm |
| osm-node-7195378895-papahu | PapaHu | hotel | — | publicado | osm |
| osm-way-28355923-robledal | Robledal | hotel | — | coordenada candidata | osm |
| osm-way-351442219-cesfam-pinto | CESFAM Pinto | medical | — | coordenada candidata | osm |
| osm-node-4494177194-doctor-rubilar | Doctor Rubilar | medical | Pinto | publicado | osm |
| osm-node-11978125701-posta-de-salud-rural-ciruelito | Posta de Salud Rural Ciruelito | medical | — | publicado | osm |
| manual-posta-recinto | Posta de Salud Rural Recinto | medical | — | publicado | manual, osm |
| editorial-cervecer-a-garganta-del-diablo | Cervecería Garganta del Diablo | other | Pinto | publicado | editorial, manual |
| editorial-cervecer-a-shangrila | Cervecería Shangrila | other | Pinto | coordenada candidata | editorial |
| editorial-patio-tranquino | Patio Tranquino | other | Pinto | coordenada candidata | editorial |
| osm-node-4494113896-farmacia-becerra | Farmacia Becerra | pharmacy | Pinto | publicado | osm |
| editorial-alto-las-trancas | Alto Las Trancas | restaurant | Pinto | publicado | editorial, manual |
| osm-node-6629435738-buena-vista-bar | Buena Vista Bar | restaurant | — | publicado | osm |
| manual-cafeteria-tata | Cafetería Tata | restaurant | — | publicado | manual, osm |
| manual-cafeteria-tio-willy | Cafetería Tío Willy | restaurant | — | publicado | manual, osm |
| editorial-charlie-bowl | Charlie Bowl | restaurant | Pinto | coordenada candidata | editorial |
| osm-node-4494132496-comida-rapida | Comida Rápida | restaurant | — | publicado | osm |
| osm-node-4088884738-condominio-patagonia | Condominio Patagonia | restaurant | — | publicado | osm |
| manual-cumbres-restaurante | Cumbres Restaurante | restaurant | — | coordenada candidata | manual |
| manual-don-quelo | Don Quelo | restaurant | — | coordenada candidata | manual |
| editorial-el-pared-n | El Paredón | restaurant | Pinto | publicado | editorial, manual |
| osm-node-4494178491-entre-vigas | Entre Vigas | restaurant | — | publicado | osm |
| editorial-fauna-lounge | Fauna Lounge | restaurant | Pinto | coordenada candidata | editorial |
| osm-node-311431245-la-araucana-jamon-pan-y-vino | La Araucana - Jamon Pan y Vino | restaurant | — | publicado | osm |
| osm-node-308161486-los-adobes | Los Adobes | restaurant | — | publicado | osm |
| editorial-los-hualles-restobar | Los Hualles Restobar | restaurant | Pinto | coordenada candidata | editorial |
| editorial-miski-lirio | Miski Lirio | restaurant | Pinto | publicado | editorial, manual |
| editorial-monte-carla-las-trancas | Monte Carla Las Trancas | restaurant | Pinto | coordenada candidata | editorial |
| manual-observatorio-cafe | Observatorio Café | restaurant | — | publicado | manual, osm |
| manual-oliva-s-restaurant | Oliva's Restaurant | restaurant | — | publicado | manual, editorial, osm |
| manual-quincho-del-valle | Quincho del Valle | restaurant | — | publicado | manual |
| manual-rendez-vous | Rendez-vous | restaurant | — | publicado | manual, osm |
| editorial-restaurant-borde-andino | Restaurant Borde Andino | restaurant | Pinto | publicado | editorial, manual |
| manual-los-pincheiras-restaurant | Restaurant Los Pincheira | restaurant | — | publicado | manual, osm |
| editorial-restaurant-patrimonial-el-tren | Restaurant Patrimonial El Tren | restaurant | Pinto | coordenada candidata | editorial |
| editorial-restaurante-pizzer-a-chil-in | Restaurante Pizzería Chil'in | restaurant | Pinto | publicado | editorial, manual |
| editorial-restobar-shangrila | Restobar Shangrila | restaurant | Pinto | coordenada candidata | editorial |
| osm-node-5843178085-riding | Riding | restaurant | — | publicado | osm |
| editorial-sitari-tapas-y-brasas | Sitari Tapas y Brasas | restaurant | Pinto | publicado | editorial, manual |
| manual-snow-pub | Snow Pub | restaurant | — | publicado | manual, editorial, osm |
| editorial-steak-house | Steak House | restaurant | Pinto | coordenada candidata | editorial |
| osm-node-13502766799-sushi-oasis-pinto | Sushi Oasis Pinto | restaurant | Pinto | publicado | osm |
| osm-way-353042656-la-palmera | La Palmera | shopping | Pinto | coordenada candidata | osm |
| osm-node-2471159073-centro-de-ski-nevados-de-chillan | Centro de Ski Nevados de Chillán | ski | Pinto | publicado | osm |
| osm-node-4494132497-almacen | Almacén | supermarket | — | publicado | osm |
| osm-node-4494178490-almacen-el-magnolio | Almacén "El Magnolio" | supermarket | — | publicado | osm |
| editorial-super-mcpato | McPato Supermercado | supermarket | Pinto | publicado | editorial, manual |
| manual-minimarket-el-varon | Minimarket El Varón | supermarket | — | publicado | manual |
| manual-rucahue | Rucahue | supermarket | — | publicado | manual, editorial, osm |
| osm-node-4494132493-supermercado | Supermercado | supermarket | — | publicado | osm |
| osm-node-4494181889-supermercado | Supermercado | supermarket | Pinto | publicado | osm |
| editorial-super-el-refugio | Supermercado El Refugio | supermarket | Pinto | publicado | editorial, manual |
| osm-node-4494178494-supermercado-javiera | Supermercado Javiera | supermarket | — | publicado | osm |
| manual-la-pileta | Supermercado La Pileta | supermarket | — | publicado | manual, osm |
| osm-node-11230095722-supermercado-pinto | Supermercado Pinto | supermarket | — | publicado | osm |
| osm-way-30929847-termas-los-peucos | Termas Los Peucos | thermal_baths | — | coordenada candidata | osm |
| osm-node-5203403421-anfiteatro | Anfiteatro | tourism | — | publicado | osm |
| osm-node-1115038017-austin | Austin | tourism | — | publicado | osm |
| osm-node-13461557007-bienvenido-a-la-reserva-nacional-nuble | Bienvenido a la Reserva Nacional Ñuble | tourism | — | publicado | osm |
| manual-mtb-bike-park | Bike Park Nevados | tourism | — | cerrado verificado | manual, osm |
| manual-bosque-encantado | Bosque Encantado | tourism | — | publicado | manual, osm |
| osm-node-5808319559-cerro-arrayan | Cerro Arrayán | tourism | — | publicado | osm |
| osm-node-1202592790-cerro-colorado | Cerro Colorado | tourism | — | publicado | osm |
| osm-node-1202593438-cerro-coltrahue | Cerro Coltrahue | tourism | — | publicado | osm |
| osm-node-7821351357-cerro-come-callao | Cerro Come Callao | tourism | — | publicado | osm |
| osm-node-4342083113-cerro-consuelo | Cerro Consuelo | tourism | — | publicado | osm |
| osm-node-1350393957-cerro-el-feo | Cerro El Feo | tourism | — | publicado | osm |
| osm-node-2220466858-cerro-el-gato | Cerro El Gato | tourism | — | publicado | osm |
| osm-node-1350744475-cerro-el-planchon | Cerro El Planchón | tourism | — | publicado | osm |
| osm-node-1202592478-cerro-la-pila | Cerro La Pila | tourism | — | publicado | osm |
| osm-node-498484311-cerro-las-aguilas | Cerro Las Águilas | tourism | — | publicado | osm |
| osm-node-1202593309-cerro-las-cabras | Cerro Las Cabras | tourism | — | publicado | osm |
| osm-node-1202587653-cerro-las-canas | Cerro Las Cañas | tourism | — | publicado | osm |
| osm-node-501242743-cerro-las-mariposas | Cerro Las Mariposas | tourism | — | publicado | osm |
| osm-node-501242961-cerro-las-minas | Cerro Las Minas | tourism | — | publicado | osm |
| osm-node-1202586063-cerro-las-miras | Cerro Las Miras | tourism | — | publicado | osm |
| osm-node-501242591-cerro-las-yeguas | Cerro Las Yeguas | tourism | — | publicado | osm |
| osm-node-1350393964-cerro-los-metales | Cerro Los Metales | tourism | — | publicado | osm |
| osm-node-502735387-cerro-negro | Cerro Negro | tourism | — | publicado | osm |
| osm-node-1202584796-cerro-pelado | Cerro Pelado | tourism | — | publicado | osm |
| osm-node-2282637066-cerro-pichi-minas | Cerro Pichi Minas | tourism | — | publicado | osm |
| osm-node-2282637065-cerro-piramide | Cerro Pirámide | tourism | — | publicado | osm |
| osm-node-382037906-cerro-pirigallo | Cerro Pirigallo | tourism | — | publicado | osm |
| osm-node-2282636000-cerro-purgatorio | Cerro Purgatorio | tourism | — | publicado | osm |
| osm-node-501243122-cerro-torrecilla | Cerro Torrecilla | tourism | — | publicado | osm |
| osm-node-11230095703-ciudades | Ciudades | tourism | — | publicado | osm |
| manual-atr-cueva-pincheira | Cueva de los Pincheira | tourism | — | publicado | manual, osm |
| osm-node-5314140516-cumbre-sur | Cumbre Sur | tourism | — | publicado | osm |
| manual-fumarolas-olla-del-mote | Fumarolas Olla del Mote | tourism | — | publicado | manual, osm |
| osm-node-3463619787-informacion-turistica | Información Turística | tourism | — | publicado | osm |
| manual-la-playita | La Playita | tourism | — | publicado | manual, osm |
| osm-node-13207466680-mirador-casapiedra | Mirador Casapiedra | tourism | — | publicado | osm |
| manual-mirador-del-valle | Mirador del Valle | tourism | — | publicado | manual, osm |
| osm-node-1189483667-mirador-el-macal | Mirador El Macal | tourism | — | publicado | osm |
| osm-node-1262100859-mirador-el-regalo | Mirador El Regalo | tourism | — | publicado | osm |
| osm-node-308136377-mirador-huella-huemul | Mirador Huella Huemul | tourism | — | publicado | osm |
| osm-node-13646131879-mirador-los-coltrahues | Mirador Los Coltrahues | tourism | — | publicado | osm |
| osm-node-4463992989-mirador-los-lleuques | Mirador Los Lleuques | tourism | — | publicado | osm |
| osm-node-317670757-mirador-mariposa-del-chagual | Mirador Mariposa del Chagual | tourism | — | publicado | osm |
| osm-node-367739102-mirador-pino-huacho | Mirador Pino Huacho | tourism | — | publicado | osm |
| osm-node-1251260272-mirador-recinto | Mirador Recinto | tourism | — | publicado | osm |
| osm-node-11135357983-mirador-relbun | Mirador Relbún | tourism | — | publicado | osm |
| osm-node-343576255-mirador-salto-el-blanquillo | Mirador Salto El Blanquillo | tourism | — | publicado | osm |
| osm-node-5918847284-pared-mastodonde | Pared Mastodonde | tourism | — | publicado | osm |
| manual-parque-las-turbinas | Parque Las Turbinas | tourism | — | publicado | manual |
| osm-node-1202589759-picos-las-bravas | Picos Las Bravas | tourism | — | publicado | osm |
| manual-saltito-renegado | Saltito del Renegado | tourism | — | publicado | manual, osm |
| osm-node-5918848485-sector-pared-blanca-y-pared-deportiva | Sector Pared Blanca y Pared Deportiva | tourism | — | publicado | osm |
| manual-termas-de-chillan | Termas de Chillán | tourism | — | publicado | manual, osm |
| manual-term-valle-hermoso | Valle Hermoso | tourism | — | publicado | manual, osm |
| osm-way-28256625-valle-hermoso | Valle Hermoso | tourism | — | coordenada candidata | osm |
| osm-node-5254437521-zona-de-merienda | Zona de Merienda | tourism | — | publicado | osm |
| osm-way-1266965162-refugio-garganta-del-diablo | Refugio Garganta del Diablo | trail | — | coordenada candidata | osm |

## Artefactos y reproducibilidad

- Geometría: `01-landing-page-cordal-sur-andes-chillan/data/destination-geometry.json`
- Catálogo: `01-landing-page-cordal-sur-andes-chillan/data/destination-guide.json`
- Métricas: `.research/20260717-destination-guide/discovery-metrics.json`
- Auditoría de fusiones: `.research/20260717-destination-guide/merge-audit.json`
- Evidencia investigada: `.research/20260717-destination-guide/child_outputs/`
- Esquema: `scripts/destination/destination-guide.schema.json`

Regenerar con `npm run sync:geometry`, `npm run sync:destination` y `npm run report:destination`.
