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
  overrides: [
    {
      files: [
        "build-pwa.js",
        "**/*.config.js",
        "jobs/fetch-jobs.js",
        "jobs/classify-jobs.js",
        "jobs/analyze-jobs.js",
      ],
      // Override the environment setting for these files only
      env: {
        browser: false,
        node: true,
      },
    },
    {
      files: ["jobs/script.js"],
      env: {
        browser: true,
        node: false,
        es6: true,
        jquery: true,
      },
      globals: {
        // Define global variables injected via HTML script tags
        $: "readonly",
        jQuery: "readonly",
        Chart: "readonly",
        tippy: "readonly",
      },
    },
  ],
};
