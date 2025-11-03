import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Configuración del entorno de testing
    environment: 'node',
    
    // Archivos de setup global
    setupFiles: ['./tests/helpers/setup.js'],
    
    // Patrones de archivos de test
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    
    // Archivos a excluir
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],
    
    // Configuración de cobertura
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'coverage/**',
        'dist/**',
        'packages/*/test{,s}/**',
        '**/*.d.ts',
        'cypress/**',
        'test{,s}/**',
        'test{,-*}.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
        'scripts/**',
        'docs/**',
        '*.config.js'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Configuración de reporters
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results/results.json',
      html: './test-results/index.html'
    },
    
    // Configuración de timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Configuración de workers
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1
      }
    },
    
    // Configuración de globals
    globals: true,
    
    // Configuración de mocks
    clearMocks: true,
    restoreMocks: true,
    
    // Configuración de watch
    watch: false,
    
    // Configuración de alias para imports
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
      '@mocks': resolve(__dirname, './tests/mocks'),
      '@fixtures': resolve(__dirname, './tests/fixtures'),
      '@helpers': resolve(__dirname, './tests/helpers')
    },
    
    // Configuración específica por proyecto
    projects: [
      {
        name: 'unit-domain',
        test: {
          include: ['tests/unit/domain/**/*.{test,spec}.js'],
          environment: 'node'
        }
      },
      {
        name: 'unit-application', 
        test: {
          include: ['tests/unit/application/**/*.{test,spec}.js'],
          environment: 'node'
        }
      },
      {
        name: 'unit-infrastructure',
        test: {
          include: ['tests/unit/infrastructure/**/*.{test,spec}.js'],
          environment: 'node'
        }
      },
      {
        name: 'integration',
        test: {
          include: ['tests/integration/**/*.{test,spec}.js'],
          environment: 'node',
          testTimeout: 30000
        }
      }
    ],
    
    // Configuración de provide para inyección de dependencias en tests
    provide: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error'
    }
  },
  
  // Configuración de resolución de módulos
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
});