# Rutinas

App Android para seguir rutinas de ejercicio con temporizador. Funciona sin conexión y guarda las rutinas en el propio móvil.

## Qué hace

- Lista de rutinas guardadas. La primera vez trae precargada la "Rutina sin material".
- Crear una rutina desde cero, editarla, duplicarla y borrarla.
- Importar rutinas desde CSV y exportarlas para editarlas en Excel.
- Temporizador con transición antes de cada ejercicio, cambio automático de lado, pitidos en los 3 últimos segundos, pausa y saltos. La pantalla se mantiene encendida mientras la rutina está en marcha.

## Formato del CSV

Una fila por ejercicio, separada por `;` o `,`. La primera fila lleva los nombres de columna:

```
bloque;ejercicio;detalle;segundos;lados;transicion
Movilidad;Balanceos frontales;10 por pierna;20;2;5
Core;Plancha;30" x 2;30;1;5
```

| Columna | Obligatoria | Significado |
|---|---|---|
| ejercicio | Sí | Nombre del ejercicio. "Descanso" se muestra como pausa. |
| segundos | Sí | Duración por lado. |
| lados | No (1) | 1 o 2. Con 2 se hace izquierdo y luego derecho. |
| transicion | No (5) | Segundos de preparación antes del ejercicio. 0 para ninguna. |
| bloque | No | Agrupa ejercicios (Movilidad, Core…). |
| detalle | No | Indicaciones o repeticiones. |

Admite tildes guardadas desde Excel (UTF-8 o Windows-1252). Si una fila tiene un error, la app dice cuál y no importa el archivo.

## Compilación (GitHub Actions)

Cada `push` a `main` genera un APK firmado en la pestaña **Actions** del repositorio (apartado *Artifacts* de la ejecución).

### Firma: una sola vez

El APK se firma con una clave propia. **Guarda el archivo `.keystore` y sus contraseñas en un sitio seguro**: sin ellos no podrás instalar actualizaciones encima y tendrías que desinstalar la app (exporta antes tus rutinas).

1. Genera la clave (necesita Java):
   ```
   keytool -genkeypair -v -keystore rutinas.keystore -alias rutinas -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Conviértela a base64:
   - Linux o Mac: `base64 -w0 rutinas.keystore` (en Mac, `base64 -i rutinas.keystore`)
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("rutinas.keystore"))`
3. En GitHub, **Settings › Secrets and variables › Actions**, crea estos secretos:
   - `ANDROID_KEYSTORE_BASE64`: el texto en base64
   - `ANDROID_KEYSTORE_PASSWORD`: la contraseña del almacén
   - `ANDROID_KEY_ALIAS`: `rutinas`
   - `ANDROID_KEY_PASSWORD`: la contraseña de la clave (la misma si no pusiste otra)

### Versiones

- El número de versión visible está en `package.json` (`version`).
- El código de versión interno es el número de ejecución de GitHub Actions, así que cada APK nuevo se instala encima del anterior.

## Instalar en el móvil

1. Descarga el ZIP del APK desde Actions y descomprímelo.
2. Pásalo al móvil y ábrelo. La primera vez Android pedirá permitir "instalar apps de origen desconocido" para la app desde la que lo abras.

## Probar en el ordenador

```
npm run serve
```

Abre `http://localhost:8080`. En el navegador las rutinas se guardan en el almacenamiento local y la exportación descarga el CSV.

## Estructura

- `www/`: la app (HTML, CSS y JavaScript, sin dependencias de compilación)
  - `app.js`: vistas, editor, temporizador y guardado
  - `csv.js`: lectura y escritura de CSV
  - `default-routine.js`: rutina precargada
- `assets/logo.png`: icono, generado para Android en la compilación
- `capacitor.config.json`: nombre (`Rutinas`) e identificador (`com.hugo.rutinas`)
- `.github/workflows/android.yml`: compilación y firma del APK
