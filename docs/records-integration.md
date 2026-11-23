# Ficha de grabación

Desde Music, abre Grabaciones. Importa SoundCloud-cruce-DistroKid.csv y DistroKid-catalogo-GitHub.csv en su orden de exportación original. El cruce procede del conciliador de Musica. Los CSV operativos se cargan localmente y quedan fuera de Git.

La ficha reproduce archivos locales y ofrece el reproductor de SoundCloud en pistas disponibles. Muestra duración, métricas, candidatos históricos y portada cuadrada. Permite previsualizar arte 16:9, cargar una letra de trabajo y guardar decisiones en el almacenamiento local del navegador. La cola pone primero grabaciones homónimas y casos ambiguos, ordenados por reproducciones acumuladas y Me gusta dentro de cada grupo.

La URL identifica la grabación capturada. Un sufijo entre corchetes aporta una etiqueta de versión. Los títulos comunes agrupan candidatos editoriales y la obra queda pendiente de confirmar. Los lanzamientos del CSV se mantienen por bloques ordenados, con identificadores provisionales hasta obtener UPC o ID de DistroKid. El corte histórico no certifica disponibilidad actual en tiendas.

## Verificación

Ejecuta `node scripts/test-records-catalog.mjs` para pruebas sintéticas. Pasa como argumentos las rutas de los dos CSV para repetir la prueba de 785 grabaciones, 230 lanzamientos y 274 pistas históricas. La prueba comprueba que Tus Ojos conserva sus dos URLs y duraciones 2:59 y 3:12. Su letra está protegida en la ficha.

## Siguiente integración

Vincular la ficha con el audio canónico del catálogo local, importar métricas recientes de BLACKMAMBA-CORE y añadir adaptadores para la auditoría de Musica y la preparación de paquetes de suno-suite. El primer corte permite registrar una decisión de preparación local. La ejecución y la verificación contra plataformas requieren sus conectores.
