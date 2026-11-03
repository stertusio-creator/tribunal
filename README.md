# Tribunal

Mesa para evaluar un trabajo escolar. El docente sube el archivo y pega la consigna. El título y el nombre del participante se leen del documento.

## Cómo se usa

1. Suba un Word (`.docx`), un PDF o pegue el texto. El tope es 3 MB y 30 páginas.
2. Tribunal toma el título del encabezado o de los metadatos, y el participante de la línea de autor, de un `@nombre` o del metadato de autor.
3. Pegue solo la consigna. No se piden asignatura, nivel, título ni nombre.
4. El acta muestra la nota de contenido, el porcentaje de generación con IA y deja descargar el informe PDF.

## Si la consigna trae una rúbrica

Una tabla con criterios y niveles (por ejemplo Sobresaliente, Competente, En desarrollo e Insuficiente) y un puntaje al inicio de cada celda reemplaza la matriz fija. Cada criterio vale el máximo de su fila. La suma es la nota de contenido.

Si la consigna no trae esa tabla, se califican cinco aspectos de 20 puntos: pertinencia, argumentación, evidencia, estructura y originalidad.

## Integridad

La nota de contenido no absuelve el origen del texto. La nota institucional aplica este reglamento.

| Probabilidad | Efecto |
| --- | --- |
| Menos de 45 | Sin sanción. La nota institucional es la de contenido. |
| 45 a 64 | Se descuentan 2,0 puntos. |
| 65 a 84 | Tope de 4,0. No aprueba. |
| 85 o más, o metadato de IA | Nota institucional 0. No acreditable. |

Un metadato de ChatGPT, Claude, Gemini, Copilot, Grammarly, QuillBot u otra herramienta listada cierra el acta. La matriz queda como retroalimentación.

## Informe PDF

Datos del trabajo, dictamen, porcentaje de generación con sus fundamentos, matriz, metadatos examinados y el texto leído.

## Puesta en marcha

```bash
npm install
npm run dev
```

La lectura del modelo usa `XAI_API_KEY` solo en el servidor. Si no está, el acta se cierra con el análisis forense y una matriz estimada. La clave no se publica ni lleva el prefijo `VITE_`.
