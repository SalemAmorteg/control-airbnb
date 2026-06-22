# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


## Cooming soon Backlog

Aplicación Responsive (UI):

Estrategia: En App.jsx, el uso de maxWidth: '1200px', margin: '0 auto' ya es un buen comienzo. Necesitamos aplicar Media Queries (o flex-wrap: wrap) en el CSS de los componentes para que los botones y las tarjetas de inventario se ajusten a pantallas pequeñas sin romperse.

Perfiles, Roles y Permisos:

Estrategia: En Supabase, esto se hace mejor con una tabla profiles vinculada al auth.users mediante un user_id. Usaremos las Row Level Security (RLS) de Supabase para asegurar que un empleado nunca vea la parte de "Revenue Analysis".

Carga de Imágenes:

Estrategia: Usaremos Supabase Storage. Es muy potente y fácil de integrar. Necesitaremos un input type="file" que suba la imagen a un bucket y nos devuelva la URL pública para guardarla en la tabla de reportes.

Revenue Analysis & Dashboard:

Estrategia: Como esto depende de datos históricos, tener los puntos 1-3 resueltos es pre-requisito obligatorio.