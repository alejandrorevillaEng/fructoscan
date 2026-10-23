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

// Productos al peso de la propia tienda (prefijo 2): el código cambia con el peso, no están en bases públicas
export function isInStoreCode(code) {
  return code.length === 13 && code.startsWith('2');
}
