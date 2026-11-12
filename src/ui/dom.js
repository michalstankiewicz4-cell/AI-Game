// Drobne pomocniki DOM.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
