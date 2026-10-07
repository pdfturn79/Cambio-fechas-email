# Cambio Fechas Email

Generador web de correos de prueba (.eml) con fechas personalizadas entre 1 y 3 meses atrás.

## Funciones

- Alta manual de correos: From, To, Subject, Body y Date.
- Validación de fechas dentro del rango permitido.
- Descarga de todos los correos en un ZIP de archivos .eml.
- Generación de un script Python listo para inyectar los correos por IMAP.
- Opción para incluir o no la cabecera `Received`.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Nota sobre IMAP

La inyección por IMAP no se puede realizar directamente desde el navegador. La app genera un script Python que debes ejecutar en tu PC para subir los correos al servidor IMAP que elijas.
