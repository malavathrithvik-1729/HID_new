// vStore.js — Memory-backed storage wrapper for V-Med ID
// Resolves "Tracking Prevention" blocked storage errors in Edge/Safari.

window._vmedMemStore = window._vmedMemStore || {};

// Detect availability once to avoid repeated console warnings
let _localAvailable = false;
let _sessionAvailable = false;

try {
  localStorage.setItem('vm_test', '1');
  localStorage.removeItem('vm_test');
  _localAvailable = true;
} catch (e) {
  console.warn("vStore: localStorage is blocked by browser tracking prevention. Using memory fallback.");
}

try {
  sessionStorage.setItem('vm_test', '1');
  sessionStorage.removeItem('vm_test');
  _sessionAvailable = true;
} catch (e) {
  console.warn("vStore: sessionStorage is blocked by browser tracking prevention. Using memory fallback.");
}

export const vStore = {
  get: (key, type = 'session') => {
    const available = (type === 'local') ? _localAvailable : _sessionAvailable;
    if (available) {
      try {
        const storage = (type === 'local') ? localStorage : sessionStorage;
        const v = storage.getItem(key);
        return (v === null) ? window._vmedMemStore[key] : v;
      } catch (e) {
        return window._vmedMemStore[key];
      }
    }
    return window._vmedMemStore[key];
  },
  set: (key, val, type = 'session') => {
    window._vmedMemStore[key] = val; // Always save to memory too
    const available = (type === 'local') ? _localAvailable : _sessionAvailable;
    if (available) {
      try {
        const storage = (type === 'local') ? localStorage : sessionStorage;
        storage.setItem(key, val);
      } catch (e) { /* ignore */ }
    }
  },
  remove: (key, type = 'session') => {
    delete window._vmedMemStore[key];
    const available = (type === 'local') ? _localAvailable : _sessionAvailable;
    if (available) {
      try {
        const storage = (type === 'local') ? localStorage : sessionStorage;
        storage.removeItem(key);
      } catch (e) { /* ignore */ }
    }
  }
};

window.vStore = vStore; 
