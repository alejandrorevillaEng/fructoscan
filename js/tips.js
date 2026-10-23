// Contenido de las pantallas de bienvenida y consejos
export const ONBOARDING = [
  {
    icon: 'barcode',
    title: 'Escanea el código de barras',
    text: 'Apunta al código de barras de cualquier producto del súper. En un segundo verás si tiene poca, media o mucha fructosa y sorbitol, y por qué.',
    short: 'Apunta al código de barras de cualquier producto del súper.',
  },
  {
    icon: 'warning-circle',
    title: 'Fructosa y sorbitol',
    text: 'El sorbitol (E420) dificulta absorber la fructosa. Por eso cada producto tiene dos indicadores: uno de fructosa y otro de sorbitol y polioles.',
    short: 'Dos indicadores por producto, porque el sorbitol (E420) empeora la fructosa.',
  },
  {
    icon: 'camera',
    title: 'Si no aparece, haz una foto',
    text: 'Muchos productos no traen los ingredientes en la base de datos. Haz una foto a la lista de ingredientes y la app los rellena sola para que los revises.',
    short: 'Haz una foto a la lista de ingredientes y se rellena sola.',
  },
];

export const HIGH_FRUCTOSE = [
  ['Sirope de agave', '55–70 g'], ['Miel', '~40 g'], ['Pasas', '~30 g'], ['Dátiles', '20–30 g'],
  ['Higos secos', '~23 g'], ['Uva', '~8 g'], ['Pera', '~6 g + sorbitol'], ['Manzana', '~6 g + sorbitol'],
  ['Zumo de manzana', '~6 g'], ['Refrescos con jarabe', '5–6 g'], ['Cerezas', '~5 g + sorbitol'],
  ['Mango', '~5 g'], ['Sandía', '~3,4 g (más fructosa que glucosa)'],
];

export const HIGH_SORBITOL = ['Ciruelas y ciruelas pasas', 'Pera', 'Manzana', 'Melocotón', 'Albaricoque y orejones', 'Nectarina', 'Cereza', 'Moras', 'Chicles y caramelos «sin azúcar»', 'Chocolates y galletas «sin azúcar»'];

export const LOW_FRUCTOSE = ['Limón y lima', 'Aguacate', 'Piña', 'Naranja y mandarina', 'Fresas', 'Frambuesas', 'Kiwi', 'Plátano (ración normal)', 'Arroz, patata y avena', 'Carne, pescado y huevos'];

export const QUICK_TIPS = [
  ['Mira los 3 primeros ingredientes', 'Van de mayor a menor cantidad: ahí está casi todo.'],
  ['«Sin azúcar» no es «sin problema»', 'Muchos llevan sorbitol, maltitol o zumo de fruta.'],
  ['Busca E420 y el aviso de efectos laxantes', 'La frase «un consumo excesivo puede tener efectos laxantes» indica más de un 10 % de polioles.'],
  ['No todos los jarabes son iguales', 'Fructosa-glucosa es peor que glucosa-fructosa. El jarabe de glucosa a secas no lleva fructosa.'],
  ['Cuidado con zumos y batidos', 'Concentran mucha fruta en poco volumen.'],
  ['Salsas, yogures de sabores y bollería', 'A menudo llevan jarabes o azúcar invertido.'],
  ['La fruta, en raciones pequeñas', 'Mejor repartida en el día y acompañando otras comidas.'],
  ['Suma la comida entera', 'Varias cosas «moderadas» juntas pueden superar tu límite.'],
];

export const PROFILE_HELP = {
  malabsorcion: 'La más frecuente. El intestino absorbe mal la fructosa; depende de la cantidad. La glucosa ayuda y el sorbitol empeora.',
  ihf: 'Enfermedad hereditaria rara y grave. Hay que evitar por completo fructosa, azúcar (sacarosa) y sorbitol. Modo estricto.',
  fodmap: 'Como malabsorción, y además avisa de fructanos (trigo, cebolla, ajo, inulina).',
};
