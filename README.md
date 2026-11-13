# Totomuves 📦

Tienda web + app (PWA instalable) para vender los productos que los clientes nos regalan en las mudanzas.
La gente elige qué necesita, desliza productos estilo Tinder y la app aprende sus gustos para mostrarle primero lo que más le puede interesar. El pago es con Mercado Pago.

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
| `/admin` | Panel: subir productos con fotos desde el celular, editar, ofertas relámpago, ver pedidos y cuántos ♥ tiene cada producto |

### Cómo "aprende" la app

Cada swipe ajusta un puntaje de afinidad del usuario con la categoría del producto (♥ +1, ★ +2, ✕ −0,4). La función SQL `get_feed` ordena los productos disponibles sumando:

1. afinidad con la categoría (lo que más pesa), más un bonus si la eligió en el onboarding;
2. si cabe en su presupuesto;
3. si está en su misma comuna;
4. si tiene oferta relámpago activa;
5. qué tan nuevo es;
6. un poco de azar, para que descubra cosas nuevas.

Todo vive en `supabase/migrations/`, así que se puede ajustar sin tocar la app.

### Pagos y stock

Cada producto es una pieza única. Al apretar "Pagar", el servidor **aparta el producto por 15 minutos** para que nadie más lo compre mientras paga. Cuando Mercado Pago confirma el pago (webhook o al volver a la página del pedido), el pedido queda **pagado** y el producto **vendido**. Si el pago se rechaza, la reserva se libera.

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
2. Ve a **SQL Editor**, pega el contenido de `supabase/migrations/20261113000000_esquema_inicial.sql` y aprieta **Run**. Esto crea las tablas, la seguridad, el bucket de fotos y las categorías.
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
    descubrir/         Mazo estilo Tinder (SwipeDeck) y medidor de gustos
    admin/             Panel de administración
    api/mercadopago/   Webhook de pagos
  components/          Piezas de interfaz reutilizables
  lib/                 Supabase, Mercado Pago, formatos y tipos
  proxy.ts             Mantiene la sesión de Supabase al día
supabase/
  migrations/          Esquema de base de datos, seguridad y algoritmo del feed
  seed.sql             Productos de ejemplo
public/                Íconos, service worker y página sin conexión
```

## Ideas para las próximas versiones

- **Packs** ("Kit cocina completa", "Pieza de estudiante") con precio especial.
- Notificaciones push cuando llegue algo de sus categorías favoritas.
- Alertas de "bajó de precio" para productos en favoritos.
- Cotizador de despacho por comuna.
- Login con Google y convertir el usuario anónimo en cuenta permanente.
