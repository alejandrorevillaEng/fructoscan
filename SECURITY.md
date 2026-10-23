# Política de seguridad

## Versiones con soporte

Solo la versión publicada (rama `main`, desplegada en https://fructosa.pages.dev) recibe arreglos de seguridad.

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Escribe a revillablancoalejandro@gmail.com con qué parte afecta, cómo reproducirlo y qué impacto crees que tiene.

Es un proyecto personal: intentaré responder en unos 7 días, confirmar el problema y publicar el arreglo lo antes posible.

## Medidas actuales

- La app no tiene cuentas ni servidor propio: los datos del usuario no salen de su navegador.
- Cabeceras de seguridad (CSP, HSTS…) protegidas por tests en la suite.
- Tests en cada cambio antes de publicar; GitHub Actions fijadas por SHA y actualizadas con Dependabot.
