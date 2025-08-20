module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": "warn",
    "no-console": "off",
    eqeqeq: "error",
    curly: "error",
    semi: ["error", "always"],
    "no-var": "error",
  },
};
