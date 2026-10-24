// Validación de códigos de barras (EAN-8, UPC-A, EAN-13, EAN-14) con dígito de control
export function cleanCode(s) {
  return String(s || '').replace(/\D/g, '');
}

export function isValidEAN(code) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

// Cómo se imprimen los números bajo las barras: EAN-13 «3 017620 422003», EAN-8 «9638 5074», UPC-A «0 12345 67890 5»
const DIBUJOS = ['13', '1-6-6', '1-12', '7-6', '6-7', '8', '4-4', '12', '1-5-5-1', '1-11'];

// Busca un código válido en el texto leído con la cámara (los números de debajo de las barras).
// Solo une grupos enteros de cifras y exige el dígito de control: una lectura con un número mal no da código.
export function findEAN(text) {
  const s = String(text || '');
  const grupos = [];
  const re = /\d+/g; let m;
  while ((m = re.exec(s))) grupos.push({ d: m[0], ini: m.index, fin: m.index + m[0].length });
  let mejor = null;
  for (let i = 0; i < grupos.length; i++) {
    let codigo = ''; const forma = [];
    for (let j = i; j < grupos.length && j < i + 13; j++) {
      if (j > i && !/^\s{1,3}$/.test(s.slice(grupos[j - 1].fin, grupos[j].ini))) break;   // solo separados por espacios
      codigo += grupos[j].d; forma.push(grupos[j].d.length);
      if (codigo.length > 14) break;
      if (!isValidEAN(codigo)) continue;
      const prioridad = DIBUJOS.includes(forma.join('-')) ? 0 : 1;
      if (!mejor || prioridad < mejor.prioridad || (prioridad === mejor.prioridad && codigo.length > mejor.codigo.length)) {
        mejor = { codigo, prioridad };
      }
    }
  }
  return mejor ? mejor.codigo : null;
}

// Productos al peso de la propia tienda (prefijo 2): el código cambia con el peso, no están en bases públicas
export function isInStoreCode(code) {
  return code.length === 13 && code.startsWith('2');
}
