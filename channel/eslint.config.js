import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**'] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.test.json'],
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            'no-console': ['error', { allow: ['error'] }],
            '@typescript-eslint/no-deprecated': 'error'
        }
    },
    {
        files: ['eslint.config.js'],
        extends: [tseslint.configs.disableTypeChecked]
    }
);
