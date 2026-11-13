-- Productos de ejemplo para probar la app (opcional).
-- Ejecutar en el SQL Editor de Supabase después de la migración.
-- Se muestran sin foto (la app usa el emoji de la categoría);
-- súbeles fotos desde el panel /admin.

insert into public.products (title, description, category_slug, price, original_price, condition, comuna, flash_price, flash_until) values
  ('Sofá 3 cuerpos gris', 'Cómodo, tela lavable. Lo dejaron en una mudanza en Ñuñoa.', 'muebles', 85000, 320000, 'buen_estado', 'Ñuñoa', null, null),
  ('Mesa de comedor de madera + 4 sillas', 'Roble macizo, algunas marcas de uso.', 'muebles', 120000, 450000, 'con_detalles', 'Providencia', 95000, now() + interval '2 days'),
  ('Microondas Samsung 20L', 'Funciona perfecto, con plato giratorio.', 'electro', 35000, 89990, 'como_nuevo', 'Las Condes', null, null),
  ('Set de ollas acero inoxidable', '5 piezas con tapas de vidrio.', 'cocina', 25000, 79990, 'buen_estado', 'Maipú', null, null),
  ('Monitor 24" Full HD', 'HDMI y VGA. Incluye cable.', 'tecnologia', 45000, 129990, 'como_nuevo', 'Santiago', 39000, now() + interval '1 day'),
  ('Cama 1,5 plazas con colchón', 'Base y colchón en buen estado.', 'dormitorio', 60000, 199990, 'buen_estado', 'La Florida', null, null),
  ('Lámpara de pie nórdica', 'Luz cálida, ampolleta incluida.', 'deco', 18000, 49990, 'como_nuevo', 'Ñuñoa', null, null),
  ('Coche de paseo plegable', 'Liviano, con capota y canasto.', 'ninos', 40000, 149990, 'buen_estado', 'Puente Alto', null, null),
  ('Bicicleta aro 26', 'Recién mantenida, 21 cambios.', 'deporte', 70000, 219990, 'buen_estado', 'Peñalolén', null, null),
  ('Colección de 30 libros', 'Novelas y clásicos en español.', 'libros', 15000, null, 'buen_estado', 'Providencia', null, null),
  ('Taladro percutor Bosch', 'Con maletín y brocas.', 'herramientas', 32000, 89990, 'como_nuevo', 'San Miguel', null, null),
  ('Cucha para perro mediana', 'Plástico resistente, fácil de limpiar.', 'mascotas', 12000, 39990, 'buen_estado', 'Macul', null, null),
  ('Refrigerador No Frost 300L', 'Enfría perfecto. Tiene un pequeño golpe lateral.', 'electro', 150000, 449990, 'con_detalles', 'Las Condes', null, null),
  ('Juego de vajilla 24 piezas', 'Blanca, sin trizaduras.', 'cocina', 20000, 59990, 'como_nuevo', 'Vitacura', null, null),
  ('Escritorio con cajonera', 'Ideal para teletrabajo.', 'muebles', 45000, 139990, 'buen_estado', 'Ñuñoa', null, null),
  ('Espejo de cuerpo entero', 'Marco de madera clara.', 'deco', 22000, 69990, 'buen_estado', 'Providencia', null, null);
