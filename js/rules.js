// Diccionario de ingredientes y umbrales. Editable sin tocar la lógica (analyzer.js).
// Todos los patrones se escriben YA NORMALIZADOS: minúsculas, sin tildes, guiones -> espacio.
//
// cat:    'fru' (fructosa) | 'pol' (sorbitol/polioles) | 'fod' (fructanos, solo informativo) | 'ok' (neutraliza)
// level:  'high' | 'med' | 'low' | 'none'
// fuzzy:  admite errores de OCR (distancia de edición) en palabras sueltas
// hfi:    en perfil de intolerancia hereditaria cuenta como prohibido

export const INGREDIENTS = [
  // --- Neutros: se comprueban antes para que "jarabe de glucosa" no dispare nada ---
  // (se comparan de más largo a más corto: "jarabe de glucosa y fructosa" gana a "jarabe de glucosa")
  { p: 'jarabe de glucosa', cat: 'ok', level: 'none', label: 'jarabe de glucosa (sin fructosa)' },
  { p: 'zumo de limon', cat: 'ok', level: 'none', label: 'zumo de limón' },
  { p: 'zumo concentrado de limon', cat: 'ok', level: 'none', label: 'zumo de limón' },
  { p: 'zumo de lima', cat: 'ok', level: 'none', label: 'zumo de lima' },
  { p: 'maltodextrina', cat: 'ok', level: 'none', label: 'maltodextrina' },

  // --- Fructosa ALTA ---
  { p: 'jarabe de fructosa glucosa', cat: 'fru', level: 'high', label: 'jarabe de fructosa-glucosa (>50 % fructosa)', hfi: true },
  { p: 'jarabe de fructosa y glucosa', cat: 'fru', level: 'high', label: 'jarabe de fructosa-glucosa (>50 % fructosa)', hfi: true },
  { p: 'jarabe de fructosa', cat: 'fru', level: 'high', label: 'jarabe de fructosa', hfi: true },
  { p: 'jarabe de maiz alto en fructosa', cat: 'fru', level: 'high', label: 'jarabe de maíz alto en fructosa', hfi: true },
  { p: 'jarabe de maiz', cat: 'fru', level: 'high', label: 'jarabe de maíz', hfi: true },
  { p: 'isoglucosa', cat: 'fru', level: 'high', label: 'isoglucosa', hfi: true },
  { p: 'agave', cat: 'fru', level: 'high', label: 'sirope de agave', fuzzy: 1, hfi: true },
  { p: 'miel', cat: 'fru', level: 'high', label: 'miel', hfi: true },
  { p: 'azucar invertido', cat: 'fru', level: 'high', label: 'azúcar invertido', hfi: true },
  { p: 'jarabe de azucar invertido', cat: 'fru', level: 'high', label: 'azúcar invertido', hfi: true },
  { p: 'zumo concentrado de manzana', cat: 'fru', level: 'high', label: 'zumo concentrado de manzana', hfi: true, sorbitolFruit: true },
  { p: 'concentrado de manzana', cat: 'fru', level: 'high', label: 'concentrado de manzana', hfi: true, sorbitolFruit: true },
  { p: 'zumo de manzana', cat: 'fru', level: 'high', label: 'zumo de manzana', hfi: true, sorbitolFruit: true },
  { p: 'zumo de pera', cat: 'fru', level: 'high', label: 'zumo de pera', hfi: true, sorbitolFruit: true },
  { p: 'concentrado de pera', cat: 'fru', level: 'high', label: 'concentrado de pera', hfi: true, sorbitolFruit: true },
  { p: 'zumo de uva', cat: 'fru', level: 'high', label: 'zumo de uva', hfi: true },
  { p: 'mosto', cat: 'fru', level: 'high', label: 'mosto de uva', hfi: true },
  { p: 'pasas', cat: 'fru', level: 'high', label: 'pasas', hfi: true },
  { p: 'datiles', cat: 'fru', level: 'high', label: 'dátiles', hfi: true },
  { p: 'datil', cat: 'fru', level: 'high', label: 'dátil', hfi: true },
  { p: 'higos secos', cat: 'fru', level: 'high', label: 'higos secos', hfi: true },
  { p: 'orejones', cat: 'fru', level: 'high', label: 'orejones', hfi: true, sorbitolFruit: true },
  { p: 'ciruelas pasas', cat: 'fru', level: 'high', label: 'ciruelas pasas', hfi: true, sorbitolFruit: true },
  { p: 'fruta deshidratada', cat: 'fru', level: 'high', label: 'fruta deshidratada', hfi: true },
  { p: 'fruta desecada', cat: 'fru', level: 'high', label: 'fruta desecada', hfi: true },
  { p: 'fructosa', cat: 'fru', level: 'high', label: 'fructosa', fuzzy: 2, hfi: true },

  // --- Fructosa MEDIA ---
  { p: 'jarabe de glucosa fructosa', cat: 'fru', level: 'med', label: 'jarabe de glucosa-fructosa (<50 % fructosa)', hfi: true },
  { p: 'jarabe de glucosa y fructosa', cat: 'fru', level: 'med', label: 'jarabe de glucosa y fructosa (<50 % fructosa)', hfi: true },
  { p: 'zumo', cat: 'fru', level: 'med', label: 'zumo de fruta', hfi: true },
  { p: 'jugo', cat: 'fru', level: 'med', label: 'jugo de fruta', hfi: true },
  { p: 'pure de fruta', cat: 'fru', level: 'med', label: 'puré de fruta', hfi: true },
  { p: 'concentrado de fruta', cat: 'fru', level: 'med', label: 'concentrado de fruta', hfi: true },
  { p: 'manzana', cat: 'fru', level: 'med', label: 'manzana', hfi: true, sorbitolFruit: true },
  { p: 'pera', cat: 'fru', level: 'med', label: 'pera', hfi: true, sorbitolFruit: true },
  { p: 'mango', cat: 'fru', level: 'med', label: 'mango', hfi: true },
  { p: 'sandia', cat: 'fru', level: 'med', label: 'sandía', hfi: true },
  { p: 'cereza', cat: 'fru', level: 'med', label: 'cereza', hfi: true, sorbitolFruit: true },
  { p: 'cerezas', cat: 'fru', level: 'med', label: 'cerezas', hfi: true, sorbitolFruit: true },
  { p: 'higo', cat: 'fru', level: 'med', label: 'higo', hfi: true },
  { p: 'higos', cat: 'fru', level: 'med', label: 'higos', hfi: true },
  { p: 'uva', cat: 'fru', level: 'med', label: 'uva', hfi: true },
  { p: 'ciruela', cat: 'fru', level: 'med', label: 'ciruela', hfi: true, sorbitolFruit: true },
  { p: 'melocoton', cat: 'fru', level: 'med', label: 'melocotón', hfi: true, sorbitolFruit: true },
  { p: 'albaricoque', cat: 'fru', level: 'med', label: 'albaricoque', hfi: true, sorbitolFruit: true },
  { p: 'nectarina', cat: 'fru', level: 'med', label: 'nectarina', hfi: true, sorbitolFruit: true },
  { p: 'fruta', cat: 'fru', level: 'med', label: 'fruta', hfi: true },
  { p: 'frutas', cat: 'fru', level: 'med', label: 'frutas', hfi: true },

  // --- Fructosa BAJA (sacarosa: mitad glucosa, mitad fructosa). En IHF, prohibido ---
  { p: 'azucar de cana', cat: 'fru', level: 'low', label: 'azúcar de caña', hfi: true },
  { p: 'azucar moreno', cat: 'fru', level: 'low', label: 'azúcar moreno', hfi: true },
  { p: 'azucar', cat: 'fru', level: 'low', label: 'azúcar (sacarosa)', fuzzy: 1, hfi: true },
  { p: 'azucares', cat: 'fru', level: 'low', label: 'azúcares', hfi: true },
  { p: 'sacarosa', cat: 'fru', level: 'low', label: 'sacarosa', fuzzy: 1, hfi: true },
  { p: 'panela', cat: 'fru', level: 'low', label: 'panela', hfi: true },
  { p: 'melaza', cat: 'fru', level: 'low', label: 'melaza', hfi: true },
  { p: 'caramelo', cat: 'fru', level: 'low', label: 'caramelo', hfi: true },

  // --- Sorbitol / polioles ---
  { p: 'jarabe de sorbitol', cat: 'pol', level: 'high', label: 'jarabe de sorbitol', hfi: true },
  { p: 'sorbitol', cat: 'pol', level: 'high', label: 'sorbitol', fuzzy: 2, hfi: true },
  { p: 'maltitol', cat: 'pol', level: 'med', label: 'maltitol', fuzzy: 1, hfi: true },
  { p: 'jarabe de maltitol', cat: 'pol', level: 'med', label: 'jarabe de maltitol', hfi: true },
  { p: 'isomalt', cat: 'pol', level: 'med', label: 'isomalt', fuzzy: 1, hfi: true },
  { p: 'manitol', cat: 'pol', level: 'med', label: 'manitol', fuzzy: 1 },
  { p: 'lactitol', cat: 'pol', level: 'med', label: 'lactitol', fuzzy: 1 },
  { p: 'xilitol', cat: 'pol', level: 'med', label: 'xilitol', fuzzy: 1 },
  { p: 'eritritol', cat: 'pol', level: 'low', label: 'eritritol (suele tolerarse)', fuzzy: 1 },

  // --- Fructanos (FODMAP, informativo) ---
  { p: 'inulina', cat: 'fod', level: 'med', label: 'inulina', fuzzy: 1 },
  { p: 'fructooligosacaridos', cat: 'fod', level: 'med', label: 'fructooligosacáridos (FOS)', fuzzy: 2 },
  { p: 'fos', cat: 'fod', level: 'med', label: 'FOS' },
  { p: 'achicoria', cat: 'fod', level: 'med', label: 'achicoria' },
  { p: 'trigo', cat: 'fod', level: 'low', label: 'trigo' },
  { p: 'centeno', cat: 'fod', level: 'low', label: 'centeno' },
  { p: 'cebada', cat: 'fod', level: 'low', label: 'cebada' },
  { p: 'cebolla', cat: 'fod', level: 'med', label: 'cebolla' },
  { p: 'ajo', cat: 'fod', level: 'med', label: 'ajo' },
  { p: 'alcachofa', cat: 'fod', level: 'med', label: 'alcachofa' },
];

// Números E de polioles (se buscan como "e420", "e-420", "e 420")
export const E_NUMBERS = [
  { n: '420', sub: 'sorbitol', cat: 'pol', level: 'high', label: 'sorbitol (E420)', hfi: true },
  { n: '421', sub: 'manitol', cat: 'pol', level: 'med', label: 'manitol (E421)' },
  { n: '953', sub: 'isomalt', cat: 'pol', level: 'med', label: 'isomalt (E953)', hfi: true },
  { n: '965', sub: 'maltitol', cat: 'pol', level: 'med', label: 'maltitol (E965)', hfi: true },
  { n: '966', sub: 'lactitol', cat: 'pol', level: 'med', label: 'lactitol (E966)' },
  { n: '967', sub: 'xilitol', cat: 'pol', level: 'med', label: 'xilitol (E967)' },
  { n: '968', sub: 'eritritol', cat: 'pol', level: 'low', label: 'eritritol (E968)' },
];

// Frase legal obligatoria cuando hay >10 % de polioles
export const LAXATIVE_RE = /consumo excesivo puede (producir|tener|causar) efectos? laxantes?/;

// Frases que se eliminan antes de analizar (evitan falsos positivos)
export const IGNORE_PHRASES = [
  /sin azucares? anadidos?/g,
  /sin azucar(es)?/g,
  /contiene (los )?azucares? (naturalmente )?presentes?[^,.;]*/g,
  /(bajo|reducido) (contenido )?en azucar(es)?/g,
  /-?\d+ ?% ?(de )?azucar(es)?/g,
];

// Contextos en los que la fruta NO aporta azúcar relevante
export const NEGLIGIBLE_BEFORE = ['aroma', 'aromas', 'aroma natural', 'aromas naturales', 'vinagre', 'fibra', 'extracto', 'pectina', 'sabor', 'semillas'];

export const SUGAR_T = { low: 5, high: 12 };        // g de azúcares por 100 g
export const FRUCTOSE_T = { low: 1, high: 3 };      // g de fructosa por 100 g (si el dato existe)
export const TOP_POSITIONS = 3;                     // ingredientes "principales"

export const PROFILES = {
  malabsorcion: { id: 'malabsorcion', name: 'Malabsorción de fructosa', short: 'Malabsorción' },
  ihf: { id: 'ihf', name: 'Intolerancia hereditaria a la fructosa (IHF)', short: 'IHF (estricto)' },
  fodmap: { id: 'fodmap', name: 'Dieta baja en FODMAP', short: 'FODMAP' },
};
