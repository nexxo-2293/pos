const Store = require('electron-store');

const store = new Store({
  name: 'device-config'
});

function get(key) {
  return store.get(key);
}

function set(key, value) {
  store.set(key, value);
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear };
