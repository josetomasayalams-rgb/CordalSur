# Investigación de catálogos CordalSur

**Fecha de verificación:** 2026-07-19  
**Alcance:** Explora el Valle, Comida y provisiones, Actividades, Instagram y rutas de trekking/MTB.

## Método y criterio de publicación

La investigación combinó auditoría determinista del catálogo local, búsquedas web dirigidas y tres revisiones independientes: cobertura de Instagram, verificación externa de perfiles y plataformas de rutas. El runner de subprocesos previsto para la investigación amplia no se ejecutó porque el entorno rechazó con razón exponer un repositorio privado a procesos con red. Sus resultados fallidos no se trataron como evidencia.

Solo se publicaron perfiles y rutas con una fuente externa trazable. No se inventaron coordenadas, distancias, perfiles ni enlaces de ruta. Una ficha sin pin confiable permanece visible en el directorio, pero no ofrece distancia ni navegación.

## Decisión de producto

- **Explora el Valle** es una herramienta de urgencia práctica: comida, combustible, farmacia, salud, supermercado, cajero y otros servicios útiles en el trayecto. Solo usa destinos georreferenciados aptos para navegación y excluye panoramas, senderos, ski, termas, hoteles y cabañas.
- **Comida y provisiones** es un directorio amplio. Conserva negocios aunque todavía no exista una coordenada verificada y ofrece Instagram, sitio o teléfono cuando hay evidencia pública.
- **Actividades** es un catálogo editorial amplio. No depende de una distancia para publicar una experiencia y separa el acceso a una ruta digital de la navegación vehicular al punto de inicio.

## Instagram verificado

El archivo curado registra 30 perfiles verificados. La fuente principal fue el directorio del [PTI Valle Las Trancas](https://www.turismovallelastrancas.com/pti/), complementado con publicaciones de [Trancas.cl](https://trancas.cl/) y fuentes oficiales de cada operador.

Entre los perfiles comprobados se encuentran Sitari, Bagual, Borde Andino, Los Hualles, Oliva's, Miski Lirio, CHIL'IN, Pizzas & Beers, Steak House, Restobar Shangrilá, Snow Pub, Dulce Montaña, Koiwe, Las Cachañas, Che Cami, Las Cabras, Garganta del Diablo, Cervecería Shangrilá, Las Bravas Cafe, Valdo, Petit Club, Caramba Helados, La Cava de la Montaña, Patio Tranquino, Alto Las Trancas, Don Quelo y McPato.

Corrección importante: McPato usa [@minimarket_mcpato](https://www.instagram.com/minimarket_mcpato/), respaldado por su [ficha PTI](https://www.turismovallelastrancas.com/pti/minimarket-mc-pato/). El identificador anterior `mc.pato_supermercado` fue descartado.

En Rucahue y las cafeterías de Nevados se publica la cuenta del operador, no se presenta como una cuenta propia del local. Charlie Bowl, Good Morning, Fauna Lounge y Supermercado El Refugio no se publicaron con Instagram porque no se encontró evidencia suficiente para asociar una cuenta concreta sin riesgo de error.

## Rutas directas verificadas

“Suba” fue interpretado como **SUDA Outdoors**. La relación de SUDA con el destino se acredita en su artículo [Valle Las Trancas, un destino de montaña](https://suda.io/adventures/valle-las-trancas-un-destino-de-montana-para-visitar-en-cualquier-epoca-del-ano/).

Rutas SUDA incorporadas o corregidas:

- [Laguna Huemul](https://suda.io/activity/B7HxY9latl)
- [Mirador Valle Las Trancas](https://suda.io/activity/T5qJrmIGT8)
- [Cascada Rucapirén](https://suda.io/activity/Fd2ZzeWp32)
- [Parque Los Coltrahues](https://suda.io/activity/H8MUjjaf9t)
- [Aguas Calientes](https://suda.io/activity/eCm6lqHPZr)
- [Huemul por Ruta de los Caballos](https://suda.io/activity/BIoNbHdgIs)

Para MTB se enlazaron fichas individuales de Trailforks, no páginas regionales ni búsquedas. La fuente de control es el [inventario de Nevados de Chillán](https://www.trailforks.com/region/nevados-de-chillan/trails/). Se incorporaron Águila, Bosque Zion, Candado, Condor 1, Moto X, Nacional, Novicios, Olímpico, Renegado, Super X, Valle Hermoso, Garganta, Enlace Garganta del Diablo, Garganta Access y Subida Fumarolas.

Las rutas Gruñidor y Otoñal no recibieron enlace directo porque la evidencia encontrada repetía un track de Shangrilazo y no demostraba que fueran recorridos equivalentes.

## Strava

No se encontró una colección pública primaria y estable de rutas de Las Trancas/Nevados que pudiera atribuirse con seguridad a cada ficha. Además, Strava limita el scraping y una ruta solo es compartible cuando su propietario la deja visible para todos. Por eso no se fabricaron enlaces ni se enlazaron búsquedas genéricas. Referencias: [términos de Strava](https://www.strava.com/legal/terms?hl=en-GB) y [privacidad de rutas](https://support.strava.com/en-us/articles/15401660-creating-routes-on-mobile).

Una futura ruta Strava puede incorporarse únicamente con su URL pública directa, propietario identificable y visibilidad `Everyone` confirmada.

## Resultado implementado

- 30 perfiles de Instagram con fuente de verificación.
- 10 decisiones de reemplazo o bloqueo de rutas editoriales.
- 14 nuevas fichas de actividades con acceso directo a SUDA o Trailforks.
- 3 nuevas fichas de provisiones sin coordenadas inventadas.
- Procedencia de Instagram diferenciada entre negocio y operador.
- Enlaces de ruta independientes de Google Maps y de la distancia al departamento.

La fuente versionada de estas decisiones es `01-landing-page-cordal-sur-andes-chillan/data/researched-catalog.json`.
