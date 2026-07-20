# CordalSur Background Collection v1

Colección fotográfica generada con IA para la guía de huéspedes. Las escenas se inspiran en paisajes chilenos reales, pero no se presentan como registros documentales de un punto exacto.

| Escena | Inspiración | Uso | Perfil |
| --- | --- | --- | --- |
| `home-nevados` | Nevados de Chillán | Inicio 1 | bright |
| `home-paine` | Torres del Paine | Inicio 2 | balanced |
| `home-osorno` | Volcán Osorno | Inicio 3 | balanced |
| `checkin-cajon` | Cajón del Maipo | Check-in | balanced |
| `checkout-cochamo` | Cochamó | Check-out | moody |
| `clima-castillo` | Cerro Castillo | Clima | bright |
| `tickets-portillo` | Portillo | Tickets | bright |
| `buggy-nevados` | Bosques de Nevados de Chillán | Buggy | moody |
| `manual-nuble` | Reserva de la Biósfera Corredor Biológico Nevados de Chillán-Laguna del Laja | Manual y botiquín | moody |
| `restaurantes-villarrica` | Volcán Villarrica y mesa de montaña | Comida y provisiones | balanced |
| `actividades-conguillio` | Conguillío y Volcán Llaima | Actividades | moody |
| `nearby-antuco` | Antuco, Sierra Velluda y Laguna del Laja | Cerca de mí | balanced |

## Dirección visual

- Fotografía editorial realista, sin texto, logotipos, personas ni infraestructura ficticia.
- Paleta de marca: verde bosque, salvia, nieve marfil, roca carbón y luz dorada contenida.
- Composiciones independientes `desktop` (1600 × 1000) y `mobile` (900 × 1600), no recortes automáticos.
- Exportaciones AVIF, WebP y JPEG sin metadatos editoriales.
- Inicio rota tres escenas cada 25 segundos. Las páginas internas usan una escena fija.
- El sistema carga imágenes solo después de `cordal:access-granted` y las elimina en `cordal:access-ended`.

Los originales generados permanecen fuera del directorio publicado. La aplicación distribuye únicamente los 72 archivos optimizados de `assets/backgrounds/v1/`.

