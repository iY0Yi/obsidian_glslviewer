import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

const expandExtends = (config) => {
  if (!config || typeof config !== "object") {
    return [];
  }

  const { extends: extendConfigs, ...rest } = config;
  if (!extendConfigs) {
    return [rest];
  }

  const extended = []
    .concat(extendConfigs)
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .flatMap(expandExtends);

  return [...extended, rest];
};

const recommendedConfigs = Array.from(obsidianmd.configs.recommended).flatMap(
  expandExtends,
);

export default [
  ...recommendedConfigs,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser, // document, window, setTimeout など
        ...globals.node,    // process, console など
      },
    },
    rules: {
      "obsidianmd/sample-names": "off",
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: ["GLSL"],
        },
      ],
    },
  },
];
