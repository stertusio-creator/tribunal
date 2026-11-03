# Tribunal

Mesa de evaluación de trabajos escolares. Recibe un archivo Word (`.docx`), PDF o texto, lee los metadatos y dictamina, con criterio estricto, si la prosa parece generada por un modelo. Después califica el contenido en una matriz de cinco aspectos y deja descargar un informe PDF.

## Qué contiene el informe

- Datos del trabajo: título, estudiante, asignatura, nivel, archivo, extensión y consigna.
- Nota institucional y nota de contenido, con el dictamen.
- Porcentaje de generación con IA, indicio forense, lectura del modelo y las señales que lo sostienen.
- Matriz académica: pertinencia, argumentación, evidencia, estructura y originalidad.
- Metadatos examinados y el texto leído.

Un metadato de herramienta generativa (ChatGPT, Claude, Gemini, Copilot, Grammarly, QuillBot y otras) cierra el acta: la nota institucional queda en 0. La matriz se conserva como retroalimentación.

## Reglamento

| Probabilidad | Efecto |
| --- | --- |
| Menos de 45 | Sin sanción. La nota institucional es la de contenido. |
| 45 a 64 | Se descuentan 2,0 puntos. |
| 65 a 84 | Tope de 4,0. No aprueba. |
| 85 o más, o metadato de IA | Nota institucional 0. No acreditable. |

Aprueba desde 6,0, salvo que la integridad lo impida.

## Puesta en marcha

```bash
npm install
npm run dev
```

La lectura del modelo usa la variable de entorno `XAI_API_KEY` en el servidor. Si no está, el acta se cierra igual con el análisis forense y una matriz estimada por reglas. La clave no debe publicarse ni llevar el prefijo `VITE_`.
