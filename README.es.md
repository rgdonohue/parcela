# Parcela

**Explora la vivienda, el uso del suelo y la equidad en Santa Fe — en tus propias palabras.**

*Lee esto en [English](README.md).*

Parcela es una interfaz de lenguaje natural para explorar datos espaciales sobre Santa Fe, Nuevo México. Escribe una pregunta como *"Muéstrame parcelas residenciales dentro de 500 metros de una parada de autobús"* y verás los resultados en un mapa interactivo con una explicación en lenguaje natural.

![Parcela mostrando resultados de una consulta en español sobre un mapa de Santa Fe](docs/assets/parcela-spanish.png)

Estado actual: prototipo avanzado / versión para revisión. Todavía no hay un despliegue público de producción documentado.

---

## ¿Por qué este proyecto?

Santa Fe enfrenta una crisis de vivienda. Los precios de las casas han subido más rápido que los ingresos, los alquileres de corto plazo han reducido la oferta de vivienda, y muchos vecinos batallan para encontrar un lugar asequible donde vivir. Entender *dónde* ocurren estos problemas — y cómo se cruzan con el acceso al transporte, la zonificación, el riesgo de inundación y la demografía del barrio — requiere análisis espacial que normalmente está encerrado detrás de software GIS caro y conocimientos especializados.

Esta herramienta busca hacer ese análisis accesible para cualquier persona: residentes, periodistas, defensores comunitarios, planificadores urbanos y responsables de políticas públicas. No se necesita experiencia en SIG — solamente haz tu pregunta.

### Preguntas que puedes hacer

- "¿Cuáles barrios tienen más alquileres de corto plazo?"
- "Muéstrame parcelas con zonificación residencial que están baldías"
- "Sectores censales con ingresos medianos bajo los $40,000"
- "Viviendas asequibles dentro de 800 metros de paradas de tránsito"
- "¿Cómo ha cambiado el valor tasado cerca del Railyard desde 2018?"
- "Parcelas dentro de 500 metros de un arroyo y en zonas inundables"
- "Parcelas que colindan con una acequia en el valle de Agua Fría"

---

## Características

- **Consultas en lenguaje natural** — Haz preguntas en español o inglés; un modelo de lenguaje las traduce en consultas espaciales
- **Mapa interactivo** — Los resultados se muestran en un mapa MapLibre GL centrado en Santa Fe
- **Consultas transparentes** — Ves exactamente qué operación espacial se ejecutó, no solo el resultado final
- **Explicaciones con enfoque de equidad** — Resúmenes generados por IA que consideran contexto demográfico y de equidad
- **Múltiples capas de datos** — Parcelas, sectores censales, zonificación, hidrología, tránsito y más
- **Exportar resultados** — Descarga tus hallazgos como GeoJSON o CSV para análisis adicional

---

## Demo

> *Pronto disponible* — El proyecto está en desarrollo activo. Vuelve pronto para un enlace a la demostración.

---

## Cómo funciona

```
┌─────────────────────────────────────────────────────────────┐
│  Tú escribes: "Parcelas residenciales cerca del río"        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. El LLM convierte tu pregunta en una consulta estructurada│
│  2. La consulta se valida contra capas y campos disponibles │
│  3. Se ejecuta SQL espacial en DuckDB                       │
│  4. Los resultados regresan como GeoJSON y se pintan en mapa│
│  5. El LLM genera una explicación en lenguaje natural       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  "Se encontraron 34 parcelas residenciales dentro de 200 m │
│   de tramos del río Santa Fe, concentradas en el centro y  │
│   en el área de Agua Fría. Éstas coinciden con sectores    │
│   censales cuyos ingresos medianos están por debajo del    │
│   promedio de la ciudad."                                  │
└─────────────────────────────────────────────────────────────┘
```

Cada consulta muestra la operación estructurada que se ejecutó, para que puedas verificar lo que hizo el sistema y reproducirlo.

---

## Accesibilidad y lenguaje

Parcela es bilingüe — español e inglés — como compromiso de primer orden, no como una traducción añadida después. Santa Fe tiene una herencia hispanohablante profunda, y las preguntas que hace esta herramienta — sobre vivienda, acequias, mercedes, barrios y equidad — deben poder hacerse en el idioma en que las comunidades ya las piensan.

- La interfaz detecta el idioma del navegador y ofrece un selector para cambiar en cualquier momento
- Las consultas en español se procesan directamente (no se traducen primero al inglés)
- Las explicaciones se generan en el mismo idioma en que preguntaste
- Usamos vocabulario del español nuevomexicano donde aplica: *acequia*, *placita*, *merced*, *arroyo*, *vecino* — no español genérico
- Las traducciones son revisadas por hispanohablantes locales antes de publicarse

Si notas una traducción que no refleja el habla de Santa Fe, por favor abre un issue.

---

## Tecnología

| Componente | Tecnología |
|-----------|------------|
| Frontend | React 19, TypeScript, Vite, MapLibre GL JS, Zustand, react-i18next |
| Backend | Hono (TypeScript), Zod |
| Base de datos | DuckDB con extensión espacial |
| LLM | Ollama (local) o Together.ai (producción) |
| Despliegue | Railway/Fly.io (API), Vercel/Cloudflare Pages (frontend) |

---

## Fuentes de datos

Este proyecto utiliza datos públicamente disponibles sobre Santa Fe:

| Capa | Fuente | Elementos |
|-------|--------|----------|
| Parcelas, Huellas de edificios | Catastro del condado / SIG de la ciudad | 106K |
| Sectores censales | US Census ACS 5 años | 57 |
| Zonificación, Barrios, Límites de la ciudad, Distritos históricos | Ciudad de Santa Fe | 963 |
| Hidrología, Zonas de inundación | SIG de la ciudad / FEMA NFHL | 336 |
| Acceso al tránsito | GTFS de la ciudad | 447 |
| Alquileres de corto plazo | Permisos de la ciudad | 897 |
| Parques, Ciclovías | SIG de la ciudad | 613 |
| Vivienda asequible | HUD LIHTC | 35 |

Consulta [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) para documentación completa sobre procedencia, frecuencia de actualización y licencias.

---

## Docker

### Construir y ejecutar

```bash
docker build -t parcela .

docker run --rm -p 3000:3000 \
  -v $(pwd)/api/data:/app/api/data \
  parcela
```

La API queda disponible en `http://localhost:3000`.

---

## Desarrollo local

### Requisitos previos

- Node.js 20+
- [Ollama](https://ollama.ai/) instalado y corriendo
- Git

### Configuración

```bash
git clone https://github.com/rgdonohue/parcela.git
cd parcela

cd api && npm install && cd ..
cd web && npm install && cd ..

ollama pull qwen2.5:7b

# Inicia la API (en una terminal)
cd api && npm run dev

# Inicia el frontend (en otra terminal)
cd web && npm run dev
```

El frontend corre en `http://localhost:5173` y la API en `http://localhost:3000`.

---

## Contribuir

Este proyecto está en desarrollo activo. ¡Las contribuciones son bienvenidas!

### Áreas donde se necesita ayuda

- **Adquisición de datos** — Obtener y limpiar datos espaciales de Santa Fe
- **Patrones de consulta** — Ampliar los tipos de consultas espaciales soportadas
- **UI/UX** — Mejorar el mapa y la presentación de resultados
- **Revisión de traducción** — Hablantes nativos de español nuevomexicano que revisen textos y ejemplos
- **Pruebas** — Pruebas unitarias y de integración para el constructor de consultas
- **Documentación** — Mejorar este README y agregar tutoriales

---

## Licencia

Licencia MIT. Ver [LICENSE](LICENSE) para detalles.

---

## Contacto

¿Preguntas, ideas o comentarios? Abre un issue o escríbenos:

- GitHub Issues: [github.com/rgdonohue/parcela/issues](https://github.com/rgdonohue/parcela/issues)

---

*Construido con el objetivo de hacer los datos espaciales accesibles para la investigación sobre equidad en vivienda en Santa Fe, NM.*
