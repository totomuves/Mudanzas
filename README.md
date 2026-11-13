# Totomuves 📦

Web + app (PWA instalable) de Totomuves con dos partes:

1. **Servicio de mudanzas:** cómo trabajamos, precios, cotizador en línea y reserva de horas.
2. **Tienda de segunda mano** con los productos que los clientes nos regalan en las mudanzas: la gente elige qué necesita, desliza productos estilo Tinder y la app aprende sus gustos. El pago es con Mercado Pago.

## Qué incluye esta primera versión

| Pantalla | Qué hace |
| --- | --- |
| `/` Inicio | Portada, ofertas relámpago y productos recién llegados |
| `/bienvenida` | Onboarding: categorías que necesita, comuna y presupuesto (sin registro, usa usuario anónimo) |
| `/descubrir` | Mazo estilo Tinder: ✕ paso, ♥ me gusta, ★ ¡lo quiero!, ↺ deshacer. Muestra el "nivel" y lo que va aprendiendo |
| `/favoritos` | Lo que marcó con ♥ o ★ |
| `/catalogo` | Búsqueda y filtro por categoría |
| `/producto/[id]` | Detalle con galería de fotos |
| `/comprar/[id]` | Datos de contacto y entrega, y pago con Mercado Pago Checkout Pro |
| `/pedido/[id]` | Resultado del pago |
| `/mudanzas` | Cómo trabajamos, precios por tipo de servicio, adicionales y preguntas frecuentes |
| `/mudanzas/cotizar` | Cotizador paso a paso con precio en vivo y elección de día y bloque horario |
| `/mudanzas/reserva/[id]` | Confirmación de la reserva con botón a WhatsApp |
| `/admin/mudanzas` | Agenda: reservas, cambio de estado y días bloqueados |
| `/admin` | Panel: fotografiar y subir productos (fondo blanco automático con IA), cantidad en stock, editar, ofertas relámpago, ver pedidos y cuántos ♥ tiene cada producto |

### Cómo "aprende" la app

Cada swipe ajusta un puntaje de afinidad del usuario con la categoría del producto (♥ +1, ★ +2, ✕ −0,4). La función SQL `get_feed` ordena los productos disponibles sumando:

1. afinidad con la categoría (lo que más pesa), más un bonus si la eligió en el onboarding;
2. si cabe en su presupuesto;
3. si está en su misma comuna;
4. si tiene oferta relámpago activa;
5. qué tan nuevo es;
6. un poco de azar, para que descubra cosas nuevas.

Todo vive en `supabase/migrations/`, así que se puede ajustar sin tocar la app.

### Cómo funcionan las reservas de mudanza

- Los precios salen de dos tablas que puedes editar en Supabase → **Table Editor**:
  - `service_types`: cada tipo de servicio (nombre, precio base "desde", qué incluye, personas, horas).
  - `moving_settings`: recargo por distancia, precio por piso sin ascensor, % de embalaje, objetos pesados, recargo sábado, **bloques horarios** (`slot_times`, ej. `{08:00,14:00}`), **equipos por bloque** (`crews_per_slot`), días cerrados (0 = domingo), anticipación mínima y tu **número de WhatsApp**.
- La cotización se calcula igual en el navegador y en el servidor (`src/lib/moving.ts`), así que el precio guardado no se puede manipular.
- Cada bloque tiene tantos cupos como equipos. Si dos personas reservan el último cupo al mismo tiempo, solo una lo obtiene.
- Por ahora la reserva no cobra nada: queda "Solicitada" y ustedes confirman por WhatsApp. Cobrar un abono con Mercado Pago es un buen siguiente paso.

### Pagos y stock

Cada producto tiene una **cantidad** (1 si es pieza única). El comprador elige cuántas unidades quiere y, al apretar "Pagar", el servidor **le aparta esas unidades por 15 minutos** para que nadie más las compre mientras paga. Cuando Mercado Pago confirma el pago (webhook o al volver a la página del pedido), el pedido queda **pagado** y se **descuenta el stock**; al llegar a 0 el producto queda **agotado**. Si el pago se rechaza o pasan los 15 minutos, las unidades se liberan solas. Si repones stock de un producto agotado desde el admin, vuelve a estar disponible.

### Fotos con IA

En `/admin/nuevo` hay dos botones grandes: **Tomar foto** (abre la cámara del celular) y **Desde la galería**. Con la opción *"Quitar el fondo y dejarlo blanco con IA"* activada, cada foto se recorta, se centra y queda sobre fondo blanco, como en una tienda.

- **Por defecto es gratis:** la IA corre en el mismo navegador (librería `@imgly/background-removal`). La primera vez descarga el modelo (~40 MB) y después queda guardado. Tarda unos segundos por foto; en un computador es más rápido que en el celular.
- **Licencia:** esa librería es AGPL-3.0. Solo se carga en el panel de admin, pero si la app se vuelve un producto comercial grande conviene comprar la licencia comercial de IMG.LY o usar remove.bg.
- **Alternativa con remove.bg:** crea una clave en https://www.remove.bg/api y ponla en `REMOVE_BG_API_KEY`. Desde ese momento se usa remove.bg (calidad muy buena, 50 fotos gratis al mes en baja resolución, después es pagado).
- Si la IA falla, la foto se sube igual, sin quitar el fondo.

Si además configuras `ANTHROPIC_API_KEY`, aparece el botón **"Completar título, descripción y precio con IA"**: mira la portada y llena el título, la descripción, la categoría, el estado y un precio sugerido en pesos. Tú revisas y corriges antes de publicar. Cuesta una fracción de peso por producto.

**¿Por qué no WooCommerce?** Sería un segundo sistema que mantener (WordPress, hosting, plugins) y habría que sincronizar el stock entre la tienda y la app. Aquí la tienda, el stock y el pago viven en un solo lugar, y Mercado Pago es el estándar en Chile.

## Tecnologías

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4): web y PWA instalable en el celular.
- **Supabase**: base de datos Postgres, usuarios (anónimos + enlace mágico para admins) y almacenamiento de fotos.
- **Mercado Pago Checkout Pro**: pagos con tarjetas, débito y otros medios.
- **Vercel**: hosting (gratis para empezar).

---

## Preparar el entorno, paso a paso

### 1. Instalar herramientas en tu computador

1. **Node.js 20 o superior** (recomendado 22 LTS): https://nodejs.org. Verifica con `node -v`.
2. **Git**: https://git-scm.com. Verifica con `git --version`.
3. Un editor: **VS Code** (https://code.visualstudio.com) con las extensiones *ESLint* y *Tailwind CSS IntelliSense*.

### 2. Bajar el código

```bash
git clone https://github.com/totomuves/Mudanzas.git
cd Mudanzas
npm install
cp .env.example .env.local
```

### 3. Crear el proyecto en Supabase

1. Crea una cuenta en https://supabase.com y un proyecto nuevo (región **São Paulo** es la más cercana a Chile). Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor** y ejecuta, en orden, cada archivo de `supabase/migrations/` (pega el contenido y aprieta **Run**):
   1. `20261113000000_esquema_inicial.sql`: tienda (productos, swipes, pedidos, fotos, categorías).
   2. `20261113010000_servicio_mudanzas.sql`: servicios, precios, agenda y reservas.
   3. `20261113020000_stock_productos.sql`: cantidad (stock) por producto.
3. (Opcional) Pega también `supabase/seed.sql` para tener 16 productos de ejemplo.
4. Ve a **Authentication → Sign In / Providers** y activa **Allow anonymous sign-ins** (permite que la gente use la app sin registrarse). Deja activado **Email**.
5. Ve a **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` (después la cambias por la URL de producción).
   - *Redirect URLs*: agrega `http://localhost:3000/**` y, cuando la tengas, `https://TU-DOMINIO/**`.
6. Ve a **Project Settings → API Keys** y copia en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (la URL del proyecto, `https://xxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (la clave `sb_publishable_...`)
   - `SUPABASE_SECRET_KEY` (la clave `sb_secret_...`; **nunca** la compartas ni la subas a GitHub)

### 4. Crear tus credenciales de prueba en Mercado Pago

1. Entra a https://www.mercadopago.cl/developers con tu cuenta y ve a **Tus integraciones → Crear aplicación** (tipo *Pagos online*, producto *Checkout Pro*).
2. En la aplicación, ve a **Cuentas de prueba** y crea dos: una **vendedora** y una **compradora** (Chile).
3. Inicia sesión con la cuenta de prueba vendedora en developers, entra a **Credenciales de producción** de esa cuenta y copia el **Access Token** en `MP_ACCESS_TOKEN`. (Las credenciales de una cuenta de prueba solo mueven dinero de mentira.)
4. Para pagar en pruebas, usa la cuenta compradora y las [tarjetas de prueba](https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) (por ejemplo, titular `APRO` para pago aprobado).

> En local Mercado Pago no puede llamar a tu webhook, pero no importa: al volver del pago, la página `/pedido/[id]` consulta el pago directamente y marca el producto como vendido.

### 5. Levantar la app

```bash
npm run dev
```

Abre http://localhost:3000. Para probar en tu celular en la misma red WiFi, usa la IP de tu computador (ej. `http://192.168.1.20:3000`).

### 6. Hacerte administrador

1. Entra a http://localhost:3000/ingresar, escribe tu correo y abre el enlace que te llega.
2. En Supabase → **SQL Editor**, ejecuta (con tu correo):

   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'tu@correo.cl');
   ```

3. Entra a http://localhost:3000/admin y sube tu primer producto. Desde el celular puedes sacar la foto directo con la cámara.

---

## Publicar en internet (Vercel)

1. Crea una cuenta en https://vercel.com con tu GitHub y elige **Add New → Project → Mudanzas**.
2. En **Environment Variables** agrega las mismas variables de `.env.local`, con `NEXT_PUBLIC_SITE_URL=https://tu-app.vercel.app` (o tu dominio).
3. **Deploy**. Luego, en Supabase → Authentication → URL Configuration, cambia el *Site URL* y agrega la URL de producción a *Redirect URLs*.
4. En Mercado Pago → tu aplicación → **Webhooks**: URL `https://tu-app.vercel.app/api/mercadopago/webhook`, evento **Pagos**. Copia la **clave secreta** en la variable `MP_WEBHOOK_SECRET` de Vercel y vuelve a desplegar.
5. Cuando quieras cobrar de verdad: cambia `MP_ACCESS_TOKEN` por el Access Token de **producción** de tu cuenta real de Mercado Pago.

### Instalar como app en el celular

- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** botón compartir → *Agregar a pantalla de inicio*.

Más adelante, si quieren estar en Google Play / App Store, se puede envolver esta misma PWA con Capacitor.

---

## Diseñar: marca, colores y tipografía

Todo el diseño está centralizado para que lo puedas cambiar sin tocar las pantallas:

| Qué cambiar | Dónde |
| --- | --- |
| Nombre, textos de la portada, logo | `src/brand.ts` (pon tu logo en `public/brand/` y escribe su ruta en `logoImage`) |
| Colores (principal, fondo, botones del swipe, modo oscuro), esquinas | `src/styles/theme.css` |
| Tipografía | `src/app/fonts.ts` (cualquier fuente de Google Fonts) |
| Ícono de la app instalada | `public/icons/` (192×192, 512×512 y `apple-touch-icon` 180×180) y `src/app/icon.png` |

Con `npm run dev` corriendo, los cambios se ven al instante en el navegador.

## Comandos útiles

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Desarrollo con recarga automática |
| `npm run build` | Compilar para producción |
| `npm run start` | Correr la versión compilada |
| `npm run lint` | Revisar el código |

## Estructura

```
src/
  app/                 Páginas (cada carpeta es una URL)
    mudanzas/          Servicio de mudanzas: info, cotizador y reservas
    descubrir/         Mazo estilo Tinder (SwipeDeck) y medidor de gustos
    admin/             Panel de administración
    api/mercadopago/   Webhook de pagos
  components/          Piezas de interfaz reutilizables
  lib/                 Supabase, Mercado Pago, cotizador, formatos y tipos
  brand.ts             Nombre, textos y logo
  styles/theme.css     Colores
  proxy.ts             Mantiene la sesión de Supabase al día
supabase/
  migrations/          Esquema de base de datos, seguridad y algoritmo del feed
  seed.sql             Productos de ejemplo
public/                Íconos, service worker y página sin conexión
```

## Ideas para las próximas versiones

- Cobrar un **abono** de la mudanza con Mercado Pago al reservar.
- Recordatorio automático por WhatsApp/correo el día antes de la mudanza.
- Calcular la distancia exacta con Google Maps en el cotizador.
- **Packs** ("Kit cocina completa", "Pieza de estudiante") con precio especial.
- Notificaciones push cuando llegue algo de sus categorías favoritas.
- Alertas de "bajó de precio" para productos en favoritos.
- Cotizador de despacho por comuna.
- Login con Google y convertir el usuario anónimo en cuenta permanente.
