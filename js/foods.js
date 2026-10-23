// Alimentos frescos: fructosa y glucosa aproximadas por 100 g (USDA FoodData Central, redondeado)
// y sorbitol orientativo (0 = no, 1 = algo, 2 = bastante). Valores medios: varían con la madurez y la variedad.
import { normalize } from './analyzer.js';

export const FOODS = [
  // [nombre, alias, fructosa, glucosa, sorbitol]
  ['Sirope de agave', 'agave', 55, 12, 0],
  ['Miel', '', 41, 36, 0],
  ['Pasas', 'uvas pasas', 30, 28, 0],
  ['Higos secos', 'higo seco', 23, 25, 0],
  ['Dátiles', 'datil', 20, 20, 0],
  ['Ciruelas pasas', 'ciruela pasa', 12, 25, 2],
  ['Orejones', 'albaricoque seco', 12, 33, 2],
  ['Uva', 'uvas', 8.1, 7.2, 0],
  ['Higo fresco', 'higos breva', 7.2, 5.5, 0],
  ['Granada', '', 6.7, 6.6, 0],
  ['Pera', 'peras', 6.2, 2.8, 2],
  ['Manzana', 'manzanas', 5.9, 2.4, 1],
  ['Zumo de manzana', 'jugo de manzana', 5.7, 2.6, 1],
  ['Cereza', 'cerezas picota', 5.4, 6.6, 2],
  ['Arándanos', 'arandano', 5.0, 4.9, 0],
  ['Plátano', 'platano banana', 4.9, 5.0, 0],
  ['Mango', '', 4.7, 2.0, 0],
  ['Kiwi', '', 4.4, 4.1, 0],
  ['Papaya', '', 3.7, 4.1, 0],
  ['Sandía', 'sandia', 3.4, 1.6, 0],
  ['Ciruela', 'ciruelas', 3.1, 5.1, 2],
  ['Naranja', 'naranjas', 2.4, 2.0, 0],
  ['Mandarina', 'mandarinas clementina', 2.4, 2.1, 0],
  ['Fresa', 'fresas freson', 2.4, 2.0, 0],
  ['Frambuesa', 'frambuesas', 2.4, 1.9, 0],
  ['Moras', 'mora', 2.4, 2.3, 1],
  ['Piña', 'pina', 2.1, 1.7, 0],
  ['Melón', 'melon', 1.9, 1.5, 0],
  ['Melocotón', 'melocoton durazno', 1.5, 2.0, 1],
  ['Nectarina', '', 1.4, 1.6, 1],
  ['Tomate', 'tomates', 1.4, 1.3, 0],
  ['Albaricoque', 'albaricoques', 0.9, 2.4, 1],
  ['Limón', 'limon lima', 0.8, 1.0, 0],
  ['Zanahoria', 'zanahorias', 0.6, 0.6, 0],
  ['Espárrago', 'esparrago esparragos', 1.0, 0.7, 0],
  ['Pimiento rojo', 'pimiento', 2.3, 1.9, 0],
  ['Calabacín', 'calabacin', 1.4, 1.1, 0],
  ['Cebolla', 'cebollas', 1.3, 2.0, 0],
  ['Aguacate', 'palta', 0.1, 0.4, 0],
  ['Patata', 'patatas papa', 0.1, 0.4, 0],
  ['Arroz', '', 0, 0, 0],
  ['Avena', 'copos de avena', 0, 0, 0],
  ['Huevo', 'huevos', 0, 0, 0],
  ['Carne / pescado', 'carne pescado pollo ternera cerdo', 0, 0, 0],
  ['Leche', 'leche de vaca', 0, 0, 0],
];

export function foodLevel(f, g, s) {
  const excess = f - g;
  let fru = 'green';
  if ((excess > 0.5 && f >= 3) || f >= 15) fru = 'red';
  else if (f >= 5 || excess > 0.5) fru = 'yellow';
  const pol = s >= 2 ? 'red' : s === 1 ? 'yellow' : 'green';
  return { fru, pol, excess: Math.max(0, +excess.toFixed(1)) };
}

export function searchFoods(q) {
  const n = normalize(q);
  if (n.length < 2) return [];
  return FOODS
    .filter(([name, alias]) => normalize(`${name} ${alias}`).includes(n))
    .slice(0, 12)
    .map(([name, , f, g, s]) => ({ name, fructose: f, glucose: g, sorbitol: s, ...foodLevel(f, g, s) }));
}
