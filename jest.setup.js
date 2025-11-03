const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  originalConsoleLog(...args);
};

console.error = (...args) => {
  originalConsoleError(...args);
};

console.warn = (...args) => {
  originalConsoleWarn(...args);
};

